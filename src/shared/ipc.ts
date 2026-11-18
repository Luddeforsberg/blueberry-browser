// The one IPC contract between main and the chrome renderer.
// Types only: sandboxed preloads can't load shared runtime code, so nothing here may survive compilation.

import type { AiKeyState, AiKeyTried, AiService } from "./aiKey";
import type { AppIconGround } from "./appIcon";
import type { FileChip, TabChoice } from "./attachments";
import type { FirstJob, FirstRunStep } from "./firstRun";
import type {
  ChatThread,
  GalleryLinked,
  GalleryListing,
  HandoffNeed,
  LibrarySnapshot,
  MascotDraft,
  MascotLook,
  MemoryResult,
  PublishChoices,
  PublishedMascot,
  PublishResult,
  RecordedDraftResult,
  RecordingState,
  RoutineDraft,
  RoutineRun,
  SavedSiteList,
  Suggestion,
  WorkFrame,
  WorkView,
} from "./library";

// The chrome view under the tabs, the overlay view that floats the collapsed sidebar over a page, and the
// find bar, which floats over a page in a view of its own. The prompt view asks about what a site requested, and
// nothing else can answer it. The desktop view is the drop on the edge of the screen, in a window of its own, and the
// composer view is the window beside it that can take the keyboard: the prompt box, the tray and the ask. The suggestions view is the list under the address field while it's
// being edited, over the page. The menu view draws our menus and the Asking first card over the window, and the desktop
// menu view the mascot's menu on the desktop, in a window of its own. Only they can answer either.
export type ChromeRegion =
  | "chrome"
  | "overlay"
  | "find"
  | "prompt"
  | "desktop"
  | "composer"
  | "suggestions"
  | "tooltip"
  | "preview"
  | "menu"
  | "drop-menu";

export type LayoutMode = "vertical" | "horizontal";

export type ResizablePanel = "sidebar" | "chat";

// Pages the chrome draws itself. They open as tabs, on the same card as a web page.
export type InternalPage =
  | "new-tab"
  | "chat"
  | "routines"
  | "settings"
  | "downloads"
  | "gallery"
  | "history"
  | "flock"
  | "mascot-gallery"
  | "needs-you"
  | "recording"
  | "cloud";

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
  // False until the first run is finished.
  onboarded: boolean;
  // First run steps already passed, so leaving part way starts again at the first one that isn't done.
  firstRun: FirstRunStep[];
  // The rows First jobs shows on the new tab, set when the first run ends. Empty once hidden, and for anyone whose first
  // run came before it.
  firstJobs: FirstJob[];
  // What main has seen really happen: a key saved, history brought in, a message sent, a chat with Plain Words.
  firstJobsDone: FirstJob[];
  // Whether this profile has had its starter mascots, or never needed them. Once true, they never come back.
  startersAdded: boolean;
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
  // What the account menu and Account call you. Only ever on this computer: never sent, prompted or published.
  accountName: string | null;
  // Whose face is on the app's icon, null for Berry, and what's behind it.
  appIconMascotId: string | null;
  appIconGround: AppIconGround;
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

// A mascot as the desktop draws it, in the mood it's in.
export interface DesktopFace {
  name: string;
  look: MascotLook;
  mood: "rest" | "fetching" | "asking" | "delivered" | "oops";
}

// What the drop says besides its faces. Main decides all of it. What comes out by itself, asking and finished, never
// has a site, a step or the exact words of an approval in it: only who and what kind of thing, and a finished reply's
// own first sentence.
export type DesktopDropSays =
  | { kind: "rest" }
  // Pointed at with nothing going on: what a press does, with the shortcut's keys if it's ours.
  | { kind: "job"; shortcut: boolean }
  // Pointed at while one job works: its name and when it started.
  | { kind: "working"; title: string; since: number | null }
  // Pointed at with several things going: "2 working", "1 finished".
  | { kind: "counts"; counts: string[] }
  // Something needs you, with Answer.
  | { kind: "asking"; words: string }
  // A job ended while you were away, with Open and a cross.
  | { kind: "finished"; text: string };

