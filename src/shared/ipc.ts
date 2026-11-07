// The one IPC contract between main and the chrome renderer.
// Types only: sandboxed preloads can't load shared runtime code, so nothing here may survive compilation.

import type { PickedRows } from "./nestTable";
import type { ChatThread, GalleryLinked, NestBoard, NestCard, NestFileContent, GalleryListing, LibrarySnapshot, MascotDraft, MascotLook, MemoryResult, PublishChoices, PublishedMascot, PublishResult, RecordedDraftResult, RecordingState, RoutineDraft, RoutineRun, Suggestion, WorkFrame, WorkView } from "./library";

// The chrome view under the tabs, the overlay view that floats the collapsed sidebar over a page, and the
// find bar, which floats over a page in a view of its own. The prompt view asks about what a site requested, and
// nothing else can answer it. The desktop view is the bird on the edge of the screen, in a window of its own, and the
// composer view is its prompt box, in another.
export type ChromeRegion = "chrome" | "overlay" | "find" | "prompt" | "desktop" | "composer";

export type LayoutMode = "vertical" | "horizontal";

export type ResizablePanel = "sidebar" | "chat";

// Pages the chrome draws itself. They open as tabs, on the same card as a web page.
export type InternalPage = "new-tab" | "chat" | "nest" | "routines" | "settings" | "downloads" | "gallery" | "history" | "flock" | "mascot-gallery" | "needs-you" | "recording" | "cloud";

export type Appearance = "system" | "light" | "dark";

// When Berry stops to ask before acting on a page.
export type ActionApproval = "risky" | "always" | "never";

// What the app opens with: the tabs from last time, or just a new tab.
export type StartupChoice = "restore" | "fresh";

// Saved in the main process and kept across restarts.
export interface Settings {
  layoutMode: LayoutMode;
  appearance: Appearance;
  sidebarWidth: number;
  chatWidth: number;
  showBerry: boolean;
  keepBerryStill: boolean;
  // Whether the working mascot is drawn on the page it works in. Off is for a site that reacts badly.
  birdOnPages: boolean;
  actionApproval: ActionApproval;
  // An absolute path, or null for the system's Downloads folder.
  downloadFolder: string | null;
  askWhereToSave: boolean;
  onStartup: StartupChoice;
  // False until the first-launch steps are finished or skipped.
  onboarded: boolean;
  // Page zoom in percent, by site. Sites at 100% aren't listed.
  siteZoom: Record<string, number>;
  // Whether the new tab page offers what it noticed you repeat. Off means no model call.
  suggestions: boolean;
  // Whether a bird may offer to remember something after a job. Off means no model call. What's kept stays in use.
  memoryOffers: boolean;
  // Send to the phone even while the user is at the computer, for filming and trying it out.
  phoneAlways: boolean;
  // Who the next new chat runs as. Null is Berry.
  chosenMascotId: string | null;
  // The bird on the edge of the screen, and the shortcut that opens its composer.
  desktopBerry: boolean;
  // Where along the edge it stands, from 0 to 1. Null until it's been dragged.
  desktopBerrySpot: DesktopBerrySpot | null;
  // Jobs from ChatGPT or Claude, through the relay, run in this Blueberry while it's open, instead of in the cloud.
  relayOnMac: boolean;
}

export type DesktopEdge = "bottom" | "top" | "left" | "right";

export interface DesktopBerrySpot {
  displayId: number;
  edge: DesktopEdge;
  // How far along that edge, from 0 to 1. Each end is a corner.
  fraction: number;
}

export interface Point {
  x: number;
  y: number;
}

// Where the words go beside the bird, in its window: on the side towards the middle of the screen.
export interface DesktopLineAnchor {
  side: "left" | "right";
  // How far in from that side of the window.
  fromSide: number;
  maxWidth: number;
  across: "top" | "bottom" | "middle";
  middle: number;
}

// Everything the bird's view draws. Main works all of it out, so the view knows nothing about chats or approvals.
export interface DesktopBerryState {
  // False while it's fading away, just before the window hides.
  shown: boolean;
  // Goes up each time the window moves or changes size, when anything in it jumps with it rather than gliding.
  frame: number;
  // The window's top left on the screen.
  origin: Point;
  // The bird's top left in the window.
  at: Point;
  edge: DesktopEdge;
  flip: boolean;
  tucked: boolean;
  dragging: boolean;
  // A flight across the screen, drawn in the view so it doesn't depend on the main process keeping time.
  flight: { id: number; path: Point[]; ms: number; left: boolean } | null;
  mood: "rest" | "fetching" | "asking" | "delivered" | "oops";
  name: string;
  look: MascotLook;
  showBerry: boolean;
  still: boolean;
  // The small mark beside a tucked bird, and only then.
  sign: "working" | "waiting" | null;
  line: string | null;
  lineShowing: boolean;
  lineAnchor: DesktopLineAnchor;
}

// The prompt box, in a window of its own with real glass.
export interface DesktopComposerState {
  open: boolean;
  name: string;
}

// Replies from the phone, for Settings and Needs you. Nothing here can be used to read the bot's token, which never
// comes back from main once it's saved.
export interface PhoneState {
  status: "off" | "pairing" | "connected";
  botName: string | null;
  // The one-time link that binds the user's chat, while it's waiting for one.
  pairLink: string | null;
  // What's wrong right now, in words.
  problem: string | null;
}

// Claude and other apps on this computer using Blueberry over MCP. The token never comes back from main: snippets
// here show it hidden, and copying one puts the real one straight on the clipboard.
export interface McpSnippet {
  app: string;
  where: string;
  text: string;
}

export interface McpActivity {
  id: string;
  client: string;
  tool: string;
  at: number;
  summary: string;
  failed: boolean;
}

export interface McpState {
  on: boolean;
  // Null while it's off, or couldn't start.
  url: string | null;
  problem: string | null;
  snippets: McpSnippet[];
  // Newest first. Memory only, so it starts empty on each launch.
  activity: McpActivity[];
}

export interface PhoneAnswered {
  approvalId: string;
  said: string;
}

// Who's signed in, for publishing. Tokens never come back from main, and the password only ever goes the other way.
export interface AccountState {
  // "not-set-up" means this copy has no Gallery server, so nothing about accounts shows.
  status: "not-set-up" | "signed-out" | "signed-in";
  email: string | null;
  problem: string | null;
}

export type DownloadState = "progressing" | "paused" | "completed" | "cancelled" | "interrupted";

export type DownloadAction = "pause" | "resume" | "cancel" | "open" | "show" | "remove";

