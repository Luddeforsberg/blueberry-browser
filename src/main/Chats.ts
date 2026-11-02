import {
  ModelConfigError,
  type GenerateTitle,
  type ReplyContent,
  type ReplyMessage,
  type StreamReply,
} from "./agent";
import { randomUUID } from "crypto";
import { createPageTools, HANDOFF_WORDS, siteOf, type PageTool, type PageToolAccess } from "./browserTools";
import { enterCodeInTab } from "./codeEntry";
import type { CodeResult } from "./Phone";
import { codeEcho } from "./phoneReplies";
import { mascotNote, memoryNote } from "./mascotNote";
import { relevantFacts, worthRemembering } from "./mascotMemory";
import type { ActionApproval } from "../shared/ipc";
import type { ChatStore, StoredChat } from "./ChatStore";
import type { Tab } from "./Tab";
import type { CdpTab } from "./CdpTab";
import type { ChatApproval, ChatStep, ChatThread, ChatThreadMessage, HandoffNeed, MascotProfile, MemoryFact, WorkTabState } from "../shared/library";
import type { JobWork } from "./WorkViews";
import { BERRY, narrowSites, siteAllowed } from "../shared/mascots";
import { asHistoryMessage } from "../shared/phone";
import type { MemoryToOffer } from "./MemoryStore";

const MAX_TITLE_LENGTH = 40;
const MAX_PAGE_TEXT_LENGTH = 4000;
const MAX_RENAME_LENGTH = 100;
// A chat with no topic by then probably won't get one, so stop paying to ask.
const MAX_TITLE_ATTEMPTS = 5;
const MAX_ANSWER_LENGTH = 2000;
// A page may repeat a code back, in its words or its address, for as long as a job could plausibly still be there.
const REMEMBER_CODE_MS = 60 * 60 * 1000;
const CODE_REMOVED = "[code removed]";
const ADDRESS_DETAILS_REMOVED = "[address details removed]";

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

const publicApproval = ({ id, text, question, handoff }: ChatApproval): ChatApproval => ({ id, text, ...(question ? { question } : {}), ...(handoff ? { handoff } : {}) });

const titleFrom = (text: string): string =>
  text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : text;

// The cloud browser does one job at a time, and this reply came while it was on another.
class CloudBusyError extends Error {
  constructor() {
    super("The cloud browser is working on another job. Try again when that's done, or end it in Settings > Cloud.");
  }
}