// Everything the drop's view draws. The view never names a chat or an approval: a press only says which part.
export interface DesktopDropState {
  // False while it goes back into the edge, just before the window hides.
  shown: boolean;
  // Goes up each time the window moves or changes size, when anything in it jumps rather than gliding.
  frame: number;
  // The window's top left on the screen.
  origin: Point;
  edge: DesktopEdge;
  // The middle of the drop on the edge, in the window.
  anchor: Point;
  dragging: boolean;
  // Up to three, the one with the most to say first.
  faces: DesktopFace[];
  // Something is working, so the pips move beside the faces.
  working: boolean;
  says: DesktopDropSays;
  showBerry: boolean;
  still: boolean;
}

// What a press on the drop was on.
export type DesktopDropPart = "drop" | "answer" | "open" | "dismiss";

// The prompt box: who goes, where, and jobs sent before, whose words go in the box.
export interface DesktopBox {
  chosen: { id: string; name: string; look: MascotLook };
  flock: Array<{ id: string; name: string; look: MascotLook }>;
  // This computer or the cloud, where the chosen mascot can work there, and which it starts on.
  cloud: { fits: boolean; on: boolean };
  recent: Array<{ label: string; prompt: string }>;
  shortcut: boolean;
}

// The tray's rows carry a key main made for this one showing, never a chat's or an approval's id.
export interface DesktopTray {
  flock: Array<DesktopFace & { chosen: boolean }>;
  asks: Array<DesktopFace & { key: string; words: string; since: number }>;
  working: Array<DesktopFace & { key: string; title: string; step: string | null; since: number | null }>;
  finished: Array<DesktopFace & { key: string; title: string; problem: string | null; at: number }>;
}

// The ask, only ever after Answer was pressed: the exact words, which are what's being allowed.
export interface DesktopAsk {
  // Made by main for this one showing, and sent back with a decision. It says nothing of the chat or the approval.
  key: string;
  face: DesktopFace;
  kind: "approval" | "question" | "handoff";
  // The tool's exact words, or the question.
  text: string;
  answers: string[];
  handoff: { need: HandoffNeed; site: string } | null;
  // What job it's for.
  job: string;
  // What happened, for a moment after it was answered here, and then the sheet closes.
  said: string | null;
}

// The window that can take the keyboard: the prompt box, or the tray and the ask beside the drop.
export interface DesktopPanelState {
  open: "box" | "sheets" | null;
  // Goes up each time it opens, so the view grows it again and puts the keyboard in it.
  opened: number;
  // Going away, for as long as the view takes to shrink it.
  closing: boolean;
  edge: DesktopEdge;
  // The middle of the drop on the edge, in this window.
  anchor: Point;
  box: DesktopBox;
  tray: DesktopTray | null;
  ask: DesktopAsk | null;
  showBerry: boolean;
  still: boolean;
}

// An answer from the ask, with the key of the showing it was pressed on. Main applies it to the ask it showed under
// that key, and only once.
export interface DesktopDecision {
  key: string;
  allow: boolean;
  answer?: string;
}

// "done" went through. "gone" means that ask isn't the one waiting or the one showing any more, or was answered here already. "code" is an
// answer shaped like a code, which isn't sent.
export type DesktopDecided = "done" | "gone" | "code";

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
  // The field the problem is about, so it's said under that one.
  problemAbout: "email" | "password" | null;
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
  profiles: number;
  // A picture of its app on this computer, as a data address, or null where it couldn't be read.
  icon: string | null;
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
// In the horizontal layout, what opens over the page from the toolbar: Chats, or a mascot's card. `anchor` is what was
// pressed, in the window, for the panel to open under.
export type Popover =
  | { kind: "chats"; anchor: Rect }
  | { kind: "mascot"; mascotId: string; anchor: Rect }
  | { kind: "account"; anchor: Rect };

// What's open over the page, and when it closed, whether the keyboard goes back to what opened it.
export interface PopoverState {
  shown: Popover | null;
  refocus: boolean;
}

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
  // Horizontal only: where Chats and a mascot's card open, over the page. Empty in the vertical layout.
  popover: Rect;
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

// One page in the history, for the address field: its newest visit and how many there were.
export interface VisitedPage {
  url: string;
  title: string;
  favicon: string | null;
  lastVisit: number;
  visits: number;
}