export interface DownloadInfo {
  id: string;
  filename: string;
  // Empty until the user has chosen where to save, if they're asked.
  path: string;
  // The site it came from. Null for a data: address or anything else with no site.
  source: string | null;
  state: DownloadState;
  receivedBytes: number;
  // 0 when the server didn't say.
  totalBytes: number;
  startedAt: number;
  // Interrupted, but it can carry on from where it stopped.
  canResume: boolean;
  // Finished, and the file isn't there any more.
  missing: boolean;
}

// What a site can ask for. Electron's many names for these only exist in main.
export type SitePermission =
  | "camera"
  | "microphone"
  | "location"
  | "notifications"
  | "midi"
  | "screen"
  | "clipboard-read"
  | "idle-detection"
  | "window-management"
  | "local-fonts"
  | "speaker-selection"
  | "local-network"
  | "open-external";

export type SiteDecision = "allow" | "block";

export interface SavedSitePermission {
  origin: string;
  permission: SitePermission;
  decision: SiteDecision;
}

export interface PermissionPrompt {
  id: string;
  origin: string;
  permissions: SitePermission[];
}

// A page the user really visited, newest first.
export interface Visit {
  url: string;
  title: string;
  favicon: string | null;
  visitedAt: number;
}

// One visit in the saved history.
export interface HistoryEntry extends Visit {
  id: number;
}

// A browser whose history can be brought in. Main knows where it lives, so a renderer only ever names it by id.
export interface ImportSource {
  id: string;
  name: string;
}

export type HistoryImportResult = { ok: true; added: number } | { ok: false };

export interface HistoryCursor {
  visitedAt: number;
  id: number;
}

// A page of history, and where the next one starts, if there is one.
export interface HistoryPage {
  entries: HistoryEntry[];
  next: HistoryCursor | null;
}

// Why a web tab can't show its page right now. Null when all is well.
export type TabTrouble = "crashed" | "unresponsive";

// Why the last address didn't load, with Chromium's code for it as `description`.
export interface TabLoadError {
  url: string;
  description: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Where each region of the window goes, in window coordinates. Closed regions have no size.
export interface Layout {
  mode: LayoutMode;
  sidebarOpen: boolean;
  chatOpen: boolean;
  sidebarWidth: number;
  chatWidth: number;
  panelLimits: Record<ResizablePanel, { min: number; max: number }>;
  controls: Rect;
  // Off a Mac, the button that opens the app's menu, inside `controls`. Empty on a Mac, which has the menu bar.
  menuButton: Rect;
  sidebar: Rect;
  floatingSidebar: Rect;
  findBar: Rect;
  tabStrip: Rect;
  toolbar: Rect;
  // The toolbar's row of buttons and address, which the sidebar's and chat panel's own buttons line up with.
  addressRow: Rect;
  chat: Rect;
  page: Rect;
  // The page's size, all but one pixel outside the window, for a tab Berry works in behind the user's.
  parkedPage: Rect;
}

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  favicon: string | null;
  isActive: boolean;
  isLoading: boolean;
  // A running reply has used this tab, and hasn't finished yet.
  berryWorking: boolean;
  // Who is working in it, if a mascot other than Berry is.
  workingMascotId: string | null;
  // The chat whose running job opened it, which the sidebar shows it under instead of with the user's tabs.
  jobChatId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  zoomPercent: number;
  // Set for internal pages, which have no web view. `pageParam` picks which chat, for example.
  page: InternalPage | null;
  pageParam: string | null;
  trouble: TabTrouble | null;
  loadError: TabLoadError | null;
}

export interface ThemeState {
  isDark: boolean;
  // False when the system asks for reduced transparency, or the platform has no window material.
  glass: boolean;
  platform: "mac" | "windows" | "other";
}

// Where find in page has got to. `active` counts from 1.
export interface FindResult {
  active: number;
  total: number;
}

export interface ChatChunk {
  chatId: string;
  content: string;
}

export type RoutineSaveResult = { ok: true; id: string } | { ok: false; error: string };

export type MascotSaveResult = { ok: true; id: string } | { ok: false; error: string };

// `mascotId` picks who a new chat runs as. An existing chat keeps the one it started with.
export interface NestNewCard {
  x: number;
  y: number;
  mascotId?: string | null;
  // The card it's pulled out of.
  from?: string | null;
  // The rows selected in that card's table, which are then all it gets. Main checks they're in its latest answer.
  picked?: PickedRows | null;
  // Placed beside its source by a click on the handle, rather than where the user pressed or dropped the line.
  auto?: boolean;
}

// For each row either starts, or says why it can't, such as more rows than the cap.
export type NestSendEachResult = { ok: true } | { ok: false; error: string };
// `warn` when the runs did something the user allowed before, which going again may repeat: it goes only once confirmed.
export type NestRetryResult = { ok: true } | { ok: false; error: string } | { ok: false; warn: string };

// What the Nest's composer sends with its words: the bird the user chose, and where a plan's cards can go, as the top
// left of the board in sight and the cards already on it, measured.
export interface NestAskOptions {
  mascotId?: string | null;
  at: { x: number; y: number };
  taken: { x: number; y: number; width: number; height: number }[];
}

// Berry has it, and answers on the board, or it couldn't be sent, and why.
export type NestAskResult = { ok: true } | { ok: false; error: string };

// Where a file or note goes: a card that hasn't been sent, or the Nest's composer.
export type NestAttachTarget = { cardId: string } | { nestId: string };

// A file dropped on a Nest's board, as the chrome read it.
export interface NestDroppedFile {
  name: string;
  size: number;
  bytes: Uint8Array | null;
}

// Added, or why not, such as a type that can't be read or no room left on the card.
export type NestAttachResult = { ok: true } | { ok: false; error: string };

// A table card made from a file the user picked, null if they picked none, or why the file can't be one.
export type NestTableResult = { ok: true; cardId: string | null } | { ok: false; error: string };

// Run either starts the plan, or says why it can't yet, such as a card with nothing to do.
export type NestRunPlanResult = { ok: true } | { ok: false; error: string };
export type NestFromChatResult = { ok: true; nestId: string } | { ok: false; error: string };
// A card to open on a Nest's board, and scroll into view: one Needs you or a notification was about. With `runId`, that
// run of a For-each card.
export interface NestFocus {
  nestId: string;
  cardId: string;
  runId: string | null;
}
// A card that started with work from the card its line comes from, for the bird's flight along the line.
export interface NestHandOff {
  nestId: string;
  from: string;
  to: string;
}