const errorMessage = (error: unknown): string => {
  if (error instanceof ModelConfigError || error instanceof CloudBusyError) return error.message;
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

// The model sees what it did earlier by notes of its steps, not by the pages themselves, which aren't saved.
const toReplyMessage = (message: ChatThreadMessage): ReplyMessage => asHistoryMessage(message);

interface Run {
  controller: AbortController;
  partial: string;
  steps: ChatStep[];
  // Words after a step start a new paragraph, not the end of the sentence before it.
  breakBeforeText: boolean;
  approval: (ChatApproval & { askedAt: number; answer: (allow: boolean, text?: string) => void }) | null;
  tabs: Set<Tab>;
  // Every tab it has used in this reply and every site it's been on, latest last.
  used: Set<Tab>;
  sites: Set<string>;
  startedAt: number;
  // Whether what it sees depends on the "Can see" toggle, because it was sent with a page.
  withPage: boolean;
  mascot: MascotProfile;
  // Set for a task, which belongs to its caller rather than to a saved chat.
  onChange?: () => void;
  // Sites earlier replies in this chat were on, which give a reason to remember what's about them.
  earlierSites: Set<string>;
  // What its bird remembered going in, by id, and the words the model got.
  memoryIds: string[];
  memoryNote: string;
  // Questions it asked and what the user typed back.
  answers: { question: string; answer: string }[];
  // This answer came from the phone or another app, not typed here, so it stays out of what's offered for remembering.
  answeredElsewhere?: boolean;
  // A tab went to the user during this reply, so nothing about this job is offered for remembering.
  handedOver: boolean;
  // It works in the cloud browser's pages, and never in the window's tabs.
  cloud?: boolean;
  // The cloud pages it has used in this reply, latest last, like `used`.
  usedInCloud?: Set<CdpTab>;
}

// What a job in the cloud needs of the browser there. Its pages are `CdpTab`s, which the user sees as cloud tabs.
export interface ChatCloud {
  available: () => boolean;
  // One job at a time. False if another has it.
  claim: (jobId: string) => boolean;
  release: (jobId: string) => void;
  // `allows` holds from the page's first load, before anything is sent.
  open: (jobId: string, url: string, allows?: (url: string) => boolean) => Promise<CdpTab>;
  pagesOf: (jobId: string) => CdpTab[];
  page: (id: string) => CdpTab | null;
  close: (id: string) => boolean;
  // A page the user took over during a handoff goes back to the job once they say they're done.
  giveBack: (id: string) => void;
}

// Jobs on the cloud runner, which keep going with this computer off. Such a chat is saved here like any other, and its
// reply, steps and approvals come from the runner's rows. Its approvals are answered only from here, by the user.
export interface ChatRunner {
  available: () => boolean;
  has: (chatId: string) => boolean;
  // The chats with a job going there now.
  active: () => string[];
  // Sends the newest message with the chat before it. Says why it couldn't, or null once it's queued.
  start: (chatId: string, job: RunnerJobInput) => Promise<string | null>;
  // Null when nothing is running there for this chat.
  progress: (chatId: string) => RunnerProgress | null;
  decide: (chatId: string, approvalId: string, allow: boolean, answer?: string) => boolean;
  stop: (chatId: string) => void;
  forget: (chatId: string) => void;
}

export interface RunnerJobInput {
  prompt: string;
  earlier: ReplyMessage[];
  mascot: MascotProfile;
  actionApproval: ActionApproval;
}

export interface RunnerProgress {
  reply: string;
  steps: ChatStep[];
  approval: (ChatApproval & { askedAt: number }) | null;
}

// What a job needs of a bird's memory. No tool can reach any of this.
export interface ChatMemory {
  factsOf: (mascotId: string) => MemoryFact[];
  propose: (job: MemoryToOffer) => Promise<void>;
  dropOffers: (sourceId: string) => void;
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

// A run that's waiting on the user, for the Needs you page.
export interface WaitingRun {
  id: string;
  approval: ChatApproval;
  mascotId: string;
  // Null for a task, which has no saved chat.
  chatTitle: string | null;
  // The app that started its chat, such as "Claude Code".
  from: string | null;
  lastStep: string | null;
  tabId: string | null;
  askedAt: number;
}

export interface TaskProgress {
  steps: ChatStep[];
  approval: ChatApproval | null;
  tokens: number;
  memoryIds?: string[];
}

// A runner with no window has no saved chats, so only what a task uses has to be there.
export type ChatStoreLike = Pick<ChatStore, "chat" | "createChat" | "addMessage" | "renameChat" | "deleteChat" | "needsTitle" | "setGeneratedTitle">;

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
  // An approval got its answer. Comes just before the list changes.
  onDecided?: (approvalId: string, allow: boolean) => void;
}

// Every conversation with the model, whichever screen it's on. Replies are saved once they end.
export class Chats {
  private readonly runs = new Map<string, Run>();
  private readonly errors = new Map<string, string>();
  private pageAccess = true;
  private readonly jobs = new Map<string, Job>();
  private readonly taskPopups = new Map<string, Set<string>>();
  // Tabs handed to the user. Nothing reaches these, from any job. `asking` is whether a job is still waiting: one that
  // stopped waiting after the user typed there leaves the tab here, until they send it with a message or close it.
  private readonly handedOver = new Map<string, { touched: boolean; asking: boolean; host: string | null; entering: boolean; codeEntered: boolean }>();
  // Codes sent from the phone, and until when to keep them out of anything going to the model. Memory only.
  private readonly enteredCodes = new Map<RegExp, number>();
  // Tabs that have been back from the user. A sign-in lands on an address that can carry a code or a token, and any
  // later address in that tab can too, so only the site and path of it go to the model while the tab is open.
  private readonly handedBack = new Set<{ readonly id: string; readonly url: string }>();
  // Query strings and fragments seen on those tabs, kept out of anything going to the model. Memory only.
  private readonly addressDetails = new Set<string>();
  // Each chat's last reply once it's over, so its working view can settle on how it went. Memory only.
  private readonly finished = new Map<string, { run: Run; endedAt: number }>();

  constructor(
    private readonly store: ChatStoreLike,
    private readonly streamReply: StreamReply,
    private readonly generateTitle: GenerateTitle,
    private readonly browser: Pick<PageToolAccess<Tab>, "activeTab" | "allTabs"> & {
      openBackgroundTab: (url: string) => Tab;
      closeTab: (tabId: string) => boolean;
      actionApproval: () => ActionApproval;
      // What Berry goes by right now, since Hide Berry changes it.
      assistantName?: () => string;
    },
    private readonly events: ChatEvents,
    // Who a chat runs as, read when each reply starts. It must never answer with more than the mascot was given.
    private readonly mascotOf: (id: string | null) => MascotProfile = () => BERRY,
    private readonly memory: ChatMemory | null = null,
    private readonly cloud: ChatCloud | null = null,
    private readonly runner: ChatRunner | null = null
  ) {}

  // Chats started in the cloud, whose later messages go there too. Memory only, so after a restart a chat works here.
  private readonly cloudChats = new Set<string>();

  // The same tools on the cloud browser's pages. Only what this job opened there, and nothing in the window, so the
  // user's own tabs are out of reach. Approvals, limits, takeovers and handing a page to the user work as they do here.
  private cloudTools(chatId: string, run: Run, job: Job): PageTool[] {
    const cloud = this.cloud;
    if (!cloud?.available()) throw new Error("The cloud browser is off.");
    if (!cloud.claim(chatId)) throw new CloudBusyError();
    const mine = () => cloud.pagesOf(chatId).filter((tab) => job.own.has(tab.id));
    const limits = run.mascot.id === BERRY.id && run.mascot.sites.length === 0 ? undefined : run.mascot;
    return createPageTools<CdpTab>({
      allTabs: mine,
      activeTab: () => mine().find((tab) => tab.id === job.current) ?? null,
      openTab: async (url) => {
        const tab = await cloud.open(chatId, url, limits && ((address) => siteAllowed(address, limits.sites)));
        job.own.add(tab.id);
        job.current = tab.id;
        return tab;
      },
      canSee: () => true,
      onUse: (tab) => {
        run.usedInCloud ??= new Set();
        run.usedInCloud.delete(tab);
        run.usedInCloud.add(tab);
        run.sites.delete(siteOf(tab.url));
        run.sites.add(siteOf(tab.url));
      },
      stopped: () => run.controller.signal.aborted,
      ownsEveryTab: true,
      ownsTab: (id) => job.own.has(id),
      takenOver: job.takenOver,
      limits,
      closeTab: (tab) => cloud.close(tab.id),
      heldByUser: (id) => this.handedOver.has(id),
      handOver: (tab, need) => this.handOverInCloud(chatId, run, job, tab, need),
      ask: (question) => this.askQuestion(chatId, run, question),
    });
  }

  // The same as `handOver`, for a page in the cloud. The user takes the cloud tab over to sign in through the provider's
  // live view, so nothing they type comes through Blueberry, and no job reaches the page while it's held. "I'm done"
  // gives it back. Anything else gives it back only if they never took it over: if they did, it stays theirs.
  private async handOverInCloud(chatId: string, run: Run, job: Job, tab: CdpTab, need: HandoffNeed): Promise<boolean> {
    if (this.handedOver.has(tab.id)) return false;
    run.handedOver = true;
    const wasOwn = job.own.delete(tab.id);
    job.takenOver.set(tab.id, tab.url);
    const held = { touched: false, asking: true, host: hostOf(tab.url), entering: false, codeEntered: false };
    this.handedOver.set(tab.id, held);
    const who = run.mascot.id === BERRY.id ? (this.browser.assistantName?.() ?? BERRY.name) : run.mascot.name;
    const site = siteOf(tab.url);
    // A code from the phone can't be typed into a cloud page yet, so the user always does it in the page there.
    const text = need === "code" ? `${who} needs you to enter a code on ${site}` : `${who} needs you to ${HANDOFF_WORDS[need]} on ${site}`;
    let done = false;
    try {
      done = await this.wait(chatId, run, text, { handoff: { need: need === "code" ? "sign-in" : need, tabId: tab.id, site } }, (allow) => allow);
      return done;
    } finally {
      held.asking = false;
      if (done || !held.touched) {
        if (this.handedOver.delete(tab.id)) this.handedBack.add(tab);
        this.cloud?.giveBack(tab.id);
        job.takenOver.delete(tab.id);
        if (wasOwn) job.own.add(tab.id);
      }
      if (done) job.current = tab.id;
    }
  }

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
    const tools = run.cloud ? this.cloudTools(chatId, run, job) : createPageTools<Tab>({
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
        run.used.delete(tab);
        run.used.add(tab);
        run.sites.delete(siteOf(tab.url));
        run.sites.add(siteOf(tab.url));
        this.publishWorkingTabs();
      },
      stopped: () => run.controller.signal.aborted,
      ownsEveryTab: !page,
      ownsTab: (id) => job.own.has(id),
      takenOver: job.takenOver,
      heldByUser: (id) => this.handedOver.has(id),
      handOver: (tab, need) => this.handOver(chatId, run, job, tab, need),
      limits: run.mascot.id === BERRY.id && run.mascot.sites.length === 0 ? undefined : run.mascot,
      closeTab: (tab) => this.closeRunTab(run, tab),
      ask: (question) => this.askQuestion(chatId, run, question),
    });
    // A picture can't be gone through, so `Tab` refuses to take one instead. A refusal goes straight to the model too.
    return tools.map((tool) => ({
      ...tool,
      run: async (args) => {
        const result = await tool.run(args);
        return tool.returnsImage && result.startsWith("data:image/") ? result : this.withoutCodes(result);
      },
      refuses: async (args) => {
        const refused = (await tool.refuses?.(args)) ?? null;
        return refused && { ...refused, message: this.withoutCodes(refused.message) };
      },
    }));
  }

  // What a page might say back after a code went in.
  withoutCodes(text: string): string {
    const now = Date.now();
    let clean = text;
    this.enteredCodes.forEach((until, echo) => {
      if (until < now) this.enteredCodes.delete(echo);
      else clean = clean.replace(echo, CODE_REMOVED);
    });
    this.handedBack.forEach(({ url }) => {
      const details = url.search(/[?#]/);
      // A bare "#" or "?" holds no secret, and taking it out would mangle everything else the model reads.
      if (details !== -1 && url.length - details >= 4) this.addressDetails.add(url.slice(details));
    });
    // Longest first, as one address's query can begin with another's and the rest would be left showing.
    [...this.addressDetails]
      .sort((a, b) => b.length - a.length)
      .forEach((details) => {
        clean = clean.replaceAll(details, ADDRESS_DETAILS_REMOVED);
      });
    return clean;
  }

  private closeRunTab(run: Run, tab: Tab): boolean {
    const closed = this.browser.closeTab(tab.id);
    if (closed) {
      run.tabs.delete(tab);
      this.publishWorkingTabs();
    }
    return closed;
  }

  // The user does what only they can in this tab, with nothing reaching it until they say they're done. "I'm done"
  // gives it back to the job. So does anything else, if they never touched it. If they did, it's theirs, and it stays
  // out of every job's reach, because Berry must not read what they left half typed.
  private async handOver(chatId: string, run: Run, job: Job, tab: Tab, need: HandoffNeed): Promise<boolean | "code"> {
    // Another job got there first and only its answer may let the tab go, or the user left it half typed and it stays theirs.
    if (this.handedOver.has(tab.id)) return false;
    run.handedOver = true;
    const wasOwn = job.own.delete(tab.id);
    job.takenOver.set(tab.id, tab.url);
    const held = { touched: false, asking: true, host: hostOf(tab.url), entering: false, codeEntered: false };
    this.handedOver.set(tab.id, held);
    tab.heldForUser = true;
    run.tabs.delete(tab);
    this.publishWorkingTabs();
    const who = run.mascot.id === BERRY.id ? (this.browser.assistantName?.() ?? BERRY.name) : run.mascot.name;
    const site = siteOf(tab.url);
    let done = false;
    try {
      const text = need === "code" ? `${who} needs a code for ${site}` : `${who} needs you to ${HANDOFF_WORDS[need]} on ${site}`;
      done = await this.wait(chatId, run, text, { handoff: { need, tabId: tab.id, site } }, (allow) => allow);
      return done && held.codeEntered ? "code" : done;
    } finally {
      held.asking = false;
      if (done || !held.touched) {
        this.letGo(tab);
        job.takenOver.delete(tab.id);
        if (wasOwn) job.own.add(tab.id);
      }
      if (done) job.current = tab.id;
    }
  }

  // A code from the user's phone goes straight into the page, and the job only hears that one went in. Everything is
  // checked here first, and the tab stays held until it's done, so no job can see any of it happen. Not reachable from
  // any tool, and the code goes no further than the page.
  async enterCode(chatId: string, approvalId: string, code: string): Promise<CodeResult> {
    const run = this.runs.get(chatId);
    const handoff = run?.approval?.id === approvalId ? run.approval.handoff : undefined;
    if (!run || handoff?.need !== "code") return "closed";
    const tab = this.browser.allTabs().find((candidate) => candidate.id === handoff.tabId);
    if (!tab) return "tab-gone";
    const held = this.handedOver.get(tab.id);
    if (!held?.asking || !tab.heldForUser) return "not-held";
    if (held.touched) return "touched";
    if (hostOf(tab.url) !== held.host) return "moved";
    if (held.entering) return "busy";
    held.entering = true;
    const until = Date.now() + REMEMBER_CODE_MS;
    const echo = codeEcho(code);
    if (echo) this.enteredCodes.set(echo, until);
    tab.noScreenshotsUntil = until;
    // Given a size and drawn while it types, like any tab a job is using behind the user's. The hold is what keeps jobs out.
    run.tabs.add(tab);
    this.publishWorkingTabs();
    const open = () => run.approval?.id === approvalId;
    try {
      const stillOurs = () => open() && !held.touched && hostOf(tab.url) === held.host;
      const result = await enterCodeInTab(tab, code, stillOurs, () => held.touched).catch(() => "no-field" as const);
      if (result === "no-field") return "no-field";
      if (result === "interrupted") return held.touched ? "touched" : open() ? "moved" : "closed";
      held.codeEntered = true;
      return this.decide(chatId, approvalId, true) ? "entered" : "closed";
    } finally {
      held.entering = false;
      run.tabs.delete(tab);
      this.publishWorkingTabs();
    }
  }

  private letGo(tab: Tab): void {
    // This also runs for any page sent with a message, which was never away.
    if (this.handedOver.delete(tab.id)) this.handedBack.add(tab);
    tab.heldForUser = false;
  }

  // Nothing's left to wait for once a handed-over tab has gone.
  tabClosed(tabId: string): void {
    this.handedOver.delete(tabId);
    this.handedBack.forEach((tab) => {
      if (tab.id === tabId) this.handedBack.delete(tab);
    });
    this.runs.forEach((run, id) => {
      if (run.approval?.handoff?.tabId === tabId) this.decide(id, run.approval.id, false);
    });
  }

  // Everything waiting on the user, oldest first.
  waiting(): WaitingRun[] {
    return [...this.runs.entries()]
      .flatMap(([id, run]) => {
        if (!run.approval) return [];
        const job = this.jobs.get(id);
        const tabId = run.approval.handoff?.tabId ?? job?.current ?? null;
        return [
          {
            id,
            approval: publicApproval(run.approval),
            mascotId: run.mascot.id,
            chatTitle: this.store.chat(id)?.title ?? null,
            from: this.store.chat(id)?.from ?? null,
            // Not the step it is on, which is the asking.
            lastStep: run.steps.filter((step) => step.done).at(-1)?.text ?? null,
            tabId: tabId && (this.browser.allTabs().some((tab) => tab.id === tabId) || this.cloud?.page(tabId)) ? tabId : null,
            askedAt: run.approval.askedAt,
          },
        ];
      })
      .concat(this.runnerWaiting())
      .sort((a, b) => a.askedAt - b.askedAt);
  }

  // The runner's approvals, under their chat's id. The page they're about is in the cloud, so there's no tab to go to.
  private runnerWaiting(): WaitingRun[] {
    const runner = this.runner;
    if (!runner) return [];
    return runner.active().flatMap((chatId) => {
      const progress = runner.progress(chatId);
      const chat = this.store.chat(chatId);
      if (!progress?.approval || !chat) return [];
      return [
        {
          id: chatId,
          approval: publicApproval(progress.approval),
          mascotId: chat.mascotId ?? BERRY.id,
          chatTitle: chat.title,
          from: null,
          lastStep: progress.steps.filter((step) => step.done).at(-1)?.text ?? null,
          tabId: null,
          askedAt: progress.approval.askedAt,
        },
      ];
    });
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
    const held = this.handedOver.get(tabId);
    if (held) held.touched = true;
    // This runs on every click and key press in every tab, so most of the time it has nothing to do.
    if (!this.isOwnTab(tabId)) return;
    const tab = this.browser.allTabs().find((candidate) => candidate.id === tabId);
    this.jobs.forEach((job, id) => {
      if (!job.own.delete(tabId)) return;
      // Said to the model later, when the tab may be somewhere else, so it's cleaned now.
      const url = tab?.url ?? this.cloud?.page(tabId)?.url;
      job.takenOver.set(tabId, url ? this.withoutCodes(url) : "an earlier page");
      if (tab) this.runs.get(id)?.tabs.delete(tab);
    });
    this.publishWorkingTabs();
  }

  // The page a message can go with. Not one a job has handed to the user and is waiting on, whatever they send from there.
  private get activeTab(): Tab | null {
    const tab = this.browser.activeTab();
    return tab && !this.handedOver.get(tab.id)?.asking ? tab : null;
  }

  // What a chat's working view shows: the tabs its latest reply has used, and whether each may be pictured. A tab the user
  // has is theirs, and so is any the job can't see or reach, whatever the job did there earlier.
  work(chatId: string): JobWork | null {
    const ended = this.finished.get(chatId);
    const run = this.runs.get(chatId) ?? ended?.run;
    if (!run) return null;
    const job = this.jobs.get(chatId);
    const running = this.runs.get(chatId) === run;
    const tabs = run.cloud ? this.cloudTabsOf(run, job) : this.tabsOf(run, job);
    if (running) tabs.forEach(({ tab }) => run.sites.add(siteOf(tab.url)));
    return {
      mascotId: run.mascot.id,
      startedAt: run.startedAt,
      endedAt: ended && !running ? ended.endedAt : null,
      outcome: running ? null : run.controller.signal.aborted ? "stopped" : this.errors.has(chatId) ? "failed" : "done",
      tabs,
      currentId: tabs.at(-1)?.tab.id ?? null,
      sites: [...run.sites].reverse(),
      step: run.steps.filter((step) => !step.done).at(-1)?.text ?? null,
    };
  }

  private tabsOf(run: Run, job: Job | undefined): JobWork["tabs"] {
    const open = this.browser.allTabs();
    const state = (tab: Tab): WorkTabState => {
      if (this.handedOver.has(tab.id) || tab.heldForUser) return "held";
      if (job?.takenOver.has(tab.id) || !(run.withPage || job?.own.has(tab.id))) return "yours";
      if (!siteAllowed(tab.url, run.mascot.sites)) return "off-limits";
      if (run.withPage && !this.pageAccess) return "no-access";
      return tab.mayShowCode || tab.trouble || tab.loadError ? "none" : "picture";
    };
    return [...run.used].filter((tab) => open.includes(tab)).map((tab) => ({ tab, state: state(tab), site: siteOf(tab.url) }));
  }

  // A job in the cloud's pages are only ever its own. The chrome shows them from the cloud tab's own live view or
  // pictures, so nothing of them is captured here.
  private cloudTabsOf(run: Run, job: Job | undefined): JobWork["tabs"] {
    const state = (tab: CdpTab): WorkTabState => {
      if (this.handedOver.has(tab.id)) return "held";
      if (job?.takenOver.has(tab.id) || !job?.own.has(tab.id)) return "yours";
      if (!siteAllowed(tab.url, run.mascot.sites)) return "off-limits";
      return tab.trouble || tab.loadError ? "none" : "picture";
    };
    return [...(run.usedInCloud ?? [])].filter((tab) => this.cloud?.page(tab.id) === tab).map((tab) => ({ tab, cloud: true, state: state(tab), site: siteOf(tab.url) }));
  }

  thread(id: string): ChatThread | null {
    const chat = this.store.chat(id);
    return chat && this.toThread(chat);
  }

  private toThread(chat: StoredChat): ChatThread {
    const run = this.runs.get(chat.id);
    if (this.runner?.has(chat.id)) {
      const progress = this.runner.progress(chat.id);
      return {
        ...chat,
        partial: progress?.reply ?? null,
        steps: progress?.steps ?? [],
        approval: progress?.approval ? publicApproval(progress.approval) : null,
        error: this.errors.get(chat.id) ?? null,
        memoryIds: [],
        runner: true,
      };
    }
    return {
      ...chat,
      partial: run?.partial ?? null,
      steps: run?.steps ?? [],
      approval: run?.approval ? publicApproval(run.approval) : null,
      error: this.errors.get(chat.id) ?? null,
      memoryIds: run?.memoryIds ?? [],
    };
  }

  isRunning(chatId: string): boolean {
    return this.runs.has(chatId) || !!this.runner?.progress(chatId);
  }

  // Starts a chat when `chatId` is null, as `mascotId` if it's given. An existing chat stays with its own mascot.
  // The reply follows through the events. `from` names the app outside Blueberry that started a new chat, and `sites`
  // can only narrow where this reply may go, on top of the mascot's own.
  send(
    chatId: string | null,
    text: string,
    { seePage, mascotId, from = null, sites = [], cloud = false, runner = false }: { seePage: boolean; mascotId?: string | null; from?: string | null; sites?: string[]; cloud?: boolean; runner?: boolean }
  ): ChatThread | null {
    const message = text.trim();
    if (!message) return null;
    if (chatId && (!this.store.chat(chatId) || this.isRunning(chatId))) return null;
    // Only the user starts one there, from this window, so not an app and never with a page.
    const inRunner = (runner === true && from === null) || (chatId !== null && !!this.runner?.has(chatId));
    if (inRunner) return this.sendToRunner(chatId, message, mascotId ?? null);
    const inCloud = cloud === true || (chatId !== null && this.cloudChats.has(chatId));
    // Asked for the cloud with it off, the job doesn't quietly run in the user's own tabs instead.
    if (inCloud && !this.cloud?.available()) return null;

    // The renderer's choice is checked here, so nothing but a mascot in the flock can start a chat.
    const chosen = typeof mascotId === "string" && mascotId !== BERRY.id ? mascotId : null;
    if (!chatId && chosen && this.mascotOf(chosen).deletedAt !== null) return null;
    const id = chatId ?? this.store.createChat(titleFrom(message), chosen, from);
    const profile = this.mascotOf(this.store.chat(id)?.mascotId ?? null);
    const mascot = sites.length > 0 ? { ...profile, sites: narrowSites(profile.sites, sites) } : profile;
    this.store.addMessage(id, { role: "user", content: message });
    this.errors.delete(id);
    const earlier = this.finished.get(id)?.run;
    this.finished.delete(id);
    this.memory?.dropOffers(id);

    const run: Run = { controller: new AbortController(), partial: "", steps: [], breakBeforeText: false, approval: null, tabs: new Set(), used: new Set(), sites: new Set(), startedAt: Date.now(), withPage: false, mascot, earlierSites: new Set([...(earlier?.earlierSites ?? []), ...(earlier?.sites ?? [])]), memoryIds: [], memoryNote: "", answers: [], handedOver: false, cloud: inCloud };
    if (inCloud) this.cloudChats.add(id);
    this.runs.set(id, run);
    // A page in this window never goes with a job in the cloud.
    void this.reply(id, run, seePage && !inCloud);

    this.notify(id);
    return this.thread(id);
  }

  private sendToRunner(chatId: string | null, message: string, mascotId: string | null): ChatThread | null {
    const runner = this.runner;
    if (!runner?.available()) return null;
    const chosen = typeof mascotId === "string" && mascotId !== BERRY.id ? mascotId : null;
    if (!chatId && chosen && this.mascotOf(chosen).deletedAt !== null) return null;
    const id = chatId ?? this.store.createChat(titleFrom(message), chosen, null);
    const mascot = this.mascotOf(this.store.chat(id)?.mascotId ?? null);
    const earlier = (this.store.chat(id)?.messages ?? []).map(toReplyMessage);
    this.store.addMessage(id, { role: "user", content: message });
    this.errors.delete(id);
    this.finished.delete(id);
    void runner.start(id, { prompt: message, earlier, mascot, actionApproval: this.browser.actionApproval() }).then((problem) => {
      if (!problem) return;
      this.errors.set(id, problem);
      this.notify(id);
    });
    this.notify(id);
    return this.thread(id);
  }

  // A conversation in the cloud that was started elsewhere, such as on the phone, becomes a runner chat here, as the bird
  // its first job ran as. Its messages follow through `runnerFollowedUp` and `runnerFinished`.
  adoptRunnerChat(prompt: string, mascotId: string | null): string {
    return this.store.createChat(titleFrom(prompt), mascotId && mascotId !== BERRY.id ? mascotId : null, null);
  }

  // A message sent in a runner chat from elsewhere.
  runnerFollowedUp(chatId: string, prompt: string): void {
    if (!this.store.chat(chatId)) return;
    this.store.addMessage(chatId, { role: "user", content: prompt });
    this.errors.delete(chatId);
    this.finished.delete(chatId);
    this.notify(chatId);
  }

  // The runner's rows changed.
  runnerChanged(chatId: string): void {
    this.notify(chatId);
  }

  // A job on the runner is over, and its reply is saved like any other.
  runnerFinished(chatId: string, { reply, steps, error }: { reply: string; steps: ChatStep[]; error: string | null }): void {
    if (!this.store.chat(chatId)) return;
    if (reply || steps.length > 0) this.store.addMessage(chatId, { role: "assistant", content: reply, steps: steps.map((step) => ({ ...step, done: true })) });
    if (error) this.errors.set(chatId, error);
    this.notify(chatId);
    if (reply && !error) void this.nameChat(chatId);
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
    this.finished.delete(chatId);
    this.jobs.delete(chatId);
    this.cloudChats.delete(chatId);
    this.runner?.forget(chatId);
    this.memory?.dropOffers(chatId);
    if (!this.store.deleteChat(chatId)) return false;
    this.events.onListChanged();
    return true;
  }

  stop(chatId: string): void {
    this.runs.get(chatId)?.controller.abort();
    if (this.runner?.has(chatId)) this.runner.stop(chatId);
  }

  // Stop in the toolbar, from the tab being worked in rather than from a chat. The same as Stop in the chat or on a routine.
  stopWorkIn(tabId: string): boolean {
    const working = [...this.runs.values()].filter((run) => [...run.tabs].some((tab) => tab.id === tabId));
    working.forEach((run) => run.controller.abort());
    return working.length > 0;
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
      // Sending a page with a message is the user sharing it, so one they kept back is theirs to give.
      if (page) this.letGo(page);
      run.withPage = page !== null;
      const messages = await this.withNewestPage(chatId, seePage, run.mascot);
      const tools = this.jobTools(chatId, run, page);
      this.recall(chatId, run, this.userWords(chatId).join("\n"));
      await this.consume(chatId, run, messages, tools, (content) => this.events.onChunk(chatId, content));
    } catch (error) {
      if (!signal.aborted) {
        console.error("Error in chat reply:", error);
        this.errors.set(chatId, errorMessage(error));
      }
    }

    if (run.cloud) this.cloud?.release(chatId);
    // Deleted while replying, so there's nowhere to save it.
    if (this.runs.get(chatId) !== run) return;
    this.finished.set(chatId, { run, endedAt: Date.now() });
    this.runs.delete(chatId);
    this.publishWorkingTabs();
    if (run.partial || run.steps.length > 0) {
      // A step cut off by Stop is over too.
      const steps = run.steps.map((step) => ({ ...step, done: true }));
      this.store.addMessage(chatId, { role: "assistant", content: run.partial, steps, memoryIds: run.memoryIds });
    }
    this.notify(chatId);
    if (run.partial && !this.errors.has(chatId)) void this.nameChat(chatId);
    // Another app wrote what this chat started with, so none of it is what the user said about themselves.
    if (this.store.chat(chatId)?.from) return;
    this.offerToRemember(chatId, run, this.errors.has(chatId), {
      said: this.userWords(chatId),
      routine: null,
      stillWanted: () => this.finished.get(chatId)?.run === run,
    });
  }

  // What the user typed in this chat, which is saved without any page that went with it.
  private userWords(chatId: string): string[] {
    return (this.store.chat(chatId)?.messages ?? []).filter(({ role }) => role === "user").map(({ content }) => content);
  }

  // What this bird remembers that's about this job, which goes into its prompt and shows on the reply.
  private recall(id: string, run: Run, text: string): void {
    const facts = this.memory?.factsOf(run.mascot.id) ?? [];
    if (facts.length === 0) return;
    const job = this.jobs.get(id);
    const tabs = this.browser.allTabs().filter((tab) => tab.id === job?.current || job?.own.has(tab.id));
    const sites = [...run.mascot.sites, ...run.earlierSites, ...tabs.map((tab) => siteOf(tab.url))];
    const relevant = relevantFacts(facts, { sites, text, allowed: run.mascot.sites });
    run.memoryIds = relevant.map((fact) => fact.id);
    run.memoryNote = memoryNote(relevant);
    this.publish(id, run);
  }

  // The model only gets what the user typed, any question they answered, and the names of the sites used, never a page or
  // the reply. A site's name and a question's wording are as close as a page can get, and whatever comes back goes through
  // `parseProposals` and waits for the user, so nothing is kept until they press Remember.
  private offerToRemember(sourceId: string, run: Run, failed: boolean, job: Pick<MemoryToOffer, "said" | "routine" | "stillWanted">): void {
    const handedOver = run.handedOver || [...run.used].some((tab) => this.handedBack.has(tab) || this.handedOver.has(tab.id) || tab.heldForUser || tab.mayShowCode);
    const sites = [...run.sites].filter((site) => site.includes("."));
    // A routine's words were written earlier, so what's new is only what the user said during this run.
    if (!this.memory || this.mascotOf(run.mascot.id).deletedAt !== null || !worthRemembering({ stopped: run.controller.signal.aborted, failed, replied: !!run.partial, handedOver, said: job.said.at(-1), answers: run.answers })) return;
    void this.memory.propose({
      ...job,
      sourceId,
      mascotId: run.mascot.id,
      said: job.said.map((text) => this.withoutCodes(text)),
      routine: job.routine && this.withoutCodes(job.routine),
      answers: run.answers.map(({ question, answer }) => ({ question: this.withoutCodes(question), answer: this.withoutCodes(answer) })),
      sites,
    });
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
      mascotNote: (run.mascot.id === BERRY.id ? "" : mascotNote(run.mascot)) + run.memoryNote || undefined,
    })) {
      const content = run.breakBeforeText ? `\n\n${words}` : words;
      run.breakBeforeText = false;
      run.partial += content;
      onWords(content);
    }
  }

  // Runs one message as a chat with no page would, with the same tools and the same approvals, under an id of the
  // caller's. Nothing is saved here. `stop` and `decide` take that id. Never rejects.
  // With `cloud`, it works in the cloud browser's pages instead, as the cloud runner's jobs do, and `earlier` is the chat
  // that came before the message. `onText` is told the reply so far as it's written.
  async runTask(
    id: string,
    message: string,
    onProgress: (progress: TaskProgress) => void,
    mascotId: string | null = null,
    sites: string[] = [],
    { cloud = false, earlier = [], onText }: { cloud?: boolean; earlier?: ReplyMessage[]; onText?: (text: string) => void } = {}
  ): Promise<TaskResult> {
    let tokens = 0;
    const mascot = this.mascotOf(mascotId);
    const run: Run = {
      controller: new AbortController(),
      partial: "",
      steps: [],
      breakBeforeText: false,
      approval: null,
      tabs: new Set(),
      used: new Set(),
      sites: new Set(),
      startedAt: Date.now(),
      withPage: false,
      // A routine's own sites can only narrow what its mascot may do.
      mascot: { ...mascot, sites: narrowSites(mascot.sites, sites) },
      onChange: () =>
        onProgress({
          steps: run.steps.map((step) => ({ ...step })),
          approval: run.approval && publicApproval(run.approval),
          tokens,
          memoryIds: run.memoryIds,
        }),
      earlierSites: new Set(),
      memoryIds: [],
      memoryNote: "",
      answers: [],
      handedOver: false,
      cloud,
    };
    this.runs.set(id, run);
    this.taskPopups.set(id, new Set());
    let error: string | null = null;
    try {
      const tools = this.jobTools(id, run, null);
      this.recall(id, run, message);
      await this.consume(id, run, [...earlier, { role: "user", content: message }], tools, () => onText?.(run.partial), (used) => (tokens += used));
    } catch (caught) {
      if (!run.controller.signal.aborted) {
        console.error("Error in a task:", caught);
        error = errorMessage(caught);
      }
    }
    if (cloud) this.cloud?.release(id);
    this.runs.delete(id);
    this.publishWorkingTabs();
    this.offerToRemember(id, run, error !== null, { said: [], routine: message, stillWanted: () => true });
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

  private wait<T>(chatId: string, run: Run, text: string, kind: Pick<ChatApproval, "question" | "handoff">, onAnswer: (allow: boolean, answer?: string) => T): Promise<T> {
    const { signal } = run.controller;
    return new Promise((resolve, reject) => {
      const stopped = () => reject(new Error("Stopped while waiting for approval"));
      if (signal.aborted) return stopped();
      const tab = this.browser.allTabs().find(({ id }) => id === this.jobs.get(chatId)?.current);
      signal.addEventListener("abort", stopped, { once: true });
      run.approval = {
        id: randomUUID(),
        text,
        ...kind,
        askedAt: Date.now(),
        answer: (allow, answer) => {
          signal.removeEventListener("abort", stopped);
          tab?.actor?.answered();
          resolve(onAnswer(allow, answer));
        },
      };
      tab?.actor?.waitingForUser();
      this.publish(chatId, run);
      this.events.onListChanged();
    });
  }

  private askToAllow(chatId: string, run: Run, text: string): Promise<boolean> {
    return this.wait(chatId, run, text, {}, (allow) => allow);
  }

  // Null if the user would rather not answer.
  private askQuestion(chatId: string, run: Run, question: string): Promise<string | null> {
    return this.wait(chatId, run, question, { question: true }, (allow, answer) => {
      if (!allow || !answer) return null;
      if (!run.answeredElsewhere) run.answers.push({ question, answer });
      return answer;
    });
  }

  // False if that request has already been answered or its reply has ended. `answer` is for a question.
  decide(chatId: string, approvalId: string, allow: boolean, answer?: string, { fromPhone = false, fromApp = false }: { fromPhone?: boolean; fromApp?: boolean } = {}): boolean {
    const run = this.runs.get(chatId);
    // On the runner, only the user answers, from this window. The phone and apps can't.
    if (!run && this.runner?.has(chatId)) return !fromPhone && !fromApp && this.runner.decide(chatId, approvalId, allow === true, typeof answer === "string" ? answer.trim().slice(0, MAX_ANSWER_LENGTH) : undefined);
    if (run?.approval?.id !== approvalId) return false;
    run.answeredElsewhere = fromPhone || fromApp;
    const { answer: finish } = run.approval;
    run.approval = null;
    this.events.onDecided?.(approvalId, allow === true);
    finish(allow === true, typeof answer === "string" ? answer.trim().slice(0, MAX_ANSWER_LENGTH) : undefined);
    this.publish(chatId, run);
    this.events.onListChanged();
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
      tab.mayShowCode
        ? null
        : tab.screenshot().then(
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
    return this.pageAccess && !this.handedOver.has(tab.id) && siteAllowed(tab.url, mascot.sites)
      ? { url: this.withoutCodes(tab.url), text: text === null ? null : this.withoutCodes(text), screenshot }
      : null;
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
