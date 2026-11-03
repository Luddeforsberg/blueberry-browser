import { randomBytes } from "crypto";
import { app, safeStorage, shell } from "electron";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { PhoneState } from "../shared/ipc";
import type { IncomingChoice, IncomingReply, PhoneChannel, PhoneChoice } from "./Phone";

// The user's own Telegram bot, reached from here with long polling, so no server of ours is involved. The token only
// ever goes in the address of these requests and, encrypted, into one file. Nothing logs either, and no error from a
// request is passed on in any form but its status, because an address with the token in it could be part of one.

const LIVE_API = "https://api.telegram.org";
const POLL_SECONDS = 25;
const POLL_ABORT_MS = (POLL_SECONDS + 10) * 1000;
const CALL_ABORT_MS = 15_000;
const LONGEST_BACKOFF_MS = 60_000;
const FIRST_BACKOFF_MS = 5_000;
const OTHER_POLLER_WAIT_MS = 30_000;
const LINK_LASTS_MS = 10 * 60 * 1000;
const TOKEN_SHAPE = /^\d+:[A-Za-z0-9_-]{20,}$/;
const ONLY_THESE_UPDATES = ["message", "callback_query"];

// Messages can be 4096 characters, and a job's name and a line of ours go around the request.
const LONGEST_TEXT = 3800;

const TOKEN_REJECTED = "Telegram no longer accepts this bot’s token. Disconnect and connect it again.";
const NO_NETWORK = "Can’t reach Telegram right now. Blueberry keeps trying, and everything still waits on Needs you.";
const OTHER_POLLER = "Something else is reading this bot’s messages, so Blueberry can’t. Stop it, or use a bot of its own.";
const NOT_SAVED = "Connected for now, but this couldn’t be saved, so you’d have to connect again after a restart.";
const LINK_NOT_CURRENT = "That isn’t the current link. Get a new one in Blueberry, under Settings > Phone.";
const CANT_MESSAGE = "Telegram says the bot can’t message you. Open its chat and press Start.";

// Only an app we're developing or testing can be pointed elsewhere, and only at this computer. A real user's token
// can't be sent anywhere but Telegram.
export const telegramApiBase = (override: string | undefined, packaged: boolean): string => {
  if (!override || packaged) return LIVE_API;
  try {
    const { protocol, hostname } = new URL(override);
    return protocol === "http:" && hostname === "127.0.0.1" ? override.replace(/\/$/, "") : LIVE_API;
  } catch {
    return LIVE_API;
  }
};

class TelegramError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: number | null
  ) {
    super(`Telegram answered ${status}`);
  }
}

interface Message {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  reply_to_message?: { message_id: number };
}

interface Update {
  update_id: number;
  message?: Message;
  callback_query?: { id: string; from: { id: number }; message?: { message_id: number; chat: { id: number } }; data?: string };
}

interface Saved {
  token: string;
  botName: string | null;
  chatId: number | null;
}

// Ends early on abort. Either way the other is undone, so a poller that backs off for long doesn't gather listeners.
export const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const wake = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    signal.addEventListener("abort", wake, { once: true });
  });

export class TelegramChannel implements PhoneChannel {
  readonly longestText = LONGEST_TEXT;
  private token: string | null = null;
  private botName: string | null = null;
  private chatId: number | null = null;
  private problem: string | null = null;
  private pairing: { token: string; until: number } | null = null;
  // Replaced on every start, so stopping ends the one poller there is, and starting can't make a second.
  private polling: AbortController | null = null;
  private waitUntil = 0;
  private closed = false;
  private notSaved = false;
  private onReply: (reply: IncomingReply) => void = () => {};
  private onChoice: (choice: IncomingChoice) => void = () => {};

  constructor(
    private readonly file: string,
    private readonly onChange: () => void,
    private readonly api = telegramApiBase(process.env.BLUEBERRY_TELEGRAM_API, app.isPackaged)
  ) {}

  listen(onReply: (reply: IncomingReply) => void, onChoice: (choice: IncomingChoice) => void): void {
    this.onReply = onReply;
    this.onChoice = onChoice;
  }

  // Whether a message could reach the user right now.
  get ready(): boolean {
    return this.token !== null && this.chatId !== null && this.problem !== TOKEN_REJECTED;
  }

  get state(): PhoneState {
    return {
      status: this.token === null ? "off" : this.chatId === null ? "pairing" : "connected",
      botName: this.botName,
      pairLink: this.chatId === null && this.pairing && this.botName ? `https://t.me/${this.botName}?start=${this.pairing.token}` : null,
      problem: this.notSaved ? NOT_SAVED : this.problem,
    };
  }

  // Off until a token has been saved, so this does nothing at all for most people.
  start(): void {
    const saved = this.load();
    if (!saved) return;
    this.token = saved.token;
    this.botName = saved.botName;
    this.chatId = saved.chatId;
    if (this.chatId === null) this.newLink();
    this.startPolling();
  }

