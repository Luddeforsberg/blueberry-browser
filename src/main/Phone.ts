import type { NeedsYouItem } from "../shared/library";
import { bindReply, plausibleCode, type RequestKind } from "./phoneReplies";

// What's waiting, said on the user's phone, and what they answer. Nothing here knows which service carries it. That's
// `PhoneChannel`, and today there's one, Telegram.

export interface PhoneChoice {
  label: string;
  data: string;
}

export interface IncomingReply {
  text: string;
  // The message itself, for deleting it.
  ref: string;
  // The message of ours this is a reply to, if it is one.
  replyTo: string | null;
}

export interface IncomingChoice {
  handle: string;
  data: string;
  acknowledge: (note?: string) => void;
}

export interface PhoneChannel {
  readonly ready: boolean;
  readonly longestText: number;
  listen: (onReply: (reply: IncomingReply) => void, onChoice: (choice: IncomingChoice) => void) => void;
  // A name for the message, for `edit` and for matching replies, or null if it wasn't sent. Never throws.
  send: (text: string, choices?: PhoneChoice[]) => Promise<string | null>;
  edit: (handle: string, text: string) => Promise<void>;
  // False if the service wouldn't.
  deleteIncoming: (ref: string) => Promise<boolean>;
}

// Everything that can happen to a code on its way to a page, from `Chats.enterCode`.
export type CodeResult = "entered" | "closed" | "tab-gone" | "not-held" | "touched" | "moved" | "no-field" | "busy";

export interface PhoneDeps {
  waiting: () => NeedsYouItem[];
  nameOf: (item: NeedsYouItem) => string;
  away: () => boolean;
  decide: (id: string, approvalId: string, allow: boolean, answer?: string) => boolean;
  enterCode: (id: string, approvalId: string, code: string) => Promise<CodeResult>;
  // For the row on Needs you, which has no other way to know it was answered from here.
  onAnswered: (approvalId: string, said: string) => void;
}

const CHECK_MS = 15_000;

interface Request {
  item: NeedsYouItem;
  name: string;
  kind: RequestKind;
  text: string;
  handle: string | null;
  sent: Promise<string | null>;
  answeredHere: boolean;
  // How it was answered at the computer, once it was.
  allowed: boolean | null;
}

const kindOf = ({ approval }: NeedsYouItem): RequestKind => {
  if (approval.question) return "question";
  if (!approval.handoff) return "approval";
  return approval.handoff.need === "code" ? "code" : "computer";
};

// The words of the request itself are the same as on the card: only these lines go around them.
const wordsFor = (item: NeedsYouItem, name: string, kind: RequestKind, longest: number): { kind: RequestKind; text: string } => {
  const { text } = item.approval;
  if (text.length > longest) return { kind: "computer", text: `${name} is asking something too long to show here. It’s waiting for you at the computer.` };
  if (kind === "code") return { kind, text: `${text}. Reply with it.` };
  if (kind === "computer") return { kind, text: `${text}. It’s waiting for you at the computer.` };
  if (kind === "question") return { kind, text: `${name} asks, for “${item.job}”:\n\n${text}\n\nReply with your answer. Don’t send passwords or codes for this.` };
  return { kind, text: `${name}, for “${item.job}”:\n\n${text}` };
};

const whatHappened = ({ kind, allowed, name }: Request): string => {
  if (allowed === null) return "The job stopped, so nothing happened.";
  if (kind === "approval") return allowed ? "Allowed at the computer." : "Not allowed, at the computer.";
  if (kind === "question") return allowed ? "Answered at the computer." : "Skipped at the computer.";
  return allowed ? `Done at the computer. ${name} carries on.` : `Not done. ${name} carries on without it.`;
};

const CODE_REFUSED: Record<Exclude<CodeResult, "entered">, (site: string) => string> = {
  closed: () => "That’s no longer waiting, so nothing was typed.",
  "tab-gone": (site) => `The tab for ${site} is gone, so nothing was typed.`,
  "not-held": (site) => `The tab for ${site} isn’t waiting for you any more, so nothing was typed.`,
  touched: (site) => `You’ve used the ${site} tab yourself, so it stays yours and nothing was typed. It’s waiting for you at the computer.`,
  moved: (site) => `That tab has left ${site}, so nothing was typed. It’s waiting for you at the computer.`,
  "no-field": (site) => `I couldn’t tell where the code goes on ${site}, so nothing was typed. It’s waiting for you at the computer.`,
  busy: () => "Still typing the last one, so this one wasn’t used.",
};

