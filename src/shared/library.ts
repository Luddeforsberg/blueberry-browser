// What the sidebar and internal pages show. Types only, like the IPC contract.
// Chats are saved locally. Today a mock in the main process serves the rest, until storage replaces it.

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

export interface ChatThreadMessage {
  role: "user" | "assistant";
  content: string;
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
  // Why the last reply failed, until the next message.
  error: string | null;
}

export type RoutineStatus = "running" | "finished" | "needs-approval";

export interface Routine {
  id: string;
  name: string;
  schedule: string;
  lastResult: string;
  status: RoutineStatus;
}

export interface RoutineStep {
  time: string;
  text: string;
  isCurrent: boolean;
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
  todaysRun: RoutineStep[];
}