  stop(): void {
    this.polling?.abort();
    this.polling = null;
  }

  // For good. A token still being checked when the window closes doesn't start a poller nobody can stop.
  close(): void {
    this.closed = true;
    this.stop();
  }

  // Checks the token with Telegram before keeping it. Nothing changes if it fails.
  async connect(raw: unknown): Promise<PhoneState> {
    const token = typeof raw === "string" ? raw.trim() : "";
    const refuse = (problem: string) => ({ ...this.state, status: "off" as const, problem });
    if (!TOKEN_SHAPE.test(token)) return refuse("That doesn’t look like a bot token. BotFather gives you one like 123456:ABC-DEF…");
    if (!safeStorage.isEncryptionAvailable()) return refuse("This computer has no safe place to keep the token, so it wasn’t saved.");
    let username: string | undefined;
    try {
      username = (await this.request<{ username?: string }>(token, "getMe", {}, AbortSignal.timeout(CALL_ABORT_MS))).username;
    } catch (error) {
      return refuse(error instanceof TelegramError ? "Telegram didn’t accept that token." : "Couldn’t reach Telegram, so nothing was saved. Try again.");
    }
    if (!username) return refuse("Telegram didn’t say what this bot is called.");
    if (this.closed) return this.state;

    this.stop();
    this.token = token;
    this.botName = username;
    this.chatId = null;
    this.problem = null;
    this.newLink();
    this.save();
    this.startPolling();
    this.onChange();
    return this.state;
  }

  disconnect(): PhoneState {
    this.stop();
    this.token = null;
    this.botName = null;
    this.chatId = null;
    this.problem = null;
    this.pairing = null;
    this.notSaved = false;
    try {
      rmSync(this.file, { force: true });
    } catch {
      console.error("Couldn't remove the saved phone connection.");
    }
    this.onChange();
    return this.state;
  }

  // One link binds one chat, once, and it doesn't last.
  newLink(): PhoneState {
    if (this.token !== null && this.chatId === null) {
      this.pairing = { token: randomBytes(16).toString("base64url"), until: Date.now() + LINK_LASTS_MS };
    }
    return this.state;
  }

  // In the user's own browser. In a tab here, Telegram's page has a Start button that goes to a tg: address, which tabs
  // don't open. It takes no address from the renderer, so this can't open anything else.
  async openLink(): Promise<void> {
    const { pairLink } = this.state;
    if (pairLink) await shell.openExternal(pairLink);
  }

  async send(text: string, choices: PhoneChoice[] = []): Promise<string | null> {
    if (!this.ready) return null;
    try {
      const sent = await this.call<Message>("sendMessage", {
        chat_id: this.chatId,
        text,
        // Telegram's servers would fetch any address in the message for a preview, and it may be one with data in it.
        link_preview_options: { is_disabled: true },
        ...(choices.length > 0 ? { reply_markup: { inline_keyboard: [choices.map(({ label, data }) => ({ text: label, callback_data: data }))] } } : {}),
      });
      if (this.problem === CANT_MESSAGE) this.setProblem(null);
      return String(sent.message_id);
    } catch (error) {
      if (error instanceof TelegramError && error.status === 403) this.setProblem(CANT_MESSAGE);
      else this.noteFailure(error);
      return null;
    }
  }

  // Without a keyboard, so the buttons go.
  async edit(handle: string, text: string): Promise<void> {
    if (!this.ready) return;
    await this.call("editMessageText", { chat_id: this.chatId, message_id: Number(handle), text, link_preview_options: { is_disabled: true } }).catch((error) => this.noteFailure(error));
  }

  async deleteIncoming(ref: string): Promise<boolean> {
    if (!this.ready) return false;
    return this.call("deleteMessage", { chat_id: this.chatId, message_id: Number(ref) }).then(
      () => true,
      () => false
    );
  }

  private startPolling(): void {
    this.stop();
    const polling = new AbortController();
    this.polling = polling;
    void this.poll(polling.signal);
  }

