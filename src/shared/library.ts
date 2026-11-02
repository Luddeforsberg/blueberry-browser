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
  // What its bird remembered going into this reply, by id, so forgetting one takes it off here too.
  memoryIds?: string[];
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  updatedAt: number;
  // Who the chat runs as. Null is Berry, which every chat from before the flock stays.
  mascotId: string | null;
  // The app that started it from outside Blueberry, such as "Claude Code". Null for one the user started here.
  from: string | null;
  // A reply is being written right now.
  running?: boolean;
  // Its jobs are done in the cloud.
  cloud?: boolean;
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
  tabs: WorkTab[];
  // What it's doing now, in the bird's words. Null between steps, with nothing to say.
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

export type RoutineSchedule =
  | { kind: "once"; at: number }
  | { kind: "daily"; time: string }
  // Days count from Sunday, as 0.
  | { kind: "weekly"; days: number[]; time: string }
  // A day the month doesn't have means its last day.
  | { kind: "monthly"; day: number; time: string }
  // Only ever by Run now. What a routine learnt from being shown starts here, so it does nothing until it's asked.
  | { kind: "manual" };

export interface RoutineDraft {
  name: string;
  instructions: string;
  schedule: RoutineSchedule;
  // Who runs it. Left out or null is Berry.
  mascotId?: string | null;
  // The only sites a run may use, on top of its mascot's limits. Left out or empty adds no limit.
  sites?: string[];
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
  // What its bird remembered going into this run, by id.
  memoryIds?: string[];
}

export interface Routine {
  id: string;
  name: string;
  instructions: string;
  scheduleSpec: RoutineSchedule;
  mascotId: string | null;
  sites: string[];
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
  // Its row on the Gallery's server, if the user published it. Saving here doesn't change that row.
  publishedId?: string;
  // Choosing it turns on Do this in the cloud. Only the user's own choice here, so it's never published or shared.
  worksInCloud?: boolean;
}

// Something one mascot remembers about how the user likes things done, because they pressed Remember. It's kept apart from
// the mascot, in a file of its own, so nothing that copies or publishes a mascot can take it along.
export interface MemoryFact {
  id: string;
  mascotId: string;
  // Exactly what the user saw, and exactly what the model reads.
  text: string;
  // The one site it's about, as a hostname. Null if it's about how they like things anywhere.
  site: string | null;
  savedAt: number;
}

// What a bird would like to remember, waiting for the user. It's not memory, and nothing reads it but the screen it's on.
export interface MemoryOffer {
  id: string;
  mascotId: string;
  // The chat or routine run it came after.
  sourceId: string;
  text: string;
  site: string | null;
}

export interface MemoryState {
  facts: MemoryFact[];
  offers: MemoryOffer[];
}

export type MemoryResult = { ok: true } | { ok: false; error: string };

// "I asked this, and here's what it gave me". Plain text everywhere it shows, never rendered as markdown.
export interface MascotExample {
  prompt: string;
  answer: string;
}

// One card in the Gallery. Add makes a copy of `draft`, and only `draft`, through the same checks as a hand-made mascot.
export interface GalleryMascot {
  id: string;
  author: string;
  category: string;
  // One line on what it does. Its limits come from `draft`, in `permissionsInWords`.
  description: string;
  draft: MascotDraft;
  // Starters only have one from a real run. Left out, there's none to show.
  example?: MascotExample | null;
  // These are for what people published. A starter has no server row, so it has no count to show.
  addCount?: number;
  publishedAt?: number;
  // Its public page, once the site's address is set.
  link?: string | null;
}

// What the Gallery page shows, and whether the published ones are among it. "starters" means no server is set up, so
// there's nothing to report. "unreachable" means one is, and it couldn't be read.
export interface GalleryListing {
  entries: GalleryMascot[];
  status: "starters" | "live" | "unreachable";
}

// What the user chooses when publishing. The rest of what goes public is read from the mascot in main.
export interface PublishChoices {
  author: string;
  description: string;
  category: string;
  example: MascotExample | null;
}

export type PublishResult = { ok: true; id: string; link: string | null } | { ok: false; error: string };

// One of the user's own, for Settings and for publishing again.
export interface PublishedMascot extends PublishChoices {
  id: string;
  name: string;
  addCount: number;
  link: string | null;
  // We took it out of the Gallery, from the dashboard.
  hidden: boolean;
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

// One thing Berry saw the user do while it was being shown something. Only ever in memory, and only in main and the chrome.
export type TrailKind = "went" | "searched" | "clicked" | "typed" | "secret" | "chose" | "ticked" | "pressed" | "switched" | "frame" | "file";

export interface TrailStep {
  id: string;
  kind: TrailKind;
  // The note, in plain words. Code writes these, with `label` and `value` the only parts that came from a page or a field.
  text: string;
  site: string;
  // The page's address without its query or fragment, or where a click led. Empty on a page's front door.
  path: string;
  // What the page calls the thing. Untrusted, and a name only.
  label: string;
  // What the user typed or chose. Never set for a secret field.
  value: string;
  // Typed, and then sent with Enter.
  submitted?: boolean;
}

export type RecordingStatus = "idle" | "recording" | "review" | "drafting";

export interface RecordingState {
  status: RecordingStatus;
  startedAt: number | null;
  steps: TrailStep[];
  // It stopped by itself, because it had seen as much as it can keep or had run for too long.
  cut: "full" | "time" | null;
  // Why the last try at writing it up failed.
  error: string | null;
}

// Something in the instructions that looks like it should change from run to run. `value` is in the instructions as it stands.
export interface RecordedChange {
  label: string;
  value: string;
}

// What a recording becomes, to fill in the routine form. The sites come from the trail, in code, and never from the model.
export interface RecordedDraft {
  name: string;
  instructions: string;
  sites: string[];
  changes: RecordedChange[];
}

export type RecordedDraftResult = { ok: true; draft: RecordedDraft } | { ok: false; error: string };

export interface LibrarySnapshot {
  pinned: PinnedSite[];
  bookmarks: Bookmark[];
  chats: ChatThreadSummary[];
  routines: Routine[];
  // Berry first, then the rest of the flock, including deleted mascots that chats still point at.
  mascots: MascotProfile[];
  // Oldest first.
  needsYou: NeedsYouItem[];
  memory: MemoryState;
}