export interface ChatSendOptions {
  seePage: boolean;
  mascotId?: string | null;
  // Work in a browser in the cloud rather than in this window's tabs. Ignored while the cloud is off.
  cloud?: boolean;
  // Send it to the cloud runner, which keeps going with this computer off. Needs the user signed in.
  runner?: boolean;
}

// Settings > Cloud > Runner: the account the cloud runner signs in as, linked to this user's, and whether the runner has
// accepted. Only its email, never its password, which only the runner has.
export interface RunnerState {
  status: "not-set-up" | "signed-out" | "none" | "waiting" | "linked";
  email: string | null;
  problem: string | null;
  // Where ChatGPT or Claude can connect to the flock in the cloud, once linked and if the runner serves it.
  relayUrl: string | null;
}

// Settings > Cloud. The key and project id never come back here once saved: only whether there are any.
export interface CloudState {
  // "local" is the test browser on this computer, only in an unpackaged app.
  provider: "browserbase" | "local" | null;
  configured: boolean;
  status: "off" | "idle" | "starting" | "running" | "ended";
  // The chat or run using it now, if any.
  busy: boolean;
  // Whether End has anything to end, here or at the provider.
  canEnd: boolean;
  // The provider didn't confirm the last end, so a paid session may still be running.
  unreleased: boolean;
  problem: string | null;
  // Sites brought into the cloud browser signed in, newest first. Names and dates only, never a cookie.
  logins: CloudLogin[];
}

// "brought": its cookies went in. "checked": the user saw it signed in there. "signed-out": they saw it wasn't.
export type CloudLoginStatus = "brought" | "checked" | "signed-out";

export interface CloudLogin {
  site: string;
  addedAt: number;
  checkedAt: number | null;
  status: CloudLoginStatus;
}

// What a cloud tab shows: the provider's live view in a frame, or pictures sent as `cloud:frame`.
// `checking` names the site when the user opened it to see whether they're signed in there.
export type CloudView = { kind: "live"; url: string; takenOver: boolean; checking: string | null } | { kind: "frames"; takenOver: boolean; checking: string | null } | { kind: "gone" };

export interface CloudFrame {
  tabId: string;
  // A JPEG, base64.
  data: string;
}

