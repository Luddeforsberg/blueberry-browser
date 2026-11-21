import type { GenerateTitle, ReplyMessage, StreamReply } from "./agent";
import type { PageToolAccess } from "../tools/browserTools";
import type { ActionApproval } from "../../shared/ipc";
import type { ChatStore } from "./ChatStore";
import type { Tab } from "../tabs/Tab";
import type { CdpTab } from "../tools/CdpTab";
import type { ChatApproval, ChatStep, ChatThread, ChatThreadMessage, MascotProfile, SaidOnTheWay, WorkOutcome } from "../../shared/library";
import type { ChatMemory } from "./jobMemory";

// What the parts of `Chats` work with: what it was made with, the state it owns and the few things every part does.
// `Chats` makes each once and hands the same one to every part that needs it, never a copy.

export interface Run {
  controller: AbortController;
  partial: string;
  // What it said it's doing, in a message that went on to use tools, until its answer starts. Never saved or sent on.
  statusLine: string | null;
  steps: ChatStep[];
  // What it wrote on the way, kept where it was said, for the screen only.
  said: SaidOnTheWay[];
  // Words after a step start a new paragraph, not the end of the sentence before it.
  breakBeforeText: boolean;
  approval: (ChatApproval & { askedAt: number; answer: (allow: boolean, text?: string) => void }) | null;
  tabs: Set<Tab>;
  // Every tab it has used in this reply and every site it's been on, latest last. A site counts only as a tool uses a tab,
  // the same as the tools count it within the reply, and never from where a tab is now, so reading the working view
  // changes nothing.
  used: Set<Tab>;
  sites: Set<string>;
  startedAt: number;
  // Whether what it sees depends on the "Can see" toggle, because it was sent with a page.
  withPage: boolean;
  // The page sent with the message, from before it's read, so no other job's end closes it meanwhile.
  sentPage?: Tab;
  mascot: MascotProfile;
  // Set for a task, which belongs to its caller rather than to a saved chat.
  onChange?: () => void;
  // Sites earlier replies in this chat were on, which give a reason to remember what's about them.
  earlierSites: Set<string>;
  // What its mascot remembered going in, by id, and the words the model got.
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
  // Asks at least this much before acting, whatever the setting, as for a job from the relay.
  askAtLeast?: ActionApproval | undefined;
  // Told once, when this reply ends, how it went. Not for a later reply in the same chat.
  onEnd?: ((ended: EndedReply) => void) | undefined;
  // The user typed this here and is there to answer, so it may ask or plan before starting.
  userPresent: boolean;
}

// A chat's last reply once it's over: what its working view, the next reply and suggestions need of it, and nothing live,
// so the run itself can go once its transcript is saved.
export interface EndedRun {
  readonly mascot: { readonly id: string; readonly sites: readonly string[] };
  readonly startedAt: number;
  readonly endedAt: number;
  readonly outcome: WorkOutcome;
  readonly withPage: boolean;
  readonly cloud: boolean;
  // The tabs it used, by id, latest last.
  readonly tabIds: readonly string[];
  // The sites this reply was on, latest last, and every site this chat's replies have been on, for the next one.
  readonly sites: readonly string[];
  readonly beenTo: readonly string[];
  // Its answer, when saving it failed, so the chat still shows it and the next message can save it first.
  readonly unsaved?: ChatThreadMessage;
}

// How one reply ended, for whoever started it.
export interface EndedReply {
  reply: string;
  steps: ChatStep[];
  outcome: "done" | "failed" | "stopped";
  error: string | null;
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
  // The chat before this message, read when it's sent, and again if what was sent elsewhere had to be brought in first.
  earlier: () => ReplyMessage[];
  mascot: MascotProfile;
  actionApproval: ActionApproval;
}

export interface RunnerProgress {
  reply: string;
  steps: ChatStep[];
  approval: (ChatApproval & { askedAt: number }) | null;
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
  // For the screen only: what it said it's doing, until its answer starts.
  statusLine?: string | null;
  approval: ChatApproval | null;
  tokens: number;
  memoryIds?: string[];
}

// A runner with no window has no saved chats, so only what a task uses has to be there.
export type ChatStoreLike = Pick<
  ChatStore,
  "chat" | "createChat" | "addMessage" | "filesOf" | "renameChat" | "deleteChat" | "needsTitle" | "setGeneratedTitle" | "setSeen"
>;

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

// The window's tabs, as a chat reaches them.
export type ChatBrowser = Pick<PageToolAccess<Tab>, "activeTab" | "allTabs"> & {
  openBackgroundTab: (url: string) => Tab;
  closeTab: (tabId: string) => boolean;
  // A tab a job opened is the user's now, so it's saved with their session like any other.
  giveToUser?: (tabId: string) => void;
  actionApproval: () => ActionApproval;
  // What Berry goes by right now, since Hide Berry changes it.
  assistantName?: () => string;
  // Whether the chat's tab is the one in front. With none, as on a runner, every chat counts as seen.
  chatInFront?: (chatId: string) => boolean;
};

export interface ChatParts {
  store: ChatStoreLike;
  streamReply: StreamReply;
  generateTitle: GenerateTitle;
  browser: ChatBrowser;
  events: ChatEvents;
  // Who a chat runs as, read when each reply starts. It must never answer with more than the mascot was given.
  mascotOf: (id: string | null) => MascotProfile;
  memory: ChatMemory | null;
  cloud: ChatCloud | null;
  runner: ChatRunner | null;
  // Each reply while it runs, by its chat's or task's id.
  runs: Map<string, Run>;
  // Why a chat's last reply failed, until its next message.
  errors: Map<string, string>;
  // Each chat's last reply once it's over, so its working view can settle on how it went. Memory only.
  finished: Map<string, EndedRun>;
  // The "Can see" toggle, read each time, since it can change while a reply runs.
  pageAccess: () => boolean;
  publish: (chatId: string, run: Run) => void;
  publishWorkingTabs: () => void;
  notify: (chatId: string) => void;
  withoutCodes: (text: string) => string;
}
