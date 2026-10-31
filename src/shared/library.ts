// What the sidebar and internal pages show. Types only, like the IPC contract.
// All of it is saved locally.

export interface PinnedSite {
  id: string;
  title: string;
  url: string;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
}

// Something Berry did on the way to a reply.
export interface ChatStep {
  text: string;
  done: boolean;
}

// An action waiting for the user to allow it.
export interface ChatApproval {
  id: string;
  text: string;
  // Berry is asking for an answer in words, not for leave to do something.
  question?: boolean;
  // Berry has handed a tab to the user, and is waiting for them to say they're done with it.
  handoff?: ChatHandoff;
}

// What only the user can do on a page. Berry can't see the tab while they do it.
export type HandoffNeed = "sign-in" | "code" | "captcha";

export interface ChatHandoff {
  need: HandoffNeed;
  tabId: string;
  site: string;
}

// One thing the flock is waiting on the user for, from any chat or routine run.
export interface NeedsYouItem {
  // The chat's or run's id, which is what `chat:decide` takes.
  id: string;
  approval: ChatApproval;
  mascotId: string;
  // What the job is: the chat's title, or the routine's name.
  job: string;
  // Set when it's a routine's run.
  routineId: string | null;
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
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  updatedAt: number;
  // Who the chat runs as. Null is Berry, which every chat from before the flock stays.
  mascotId: string | null;
  // A reply is being written right now.
  running?: boolean;
}

export interface ChatThread extends ChatThreadSummary {
  messages: ChatThreadMessage[];
  // The reply being written, which is saved once it ends. Null when no reply is running.
  partial: string | null;
  // What the running reply has done so far. Empty when no reply is running.
  steps: ChatStep[];
  approval: ChatApproval | null;
  // Why the last reply failed, until the next message.
  error: string | null;
}

export type RoutineSchedule =
  | { kind: "once"; at: number }
  | { kind: "daily"; time: string }
  // Days count from Sunday, as 0.
  | { kind: "weekly"; days: number[]; time: string }
  // A day the month doesn't have means its last day.
  | { kind: "monthly"; day: number; time: string };

export interface RoutineDraft {
  name: string;
  instructions: string;
  schedule: RoutineSchedule;
  // Who runs it. Left out or null is Berry.
  mascotId?: string | null;
}

// How one run went, or is going.
export type RoutineRunStatus = "running" | "needs-approval" | "finished" | "failed" | "stopped" | "interrupted";

export type RoutineStatus = RoutineRunStatus | "queued" | "paused" | "idle";

export interface RoutineRun {
  id: string;
  routineId: string;
  status: RoutineRunStatus;
  startedAt: number;
  endedAt: number | null;
  // When it should have run, if the app was closed or the computer asleep at that time.
  lateFor: number | null;
  steps: ChatStep[];
  // Berry's report, or as much of it as it got to write.
  result: string | null;
  error: string | null;
  // While it's interrupted, this is what it was waiting to do and didn't.
  approval: ChatApproval | null;
  tokens: number | null;
  // False until the user has opened Routines since it ended.
  seen: boolean;
}

export interface Routine {
  id: string;
  name: string;
  instructions: string;
  scheduleSpec: RoutineSchedule;
  mascotId: string | null;
  // The schedule in words.
  schedule: string;
  paused: boolean;
  nextRunAt: number | null;
  lastResult: string;
  status: RoutineStatus;
  latestRun: RoutineRun | null;
  // Some run has ended since the user last opened Routines, not necessarily the latest.
  unseen: boolean;
}

// One drawing with changeable colours and one accessory. The blueberry never changes.
export type MascotPalette = "jackdaw" | "robin" | "canary" | "parakeet" | "flamingo" | "kingfisher";
export type MascotAccessory = "none" | "crown" | "cap" | "glasses" | "headphones" | "bow";

export interface MascotLook {
  palette: MascotPalette;
  accessory: MascotAccessory;
}

// What a mascot may do beyond reading pages, as named switches rather than a list of tools, so a saved mascot means
// the same thing when the tools change.
export type MascotTool = "visit" | "click" | "type";

// What the user fills in. Plain data, so a mascot can be saved, and later published, as it is.
export interface MascotDraft {
  name: string;
  look: MascotLook;
  // In the user's words: what it's for and how it should work. Goes into the prompt, marked as theirs.
  instructions: string;
  // The sites it may use, as hostnames, each with its subdomains. Empty means it isn't limited to any.
  sites: string[];
  tools: MascotTool[];
}

export interface MascotProfile extends MascotDraft {
  id: string;
  // A deleted mascot stays on file, so its chats keep their look and, above all, their limits.
  deletedAt: number | null;
  // The Gallery entry this is a copy of, only so the Gallery can say it's added. The copy never reads from the entry.
  galleryId?: string;
}

// One card in the Gallery. Add makes a copy of `draft`, and only `draft`, through the same checks as a hand-made mascot.
export interface GalleryMascot {
  id: string;
  author: string;
  category: string;
  // One line on what it does. Its limits come from `draft`, in `permissionsInWords`.
  description: string;
  draft: MascotDraft;
}

export type SuggestionKind = "prompt" | "routine" | "mascot";

// The words of a suggestion, written once and saved. A suggestion only ever fills something in for the user to confirm.
export type SuggestionWords = { id: string; title: string } & (
  | { kind: "prompt"; prompt: string }
  | { kind: "routine"; draft: RoutineDraft }
  | { kind: "mascot"; draft: MascotDraft }
);

// With why it's there, worked out fresh from what's in the history now.
export type Suggestion = SuggestionWords & { why: string };

export interface LibrarySnapshot {
  pinned: PinnedSite[];
  bookmarks: Bookmark[];
  chats: ChatThreadSummary[];
  routines: Routine[];
  // Berry first, then the rest of the flock, including deleted mascots that chats still point at.
  mascots: MascotProfile[];
  // Oldest first.
  needsYou: NeedsYouItem[];
}