// Renderer asks, main answers. `region` names the views main accepts the call from.
export interface InvokeChannels {
  "tabs:list": { region: "chrome" | "overlay"; args: []; result: TabInfo[] };
  "tabs:create": { region: "chrome" | "overlay"; args: [url?: string]; result: TabInfo };
  "tabs:close": { region: "chrome" | "overlay"; args: [tabId: string]; result: boolean };
  "tabs:switch": { region: "chrome" | "overlay"; args: [tabId: string]; result: boolean };
  "tabs:move": { region: "chrome" | "overlay"; args: [tabId: string, toIndex: number]; result: boolean };
  "tabs:move-by": { region: "chrome" | "overlay"; args: [tabId: string, delta: number]; result: boolean };
  "tabs:open-page": {
    region: "chrome" | "overlay";
    args: [page: InternalPage, options?: { param?: string; title?: string }];
    result: TabInfo;
  };
  "history:recent": { region: "chrome"; args: []; result: Visit[] };
  "history:search": {
    region: "chrome";
    args: [options: { query?: string; before?: HistoryCursor }];
    result: HistoryPage;
  };
  "history:delete": { region: "chrome"; args: [id: number]; result: boolean };
  // Asks first, in main. False if the user said no.
  "history:clear": { region: "chrome"; args: []; result: boolean };
  "history:import-sources": { region: "chrome"; args: []; result: ImportSource[] };
  "history:import": { region: "chrome"; args: [sourceId: string]; result: HistoryImportResult };
  "tab:navigate": { region: "chrome"; args: [tabId: string, url: string]; result: boolean };
  "tab:back": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:forward": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:reload": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:stop": { region: "chrome"; args: [tabId: string]; result: boolean };
  // Ends every job working in this tab. It's here, in the chrome, because no page can reach it.
  "tab:stop-work": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:zoom-reset": { region: "chrome"; args: [tabId: string]; result: boolean };
  "find:search": { region: "find"; args: [text: string]; result: void };
  "find:step": { region: "find"; args: [forward: boolean]; result: void };
  "find:close": { region: "find"; args: []; result: void };
  "layout:get": { region: "chrome" | "overlay"; args: []; result: Layout };
  "layout:toggle-sidebar": { region: "chrome" | "overlay"; args: []; result: void };
  "layout:toggle-chat": { region: "chrome"; args: []; result: void };
  "layout:resize": { region: "chrome"; args: [panel: ResizablePanel, width: number]; result: void };
  // Off a Mac, the menu button opens the app's own menu under itself, since the window has no menu bar.
  "layout:app-menu": { region: "chrome"; args: []; result: void };
  "overlay:show-sidebar": { region: "chrome"; args: []; result: void };
  "overlay:hide": { region: "overlay"; args: []; result: void };
  "theme:get": { region: "chrome" | "overlay" | "find" | "prompt" | "desktop" | "composer"; args: []; result: ThemeState };
  "library:get": { region: "chrome" | "overlay"; args: []; result: LibrarySnapshot };
  "bookmarks:toggle": { region: "chrome"; args: []; result: void };
  "bookmarks:toggle-pin": { region: "chrome"; args: []; result: void };
  "bookmarks:menu": { region: "chrome" | "overlay"; args: [bookmarkId: string]; result: void };
  "library:chat": { region: "chrome"; args: [chatId: string]; result: ChatThread | null };
  "settings:get": { region: "chrome" | "overlay"; args: []; result: Settings };
  "settings:update": { region: "chrome"; args: [patch: Partial<Settings>]; result: Settings };
  // Whether the shortcut couldn't be had, because another app holds it, so Settings can say so.
  "desktop:shortcut-taken": { region: "chrome"; args: []; result: boolean };
  "desktop:state": { region: "desktop"; args: []; result: DesktopBerryState };
  // Where the words are in the window, so the pointer can land on them, or null when they aren't showing.
  "desktop:line-box": { region: "desktop"; args: [box: Rect | null]; result: void };
  // The bird or its words were pressed. Main decides what that opens, so the view never names a chat or an approval.
  "desktop:press": { region: "desktop"; args: []; result: void };
  "desktop:drag-start": { region: "desktop"; args: []; result: void };
  "desktop:drag-end": { region: "desktop"; args: []; result: void };
  "desktop:menu": { region: "desktop"; args: []; result: void };
  "desktop:composer-state": { region: "composer"; args: []; result: DesktopComposerState };
  "desktop:composer-height": { region: "composer"; args: [height: number]; result: void };
  // Starts a job with no page, as whoever is chosen. It's the same as a chat started from the new tab page.
  "desktop:send": { region: "composer"; args: [text: string]; result: boolean };
  "desktop:close-composer": { region: "composer"; args: []; result: void };
  "chat:send": {
    region: "chrome";
    args: [chatId: string | null, text: string, options: ChatSendOptions];
    result: ChatThread | null;
  };
  // Says which chat's working view is on screen and how wide its picture is, or null for none. The answer and everything
  // after it come as `work:updated` and `work:frame`, to the chrome and nowhere else. A width of 0 means words only.
  "work:watch": { region: "chrome"; args: [chatId: string | null, pictureWidth: number]; result: void };
  "chat:stop": { region: "chrome"; args: [chatId: string]; result: void };
  // A routine's run answers its approvals here too, under the run's id.
  "chat:decide": {
    region: "chrome" | "overlay";
    args: [chatId: string, approvalId: string, allow: boolean, answer?: string];
    result: boolean;
  };
  // Allow for this card's runs, on an approval of one run of a For-each card that offers it. Only from the chrome, and
  // main refuses it anywhere else: the phone, another app, the runner and a job in the cloud never reach it.
  "chat:allow-for-card": { region: "chrome"; args: [chatId: string, approvalId: string]; result: boolean };
  "chat:rename": { region: "chrome" | "overlay"; args: [chatId: string, title: string]; result: boolean };
  // The native menu for a chat in the sidebar. Delete happens in main, so only Rename comes back.
  "chat:menu": { region: "chrome" | "overlay"; args: [chatId: string]; result: "rename" | null };
  // A Nest opens as a tab of its own, so creating one opens it, and this says which.
  "nests:create": { region: "chrome" | "overlay"; args: []; result: string };
  "nests:board": { region: "chrome"; args: [nestId: string]; result: NestBoard | null };
  "nests:rename": { region: "chrome" | "overlay"; args: [nestId: string, title: string]; result: boolean };
  // The native menu for a Nest in the sidebar. Delete asks and happens in main, so only Rename comes back.
  "nests:menu": { region: "chrome" | "overlay"; args: [nestId: string]; result: "rename" | null };
  // A draft card, unconnected or pulled out of `from`, which it then gets the latest answer of whenever it sends.
  "nests:add-card": { region: "chrome"; args: [nestId: string, card: NestNewCard]; result: NestCard | null };
  // Another card as one more input on a draft or a planned card, with the rows picked from it if any. Main checks it.
  "nests:add-input": { region: "chrome"; args: [cardId: string, fromId: string, picked?: PickedRows]; result: NestSendEachResult };
  // Retry the runs of a For-each card that didn't finish, or start the ones that didn't start. `warn` asks to confirm first.
  "nests:retry-runs": { region: "chrome"; args: [cardId: string, which: "unfinished" | "unstarted", confirmed: boolean]; result: NestRetryResult };
  "nests:move-card": { region: "chrome"; args: [cardId: string, x: number, y: number]; result: boolean };
  "nests:resize-card": { region: "chrome"; args: [cardId: string, width: number, height: number]; result: boolean };
  "nests:nudge-cards": { region: "chrome"; args: [nestId: string, moves: { id: string; x: number; y: number }[]]; result: boolean };
  // Only a draft's bird can change. A sent card keeps its chat's.
  "nests:set-bird": { region: "chrome"; args: [cardId: string, mascotId: string]; result: boolean };
  // Asks first in main when the card has a chat, which goes with it.
  "nests:delete-card": { region: "chrome"; args: [cardId: string]; result: boolean };
  // Sends from a card through the chat path, starting its chat if it's a draft. It runs only because the user sent it.
  "nests:send": { region: "chrome"; args: [cardId: string, text: string]; result: NestSendEachResult };
  // Sends a draft once for each row its line brings, each run its own chat, a few at a time. Only because the user sent it.
  "nests:send-each": { region: "chrome"; args: [cardId: string, text: string]; result: NestSendEachResult };
  // A reply in one run's thread, which gets its row again.
  "nests:send-run": { region: "chrome"; args: [runId: string, text: string]; result: NestSendEachResult };
  // Stops every run on a card, and whatever is still waiting never starts.
  "nests:stop-card": { region: "chrome"; args: [cardId: string]; result: boolean };
  // The Nest's composer: Berry starts one card at once, plans several, or asks first. Only because the user sent it.
  "nests:ask": { region: "chrome"; args: [nestId: string, text: string, options: NestAskOptions]; result: NestAskResult };
  // A planned card's prompt or For each row, only before the plan runs.
  "nests:edit-plan": { region: "chrome"; args: [cardId: string, change: { prompt?: string; each?: boolean }]; result: boolean };
  // Run: sends every planned card. Each starts once the card it reads from has answered, or once the user says so.
  "nests:run-plan": { region: "chrome"; args: [nestId: string]; result: NestRunPlanResult };
  "nests:discard-plan": { region: "chrome"; args: [nestId: string]; result: boolean };
  // Open as a Nest: a new Nest whose first card is this chat, which opens in the chat's tab.
  "nests:from-chat": { region: "chrome"; args: [chatId: string]; result: NestFromChatResult };
  // Looks right, continue: starts the cards of a run plan that wait for this card's answer to be checked.
  "nests:continue": { region: "chrome"; args: [cardId: string]; result: boolean };
  // Opens the system's file picker in main, which reads and copies in what's picked. A renderer never names a path. Says
  // why for each file that couldn't be added.
  "nests:attach-files": { region: "chrome"; args: [target: NestAttachTarget]; result: { problems: string[] } };
  "nests:add-note": { region: "chrome"; args: [target: NestAttachTarget, text: string]; result: NestAttachResult };
  // Only before its card is sent. Empty words remove it.
  "nests:edit-note": { region: "chrome"; args: [attachmentId: string, text: string]; result: boolean };
  // With a planned card's id, one of the composer's it points at stops being pointed at there, and stays on the composer.
  "nests:remove-attachment": { region: "chrome"; args: [attachmentId: string, fromCardId?: string]; result: boolean };
  // Opens the system's file picker in main for a CSV or TSV file, which main reads and parses into a table card placed in
  // sight. A renderer never names a path.
  "nests:add-table-file": { region: "chrome"; args: [nestId: string, place: Pick<NestAskOptions, "at" | "taken">]; result: NestTableResult };
  // The user's own name for a For-each card's column.
  "nests:rename-column": { region: "chrome"; args: [cardId: string, name: string]; result: boolean };
  // A card's table on the clipboard as cells, or saved as a CSV file where the user chooses in main's save dialog.
  "nests:copy-table": { region: "chrome"; args: [cardId: string]; result: boolean };
  // A file's whole table, which a board carries only the first rows of.
  "nests:table-rows": { region: "chrome"; args: [cardId: string]; result: string[][] | null };
  "nests:save-table": { region: "chrome"; args: [cardId: string]; result: boolean };
  // A file dropped on the board, read in the chrome from what was dropped, never a path: its name, size and bytes, or no
  // bytes when it's too big to read. Main checks it and makes a file's card where it landed, or a table card for a CSV.
  "nests:drop-file": { region: "chrome"; args: [nestId: string, file: NestDroppedFile, place: Pick<NestAskOptions, "at" | "taken">]; result: NestTableResult };
  // What a file's card shows when it's opened, read in main.
  "nests:file-content": { region: "chrome"; args: [cardId: string]; result: NestFileContent | null };
  // A file's card's file, written only where the user chooses in main's save dialog.
  "nests:save-file": { region: "chrome"; args: [cardId: string]; result: boolean };
  "page:text": { region: "chrome"; args: []; result: string | null };
  "chat:page-access": { region: "chrome"; args: []; result: boolean };
  "chat:set-page-access": { region: "chrome"; args: [enabled: boolean]; result: boolean };
  "berry:context-menu": { region: "chrome"; args: []; result: void };
  // Showing Berry how. Only the chrome can start, stop or read one, so no page, tool or mascot can.
  "recording:state": { region: "chrome"; args: []; result: RecordingState };
  "recording:start": { region: "chrome"; args: []; result: boolean };
  "recording:stop": { region: "chrome"; args: []; result: void };
  "recording:remove-step": { region: "chrome"; args: [stepId: string]; result: void };
  "recording:discard": { region: "chrome"; args: []; result: void };
  // The one call that sends anything anywhere. On success the trail is gone from main.
  "recording:draft": { region: "chrome"; args: []; result: RecordedDraftResult };
  "routines:save": { region: "chrome"; args: [id: string | null, draft: RoutineDraft]; result: RoutineSaveResult };
  "routines:set-paused": { region: "chrome"; args: [id: string, paused: boolean]; result: boolean };
  // Asks first, in main.
  "routines:delete": { region: "chrome"; args: [id: string]; result: boolean };
  "routines:run-now": { region: "chrome"; args: [id: string]; result: boolean };
  "routines:stop": { region: "chrome"; args: [runId: string]; result: boolean };
  "routines:runs": { region: "chrome"; args: [id: string]; result: RoutineRun[] };
  "routines:mark-seen": { region: "chrome"; args: []; result: void };
  "mascots:save": { region: "chrome"; args: [id: string | null, draft: MascotDraft & { worksInCloud?: boolean }]; result: MascotSaveResult };
  // Asks first, in main.
  "mascots:delete": { region: "chrome"; args: [id: string]; result: boolean };
  "mascots:gallery": { region: "chrome"; args: []; result: GalleryListing };
  "mascots:gallery-linked": { region: "chrome"; args: [galleryId: string]; result: GalleryLinked };
  // By the entry's id, so main copies what it has rather than what a renderer sends. A name is only for one that clashes.
  // `version` is the one the review showed, so what's added is what was read.
  "mascots:add-from-gallery": { region: "chrome"; args: [galleryId: string, version: string, name: string | null]; result: MascotSaveResult };
  // By the mascot's id, so what goes public is read in main, not sent by a renderer. Only the choices come from there.
  "mascots:publish": { region: "chrome"; args: [mascotId: string, choices: PublishChoices]; result: PublishResult };
  // Asks first, in main.
  "mascots:unpublish": { region: "chrome"; args: [publishedId: string]; result: PublishResult };
  // Null if the server couldn't say.
  "mascots:published": { region: "chrome"; args: []; result: PublishedMascot[] | null };
  "mascots:last-author": { region: "chrome"; args: []; result: string };
  // By the offer's id, so what's kept is what main showed, not what a renderer sends. Only the chrome can reach these: no
  // page, tool or mascot can read or write memory.
  "memory:decide": { region: "chrome"; args: [offerId: string, keep: boolean]; result: MemoryResult };
  "memory:edit": { region: "chrome"; args: [factId: string, text: string]; result: MemoryResult };
  "memory:forget": { region: "chrome"; args: [factId: string]; result: boolean };
  // Asks first, in main.
  "memory:clear": { region: "chrome"; args: [mascotId: string]; result: boolean };
  "account:state": { region: "chrome"; args: []; result: AccountState };
  "account:sign-in": { region: "chrome"; args: [email: string, password: string]; result: AccountState };
  "account:sign-up": { region: "chrome"; args: [email: string, password: string]; result: AccountState };
  "account:sign-out": { region: "chrome"; args: []; result: AccountState };
  "suggestions:list": { region: "chrome"; args: []; result: Suggestion[] };
  "suggestions:dismiss": { region: "chrome"; args: [id: string]; result: Suggestion[] };
  "suggestions:used": { region: "chrome"; args: [id: string]; result: Suggestion[] };
  "downloads:list": { region: "chrome"; args: []; result: DownloadInfo[] };
  "downloads:act": { region: "chrome"; args: [id: string, action: DownloadAction]; result: boolean };
  "downloads:choose-folder": { region: "chrome"; args: []; result: void };
  "permissions:saved": { region: "chrome"; args: []; result: SavedSitePermission[] };
  "permissions:set": {
    region: "chrome";
    args: [origin: string, permission: SitePermission, decision: SiteDecision | null];
    result: boolean;
  };
  "phone:state": { region: "chrome"; args: []; result: PhoneState };
  // The token goes this way only.
  "phone:connect": { region: "chrome"; args: [token: string]; result: PhoneState };
  "phone:new-link": { region: "chrome"; args: []; result: PhoneState };
  "phone:open-link": { region: "chrome"; args: []; result: void };
  "phone:disconnect": { region: "chrome"; args: []; result: PhoneState };
  "mcp:state": { region: "chrome"; args: []; result: McpState };
  "mcp:set-on": { region: "chrome"; args: [on: boolean]; result: McpState };
  // A new token, so every app set up with the old one is refused.
  "mcp:revoke": { region: "chrome"; args: []; result: McpState };
  // Puts that app's snippet, with the real token, on the clipboard.
  "mcp:copy": { region: "chrome"; args: [app: string]; result: boolean };
  "cloud:state": { region: "chrome"; args: []; result: CloudState };
  // The key and project id go this way only.
  "cloud:save": { region: "chrome"; args: [apiKey: string, projectId: string]; result: CloudState };
  "cloud:forget": { region: "chrome"; args: []; result: CloudState };
  "cloud:end": { region: "chrome"; args: []; result: CloudState };
  "cloud:view": { region: "chrome"; args: [tabId: string]; result: CloudView };
  // The live view of a chat's job on the cloud runner, only ever Browserbase's page, or null while there's none.
  "cloud:runner-view": { region: "chrome"; args: [chatId: string]; result: string | null };
  // The runner's link, looked up again. Link names the runner's account by email.
  "cloud:runner-state": { region: "chrome"; args: []; result: RunnerState };
  "cloud:runner-link": { region: "chrome"; args: [email: string]; result: RunnerState };
  "cloud:runner-unlink": { region: "chrome"; args: []; result: RunnerState };
  // Ends every connection ChatGPT or Claude made through the relay. False if it couldn't.
  "cloud:relay-disconnect": { region: "chrome"; args: []; result: boolean };
  // Which cloud tab is on screen, or null. Pictures of it come as `cloud:frame`, to the chrome and nowhere else.
  "cloud:watch": { region: "chrome"; args: [tabId: string | null]; result: void };
  // The size the cloud tab shows its page at, so the page's viewport fills it, as a tab of the window's own does.
  "cloud:fit": { region: "chrome"; args: [tabId: string, width: number, height: number]; result: void };
  // The user takes the tab from the job, as clicking in a tab of the window's own does.
  "cloud:take-over": { region: "chrome"; args: [tabId: string]; result: boolean };
  // Sites from history and bookmarks to offer for bringing along. Names only.
  "cloud:login-suggestions": { region: "chrome"; args: []; result: string[] };
  // Asks for Touch ID, then copies that one site's cookies from this browser into the cloud browser and opens it there.
  // Says what went wrong, or null. Only the user can start this, from Settings: no tool or mascot reaches it.
  "cloud:bring-login": { region: "chrome"; args: [site: string]; result: string | null };
  // Opens the site in a cloud tab, for the user to see whether they're signed in.
  "cloud:check-login": { region: "chrome"; args: [site: string]; result: string | null };
  // What the user saw there.
  "cloud:mark-login": { region: "chrome"; args: [site: string, signedIn: boolean]; result: void };
  // Takes that site's cookies out of the cloud browser, and the site off the list.
  "cloud:revoke-login": { region: "chrome"; args: [site: string]; result: string | null };
  // Every cookie in the cloud browser, and the whole list.
  "cloud:forget-logins": { region: "chrome"; args: []; result: string | null };
  "permissions:current": { region: "prompt"; args: []; result: PermissionPrompt | null };
  "permissions:decide": { region: "prompt"; args: [promptId: string, allow: boolean]; result: boolean };
  "permissions:resize": { region: "prompt"; args: [height: number]; result: void };
}

