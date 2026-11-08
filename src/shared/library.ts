// What the sidebar and internal pages show. Types only, like the IPC contract.
// All of it is saved locally.

import type { LineCrossing } from "./nestTable";
import type { CardKnows } from "./nestKnows";

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  // The icon the page itself named when it was saved, which needn't be at /favicon.ico.
  favicon?: string;
}

// Pins are kept the same way as bookmarks, in a file of their own.
export type PinnedSite = Bookmark;

// Something Berry did on the way to a reply.
export interface ChatStep {
  text: string;
  done: boolean;
  // What the chat shows in its place, naming what the user allowed, such as a button. It has page text in it, so it's
  // only ever drawn here: history, the cloud and other apps get `text`.
  shown?: string;
  // The user allowed it: on its own card, or for every run of a For-each card with Allow for this card's runs.
  allowed?: "once" | "card";
}

// An action waiting for the user to allow it.
export interface ChatApproval {
  id: string;
  text: string;
  // Berry is asking for an answer in words, not for leave to do something.
  question?: boolean;
  // Berry has handed a tab to the user, and is waiting for them to say they're done with it.
  handoff?: ChatHandoff;
  // On a run of a For-each card, what Allow for this card's runs would cover, such as "clicking the button “Save draft”
  // on example.com". Only the chrome can choose it.
  grant?: string;
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
  // Set when it's a card in a Nest, or a run of one, which opens there. The job is then the Nest's name.
  inNest?: boolean;
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
  // The pages its job opened, which close when it ends, so the user can open any of them again.
  pages?: UsedPage[];
  // What a reply's model calls cost, in US dollars, with the model in .env. Only a Nest's card shows it.
  cost?: number;
}

export interface UsedPage {
  url: string;
  title: string;
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
  // What the running reply said it's doing, until its answer starts. Only for the screen, and never saved.
  statusLine: string | null;
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
  // It runs on the cloud runner on its schedule, even with the Mac off, and never here on a schedule.
  inCloud?: boolean;
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
  // While it runs, what it said it's doing, until its answer starts. Only on the Routines page, and never saved.
  statusLine?: string;
}

export interface Routine {
  id: string;
  name: string;
  instructions: string;
  scheduleSpec: RoutineSchedule;
  mascotId: string | null;
  sites: string[];
  inCloud: boolean;
  // How keeping it in the cloud is going, in words, when it isn't simply there: still on its way back to this Mac, or
  // not sent yet. Null otherwise.
  cloudNote?: string | null;
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
  // Set by main on everything it sends the page, from what a copy would be made of. Add names it back.
  version?: string;
}

// What the Gallery page shows, and whether the published ones are among it. "starters" means no server is set up, so
// there's nothing to report. "unreachable" means one is, and it couldn't be read.
export interface GalleryListing {
  entries: GalleryMascot[];
  status: "starters" | "live" | "unreachable";
}