// A row under the address field. Titles and addresses are a page's own words, so they're only ever shown as text.
export type AddressSuggestion =
  | { kind: "tab"; tabId: string; title: string; url: string; favicon: string | null }
  | { kind: "bookmark"; title: string; url: string; favicon: string | null }
  // `when` is the last visit in words, such as "Yesterday".
  | { kind: "history"; title: string; url: string; favicon: string | null; when: string }
  // What Enter does today with the typed text: open it if it looks like an address, or search for it.
  | { kind: "search"; text: string; url: string; opens: boolean }
  // Asking the chosen mascot, as the new tab's composer does. `hidden` is Show Berry turned off.
  | { kind: "ask"; text: string; name: string; look: MascotLook; hidden: boolean };

// What the chrome asks the suggestions view to show. `field` is the address field, in the window.
export interface AddressSuggestionsRequest {
  rows: AddressSuggestion[];
  selected: number | null;
  field: Rect;
}

// What the suggestions view draws: the rows, and where the sheet goes in the view, from the layout owner.
export interface AddressSuggestionsShown {
  rows: AddressSuggestion[];
  selected: number | null;
  sheet: Rect;
}

// A tooltip the chrome can't draw itself, because it hangs over a web page: its words, its shortcut's keys, and where it
// goes in the window. `slide` moves it over from where the last one was.
export interface TooltipRequest {
  words: string;
  keys: string[];
  box: Rect;
  slide: boolean;
}

// What the tooltip view draws, placed in the view by the layout owner.
export type TooltipShown = TooltipRequest;

// DESIGN.md section 8, Menus. The icon a row may lead with, drawn by the menu view.
export type MenuIcon =
  | "rename"
  | "delete"
  | "back"
  | "forward"
  | "reload"
  | "copy"
  | "cut"
  | "paste"
  | "undo"
  | "redo"
  | "select-all"
  | "link"
  | "new-tab"
  | "save"
  | "berry"
  | "show-how"
  | "print"
  | "inspect"
  | "pin"
  | "bookmark"
  | "open";

// A menu as main sends it to the menu view: words, icons and state only. Main keeps what each row does, by its id, for
// this one menu, so the view answers with nothing but the id that was pressed.
export type MenuEntry =
  | { kind: "rule" }
  | {
      kind: "row";
      id: string;
      label: string;
      icon: MenuIcon | null;
      enabled: boolean;
      // Null for a row that isn't a switch.
      checked: boolean | null;
      // Deletes or removes: in `ask`, last, after a hairline.
      danger: boolean;
      // As this computer writes it: "Ctrl C", or "⌘C" on a Mac.
      shortcut: string | null;
      submenu: MenuEntry[] | null;
    };

// What opens a menu, in the view that asked: a button's box, or the pointer as a box with no size.
export type MenuAnchor = Rect;

export interface MenuShown {
  id: string;
  label: string;
  entries: MenuEntry[];
  // With mascots hidden, a row with a mascot for its icon shows the plain glyph.
  mascotsHidden: boolean;
}

// The size of each sheet the view drew: the menu itself at "", and a submenu at the place of its row among the entries,
// such as "3" or "3.1". `rowTop` is where that row starts in the sheet it's on.
export interface MenuSheetSize {
  path: string;
  width: number;
  height: number;
  rowTop: number;
}

// Where each sheet goes in the view, by its path, once main has placed them in the window.
export type MenuPlacement = Record<string, Point>;

// The Asking first card (DESIGN.md section 8). With no `action` it's a warning with only OK.
export interface AskCard {
  id: string;
  question: string;
  detail: string;
  action: string | null;
  // A mascot's own delete shows its face.
  mascot: { name: string; look: MascotLook; hidden: boolean } | null;
}

export type MenuViewState = { kind: "menu"; menu: MenuShown } | { kind: "ask"; ask: AskCard } | null;

// A tab's preview card, which hangs beside or under its tab and so over the page, in a view of its own. The chrome says
// which tab and where its row is in the window. Main decides what the card shows and where it goes.
export interface TabPreviewRequest {
  tabId: string;
  row: Rect;
  // Moving over from the last tab's card, along the tabs.
  slide: boolean;
}

