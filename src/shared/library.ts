// What the sidebar and internal pages show. Types only, like the IPC contract.
// Chats, bookmarks and routines are saved locally. The rest is sample content until storage replaces it.

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

export interface Account {
  name: string;
  email: string;
}

export interface LibrarySnapshot {
  account: Account;
  pinned: PinnedSite[];
  bookmarks: Bookmark[];
  chats: ChatThreadSummary[];
  routines: Routine[];
}