// One entry a link asked for, from the server. Null when it isn't there, or can't be asked.
export interface GalleryLinked {
  entry: GalleryMascot | null;
  status: GalleryListing["status"];
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
export type TrailKind = "went" | "searched" | "clicked" | "typed" | "secret" | "chose" | "ticked" | "pressed" | "switched" | "frame" | "file" | "copied" | "pasted";

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
  // What the user typed, chose or copied. Never set for a secret field.
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

// A board where each card is one bird's chat thread, and a line means "this one continues from that one". It's for
// working in several threads over time, so it never finishes.
export interface NestSummary {
  id: string;
  title: string;
  updatedAt: number;
  // The chats of its cards, which belong to the Nest and stay out of the sidebar's Chats list.
  chatIds: string[];
  // Who is working on one of its cards right now, by mascot id, once each.
  working: string[];
  // Berry has planned cards in it that haven't been run.
  planned: boolean;
  // Its For-each cards still going, counted together: how many runs have ended, of how many. Null when none is going.
  progress: { done: number; total: number } | null;
  // The chat of a card, or of a run, waiting for the user's OK or answer, which its row opens the Nest at. Null if none.
  waiting: string | null;
}

export interface NestCard {
  id: string;
  // Null while it's a draft, which nothing has been sent from yet, and on a For-each card, whose runs have chats instead.
  chatId: string | null;
  // Who a draft will run as, null for Berry. A sent card is its chat's, which keeps its own.
  mascotId: string | null;
  x: number;
  y: number;
  // Placed for the user, by a plan, the composer or a line's handle, and not moved by hand since, so the board may move it
  // down out of the way of a card that grew. One the user placed or dragged never moves by itself.
  autoPlaced: boolean;
  // Set once it was sent with For each row on.
  each: NestForEach | null;
  // Set once it was sent as several versions.
  versions?: NestVersions | null;
  // Set while it's a card Berry planned that hasn't started.
  plan: NestPlanned | null;
  // Set on a card made from a file the user added: its rows, with no chat and no bird.
  table: NestTableFile | null;
  // Set on a file's card: a file the user put on the board, or one a card's bird made, with no chat and no bird.
  file: NestFile | null;
  // Set on a page's card: a link or tab the user put on the board, or one of a working card's tabs shown around it.
  page?: NestPage | null;
  // Set on a note's card: one of Berry's answers about the board, which the user put there. No chat and no bird.
  note?: NestNote | null;
  // On a card whose job is running: its job's tabs show around it as page cards.
  showingTabs?: boolean;
  // Its files and notes, which go to its bird with every message. They can change only before it's sent.
  attachments: NestAttachment[];
  // The size the user made it from its corner, or none for the usual width and a height that follows what it shows.
  size?: { width: number; height: number };
  // What its chats have cost so far, every run's on a For-each card, or null when nothing says. Never totalled for a Nest.
  cost?: number | null;
  // On a draft that could run For each row, and on a For-each card for its runs again: what one run will likely cost.
  perRun?: { cost: number; rough: boolean } | null;
  // What it found, from the cheap model after a reply, or what the user called it, `titleSettled`, which nothing replaces.
  title?: string;
  titleSettled?: boolean;
  // It finished, failed or started waiting while nobody was looking at it, and hasn't been opened since.
  unread?: boolean;
  // What it knows from other cards, counted, never what: its last message's, or what it reads when it's sent.
  knows?: CardKnows;
  // On a sent or For-each card: a card it reads from has changed since it last sent, so Update would send it what's new.
  earlierChanged?: true;
}

// A file or note on a card or on a Nest's composer. A file's contents stay in main: only its name, type and size come here.
export interface NestAttachment {
  id: string;
  kind: "file" | "note";
  // A file's own name. A note has none.
  name: string;
  // Such as application/pdf. A note is text/plain.
  type: string;
  size: number;
  // A note's words.
  text?: string;
  // On a planned card, one of the composer's it points at, which it gets a copy of at Run. Removing it there only stops
  // pointing, and changing a note changes it for every card that points at it.
  shared?: boolean;
}

// A card Berry planned. Planned until the user presses Run, when it's armed: it starts by itself once the card it reads
// from has answered, or once the user says that answer is right if it waits for them. Held if it couldn't start, with
// why, and then it's a draft the user can send. Once it starts it's an ordinary card, and this is gone.
export interface NestPlanned {
  state: "planned" | "armed" | "held";
  prompt: string;
  each: boolean;
  waits: boolean;
  // What each row of the table in its answer will be, such as "companies", when Berry planned it to answer with one.
  table: string | null;
  // Why a held card didn't start.
  note: string | null;
}

// What the user wrote in a Nest's composer and Berry's answers, one request at a time. A request is open until its plan
// runs or goes, and then it folds away.
export interface NestRequest {
  id: string;
  open: boolean;
  messages: NestTalkMessage[];
}

// One message in a Nest's composer. Berry's say what kind they are: an answer about the board, which can go on the board
// as a note, a plan with how many cards it laid out, or a question. The user's say how many cards they asked about, when
// they asked about only the ones they'd selected.
export interface NestTalkMessage {
  id: number;
  role: "user" | "berry";
  text: string;
  kind?: "answer" | "plan" | "ask";
  planned?: number;
  about?: number;
}

// A card sent with For each row: the same prompt, run once for each row, each run its own chat. Its result is the table
// it ran on with one more column, `column`, each row's short value in it.
export interface NestForEach {
  prompt: string;
  header: string[];
  column: string;
  // The cheap model is naming the column right now.
  naming?: boolean;
  runs: NestRun[];
}

// A card sent as several versions: one prompt, each version its own chat with its own note, run as For each row's runs
// are. Only `pick` crosses its lines, or while none is picked, every version, each with its letter and note.
export interface NestVersions {
  prompt: string;
  runs: NestVersion[];
  pick: string | null;
}

export interface NestVersion {
  id: string;
  letter: string;
  // What the user said this one should be, or empty for "clearly different from the others".
  note: string;
  chatId: string | null;
  state: NestRunState;
}

// A CSV or TSV file the user added, as it was then: the card's title from the file's name, its header, and how many rows
// it has. `rows` is only the first few, each cell cut, since the whole table is too big to send with every board: the
// card asks for it with `nests.tableRows`.
export interface NestTableFile {
  name: string;
  header: string[];
  rows: string[][];
  count: number;
}

// A file on a card of its own. Its bytes stay in main: the card gets its name, type and size, and the first lines of a
// text file. `made` when a card's bird made it, and then the line into its card comes from that card.
export interface NestFile {
  name: string;
  type: string;
  size: number;
  // A PDF's pages, when they could be counted.
  pages: number | null;
  preview: string | null;
  made: boolean;
}

// One of Berry's answers in the Nest's composer, put on the board as a card of its own. Berry wrote it from cards whose
// answers came from web pages, so it only ever crosses a line as untrusted data, never as the user's words.
export interface NestNote {
  text: string;
}

// A page on a card of its own, with no chat and no bird. Its address and title are kept as they were when it went on the
// board. Which tab it shows is kept in main's memory only, since tab ids start again each launch, so after a restart,
// or once its tab has closed, it's a link: only its address goes across a line.
export interface NestPage {
  url: string;
  title: string;
  // The user dropped it on the board, so its exact address counts as one they named for the card a line takes it to.
  // Not one of a card's job's tabs, or a page that job kept.
  dropped: boolean;
  // The open tab it shows, as it is now. Null for a link, or a tab that has closed.
  tab: { id: string; title: string; url: string; favicon: string | null } | null;
  // Set while it's one of a running card's tabs, shown around that card: that card, and whether it may be pictured.
  job: { cardId: string; state: WorkTabState; current: boolean } | null;
}

// What a file's card shows when it's opened, read in main: a Markdown, text or JSON file's words, a CSV file's rows, an
// HTML card's page, or an image as a data address. A PDF shows only its pages and size.
export interface NestFileContent {
  text?: string;
  // An HTML card's whole page, to run only in its sandboxed frame (see `src/shared/nestHtml.ts`).
  html?: string;
  table?: { header: string[]; rows: string[][] };
  image?: string;
}

// Waiting for its turn, started (its chat says how it's going), stopped before it started, or couldn't start.
export type NestRunState = "waiting" | "started" | "stopped" | "failed";

export interface NestRun {
  id: string;
  row: string[];
  chatId: string | null;
  state: NestRunState;
  // Its short value in the card's column, once its answer has one. The full answer stays in its chat.
  cell: string | null;
  // The value is being written from its answer right now.
  filling?: boolean;
}

// The card `to` gets the latest answer on `from` each time it sends, or only `picked`, the rows the user selected.
export interface NestLine {
  id: string;
  from: string;
  to: string;
  // How many rows the user picked, or null for the whole answer. The rows stay in main, which checks them.
  picked: number | null;
  // Exactly what crosses it now, counted from what would be sent. Null until the source has something to give.
  crosses?: LineCrossing | null;
  // Drawn into a card that was sent already, so only its next message gets it. Gone once that's sent.
  fresh?: true;
  // What it gives has changed since the card it goes to last sent with it.
  changed?: true;
}

export interface NestBoard {
  id: string;
  title: string;
  cards: NestCard[];
  lines: NestLine[];
  // The Nest's whole conversation in its composer, oldest first, up to the newest requests a board carries.
  talk: NestRequest[];
  // The composer is tucked down to a tab at the board's bottom edge.
  composerTucked?: boolean;
  // What the user just wrote, while Berry plans it.
  planning?: string | null;
  // The cheap model is naming it right now.
  naming?: boolean;
  // Files and notes on the Nest's composer, for the request being written or planned. A plan gives each card the ones it
  // needs, and they go once the plan runs or goes.
  attached: NestAttachment[];
  // What changed since the Nest was last open, from the last time it was opened this launch. Memory only.
  since?: NestSince | null;
}

// Berry's few lines on what changed while the Nest wasn't open, written from only those cards' titles and answers, or a
// plain line in code, and the cards they're about, which the board highlights for a moment. `id` is new each time.
export interface NestSince {
  id: number;
  text: string;
  cards: string[];
}

export interface LibrarySnapshot {
  pinned: PinnedSite[];
  bookmarks: Bookmark[];
  // Without the Nests' card chats.
  chats: ChatThreadSummary[];
  nests: NestSummary[];
  routines: Routine[];
  // Berry first, then the rest of the flock, including deleted mascots that chats still point at.
  mascots: MascotProfile[];
  // Oldest first.
  needsYou: NeedsYouItem[];
  memory: MemoryState;
}