export type InvokeChannel = keyof InvokeChannels;

// Main tells renderers.
export interface EventChannels {
  "tabs:updated": TabInfo[];
  "account:updated": AccountState;
  "phone:updated": PhoneState;
  "phone:answered": PhoneAnswered;
  "mcp:updated": McpState;
  "cloud:updated": CloudState;
  "cloud:runner-updated": RunnerState;
  "cloud:frame": CloudFrame;
  "layout:updated": Layout;
  "theme:updated": ThemeState;
  "desktop:state": DesktopBerryState;
  "desktop:composer-state": DesktopComposerState;
  // Whether the bird is out on the desktop, so the chrome doesn't draw a second one.
  "desktop:away": boolean;
  "settings:updated": Settings;
  "library:updated": LibrarySnapshot;
  // A `blueberry://mascot/<id>` link was opened, so the Gallery shows that entry. Only ever a checked uuid.
  "gallery:linked": string;
  "toolbar:focus-address": null;
  "overlay:visibility": boolean;
  "recording:updated": RecordingState;
  "work:updated": WorkView | null;
  "work:frame": WorkFrame;
  "chat:chunk": ChatChunk;
  "chat:updated": ChatThread;
  "chat:deleted": string;
  "nests:updated": NestBoard;
  "nests:deleted": string;
  "nests:focus": NestFocus;
  "nests:hand-off": NestHandOff;
  // ⌘+, ⌘− and ⌘0 on a Nest's board, from the View menu.
  "nests:zoom": "in" | "out" | "fit";
  // Text the user chose to ask about. It waits in the composer and is never sent by itself.
  "chat:draft": string;
  "find:opened": null;
  "find:result": FindResult;
  "suggestions:updated": Suggestion[];
  "downloads:updated": DownloadInfo[];
  "permissions:saved-updated": SavedSitePermission[];
  "permissions:prompt": PermissionPrompt | null;
}

