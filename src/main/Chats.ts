import {
  ModelConfigError,
  type GenerateTitle,
  type ReplyContent,
  type ReplyMessage,
  type StreamReply,
} from "./agent";
import { randomUUID } from "crypto";
import { createPageTools, type PageTool, type PageToolAccess } from "./browserTools";
import { mascotNote } from "./mascotNote";
import type { ActionApproval } from "../shared/ipc";
import type { ChatStore, StoredChat } from "./ChatStore";
import type { Tab } from "./Tab";
import type { ChatApproval, ChatStep, ChatThread, ChatThreadMessage, MascotProfile } from "../shared/library";
import { BERRY, siteAllowed } from "../shared/mascots";

const MAX_TITLE_LENGTH = 40;
const MAX_PAGE_TEXT_LENGTH = 4000;
const MAX_RENAME_LENGTH = 100;
// A chat with no topic by then probably won't get one, so stop paying to ask.
const MAX_TITLE_ATTEMPTS = 5;
const MAX_ANSWER_LENGTH = 2000;

const publicApproval = ({ id, text, question }: ChatApproval): ChatApproval => ({ id, text, ...(question ? { question } : {}) });

const titleFrom = (text: string): string =>
  text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : text;

const errorMessage = (error: unknown): string => {
  if (error instanceof ModelConfigError) return error.message;
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
  approval: (ChatApproval & { answer: (allow: boolean, text?: string) => void }) | null;
  tabs: Set<Tab>;
  mascot: MascotProfile;
  // Set for a task, which belongs to its caller rather than to a saved chat.
  onChange?: () => void;
}

// What a chat or task has to do with tabs. It outlasts a reply, so the next message can go on where the last one left off.
interface Job {
  // The tabs it opened, which are all it can reach when it can't see the user's page.
  own: Set<string>;
  // Tabs it opened that the user has taken, with the address each was at.
  takenOver: Map<string, string>;
  // Where a call that names no tab goes. Fixed by the job, so the user's browsing can't redirect it.
  current: string | null;
}

export interface TaskProgress {
  steps: ChatStep[];
  approval: ChatApproval | null;
  tokens: number;
}

export interface TaskResult {
  text: string;
  steps: ChatStep[];
  error: string | null;
  stopped: boolean;
  tokens: number;
  // The tabs it opened that are still its own. Any the user took over are theirs now, and aren't here.
  tabIds: string[];
}

export interface ChatEvents {
  onChunk: (chatId: string, content: string) => void;
  onThread: (thread: ChatThread) => void;
  onListChanged: () => void;
  // `mascots` says who is working in a tab, where it's a mascot other than Berry.
  onWorkingTabs: (tabs: Set<Tab>, mascots: Map<Tab, string>) => void;
}

// Every conversation with the model, whichever screen it's on. Replies are saved once they end.
export class Chats {
  private readonly runs = new Map<string, Run>();
  private readonly errors = new Map<string, string>();
  private pageAccess = true;
  private readonly jobs = new Map<string, Job>();
  private readonly taskPopups = new Map<string, Set<string>>();

  constructor(
    private readonly store: ChatStore,
    private readonly streamReply: StreamReply,
    private readonly generateTitle: GenerateTitle,
    private readonly browser: Pick<PageToolAccess, "activeTab" | "allTabs"> & {
      openBackgroundTab: (url: string) => Tab;
      closeTab: (tabId: string) => boolean;
      actionApproval: () => ActionApproval;
    },
    private readonly events: ChatEvents,
    // Who a chat runs as, read when each reply starts. It must never answer with more than the mascot was given.
    private readonly mascotOf: (id: string | null) => MascotProfile = () => BERRY
  ) {}

  // Tabs always open behind the user, so the approval cards, the reply and whatever they're doing stay in front. With
  // `page`, the page sent with this message, the tools also reach every open tab. Without it, only the job's own.
  private jobTools(chatId: string, run: Run, page: Tab | null): PageTool[] {
    const job = this.jobs.get(chatId) ?? { own: new Set<string>(), takenOver: new Map<string, string>(), current: null };
    this.jobs.set(chatId, job);
    if (page) {
      job.current = page.id;
      // Sending the page with a message is the user handing it over.
      job.takenOver.delete(page.id);
    } else if (job.current && !job.own.has(job.current) && !job.takenOver.has(job.current)) {
      // That was the page from an earlier message. This one came without it, so it's out of reach.
      job.current = [...job.own].at(-1) ?? null;
    }
    return createPageTools({
      allTabs: () => this.browser.allTabs().filter((tab) => page || job.own.has(tab.id)),
      activeTab: () => this.browser.allTabs().find((tab) => tab.id === job.current) ?? null,
      openTab: (url) => {
        const tab = this.browser.openBackgroundTab(url);
        job.own.add(tab.id);
        job.current = tab.id;
        return tab;
      },
      canSee: () => !page || this.pageAccess,
      onUse: (tab) => {
        run.tabs.add(tab);
        this.publishWorkingTabs();
      },
      ownsEveryTab: !page,
      ownsTab: (id) => job.own.has(id),
      takenOver: job.takenOver,
      limits: run.mascot.id === BERRY.id ? undefined : run.mascot,
      closeTab: (tab) => this.closeRunTab(run, tab),
      ask: (question) => this.askQuestion(chatId, run, question),
    });
  }

