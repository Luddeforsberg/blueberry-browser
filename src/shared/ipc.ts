// The one IPC contract between main and the chrome renderer.
// Types only: sandboxed preloads can't load shared runtime code, so nothing here may survive compilation.

import type { ChatThread, GalleryListing, LibrarySnapshot, MascotDraft, MascotLook, PublishChoices, PublishedMascot, PublishResult, RecordedDraftResult, RecordingState, RoutineDraft, RoutineRun, Suggestion, WorkFrame, WorkView } from "./library";

// The chrome view under the tabs, the overlay view that floats the collapsed sidebar over a page, and the
// find bar, which floats over a page in a view of its own. The prompt view asks about what a site requested, and
// nothing else can answer it. The desktop view is the bird on the edge of the screen, in a window of its own, and the
// composer view is its prompt box, in another.
export type ChromeRegion = "chrome" | "overlay" | "find" | "prompt" | "desktop" | "composer";

export type LayoutMode = "vertical" | "horizontal";

export type ResizablePanel = "sidebar" | "chat";

// Pages the chrome draws itself. They open as tabs, on the same card as a web page.
export type InternalPage = "new-tab" | "chat" | "routines" | "settings" | "downloads" | "gallery" | "history" | "flock" | "mascot-gallery" | "needs-you" | "recording";

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
  // Send to the phone even while the user is at the computer, for filming and trying it out.
  phoneAlways: boolean;
  // Who the next new chat runs as. Null is Berry.
  chosenMascotId: string | null;
  // The bird on the edge of the screen, and the shortcut that opens its composer.
  desktopBerry: boolean;
  // Where along the edge it stands, from 0 to 1. Null until it's been dragged.
  desktopBerrySpot: DesktopBerrySpot | null;
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
  sidebar: Rect;
  floatingSidebar: Rect;
  findBar: Rect;
  tabStrip: Rect;
  toolbar: Rect;
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
export interface ChatSendOptions {
  seePage: boolean;
  mascotId?: string | null;
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
  "chat:rename": { region: "chrome" | "overlay"; args: [chatId: string, title: string]; result: boolean };
  // The native menu for a chat in the sidebar. Delete happens in main, so only Rename comes back.
  "chat:menu": { region: "chrome" | "overlay"; args: [chatId: string]; result: "rename" | null };
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
  "mascots:save": { region: "chrome"; args: [id: string | null, draft: MascotDraft]; result: MascotSaveResult };
  // Asks first, in main.
  "mascots:delete": { region: "chrome"; args: [id: string]; result: boolean };
  "mascots:gallery": { region: "chrome"; args: []; result: GalleryListing };
  // By the entry's id, so main copies what it has rather than what a renderer sends. A name is only for one that clashes.
  "mascots:add-from-gallery": { region: "chrome"; args: [galleryId: string, name: string | null]; result: MascotSaveResult };
  // By the mascot's id, so what goes public is read in main, not sent by a renderer. Only the choices come from there.
  "mascots:publish": { region: "chrome"; args: [mascotId: string, choices: PublishChoices]; result: PublishResult };
  // Asks first, in main.
  "mascots:unpublish": { region: "chrome"; args: [publishedId: string]; result: PublishResult };
  // Null if the server couldn't say.
  "mascots:published": { region: "chrome"; args: []; result: PublishedMascot[] | null };
  "mascots:last-author": { region: "chrome"; args: []; result: string };
  "account:state": { region: "chrome"; args: []; result: AccountState };
  "account:sign-in": { region: "chrome"; args: [email: string, password: string]; result: AccountState };
  "account:sign-up": { region: "chrome"; args: [email: string, password: string]; result: AccountState };
  "account:sign-out": { region: "chrome"; args: []; result: AccountState };
  "suggestions:list": { region: "chrome"; args: []; result: Suggestion[] };
  "suggestions:dismiss": { region: "chrome"; args: [id: string]; result: Suggestion[] };
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
  "layout:updated": Layout;
  "theme:updated": ThemeState;
  "desktop:state": DesktopBerryState;
  "desktop:composer-state": DesktopComposerState;
  // Whether the bird is out on the desktop, so the chrome doesn't draw a second one.
  "desktop:away": boolean;
  "settings:updated": Settings;
  "library:updated": LibrarySnapshot;
  "toolbar:focus-address": null;
  "overlay:visibility": boolean;
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
  save: (id: string | null, draft: MascotDraft) => Promise<MascotSaveResult>;
  delete: (id: string) => Promise<boolean>;
  gallery: () => Promise<GalleryListing>;
  addFromGallery: (galleryId: string, name: string | null) => Promise<MascotSaveResult>;
  publish: (mascotId: string, choices: PublishChoices) => Promise<PublishResult>;
  unpublish: (publishedId: string) => Promise<PublishResult>;
  published: () => Promise<PublishedMascot[] | null>;
  lastAuthor: () => Promise<string>;
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
  work: WorkAPI;
  recording: RecordingAPI;
  find: FindAPI;
  routines: RoutinesAPI;
  mascots: MascotsAPI;
  account: AccountAPI;
  suggestions: SuggestionsAPI;
  downloads: DownloadsAPI;
  permissions: PermissionsAPI;
  phone: PhoneAPI;
}