export type Unsubscribe = () => void;

export interface BrowserAPI {
  getTabs: () => Promise<TabInfo[]>;
  createTab: (url?: string) => Promise<TabInfo>;
  closeTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<boolean>;
  moveTab: (tabId: string, toIndex: number) => Promise<boolean>;
  moveTabBy: (tabId: string, delta: number) => Promise<boolean>;
  navigateTab: (tabId: string, url: string) => Promise<boolean>;
  goBack: (tabId: string) => Promise<boolean>;
  goForward: (tabId: string) => Promise<boolean>;
  reload: (tabId: string) => Promise<boolean>;
  stop: (tabId: string) => Promise<boolean>;
  stopWork: (tabId: string) => Promise<boolean>;
  resetZoom: (tabId: string) => Promise<boolean>;
  openPage: (page: InternalPage, options?: { param?: string; title?: string }) => Promise<TabInfo>;
  getRecent: () => Promise<Visit[]>;
  searchHistory: (options: { query?: string; before?: HistoryCursor }) => Promise<HistoryPage>;
  deleteHistoryEntry: (id: number) => Promise<boolean>;
  clearHistory: () => Promise<boolean>;
  importSources: () => Promise<ImportSource[]>;
  importHistory: (sourceId: string) => Promise<HistoryImportResult>;
  onTabsUpdated: (callback: (tabs: TabInfo[]) => void) => Unsubscribe;
  onFocusAddress: (callback: () => void) => Unsubscribe;
}

export interface LayoutAPI {
  getLayout: () => Promise<Layout>;
  toggleSidebar: () => Promise<void>;
  toggleChat: () => Promise<void>;
  resize: (panel: ResizablePanel, width: number) => Promise<void>;
  showAppMenu: () => Promise<void>;
  showFloatingSidebar: () => Promise<void>;
  hideFloatingSidebar: () => Promise<void>;
  onFloatingSidebarVisibility: (callback: (visible: boolean) => void) => Unsubscribe;
  onLayoutUpdated: (callback: (layout: Layout) => void) => Unsubscribe;
}