  private closeRunTab(run: Run, tab: Tab): boolean {
    const closed = this.browser.closeTab(tab.id);
    if (closed) {
      run.tabs.delete(tab);
      this.publishWorkingTabs();
    }
    return closed;
  }

  // A page in a task's tab opened another. Nobody allowed that, so the task can't reach it, but it's cleared up with
  // the task's own.
  notePopup(openerId: string, tabId: string): void {
    this.taskPopups.forEach((popups, id) => {
      if (popups.has(openerId) || this.jobs.get(id)?.own.has(openerId)) popups.add(tabId);
    });
  }

  // Whether a chat or task is still using this tab as its own.
  isOwnTab(tabId: string): boolean {
    return [...this.jobs.values()].some(({ own }) => own.has(tabId));
  }

  // The user clicked or typed in this tab, or sent it somewhere. Looking at it isn't enough. From here on it may hold
  // anything, so the job that opened it can't reach it, and the model is told why.
  releaseTab(tabId: string): void {
    this.taskPopups.forEach((popups) => popups.delete(tabId));
    // This runs on every click and key press in every tab, so most of the time it has nothing to do.
    if (!this.isOwnTab(tabId)) return;
    const tab = this.browser.allTabs().find((candidate) => candidate.id === tabId);
    this.jobs.forEach((job, id) => {
      if (!job.own.delete(tabId)) return;
      job.takenOver.set(tabId, tab?.url ?? "an earlier page");
      if (tab) this.runs.get(id)?.tabs.delete(tab);
    });
    this.publishWorkingTabs();
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
      approval: run?.approval ? publicApproval(run.approval) : null,
      error: this.errors.get(chat.id) ?? null,
    };
  }

  isRunning(chatId: string): boolean {
    return this.runs.has(chatId);
  }

  // Starts a chat when `chatId` is null, as `mascotId` if it's given. An existing chat stays with its own mascot.
  // The reply follows through the events.
  send(chatId: string | null, text: string, { seePage, mascotId }: { seePage: boolean; mascotId?: string | null }): ChatThread | null {
    const message = text.trim();
    if (!message) return null;
    if (chatId && (!this.store.chat(chatId) || this.runs.has(chatId))) return null;

    // The renderer's choice is checked here, so nothing but a mascot in the flock can start a chat.
    const chosen = typeof mascotId === "string" && mascotId !== BERRY.id ? mascotId : null;
    if (!chatId && chosen && this.mascotOf(chosen).deletedAt !== null) return null;
    const id = chatId ?? this.store.createChat(titleFrom(message), chosen);
    const mascot = this.mascotOf(this.store.chat(id)?.mascotId ?? null);
    this.store.addMessage(id, { role: "user", content: message });
    this.errors.delete(id);

    const run: Run = { controller: new AbortController(), partial: "", steps: [], breakBeforeText: false, approval: null, tabs: new Set(), mascot };
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
    this.publishWorkingTabs();
    this.errors.delete(chatId);
    this.jobs.delete(chatId);
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
      // Read before anything waits, so it's the page the message was sent from wherever the user has gone since.
      const page = seePage && this.pageAccess ? this.activeTab : null;
      const messages = await this.withNewestPage(chatId, seePage, run.mascot);
      const tools = this.jobTools(chatId, run, page);
      await this.consume(chatId, run, messages, tools, (content) => this.events.onChunk(chatId, content));
    } catch (error) {
      if (!signal.aborted) {
        console.error("Error in chat reply:", error);
        this.errors.set(chatId, errorMessage(error));
      }
    }

    // Deleted while replying, so there's nowhere to save it.
    if (this.runs.get(chatId) !== run) return;
    this.runs.delete(chatId);
    this.publishWorkingTabs();
    if (run.partial || run.steps.length > 0) {
      // A step cut off by Stop is over too.
      const steps = run.steps.map((step) => ({ ...step, done: true }));
      this.store.addMessage(chatId, { role: "assistant", content: run.partial, steps });
    }
    this.notify(chatId);
    if (run.partial && !this.errors.has(chatId)) void this.nameChat(chatId);
  }

  private async consume(
    id: string,
    run: Run,
    messages: ReplyMessage[],
    tools: PageTool[],
    onWords: (content: string) => void,
    onUsage?: (tokens: number) => void
  ): Promise<void> {
    for await (const words of this.streamReply(messages, run.controller.signal, {
      tools,
      actionApproval: this.browser.actionApproval,
      approve: (text) => this.askToAllow(id, run, text),
      onStep: (text) => this.startStep(id, run, text),
      onUsage,
      mascotNote: run.mascot.id === BERRY.id ? undefined : mascotNote(run.mascot),
    })) {
      const content = run.breakBeforeText ? `\n\n${words}` : words;
      run.breakBeforeText = false;
      run.partial += content;
      onWords(content);
    }
  }

  // Runs one message as a chat with no page would, with the same tools and the same approvals, under an id of the
  // caller's. Nothing is saved here. `stop` and `decide` take that id. Never rejects.
  async runTask(id: string, message: string, onProgress: (progress: TaskProgress) => void, mascotId: string | null = null): Promise<TaskResult> {
    let tokens = 0;
    const run: Run = {
      controller: new AbortController(),
      partial: "",
      steps: [],
      breakBeforeText: false,
      approval: null,
      tabs: new Set(),
      mascot: this.mascotOf(mascotId),
      onChange: () =>
        onProgress({
          steps: run.steps.map((step) => ({ ...step })),
          approval: run.approval && publicApproval(run.approval),
          tokens,
        }),
    };
    this.runs.set(id, run);
    this.taskPopups.set(id, new Set());
    let error: string | null = null;
    try {
      const tools = this.jobTools(id, run, null);
      await this.consume(id, run, [{ role: "user", content: message }], tools, () => {}, (used) => (tokens += used));
    } catch (caught) {
      if (!run.controller.signal.aborted) {
        console.error("Error in a task:", caught);
        error = errorMessage(caught);
      }
    }
    this.runs.delete(id);
    this.publishWorkingTabs();
    const tabIds = [...(this.jobs.get(id)?.own ?? []), ...(this.taskPopups.get(id) ?? [])];
    this.jobs.delete(id);
    this.taskPopups.delete(id);
    return {
      text: run.partial,
      steps: run.steps.map((step) => ({ ...step, done: true })),
      error,
      stopped: run.controller.signal.aborted,
      tokens,
      tabIds,
    };
  }

  private publishWorkingTabs(): void {
    const runs = [...this.runs.values()];
    const mascots = new Map(runs.filter((run) => run.mascot.id !== BERRY.id).flatMap((run) => [...run.tabs].map((tab) => [tab, run.mascot.id] as const)));
    this.events.onWorkingTabs(new Set(runs.flatMap((run) => [...run.tabs])), mascots);
  }

  private publish(chatId: string, run: Run): void {
    if (run.onChange) return run.onChange();
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

  private wait<T>(chatId: string, run: Run, text: string, question: boolean, onAnswer: (allow: boolean, answer?: string) => T): Promise<T> {
    const { signal } = run.controller;
    return new Promise((resolve, reject) => {
      const stopped = () => reject(new Error("Stopped while waiting for approval"));
      if (signal.aborted) return stopped();
      signal.addEventListener("abort", stopped, { once: true });
      run.approval = {
        id: randomUUID(),
        text,
        ...(question ? { question: true } : {}),
        answer: (allow, answer) => {
          signal.removeEventListener("abort", stopped);
          resolve(onAnswer(allow, answer));
        },
      };
      this.publish(chatId, run);
    });
  }

  private askToAllow(chatId: string, run: Run, text: string): Promise<boolean> {
    return this.wait(chatId, run, text, false, (allow) => allow);
  }

  // Null if the user would rather not answer.
  private askQuestion(chatId: string, run: Run, question: string): Promise<string | null> {
    return this.wait(chatId, run, question, true, (allow, answer) => (allow && answer ? answer : null));
  }

  // False if that request has already been answered or its reply has ended. `answer` is for a question.
  decide(chatId: string, approvalId: string, allow: boolean, answer?: string): boolean {
    const run = this.runs.get(chatId);
    if (run?.approval?.id !== approvalId) return false;
    const { answer: finish } = run.approval;
    run.approval = null;
    finish(allow === true, typeof answer === "string" ? answer.trim().slice(0, MAX_ANSWER_LENGTH) : undefined);
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
  private async withNewestPage(chatId: string, seePage: boolean, mascot: MascotProfile): Promise<ReplyMessage[]> {
    const messages = (this.store.chat(chatId)?.messages ?? []).map(toReplyMessage);
    const page = seePage ? await this.readPage(mascot) : null;
    const newest = messages[messages.length - 1];
    if (!page || !newest || typeof newest.content !== "string") return messages;
    return [...messages.slice(0, -1), { role: "user", content: withPage(newest.content, page) }];
  }

  private async readPage(mascot: MascotProfile): Promise<Page | null> {
    const tab = this.pageAccess ? this.activeTab : null;
    // A mascot's limit covers the page that goes with a message too.
    if (!tab || !siteAllowed(tab.url, mascot.sites)) return null;

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
    return this.pageAccess && siteAllowed(tab.url, mascot.sites) ? { url: tab.url, text, screenshot } : null;
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