// What the preview view draws. The picture is the tab's own, kept in main, and sent nowhere but here.
export interface TabPreviewShown {
  tabId: string;
  title: string;
  site: string;
  // A small JPEG as a data address, or null where there's no picture yet.
  picture: string | null;
  // The name of the mascot working in the tab, if one is.
  working: string | null;
  // Keep Berry still, so the pips hold.
  still: boolean;
  // Where the card goes in the view, from the layout owner. Its height is what it draws.
  card: Rect;
  slide: boolean;
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
export interface ChatSendOptions {
  seePage: boolean;
  mascotId?: string | null;
  // Work in a browser in the cloud rather than in this window's tabs. Ignored while the cloud is off.
  cloud?: boolean;
  // Send it to the cloud runner, which keeps going with this computer off. Needs the user signed in.
  runner?: boolean;
  // What the + added: files by the ids main gave them, and the user's tabs by id. Main judges each again.
  files?: string[];
  tabs?: string[];
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
export type CloudView =
  | { kind: "live"; url: string; takenOver: boolean; checking: string | null }
  | { kind: "frames"; takenOver: boolean; checking: string | null }
  | { kind: "gone" };

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
  // Pages in the history matching what's typed in the address field, one row per page, for its suggestions.
  "history:suggest": { region: "chrome"; args: [text: string]; result: VisitedPage[] };
  // Shows the list under the address field, or moves its selection. The chrome works out the rows.
  "address:show": { region: "chrome"; args: [request: AddressSuggestionsRequest]; result: void };
  "address:close": { region: "chrome"; args: []; result: void };
  // A row pressed in the list, by its place in what's shown. Main hands that row back to the chrome to act on.
  "address:pick": { region: "suggestions"; args: [index: number]; result: void };
  // A tooltip over the page, in a view of its own that never takes the keyboard. The chrome decides when and where.
  "tooltip:show": { region: "chrome"; args: [request: TooltipRequest]; result: void };
  "tooltip:hide": { region: "chrome" | "tooltip"; args: []; result: void };
  // A tab's preview card over the page, in a view of its own that never takes the keyboard. The chrome decides when.
  "preview:show": { region: "chrome" | "overlay"; args: [request: TabPreviewRequest]; result: void };
  "preview:hide": { region: "chrome" | "overlay" | "preview"; args: []; result: void };
  "tab:navigate": { region: "chrome"; args: [tabId: string, url: string]; result: boolean };
  "tab:back": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:forward": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:reload": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:stop": { region: "chrome"; args: [tabId: string]; result: boolean };
  // Ends every job working in this tab. It's here, in the chrome, because no page can reach it.
  "tab:stop-work": { region: "chrome"; args: [tabId: string]; result: boolean };
  // Takes a tab a job opened away from it, as clicking in the page does: the job can't reach it any more. Only ever narrows.
  "tab:take-over": { region: "chrome"; args: [tabId: string]; result: void };
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
  // The menu views: what they show, where main put each sheet once the view says how big they are, and their answers.
  // Only the view drawing a menu or a card may answer it, by the ids main gave, and main acts on each id once.
  "menu:current": { region: "menu" | "drop-menu"; args: []; result: MenuViewState };
  "menu:place": { region: "menu" | "drop-menu"; args: [menuId: string, sheets: MenuSheetSize[]]; result: MenuPlacement | null };
  "menu:choose": { region: "menu" | "drop-menu"; args: [menuId: string, rowId: string]; result: void };
  "menu:dismiss": { region: "menu" | "drop-menu"; args: [menuId: string]; result: void };
  "menu:answer": { region: "menu"; args: [askId: string, yes: boolean]; result: void };
  "overlay:show-sidebar": { region: "chrome"; args: []; result: void };
  "overlay:hide": { region: "overlay"; args: []; result: void };
  "overlay:open-popover": { region: "chrome"; args: [popover: Popover]; result: void };
  "overlay:close-popover": { region: "chrome" | "overlay"; args: [refocus: boolean]; result: void };
  "theme:get": {
    region:
      | "chrome"
      | "overlay"
      | "find"
      | "prompt"
      | "desktop"
      | "composer"
      | "suggestions"
      | "tooltip"
      | "preview"
      | "menu"
      | "drop-menu";
    args: [];
    result: ThemeState;
  };
  "library:get": { region: "chrome" | "overlay"; args: []; result: LibrarySnapshot };
  "bookmarks:toggle": { region: "chrome"; args: []; result: void };
  // Moves a saved site on top as a tile, or into the bookmarks, at a place in that list. Dragging and the menu both use it.
  "bookmarks:place": { region: "chrome" | "overlay"; args: [bookmarkId: string, list: SavedSiteList, index: number]; result: void };
  // Settles once the menu has closed.
  "bookmarks:menu": { region: "chrome" | "overlay"; args: [bookmarkId: string, anchor: MenuAnchor]; result: void };
  "library:chat": { region: "chrome"; args: [chatId: string]; result: ChatThread | null };
  "settings:get": { region: "chrome" | "overlay"; args: []; result: Settings };
  "settings:update": { region: "chrome"; args: [patch: Partial<Settings>]; result: Settings };
  // Light, dark or system, from the account menu, which can open in the overlay. It is all the overlay may change.
  "settings:set-appearance": { region: "chrome" | "overlay"; args: [appearance: Appearance]; result: void };
  // The app's icon as the chrome drew it, a PNG data address, for the mascot and ground it was drawn for. Main refuses
  // it unless those are what's chosen and it's a PNG of the right size, and says whether it took it.
  "settings:app-icon": { region: "chrome"; args: [png: string, mascotId: string | null, ground: AppIconGround]; result: boolean };
  // Whether the shortcut couldn't be had, because another app holds it, so Settings can say so.
  "desktop:shortcut-taken": { region: "chrome"; args: []; result: boolean };
  "desktop:state": { region: "desktop"; args: []; result: DesktopDropState };
  // Where the drop is drawn in its window, for the frame it was drawn for, so the pointer can land on it and nowhere else.
  "desktop:drop-box": { region: "desktop"; args: [box: Rect, frame: number]; result: void };
  // The drop, or a button on it, was pressed. Main decides what that opens, so the view never names a chat or an approval.
  "desktop:press": { region: "desktop"; args: [part: DesktopDropPart]; result: void };
  "desktop:drag-start": { region: "desktop"; args: []; result: void };
  "desktop:drag-end": { region: "desktop"; args: []; result: void };
  "desktop:menu": { region: "desktop"; args: []; result: void };
  "desktop:panel-state": { region: "composer"; args: []; result: DesktopPanelState };
  // How tall what's showing needs to be: the box with its lines, or the tray and the ask with their room.
  "desktop:panel-height": { region: "composer"; args: [height: number]; result: void };
  // Starts a job with no page, as whoever is chosen, here or in the cloud where that mascot can work there. It's the
  // same as a chat started from the new tab page.
  "desktop:send": { region: "composer"; args: [text: string, cloud: boolean]; result: boolean };
  // Who the next job goes to, from the box's own picker or Tab.
  "desktop:choose": { region: "composer"; args: [mascotId: string]; result: void };
  "desktop:open-box": { region: "composer"; args: []; result: void };
  "desktop:close-panel": { region: "composer"; args: []; result: void };
  "desktop:open-blueberry": { region: "composer"; args: []; result: void };
  // A row in the tray, by the key main gave it: Answer on an ask, or a job to open in Blueberry.
  "desktop:tray-press": { region: "composer"; args: [key: string]; result: void };
  // The answer to the ask that's showing. Main holds which ask that is.
  "desktop:decide": { region: "composer"; args: [decision: DesktopDecision]; result: DesktopDecided };
  // Opens the page the ask is about in Blueberry, or its chat when it has none here.
  "desktop:see-page": { region: "composer"; args: []; result: void };
  "chat:send": {
    region: "chrome";
    args: [chatId: string | null, text: string, options: ChatSendOptions];
    result: ChatThread | null;
  };
  // Says which chat's working view is on screen and how wide its picture is, or null for none. The answer and everything
  // after it come as `work:updated` and `work:frame`, to the chrome and nowhere else. A width of 0 means words only.
  "work:watch": { region: "chrome"; args: [chatId: string | null, pictureWidth: number]; result: void };
  // The prompt box's +. Main opens the dialog, reads the files and keeps them, and only chips come back. `kept` is what
  // the box holds already, so main can keep the count. A drop or a paste sends the bytes, never a path.
  "attachments:choose-files": { region: "chrome"; args: [kept: string[]]; result: FileChip[] };
  "attachments:add-files": { region: "chrome"; args: [files: { name: string; bytes: Uint8Array }[], kept: string[]]; result: FileChip[] };
  "attachments:discard": { region: "chrome"; args: [id: string]; result: void };
  // The user's tabs that could go with a message in this chat, or a new one as this mascot, each with why not if it can't.
  "attachments:tabs": { region: "chrome"; args: [chatId: string | null, mascotId: string | null]; result: TabChoice[] };
  "chat:stop": { region: "chrome"; args: [chatId: string]; result: void };
  // Which chat the chat panel has, or null for a new one, so a reply that ends in the open panel counts as seen.
  "chat:panel-shows": { region: "chrome"; args: [chatId: string | null]; result: void };
  // A routine's run answers its approvals here too, under the run's id.
  "chat:decide": {
    region: "chrome" | "overlay";
    args: [chatId: string, approvalId: string, allow: boolean, answer?: string];
    result: boolean;
  };
  "chat:rename": { region: "chrome" | "overlay"; args: [chatId: string, title: string]; result: boolean };
  // The menu for a chat in the sidebar. Delete asks first and happens in main, so only Rename comes back.
  "chat:menu": { region: "chrome" | "overlay"; args: [chatId: string, anchor: MenuAnchor]; result: "rename" | null };
  "page:text": { region: "chrome"; args: []; result: string | null };
  "chat:page-access": { region: "chrome"; args: []; result: boolean };
  "chat:set-page-access": { region: "chrome"; args: [enabled: boolean]; result: boolean };
  "berry:context-menu": { region: "chrome"; args: [anchor: MenuAnchor]; result: void };
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
  "mascots:save": {
    region: "chrome";
    args: [id: string | null, draft: MascotDraft & { worksInCloud?: boolean }];
    result: MascotSaveResult;
  };
  // Asks first, in main.
  "mascots:delete": { region: "chrome"; args: [id: string]; result: boolean };
  "mascots:gallery": { region: "chrome"; args: []; result: GalleryListing };
  // The bundled starters' example prompts, by Gallery id, from real runs. For the new tab's try rows. Nothing from the server.
  "mascots:examples": { region: "chrome"; args: []; result: Record<string, string> };
  // Who the next new chat runs as, from the chrome or a mascot's card over the page. Null is Berry.
  "mascots:choose": { region: "chrome" | "overlay"; args: [mascotId: string | null]; result: void };
  "mascots:gallery-linked": { region: "chrome"; args: [galleryId: string]; result: GalleryLinked };
  // By the entry's id, so main copies what it has rather than what a renderer sends. A name is only for one that clashes.
  // `version` is the one the review showed, so what's added is what was read.
  "mascots:add-from-gallery": {
    region: "chrome";
    args: [galleryId: string, version: string, name: string | null];
    result: MascotSaveResult;
  };
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
  "account:state": { region: "chrome" | "overlay"; args: []; result: AccountState };
  "account:sign-in": { region: "chrome"; args: [email: string, password: string]; result: AccountState };
  "account:sign-up": { region: "chrome"; args: [email: string, password: string]; result: AccountState };
  "account:sign-out": { region: "chrome" | "overlay"; args: []; result: AccountState };
  "ai-key:state": { region: "chrome"; args: []; result: AiKeyState };
  // The key goes this way only, and is kept only if the service answers with it. Nothing gives it back.
  "ai-key:try": { region: "chrome"; args: [service: AiService, key: string]; result: { outcome: AiKeyTried; state: AiKeyState } };
  "ai-key:remove": { region: "chrome"; args: []; result: AiKeyState };
  // Opens the service's own page for making a key.
  "ai-key:find": { region: "chrome"; args: [service: AiService]; result: void };
  // What's on the clipboard, for the key field's Paste, only if it has the shape of that service's key. Null otherwise,
  // so nothing else on the clipboard, such as a password, can be read this way.
  "ai-key:paste": { region: "chrome"; args: [service: AiService]; result: string | null };
  "suggestions:list": { region: "chrome"; args: []; result: Suggestion[] };
  "suggestions:dismiss": { region: "chrome"; args: [id: string]; result: Suggestion[] };
  "suggestions:used": { region: "chrome"; args: [id: string]; result: Suggestion[] };
  "downloads:list": { region: "chrome"; args: []; result: DownloadInfo[] };
  "downloads:act": { region: "chrome"; args: [id: string, action: DownloadAction]; result: boolean };
  "downloads:choose-folder": { region: "chrome"; args: []; result: void };
  // Shows the folder files are saved to. Main knows which, so nothing names a path.
  "downloads:open-folder": { region: "chrome"; args: []; result: boolean };
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
  "ai-key:updated": AiKeyState;
  "phone:updated": PhoneState;
  "phone:answered": PhoneAnswered;
  "mcp:updated": McpState;
  "cloud:updated": CloudState;
  "cloud:runner-updated": RunnerState;
  "cloud:frame": CloudFrame;
  "layout:updated": Layout;
  "theme:updated": ThemeState;
  "desktop:state": DesktopDropState;
  "desktop:panel-state": DesktopPanelState;
  "settings:updated": Settings;
  "library:updated": LibrarySnapshot;
  // A `blueberry://mascot/<id>` link was opened, so the Gallery shows that entry. Only ever a checked uuid.
  "gallery:linked": string;
  "toolbar:focus-address": null;
  // To the suggestions view: what to draw, or null when it's hidden.
  "address:suggestions": AddressSuggestionsShown | null;
  // To the chrome: the row pressed in the list.
  "address:picked": AddressSuggestion;
  // To the tooltip view: what to draw, or null when it's hidden.
  "tooltip:shown": TooltipShown | null;
  // To the preview view: the card to draw, or null when it's hidden.
  "preview:shown": TabPreviewShown | null;
  "overlay:visibility": boolean;
  "overlay:popover": PopoverState;
  "recording:updated": RecordingState;
  "work:updated": WorkView | null;
  "work:frame": WorkFrame;
  "chat:chunk": ChatChunk;
  "chat:updated": ChatThread;
  "chat:deleted": string;
  // Text the user chose to ask about. It waits in the composer and is never sent by itself.
  "chat:draft": string;
  "find:opened": null;
  "find:result": FindResult;
  "suggestions:updated": Suggestion[];
  "downloads:updated": DownloadInfo[];
  "permissions:saved-updated": SavedSitePermission[];
  "permissions:prompt": PermissionPrompt | null;
  // To a menu view: the menu or card to draw, or null when it's hidden.
  "menu:shown": MenuViewState;
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
  takeOver: (tabId: string) => Promise<void>;
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
  openPopover: (popover: Popover) => Promise<void>;
  closePopover: (refocus: boolean) => Promise<void>;
  onPopover: (callback: (state: PopoverState) => void) => Unsubscribe;
  onLayoutUpdated: (callback: (layout: Layout) => void) => Unsubscribe;
}

export interface ThemeAPI {
  getTheme: () => Promise<ThemeState>;
  onThemeUpdated: (callback: (theme: ThemeState) => void) => Unsubscribe;
}

export interface SettingsAPI {
  getSettings: () => Promise<Settings>;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
  setAppearance: (appearance: Appearance) => Promise<void>;
  setAppIcon: (png: string, mascotId: string | null, ground: AppIconGround) => Promise<boolean>;
  // The menu for right-clicking Berry, with Keep Berry still and Hide Berry.
  showBerryMenu: (anchor: MenuAnchor) => Promise<void>;
  onSettingsUpdated: (callback: (settings: Settings) => void) => Unsubscribe;
}

export interface ChatAPI {
  // Starts a chat when `chatId` is null. The reply arrives through the events.
  send: (chatId: string | null, text: string, options: ChatSendOptions) => Promise<ChatThread | null>;
  stop: (chatId: string) => Promise<void>;
  panelShows: (chatId: string | null) => Promise<void>;
  decide: (chatId: string, approvalId: string, allow: boolean, answer?: string) => Promise<boolean>;
  rename: (chatId: string, title: string) => Promise<boolean>;
  showMenu: (chatId: string, anchor: MenuAnchor) => Promise<"rename" | null>;
  getPageText: () => Promise<string | null>;
  getPageAccess: () => Promise<boolean>;
  setPageAccess: (enabled: boolean) => Promise<boolean>;
  onChatChunk: (callback: (chunk: ChatChunk) => void) => Unsubscribe;
  onChatUpdated: (callback: (thread: ChatThread) => void) => Unsubscribe;
  onChatDeleted: (callback: (chatId: string) => void) => Unsubscribe;
  onDraft: (callback: (text: string) => void) => Unsubscribe;
}

export interface AttachmentsAPI {
  chooseFiles: (kept: string[]) => Promise<FileChip[]>;
  addFiles: (files: { name: string; bytes: Uint8Array }[], kept: string[]) => Promise<FileChip[]>;
  discard: (id: string) => Promise<void>;
  tabs: (chatId: string | null, mascotId: string | null) => Promise<TabChoice[]>;
}

export interface LibraryAPI {
  toggleBookmark: () => Promise<void>;
  placeSavedSite: (bookmarkId: string, list: SavedSiteList, index: number) => Promise<void>;
  showBookmarkMenu: (bookmarkId: string, anchor: MenuAnchor) => Promise<void>;
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

export interface AddressAPI {
  suggestHistory: (text: string) => Promise<VisitedPage[]>;
  show: (request: AddressSuggestionsRequest) => Promise<void>;
  close: () => Promise<void>;
  pick: (index: number) => Promise<void>;
  onSuggestions: (callback: (shown: AddressSuggestionsShown | null) => void) => Unsubscribe;
  onPicked: (callback: (row: AddressSuggestion) => void) => Unsubscribe;
}

export interface TooltipAPI {
  show: (request: TooltipRequest) => Promise<void>;
  hide: () => Promise<void>;
  onShown: (callback: (shown: TooltipShown | null) => void) => Unsubscribe;
}

export interface TabPreviewAPI {
  show: (request: TabPreviewRequest) => Promise<void>;
  hide: () => Promise<void>;
  onShown: (callback: (shown: TabPreviewShown | null) => void) => Unsubscribe;
}

// Only the menu views may call these.
export interface MenuAPI {
  current: () => Promise<MenuViewState>;
  place: (menuId: string, sheets: MenuSheetSize[]) => Promise<MenuPlacement | null>;
  choose: (menuId: string, rowId: string) => Promise<void>;
  dismiss: (menuId: string) => Promise<void>;
  answer: (askId: string, yes: boolean) => Promise<void>;
  onShown: (callback: (state: MenuViewState) => void) => Unsubscribe;
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
  examples: () => Promise<Record<string, string>>;
  choose: (mascotId: string | null) => Promise<void>;
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

export interface AiKeyAPI {
  state: () => Promise<AiKeyState>;
  tryKey: (service: AiService, key: string) => Promise<{ outcome: AiKeyTried; state: AiKeyState }>;
  remove: () => Promise<AiKeyState>;
  find: (service: AiService) => Promise<void>;
  paste: (service: AiService) => Promise<string | null>;
  onUpdated: (callback: (state: AiKeyState) => void) => Unsubscribe;
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
  openFolder: () => Promise<boolean>;
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
  // For Settings. The chrome can't call the rest.
  shortcutTaken: () => Promise<boolean>;
  state: () => Promise<DesktopDropState>;
  dropBox: (box: Rect, frame: number) => Promise<void>;
  press: (part: DesktopDropPart) => Promise<void>;
  dragStart: () => Promise<void>;
  dragEnd: () => Promise<void>;
  menu: () => Promise<void>;
  onState: (callback: (state: DesktopDropState) => void) => Unsubscribe;
  panelState: () => Promise<DesktopPanelState>;
  panelHeight: (height: number) => Promise<void>;
  send: (text: string, cloud: boolean) => Promise<boolean>;
  choose: (mascotId: string) => Promise<void>;
  openBox: () => Promise<void>;
  closePanel: () => Promise<void>;
  openBlueberry: () => Promise<void>;
  trayPress: (key: string) => Promise<void>;
  decide: (decision: DesktopDecision) => Promise<DesktopDecided>;
  seePage: () => Promise<void>;
  onPanelState: (callback: (state: DesktopPanelState) => void) => Unsubscribe;
}

export interface ChromeAPI {
  desktop: DesktopAPI;
  browser: BrowserAPI;
  layout: LayoutAPI;
  theme: ThemeAPI;
  settings: SettingsAPI;
  library: LibraryAPI;
  chat: ChatAPI;
  attachments: AttachmentsAPI;
  work: WorkAPI;
  recording: RecordingAPI;
  find: FindAPI;
  address: AddressAPI;
  tooltip: TooltipAPI;
  preview: TabPreviewAPI;
  menu: MenuAPI;
  routines: RoutinesAPI;
  mascots: MascotsAPI;
  memory: MemoryAPI;
  account: AccountAPI;
  aiKey: AiKeyAPI;
  suggestions: SuggestionsAPI;
  downloads: DownloadsAPI;
  permissions: PermissionsAPI;
  phone: PhoneAPI;
  mcp: McpAPI;
  cloud: CloudAPI;
}