export class Phone {
  private readonly requests = new Map<string, Request>();
  private readonly decided = new Map<string, boolean>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly channel: PhoneChannel,
    private readonly deps: PhoneDeps
  ) {
    channel.listen(
      (reply) => void this.onReply(reply).catch(() => console.error("Couldn't deal with a reply from the phone.")),
      (choice) => this.onChoice(choice)
    );
  }

  start(): void {
    this.timer = setInterval(() => this.sync(), CHECK_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // At the computer, or wherever `decide` was called from. Comes before the list changes.
  noteDecided(approvalId: string, allow: boolean): void {
    if (this.requests.has(approvalId)) this.decided.set(approvalId, allow);
  }

  // Brings the phone up to date with what's waiting. Safe to call at any time, and often.
  sync(): void {
    const items = this.deps.waiting();
    const open = new Set(items.map(({ approval }) => approval.id));
    this.requests.forEach((request, id) => {
      if (!open.has(id)) this.settle(id, request);
    });
    if (!this.channel.ready || !this.deps.away()) return;
    items.filter(({ approval }) => !this.requests.has(approval.id)).forEach((item) => this.ask(item));
  }

  private ask(item: NeedsYouItem): void {
    const name = this.deps.nameOf(item);
    const id = item.approval.id;
    const { kind, text } = wordsFor(item, name, kindOf(item), this.channel.longestText);
    const choices = kind === "approval" ? [{ label: "Allow", data: `allow:${id}` }, { label: "Don’t allow", data: `deny:${id}` }] : [];
    const request: Request = { item, name, kind, text, handle: null, sent: this.channel.send(text, choices), answeredHere: false, allowed: null };
    this.requests.set(id, request);
    void request.sent.then((handle) => {
      request.handle = handle;
      // Not sent, so the next look tries again.
      if (handle === null && this.requests.get(id) === request) this.requests.delete(id);
    });
  }

  private settle(id: string, request: Request): void {
    this.requests.delete(id);
    request.allowed = this.decided.get(id) ?? null;
    this.decided.delete(id);
    if (request.answeredHere) return;
    void request.sent.then((handle) => {
      if (handle !== null) return this.channel.edit(handle, `${request.text}\n\n${whatHappened(request)}`);
      return undefined;
    });
  }

  private onChoice({ handle, data, acknowledge }: IncomingChoice): void {
    const [action, id] = data.split(":");
    const request = this.requests.get(id);
    if (!request || request.handle !== handle || request.kind !== "approval" || (action !== "allow" && action !== "deny")) {
      acknowledge("That’s already been answered.");
      return;
    }
    const allow = action === "allow";
    const said = allow ? `Allowed. ${request.name} carries on.` : `Not allowed, and ${request.name} knows.`;
    request.answeredHere = true;
    const { approval, id: runId } = request.item;
    if (!this.deps.decide(runId, approval.id, allow)) {
      request.answeredHere = false;
      acknowledge("That’s already been answered.");
      return;
    }
    acknowledge();
    this.deps.onAnswered(approval.id, said);
    void this.channel.edit(handle, `${request.text}\n\n${said}`);
  }

  private async onReply({ text, ref, replyTo }: IncomingReply): Promise<void> {
    const open = [...this.requests.values()].flatMap((request) => (request.handle === null ? [] : [{ ...request, handle: request.handle, request }]));
    const target = bindReply(text, replyTo, open);
    const looksLikeACode = plausibleCode(text) !== null;

    if ("refused" in target) {
      const said = this.refusal(target.refused, open.map(({ request }) => request));
      const removed = looksLikeACode ? await this.channel.deleteIncoming(ref) : true;
      await this.channel.send(removed ? said : `${said} I couldn’t delete your message, so delete it yourself.`);
      return;
    }

    const { request } = target.to;
    const { approval, id } = request.item;
    if (request.kind === "question") {
      request.answeredHere = true;
      if (!this.deps.decide(id, approval.id, true, text)) {
        request.answeredHere = false;
        await this.channel.send("That’s already been answered.");
        return;
      }
      const said = `Answered. ${request.name} carries on.`;
      this.deps.onAnswered(approval.id, said);
      await this.channel.edit(target.to.handle, `${request.text}\n\n${said}`);
      return;
    }

    // Whatever it is, it was meant for a page and doesn't stay in the chat.
    const site = approval.handoff?.site ?? "that site";
    const code = plausibleCode(text);
    let problem: string | null = "That doesn’t look like a code, so nothing was typed. Send only the code: letters or digits, with at most one space or dash. Passwords are never sent this way.";
    if (code !== null) {
      // Set first, as going in ends the request, and the phone says what happened below rather than "at the computer".
      const alreadyEntering = request.answeredHere;
      request.answeredHere = true;
      const result = await this.deps.enterCode(id, approval.id, code);
      if (result === "entered") {
        problem = null;
        this.deps.onAnswered(approval.id, `Code entered. ${request.name} carries on.`);
        await this.channel.edit(target.to.handle, `${request.text}\n\nEntered the code on ${site}. ${request.name} is checking whether it worked.`);
      } else {
        request.answeredHere = alreadyEntering;
        problem = CODE_REFUSED[result](site);
      }
    }
    const removed = await this.channel.deleteIncoming(ref);
    if (problem) await this.channel.send(removed ? problem : `${problem} I couldn’t delete your message, so delete it yourself.`);
    else if (!removed) await this.channel.send("I couldn’t delete your message with the code, so delete it yourself.");
  }

  private refusal(why: "closed" | "not-by-reply" | "nothing-waiting" | "which-one" | "looks-like-a-code", open: Request[]): string {
    if (why === "closed") return "That’s no longer waiting, so nothing happened.";
    if (why === "nothing-waiting") return "Nothing’s waiting for you right now, so nothing happened.";
    if (why === "not-by-reply") return "A reply can’t answer that, so nothing happened. Use its buttons, or the computer.";
    if (why === "looks-like-a-code") return "That looks like a code, and answers to questions go to the model, so it wasn’t passed on. If it really is your answer, type it at the computer.";
    const takers = open.filter(({ kind }) => kind === "code" || kind === "question");
    const list = takers.map(({ item, kind, name }) => `• ${kind === "code" ? `${name}: a code for ${item.approval.handoff?.site}` : `${name}: a question for “${item.job}”`}`);
    return `More than one thing is waiting, so nothing was used. Reply to the message you’re answering:\n${list.join("\n")}`;
  }
}
