// A chat as the sidebar and pages show it: its messages, the steps and approvals of a reply, Needs you, and the working
// view beside it. Part of library.ts, which everything imports it from.

import type { SentAttachment } from "../attachments";
import type { AskWhy } from "../asking";

// Something Berry did on the way to a reply.
export interface ChatStep {
  text: string;
  done: boolean;
  // What the chat shows in its place, naming what the user allowed, such as a button. It has page text in it, so it's
  // only ever drawn here: history, the cloud and other apps get `text`.
  shown?: string;
  // What kind of thing it did, which picks its pips (DESIGN.md section 6). Only for the screen: with none, it's plain.
  kind?: StepKind;
}

// Every kind there is, so a step read back from somewhere else keeps only one of these.
export const STEP_KINDS = ["open", "read", "scan", "search", "click", "type", "ask", "wait"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

// Words a mascot wrote on the way to its answer, in a message that went on to use tools, after `after` of its steps.
// Only for the screen, like a step's `shown`: the model, history, the cloud and other apps never get them.
export interface SaidOnTheWay {
  after: number;
  text: string;
}

// An action waiting for the user to allow it.
export interface ChatApproval {
  id: string;
  text: string;
  // Berry is asking for an answer in words, not for leave to do something.
  question?: boolean;
  // For a question: answers the user can press, each sent back as if typed. They can still type their own.
  answers?: string[];
  // For an action: the rule that made it ask, and the piece of `text` it's about. None from the cloud runner.
  why?: AskWhy;
  // Berry has handed a tab to the user, and is waiting for them to say they're done with it.
  handoff?: ChatHandoff;
}

// What only the user can do on a page. Berry can't see the tab while they do it.
export type HandoffNeed = "sign-in" | "code" | "captcha";

interface ChatHandoff {
  need: HandoffNeed;
  tabId: string;
  site: string;
}

// One thing the mascots are waiting on the user for, from any chat or routine run.
export interface NeedsYouItem {
  // The chat's or run's id, which is what `chat:decide` takes.
  id: string;
  approval: ChatApproval;
  mascotId: string;
  // What the job is: the chat's title, or the routine's name.
  job: string;
  // Set when it's a routine's run.
  routineId: string | null;
  // The app that started it from outside Blueberry, such as "Claude Code".
  from: string | null;
  // What it did last, in its own words. Null if it hasn't done anything yet.
  lastStep: string | null;
  // The tab it's working in, for going there.
  tabId: string | null;
  askedAt: number;
}

export interface ChatThreadMessage {
  role: "user" | "assistant";
  content: string;
  steps?: ChatStep[];
  // What its mascot remembered going into this reply, by id, so forgetting one takes it off here too.
  memoryIds?: string[];
  // The pages its job opened, which close when it ends, so the user can open any of them again.
  pages?: UsedPage[];
  // What the user sent with it from the prompt box's +, by name only.
  attached?: SentAttachment[];
  // A reply's words between its steps, when it began and how long it took, in milliseconds. None from before these.
  said?: SaidOnTheWay[];
  startedAt?: number | undefined;
  took?: number;
}

export interface UsedPage {
  url: string;
  title: string;
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  updatedAt: number;
  // Who the chat runs as. Null is Berry, which every chat from before there were other mascots stays.
  mascotId: string | null;
  // The app that started it from outside Blueberry, such as "Claude Code". Null for one the user started here.
  from: string | null;
  // A reply is being written right now.
  running?: boolean;
  // Its jobs are done in the cloud.
  cloud?: boolean;
  // Its last reply ended, not stopped, while its tab wasn't in front, and the user hasn't opened it since.
  unseen?: boolean;
}

export interface ChatThread extends ChatThreadSummary {
  messages: ChatThreadMessage[];
  // The reply being written, which is saved once it ends. Null when no reply is running.
  partial: string | null;
  // What the running reply said it's doing, until its answer starts. Only for the screen, and never saved.
  statusLine: string | null;
  // What the running reply has done so far, what it said between, and when it began. Empty and null when none is running.
  steps: ChatStep[];
  said: SaidOnTheWay[];
  startedAt: number | null;
  approval: ChatApproval | null;
  // Why the last reply failed, until the next message.
  error: string | null;
  // What the running reply went in remembering. Empty when no reply is running.
  memoryIds: string[];
  // Its replies come from the cloud runner, which keeps going with this computer off.
  runner?: boolean;
}

// Whether a tab in a job's working view has a picture, and why not if it doesn't.
export type WorkTabState =
  | "picture"
  // Handed to the user, for a sign-in or a code.
  | "held"
  // The user took it from the job.
  | "yours"
  // The mascot isn't allowed on this site.
  | "off-limits"
  // The user has switched off what the job could see.
  | "no-access"
  // The page has crashed, couldn't load, or may be showing a code.
  | "none";

export interface WorkTab {
  id: string;
  site: string;
  title: string;
  favicon: string | null;
  state: WorkTabState;
  // Where it's working now. The rest are the job's other tabs.
  current: boolean;
  // A page in the cloud browser, which the chrome shows from the cloud tab's own live view or pictures.
  cloud?: boolean;
}

export type WorkOutcome = "done" | "stopped" | "failed";

// What's said beside a job's pictures on the main chat. Only words: pictures come by themselves, as `WorkFrame`.
export interface WorkView {
  chatId: string;
  mascotId: string;
  // Never none: a job with no tabs has no view.
  tabs: [WorkTab, ...WorkTab[]];
  // What it's doing now, in the mascot's words. Null between steps, with nothing to say.
  doing: string | null;
  startedAt: number;
  endedAt: number | null;
  outcome: WorkOutcome | null;
  // Every site it's been on, newest first.
  sites: string[];
}

// A small picture of a tab. Only ever sent to the chrome, and never saved, sent on or read by anything.
export interface WorkFrame {
  chatId: string;
  tabId: string;
  picture: string;
}
