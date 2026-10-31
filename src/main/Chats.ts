import {
  isStepLimit,
  ModelConfigError,
  type GenerateTitle,
  type ReplyContent,
  type ReplyMessage,
  type StreamReply,
} from "./agent";
import { randomUUID } from "crypto";
import { createPageTools, type PageTool, type PageToolAccess } from "./browserTools";
import type { ChatStore, StoredChat } from "./ChatStore";
import type { Tab } from "./Tab";
import type { ChatApproval, ChatStep, ChatThread, ChatThreadMessage } from "../shared/library";

const MAX_TITLE_LENGTH = 40;
const MAX_PAGE_TEXT_LENGTH = 4000;
const MAX_RENAME_LENGTH = 100;
// A chat with no topic by then probably won't get one, so stop paying to ask.
const MAX_TITLE_ATTEMPTS = 5;

const titleFrom = (text: string): string =>
  text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : text;

const errorMessage = (error: unknown): string => {
  if (error instanceof ModelConfigError) return error.message;
  if (isStepLimit(error)) return "This took too many steps, so it stopped here. Send a message to keep going.";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("401") || message.includes("unauthorized")) {
    return "The API key was rejected. Check it in the .env file and restart.";
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return "The model is rate limited right now. Try again in a moment.";
  }
  if (message.includes("network") || message.includes("fetch") || message.includes("econnrefused")) {
    return "Couldn't reach the model. Check your connection and try again.";
  }
  return "Something went wrong with this reply. Try again.";
};

interface Page {
  url: string;
  text: string | null;
  screenshot: string | null;
}

const withPage = (message: string, page: Page): ReplyContent => {
  const text = page.text ? `\n${page.text.slice(0, MAX_PAGE_TEXT_LENGTH)}\n` : "";
  return [
    ...(page.screenshot
      ? [{ type: "image_url" as const, image_url: { url: page.screenshot } }]
      : []),
    { type: "text" as const, text: `<page url="${page.url}">${text}</page>\n\n${message}` },
  ];
};

// The model sees what it did earlier by these notes, not by the pages themselves, which aren't saved.
const toReplyMessage = ({ role, content, steps }: ChatThreadMessage): ReplyMessage => ({
  role,
  content: steps ? `<steps>\n${steps.map((step) => `- ${step.text}`).join("\n")}\n</steps>\n\n${content}` : content,
});

interface Run {
  controller: AbortController;
  partial: string;
  steps: ChatStep[];
  // Words after a step start a new paragraph, not the end of the sentence before it.
  breakBeforeText: boolean;
  approval: (ChatApproval & { answer: (allow: boolean) => void }) | null;
}

export interface ChatEvents {
  onChunk: (chatId: string, content: string) => void;
  onThread: (thread: ChatThread) => void;
  onListChanged: () => void;
}

// Every conversation with the model, whichever screen it's on. Replies are saved once they end.
export class Chats {
  private readonly runs = new Map<string, Run>();
  private readonly errors = new Map<string, string>();
  private pageAccess = true;
  private readonly pageTools: PageTool[];
  // The tabs each chat opened itself, which are all it can reach when it can't see the user's page.
  private readonly ownTabs = new Map<string, Set<string>>();

  constructor(
    private readonly store: ChatStore,
    private readonly streamReply: StreamReply,
    private readonly generateTitle: GenerateTitle,
    private readonly browser: Omit<PageToolAccess, "canSee"> & { openBackgroundTab: (url: string) => Tab },
    private readonly events: ChatEvents
  ) {
    this.pageTools = createPageTools({ ...browser, canSee: () => this.pageAccess });
  }

  // These open behind the chat, so the approval cards and the reply stay in front of the user.
  private ownTabTools(chatId: string): PageTool[] {
    const ids = this.ownTabs.get(chatId) ?? new Set<string>();
    this.ownTabs.set(chatId, ids);
    const allTabs = () => this.browser.allTabs().filter((tab) => ids.has(tab.id));
    return createPageTools({
      allTabs,
      activeTab: () => allTabs().at(-1) ?? null,
      openTab: (url) => {
        const tab = this.browser.openBackgroundTab(url);
        ids.add(tab.id);
        return tab;
      },
      canSee: () => true,
    });
  }

  // A tab the user has gone to is theirs now, and may hold anything, so no chat reaches it this way any more.
  releaseTab(tabId: string): void {
    this.ownTabs.forEach((ids) => ids.delete(tabId));
  }

  private get activeTab(): Tab | null {
    return this.browser.activeTab();
  }

  thread(id: string): ChatThread | null {
    const chat = this.store.chat(id);
    return chat && this.toThread(chat);
  }

  private toThread(chat: StoredChat): ChatThread {
    const run = this.runs.get(chat.id);
    return {
      ...chat,
      partial: run?.partial ?? null,
      steps: run?.steps ?? [],
      approval: run?.approval ? { id: run.approval.id, text: run.approval.text } : null,
      error: this.errors.get(chat.id) ?? null,
    };
  }

  // Starts a chat when `chatId` is null. The reply follows through the events.
  send(chatId: string | null, text: string, { seePage }: { seePage: boolean }): ChatThread | null {
    const message = text.trim();
    if (!message) return null;
    if (chatId && (!this.store.chat(chatId) || this.runs.has(chatId))) return null;

    const id = chatId ?? this.store.createChat(titleFrom(message));
    this.store.addMessage(id, { role: "user", content: message });
    this.errors.delete(id);

    const run: Run = { controller: new AbortController(), partial: "", steps: [], breakBeforeText: false, approval: null };
    this.runs.set(id, run);
    void this.reply(id, run, seePage);

    this.notify(id);
    return this.thread(id);
  }