export interface ThemeAPI {
  getTheme: () => Promise<ThemeState>;
  onThemeUpdated: (callback: (theme: ThemeState) => void) => Unsubscribe;
}

export interface SettingsAPI {
  getSettings: () => Promise<Settings>;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
  // The native menu for right-clicking Berry, with Keep Berry still and Hide Berry.
  showBerryMenu: () => Promise<void>;
  onSettingsUpdated: (callback: (settings: Settings) => void) => Unsubscribe;
}

export interface ChatAPI {
  // Starts a chat when `chatId` is null. The reply arrives through the events.
  send: (chatId: string | null, text: string, options: ChatSendOptions) => Promise<ChatThread | null>;
  stop: (chatId: string) => Promise<void>;
  decide: (chatId: string, approvalId: string, allow: boolean, answer?: string) => Promise<boolean>;
  allowForCard: (chatId: string, approvalId: string) => Promise<boolean>;
  rename: (chatId: string, title: string) => Promise<boolean>;
  showMenu: (chatId: string) => Promise<"rename" | null>;
  getPageText: () => Promise<string | null>;
  getPageAccess: () => Promise<boolean>;
  setPageAccess: (enabled: boolean) => Promise<boolean>;
  onChatChunk: (callback: (chunk: ChatChunk) => void) => Unsubscribe;
  onChatUpdated: (callback: (thread: ChatThread) => void) => Unsubscribe;
  onChatDeleted: (callback: (chatId: string) => void) => Unsubscribe;
  onDraft: (callback: (text: string) => void) => Unsubscribe;
}

export interface NestsAPI {
  create: () => Promise<string>;
  board: (nestId: string) => Promise<NestBoard | null>;
  rename: (nestId: string, title: string) => Promise<boolean>;
  showMenu: (nestId: string) => Promise<"rename" | null>;
  addCard: (nestId: string, card: NestNewCard) => Promise<NestCard | null>;
  addInput: (cardId: string, fromId: string, picked?: PickedRows) => Promise<NestSendEachResult>;
  retryRuns: (cardId: string, which: "unfinished" | "unstarted", confirmed: boolean) => Promise<NestRetryResult>;
  moveCard: (cardId: string, x: number, y: number) => Promise<boolean>;
  // The size the user made a card from its corner.
  resizeCard: (cardId: string, width: number, height: number) => Promise<boolean>;
  // Cards placed for the user, moved out of the way of one that grew. Main moves no card the user placed or dragged.
  nudgeCards: (nestId: string, moves: { id: string; x: number; y: number }[]) => Promise<boolean>;
  setBird: (cardId: string, mascotId: string) => Promise<boolean>;
  deleteCard: (cardId: string) => Promise<boolean>;
  // Each says why when it can't send, so a press never does nothing.
  send: (cardId: string, text: string) => Promise<NestSendEachResult>;
  sendEach: (cardId: string, text: string) => Promise<NestSendEachResult>;
  sendRun: (runId: string, text: string) => Promise<NestSendEachResult>;
  stopCard: (cardId: string) => Promise<boolean>;
  ask: (nestId: string, text: string, options: NestAskOptions) => Promise<NestAskResult>;
  editPlan: (cardId: string, change: { prompt?: string; each?: boolean }) => Promise<boolean>;
  runPlan: (nestId: string) => Promise<NestRunPlanResult>;
  discardPlan: (nestId: string) => Promise<boolean>;
  continueFrom: (cardId: string) => Promise<boolean>;
  attachFiles: (target: NestAttachTarget) => Promise<{ problems: string[] }>;
  addNote: (target: NestAttachTarget, text: string) => Promise<NestAttachResult>;
  editNote: (attachmentId: string, text: string) => Promise<boolean>;
  removeAttachment: (attachmentId: string, fromCardId?: string) => Promise<boolean>;
  addTableFile: (nestId: string, place: Pick<NestAskOptions, "at" | "taken">) => Promise<NestTableResult>;
  renameColumn: (cardId: string, name: string) => Promise<boolean>;
  copyTable: (cardId: string) => Promise<boolean>;
  tableRows: (cardId: string) => Promise<string[][] | null>;
  saveTable: (cardId: string) => Promise<boolean>;
  dropFile: (nestId: string, file: NestDroppedFile, place: Pick<NestAskOptions, "at" | "taken">) => Promise<NestTableResult>;
  fileContent: (cardId: string) => Promise<NestFileContent | null>;
  saveFile: (cardId: string) => Promise<boolean>;
  onUpdated: (callback: (board: NestBoard) => void) => Unsubscribe;
  onDeleted: (callback: (nestId: string) => void) => Unsubscribe;
  fromChat: (chatId: string) => Promise<NestFromChatResult>;
  onFocus: (callback: (focus: NestFocus) => void) => Unsubscribe;
  onHandOff: (callback: (handOff: NestHandOff) => void) => Unsubscribe;
  onZoom: (callback: (zoom: "in" | "out" | "fit") => void) => Unsubscribe;
}

export interface LibraryAPI {
  toggleBookmark: () => Promise<void>;
  togglePin: () => Promise<void>;
  showBookmarkMenu: (bookmarkId: string) => Promise<void>;
  getLibrary: () => Promise<LibrarySnapshot>;
  getChat: (chatId: string) => Promise<ChatThread | null>;
  onLibraryUpdated: (callback: (library: LibrarySnapshot) => void) => Unsubscribe;
}

export interface WorkAPI {
  watch: (chatId: string | null, pictureWidth: number) => Promise<void>;
  onUpdated: (callback: (view: WorkView | null) => void) => Unsubscribe;
  onFrame: (callback: (frame: WorkFrame) => void) => Unsubscribe;
}

export interface RecordingAPI {
  state: () => Promise<RecordingState>;
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  removeStep: (stepId: string) => Promise<void>;
  discard: () => Promise<void>;
  draft: () => Promise<RecordedDraftResult>;
  onUpdated: (callback: (state: RecordingState) => void) => Unsubscribe;
}

export interface FindAPI {
  search: (text: string) => Promise<void>;
  step: (forward: boolean) => Promise<void>;
  close: () => Promise<void>;
  onOpened: (callback: () => void) => Unsubscribe;
  onResult: (callback: (result: FindResult) => void) => Unsubscribe;
}

