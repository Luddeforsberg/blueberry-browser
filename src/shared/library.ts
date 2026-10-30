// What the sidebar and internal pages show. Types only, like the IPC contract.
// Today a mock in the main process serves these. Local storage and sync replace it later.

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