  private notify(chatId: string): void {
    const thread = this.thread(chatId);
    if (thread) this.events.onThread(thread);
    this.events.onListChanged();
  }

  rename(chatId: string, title: string): boolean {
    const name = title.trim().slice(0, MAX_RENAME_LENGTH);
    if (!name || !this.store.renameChat(chatId, name)) return false;
    this.notify(chatId);
    return true;
  }

  delete(chatId: string): boolean {
    this.stop(chatId);
    this.runs.delete(chatId);
    this.errors.delete(chatId);
    this.ownTabs.delete(chatId);
    if (!this.store.deleteChat(chatId)) return false;
    this.events.onListChanged();
    return true;
  }

  stop(chatId: string): void {
    this.runs.get(chatId)?.controller.abort();
  }

  stopAll(): void {
    this.runs.forEach((run) => run.controller.abort());
  }

  // Never rejects: whatever goes wrong ends up on the thread.
  private async reply(chatId: string, run: Run, seePage: boolean): Promise<void> {
    const { signal } = run.controller;
    try {
      const messages = await this.withNewestPage(chatId, seePage);
      const tools = seePage && this.pageAccess && this.activeTab ? this.pageTools : this.ownTabTools(chatId);
      const onStep = (text: string) => this.startStep(chatId, run, text);
      const approve = (text: string) => this.askToAllow(chatId, run, text);
      for await (const words of this.streamReply(messages, signal, { tools, approve, onStep })) {
        const content = run.breakBeforeText ? `\n\n${words}` : words;
        run.breakBeforeText = false;
        run.partial += content;
        this.events.onChunk(chatId, content);
      }
    } catch (error) {
      if (!signal.aborted) {
        console.error("Error in chat reply:", error);
        this.errors.set(chatId, errorMessage(error));
      }
    }

    // Deleted while replying, so there's nowhere to save it.
    if (this.runs.get(chatId) !== run) return;
    this.runs.delete(chatId);
    if (run.partial || run.steps.length > 0) {
      // A step cut off by Stop is over too.
      const steps = run.steps.map((step) => ({ ...step, done: true }));
      this.store.addMessage(chatId, { role: "assistant", content: run.partial, steps });
    }
    this.notify(chatId);
    if (run.partial && !this.errors.has(chatId)) void this.nameChat(chatId);
  }

  private publish(chatId: string, run: Run): void {
    const thread = this.runs.get(chatId) === run ? this.thread(chatId) : null;
    if (thread) this.events.onThread(thread);
  }

  private startStep(chatId: string, run: Run, text: string): () => void {
    const step: ChatStep = { text, done: false };
    run.steps.push(step);
    run.breakBeforeText = run.partial !== "";
    this.publish(chatId, run);
    return () => {
      step.done = true;
      this.publish(chatId, run);
    };
  }

  private askToAllow(chatId: string, run: Run, text: string): Promise<boolean> {
    const { signal } = run.controller;
    return new Promise((resolve, reject) => {
      const stopped = () => reject(new Error("Stopped while waiting for approval"));
      if (signal.aborted) return stopped();
      signal.addEventListener("abort", stopped, { once: true });
      run.approval = {
        id: randomUUID(),
        text,
        answer: (allow) => {
          signal.removeEventListener("abort", stopped);
          resolve(allow);
        },
      };
      this.publish(chatId, run);
    });
  }

  // False if that request has already been answered or its reply has ended.
  decide(chatId: string, approvalId: string, allow: boolean): boolean {
    const run = this.runs.get(chatId);
    if (run?.approval?.id !== approvalId) return false;
    const { answer } = run.approval;
    run.approval = null;
    answer(allow === true);
    this.publish(chatId, run);
    return true;
  }

  // Never rejects: a chat keeps its first message as its title until this works.
  private async nameChat(chatId: string): Promise<void> {
    const chat = this.store.chat(chatId);
    if (!chat || !this.store.needsTitle(chatId)) return;
    if (chat.messages.filter((message) => message.role === "user").length > MAX_TITLE_ATTEMPTS) return;
    try {
      const title = await this.generateTitle(chat.messages);
      if (title && this.store.setGeneratedTitle(chatId, title)) this.notify(chatId);
    } catch (error) {
      console.error("Failed to generate a chat title:", error);
    }
  }

  // Only the newest message carries the page, so older screenshots don't go to the model again.
  private async withNewestPage(chatId: string, seePage: boolean): Promise<ReplyMessage[]> {
    const messages = (this.store.chat(chatId)?.messages ?? []).map(toReplyMessage);
    const page = seePage ? await this.readPage() : null;
    const newest = messages[messages.length - 1];
    if (!page || !newest || typeof newest.content !== "string") return messages;
    return [...messages.slice(0, -1), { role: "user", content: withPage(newest.content, page) }];
  }

  private async readPage(): Promise<Page | null> {
    const tab = this.pageAccess ? this.activeTab : null;
    if (!tab) return null;

    const [screenshot, text] = await Promise.all([
      tab.screenshot().then(
        (image) => image.toDataURL(),
        (error) => {
          console.error("Failed to capture screenshot:", error);
          return null;
        }
      ),
      tab.getTabText().catch((error) => {
        console.error("Failed to get page text:", error);
        return null;
      }),
    ]);
    // "Can see" may have been switched off while the page was being read, so nothing read goes out.
    return this.pageAccess ? { url: tab.url, text, screenshot } : null;
  }

  // The "Can see" toggle. Off means no page text or screenshot goes with a message.
  setPageAccess(enabled: boolean): boolean {
    this.pageAccess = enabled === true;
    return this.pageAccess;
  }

  get canSeePage(): boolean {
    return this.pageAccess;
  }
}