export interface RoutinesAPI {
  save: (id: string | null, draft: RoutineDraft) => Promise<RoutineSaveResult>;
  setPaused: (id: string, paused: boolean) => Promise<boolean>;
  delete: (id: string) => Promise<boolean>;
  runNow: (id: string) => Promise<boolean>;
  stop: (runId: string) => Promise<boolean>;
  getRuns: (id: string) => Promise<RoutineRun[]>;
  markSeen: () => Promise<void>;
}

export interface MascotsAPI {
  save: (id: string | null, draft: MascotDraft & { worksInCloud?: boolean }) => Promise<MascotSaveResult>;
  delete: (id: string) => Promise<boolean>;
  gallery: () => Promise<GalleryListing>;
  galleryLinked: (galleryId: string) => Promise<GalleryLinked>;
  addFromGallery: (galleryId: string, version: string, name: string | null) => Promise<MascotSaveResult>;
  publish: (mascotId: string, choices: PublishChoices) => Promise<PublishResult>;
  unpublish: (publishedId: string) => Promise<PublishResult>;
  published: () => Promise<PublishedMascot[] | null>;
  lastAuthor: () => Promise<string>;
  onLinked: (callback: (galleryId: string) => void) => Unsubscribe;
}

export interface MemoryAPI {
  decide: (offerId: string, keep: boolean) => Promise<MemoryResult>;
  edit: (factId: string, text: string) => Promise<MemoryResult>;
  forget: (factId: string) => Promise<boolean>;
  clear: (mascotId: string) => Promise<boolean>;
}

export interface AccountAPI {
  state: () => Promise<AccountState>;
  signIn: (email: string, password: string) => Promise<AccountState>;
  signUp: (email: string, password: string) => Promise<AccountState>;
  signOut: () => Promise<AccountState>;
  onUpdated: (callback: (state: AccountState) => void) => Unsubscribe;
}

export interface SuggestionsAPI {
  list: () => Promise<Suggestion[]>;
  dismiss: (id: string) => Promise<Suggestion[]>;
  // Its prompt was sent or its form saved.
  used: (id: string) => Promise<Suggestion[]>;
  onUpdated: (callback: (suggestions: Suggestion[]) => void) => Unsubscribe;
}

export interface DownloadsAPI {
  list: () => Promise<DownloadInfo[]>;
  act: (id: string, action: DownloadAction) => Promise<boolean>;
  chooseFolder: () => Promise<void>;
  onUpdated: (callback: (downloads: DownloadInfo[]) => void) => Unsubscribe;
}

export interface PermissionsAPI {
  saved: () => Promise<SavedSitePermission[]>;
  set: (origin: string, permission: SitePermission, decision: SiteDecision | null) => Promise<boolean>;
  onSavedUpdated: (callback: (saved: SavedSitePermission[]) => void) => Unsubscribe;
  // Only the prompt view may call these.
  current: () => Promise<PermissionPrompt | null>;
  decide: (promptId: string, allow: boolean) => Promise<boolean>;
  resizePrompt: (height: number) => Promise<void>;
  onPrompt: (callback: (prompt: PermissionPrompt | null) => void) => Unsubscribe;
}

export interface PhoneAPI {
  state: () => Promise<PhoneState>;
  connect: (token: string) => Promise<PhoneState>;
  newLink: () => Promise<PhoneState>;
  openLink: () => Promise<void>;
  disconnect: () => Promise<PhoneState>;
  onUpdated: (callback: (state: PhoneState) => void) => Unsubscribe;
  onAnswered: (callback: (answered: PhoneAnswered) => void) => Unsubscribe;
}

export interface McpAPI {
  state: () => Promise<McpState>;
  setOn: (on: boolean) => Promise<McpState>;
  revoke: () => Promise<McpState>;
  copy: (app: string) => Promise<boolean>;
  onUpdated: (callback: (state: McpState) => void) => Unsubscribe;
}

export interface CloudAPI {
  state: () => Promise<CloudState>;
  save: (apiKey: string, projectId: string) => Promise<CloudState>;
  forget: () => Promise<CloudState>;
  end: () => Promise<CloudState>;
  view: (tabId: string) => Promise<CloudView>;
  runnerView: (chatId: string) => Promise<string | null>;
  runnerState: () => Promise<RunnerState>;
  linkRunner: (email: string) => Promise<RunnerState>;
  unlinkRunner: () => Promise<RunnerState>;
  disconnectRelay: () => Promise<boolean>;
  onRunnerUpdated: (callback: (state: RunnerState) => void) => Unsubscribe;
  watch: (tabId: string | null) => Promise<void>;
  fit: (tabId: string, width: number, height: number) => Promise<void>;
  takeOver: (tabId: string) => Promise<boolean>;
  loginSuggestions: () => Promise<string[]>;
  bringLogin: (site: string) => Promise<string | null>;
  checkLogin: (site: string) => Promise<string | null>;
  markLogin: (site: string, signedIn: boolean) => Promise<void>;
  revokeLogin: (site: string) => Promise<string | null>;
  forgetLogins: () => Promise<string | null>;
  onUpdated: (callback: (state: CloudState) => void) => Unsubscribe;
  onFrame: (callback: (frame: CloudFrame) => void) => Unsubscribe;
}

export interface DesktopAPI {
  // For Settings and the chrome's own bird. The chrome can't call the rest.
  shortcutTaken: () => Promise<boolean>;
  onAway: (callback: (away: boolean) => void) => Unsubscribe;
  state: () => Promise<DesktopBerryState>;
  lineBox: (box: Rect | null) => Promise<void>;
  press: () => Promise<void>;
  dragStart: () => Promise<void>;
  dragEnd: () => Promise<void>;
  menu: () => Promise<void>;
  onState: (callback: (state: DesktopBerryState) => void) => Unsubscribe;
  composerState: () => Promise<DesktopComposerState>;
  composerHeight: (height: number) => Promise<void>;
  send: (text: string) => Promise<boolean>;
  closeComposer: () => Promise<void>;
  onComposerState: (callback: (state: DesktopComposerState) => void) => Unsubscribe;
}

export interface ChromeAPI {
  desktop: DesktopAPI;
  browser: BrowserAPI;
  layout: LayoutAPI;
  theme: ThemeAPI;
  settings: SettingsAPI;
  library: LibraryAPI;
  chat: ChatAPI;
  nests: NestsAPI;
  work: WorkAPI;
  recording: RecordingAPI;
  find: FindAPI;
  routines: RoutinesAPI;
  mascots: MascotsAPI;
  memory: MemoryAPI;
  account: AccountAPI;
  suggestions: SuggestionsAPI;
  downloads: DownloadsAPI;
  permissions: PermissionsAPI;
  phone: PhoneAPI;
  mcp: McpAPI;
  cloud: CloudAPI;
}
