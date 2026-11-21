// What the sidebar and internal pages show. Types only, like the IPC contract.
// All of it is saved locally.
// Its parts are in library/, and this file is the one everything imports them from.

import type { ChatThreadSummary, NeedsYouItem } from "./library/chats";
import type { MascotDraft, MascotProfile, MemoryState } from "./library/mascots";
import type { Routine, RoutineDraft } from "./library/routines";

export { REPLY_NOT_SAVED, STEP_KINDS } from "./library/chats";
export type {
  ChatApproval,
  ChatStep,
  ChatThread,
  QueuedMessage,
  ChatThreadMessage,
  ChatThreadSummary,
  HandoffNeed,
  NeedsYouItem,
  SaidOnTheWay,
  StepKind,
  UsedPage,
  WorkFrame,
  WorkOutcome,
  WorkTab,
  WorkTabState,
  WorkView,
} from "./library/chats";
export type { Routine, RoutineDraft, RoutineRun, RoutineRunStatus, RoutineSchedule, RoutineStatus } from "./library/routines";
export type {
  GalleryLinked,
  GalleryListing,
  GalleryMascot,
  MascotAccessory,
  MascotDraft,
  MascotExample,
  MascotLook,
  MascotPalette,
  MascotProfile,
  MascotTool,
  MemoryFact,
  MemoryOffer,
  MemoryResult,
  MemoryState,
  PublishChoices,
  PublishedMascot,
  PublishResult,
} from "./library/mascots";
export type { RecordedChange, RecordedDraft, RecordedDraftResult, RecordingState, TrailKind, TrailStep } from "./library/recordings";

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  // The icon the page itself named when it was saved, which needn't be at /favicon.ico.
  favicon?: string;
}

// Pins are kept the same way as bookmarks, in a file of their own. A site is in one or the other: a favourite is a
// bookmark kept on top, as a tile.
export type PinnedSite = Bookmark;
export type SavedSiteList = "favourites" | "bookmarks";

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
  // Berry first, then the rest of the mascots, including deleted mascots that chats still point at.
  mascots: MascotProfile[];
  // Oldest first.
  needsYou: NeedsYouItem[];
  memory: MemoryState;
}