  private async poll(signal: AbortSignal): Promise<void> {
    let offset: number | undefined;
    // Whatever was said while the app was closed can't be for anything open now.
    let caughtUp = false;
    let backoff = FIRST_BACKOFF_MS;
    while (!signal.aborted) {
      try {
        const params = caughtUp ? { offset, timeout: POLL_SECONDS, allowed_updates: ONLY_THESE_UPDATES } : { offset: -1, limit: 1, timeout: 0, allowed_updates: ONLY_THESE_UPDATES };
        const updates = await this.call<Update[]>("getUpdates", params, AbortSignal.any([signal, AbortSignal.timeout(POLL_ABORT_MS)]));
        if (signal.aborted) return;
        backoff = FIRST_BACKOFF_MS;
        if (this.problem === NO_NETWORK || this.problem === OTHER_POLLER) this.setProblem(null);
        for (const update of updates) {
          offset = update.update_id + 1;
          if (caughtUp) this.handle(update);
        }
        caughtUp = true;
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof TelegramError && (error.status === 401 || error.status === 404)) {
          this.setProblem(TOKEN_REJECTED);
          return;
        }
        if (error instanceof TelegramError && error.status === 409) {
          this.setProblem(OTHER_POLLER);
          await sleep(OTHER_POLLER_WAIT_MS, signal);
        } else {
          if (!(error instanceof TelegramError && error.status === 429)) this.setProblem(NO_NETWORK);
          await sleep(backoff, signal);
          backoff = Math.min(backoff * 2, LONGEST_BACKOFF_MS);
        }
      }
    }
  }

  private handle({ message, callback_query: choice }: Update): void {
    if (message) this.handleMessage(message);
    // A private chat has one other person in it, so that chat and that person are the same id.
    if (choice && this.chatId !== null && choice.from.id === this.chatId && choice.message?.chat.id === this.chatId && choice.data) {
      this.onChoice({
        handle: String(choice.message.message_id),
        data: choice.data,
        acknowledge: (note) => {
          void this.call("answerCallbackQuery", { callback_query_id: choice.id, ...(note ? { text: note } : {}) }).catch((error) => this.noteFailure(error));
        },
      });
    }
  }

  private handleMessage({ message_id, chat, text, reply_to_message }: Message): void {
    if (text === undefined) return;
    if (this.chatId === null) {
      const { pairing } = this;
      if (!pairing || chat.type !== "private") return;
      if (Date.now() > pairing.until || text !== `/start ${pairing.token}`) {
        // Silence looks broken, and this says nothing about the user.
        if (text.startsWith("/start")) void this.call("sendMessage", { chat_id: chat.id, text: LINK_NOT_CURRENT }).catch(() => {});
        return;
      }
      this.chatId = chat.id;
      this.pairing = null;
      this.save();
      void this.send("Connected. When a job needs you and you’re away from the computer, it asks here. Telegram can read these messages, so passwords are never sent this way.");
      this.onChange();
      return;
    }
    if (chat.id !== this.chatId || text.startsWith("/")) return;
    this.onReply({ text, ref: String(message_id), replyTo: reply_to_message ? String(reply_to_message.message_id) : null });
  }

  private setProblem(problem: string | null): void {
    if (problem === this.problem) return;
    this.problem = problem;
    this.onChange();
  }

  private noteFailure(error: unknown): void {
    if (error instanceof TelegramError && (error.status === 401 || error.status === 404)) this.setProblem(TOKEN_REJECTED);
    else if (!(error instanceof TelegramError)) this.setProblem(NO_NETWORK);
  }

  // Waits out a limit Telegram has set, then tries once more if it sets another.
  private async call<T = unknown>(method: string, params: object, signal = AbortSignal.timeout(CALL_ABORT_MS)): Promise<T> {
    const token = this.token;
    if (token === null) throw new TelegramError(401, null);
    for (let attempt = 0; ; attempt++) {
      await sleep(this.waitUntil - Date.now(), signal);
      try {
        return await this.request<T>(token, method, params, signal);
      } catch (error) {
        if (!(error instanceof TelegramError) || error.retryAfter === null) throw error;
        this.waitUntil = Date.now() + error.retryAfter * 1000;
        if (attempt > 0) throw error;
      }
    }
  }

  private async request<T>(token: string, method: string, params: object, signal: AbortSignal): Promise<T> {
    let response: Response;
    let body: { ok?: boolean; result?: T; parameters?: { retry_after?: number } };
    try {
      response = await fetch(`${this.api}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
        signal,
      });
      body = await response.json();
    } catch {
      // Dropped, whatever it says, as it could quote the address.
      throw new Error("Couldn't reach Telegram");
    }
    if (!body.ok) throw new TelegramError(response.status, body.parameters?.retry_after ?? null);
    return body.result as T;
  }

  private load(): Saved | null {
    try {
      const { token, botName, chatId } = JSON.parse(readFileSync(this.file, "utf8"));
      if (typeof token !== "string" || !safeStorage.isEncryptionAvailable()) return null;
      return { token: safeStorage.decryptString(Buffer.from(token, "base64")), botName: typeof botName === "string" ? botName : null, chatId: typeof chatId === "number" ? chatId : null };
    } catch {
      return null;
    }
  }

  private save(): void {
    if (this.token === null) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify({ token: safeStorage.encryptString(this.token).toString("base64"), botName: this.botName, chatId: this.chatId }), { mode: 0o600 });
      renameSync(temp, this.file);
      this.notSaved = false;
    } catch {
      this.notSaved = true;
      console.error("Couldn't save the phone connection.");
    }
  }
}
