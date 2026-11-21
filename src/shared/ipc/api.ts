// Part of the IPC contract (ipc.ts): the API the preload gives the chrome views, built on the channels.
// Types only, like ipc.ts: the sandboxed preload can't load shared runtime code, so nothing here may survive compilation.

import type { AiKeyState, AiKeyTried, AiService } from "../aiKey";
import type { AppIconGround } from "../appIcon";
import type { FileChip, TabChoice } from "../attachments";
import type {
  ChatThread,
  GalleryLinked,
  GalleryListing,
  LibrarySnapshot,
  MascotDraft,
  MemoryResult,
  PublishChoices,
  PublishResult,
  PublishedMascot,
  RecordedDraftResult,
  RecordingState,
  RoutineDraft,
  RoutineRun,
  SavedSiteList,
  Suggestion,
  WorkFrame,
  WorkView,
} from "../library";
import type {
  DownloadAction,
  DownloadInfo,
  HistoryCursor,
  HistoryImportResult,
  HistoryPage,
  ImportSource,
  PermissionPrompt,
  SavedSitePermission,
  SiteDecision,
  SitePermission,
  Visit,
  VisitedPage,
} from "./browsing";
import type { ChatChunk, ChatSendOptions, MascotSaveResult, RoutineSaveResult } from "./chats";
import type { AccountState, CloudFrame, CloudState, CloudView, McpState, PhoneAnswered, PhoneState, RunnerState } from "./connections";
import type { DesktopDecided, DesktopDecision, DesktopDropPart, DesktopDropState, DesktopPanelState } from "./desktop";
import type {
  AddressSuggestion,
  AddressSuggestionsRequest,
  AddressSuggestionsShown,
  FindResult,
  MenuAnchor,
  MenuPlacement,
  MenuSheetSize,
  MenuViewState,
  TabPreviewRequest,
  TabPreviewShown,
  TooltipRequest,
  TooltipShown,
} from "./overPage";
import type { Appearance, Settings } from "./settings";
import type { InternalPage, Layout, Popover, PopoverState, Rect, ResizablePanel, TabInfo, ThemeState } from "./window";

type Unsubscribe = () => void;

interface BrowserAPI {
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
  searchHistory: (options: { query?: string; before?: HistoryCursor | undefined }) => Promise<HistoryPage>;
  deleteHistoryEntry: (id: number) => Promise<boolean>;
  clearHistory: () => Promise<boolean>;
  importSources: () => Promise<ImportSource[]>;
  importHistory: (sourceId: string) => Promise<HistoryImportResult>;
  onTabsUpdated: (callback: (tabs: TabInfo[]) => void) => Unsubscribe;
  onFocusAddress: (callback: () => void) => Unsubscribe;
}

interface LayoutAPI {
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

interface ThemeAPI {
  getTheme: () => Promise<ThemeState>;
  onThemeUpdated: (callback: (theme: ThemeState) => void) => Unsubscribe;
}

interface SettingsAPI {
  getSettings: () => Promise<Settings>;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
  setAppearance: (appearance: Appearance) => Promise<void>;
  setAppIcon: (png: string, mascotId: string | null, ground: AppIconGround) => Promise<boolean>;
  // The menu for right-clicking Berry, with Keep Berry still and Hide Berry.
  showBerryMenu: (anchor: MenuAnchor) => Promise<void>;
  onSettingsUpdated: (callback: (settings: Settings) => void) => Unsubscribe;
}

interface ChatAPI {
  // Starts a chat when `chatId` is null. The reply arrives through the events.
  send: (chatId: string | null, text: string, options: ChatSendOptions) => Promise<ChatThread | null>;
  stop: (chatId: string) => Promise<void>;
  followUp: (chatId: string, id: string, action: "send-now" | "remove") => Promise<boolean>;
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

interface AttachmentsAPI {
  chooseFiles: (kept: string[]) => Promise<FileChip[]>;
  addFiles: (files: { name: string; bytes: Uint8Array }[], kept: string[]) => Promise<FileChip[]>;
  discard: (id: string) => Promise<void>;
  tabs: (chatId: string | null, mascotId: string | null) => Promise<TabChoice[]>;
}

interface LibraryAPI {
  toggleBookmark: () => Promise<void>;
  placeSavedSite: (bookmarkId: string, list: SavedSiteList, index: number) => Promise<void>;
  showBookmarkMenu: (bookmarkId: string, anchor: MenuAnchor) => Promise<void>;
  getLibrary: () => Promise<LibrarySnapshot>;
  getChat: (chatId: string) => Promise<ChatThread | null>;
  onLibraryUpdated: (callback: (library: LibrarySnapshot) => void) => Unsubscribe;
}

interface WorkAPI {
  watch: (chatId: string | null, pictureWidth: number) => Promise<void>;
  onUpdated: (callback: (view: WorkView | null) => void) => Unsubscribe;
  onFrame: (callback: (frame: WorkFrame) => void) => Unsubscribe;
}

interface RecordingAPI {
  state: () => Promise<RecordingState>;
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  removeStep: (stepId: string) => Promise<void>;
  discard: () => Promise<void>;
  draft: () => Promise<RecordedDraftResult>;
  onUpdated: (callback: (state: RecordingState) => void) => Unsubscribe;
}

interface AddressAPI {
  suggestHistory: (text: string) => Promise<VisitedPage[]>;
  show: (request: AddressSuggestionsRequest) => Promise<void>;
  close: () => Promise<void>;
  pick: (listId: number, index: number) => Promise<void>;
  onSuggestions: (callback: (shown: AddressSuggestionsShown | null) => void) => Unsubscribe;
  onPicked: (callback: (row: AddressSuggestion) => void) => Unsubscribe;
}

interface TooltipAPI {
  show: (request: TooltipRequest) => Promise<void>;
  hide: () => Promise<void>;
  onShown: (callback: (shown: TooltipShown | null) => void) => Unsubscribe;
}

interface TabPreviewAPI {
  show: (request: TabPreviewRequest) => Promise<void>;
  hide: () => Promise<void>;
  onShown: (callback: (shown: TabPreviewShown | null) => void) => Unsubscribe;
}

// Only the menu views may call these.
interface MenuAPI {
  current: () => Promise<MenuViewState>;
  place: (menuId: string, sheets: MenuSheetSize[]) => Promise<MenuPlacement | null>;
  choose: (menuId: string, rowId: string) => Promise<void>;
  dismiss: (menuId: string) => Promise<void>;
  answer: (askId: string, yes: boolean) => Promise<void>;
  onShown: (callback: (state: MenuViewState) => void) => Unsubscribe;
}

interface FindAPI {
  search: (text: string) => Promise<void>;
  step: (forward: boolean) => Promise<void>;
  close: () => Promise<void>;
  onOpened: (callback: () => void) => Unsubscribe;
  onResult: (callback: (result: FindResult) => void) => Unsubscribe;
}

interface RoutinesAPI {
  save: (id: string | null, draft: RoutineDraft) => Promise<RoutineSaveResult>;
  setPaused: (id: string, paused: boolean) => Promise<boolean>;
  delete: (id: string) => Promise<boolean>;
  runNow: (id: string) => Promise<boolean>;
  stop: (runId: string) => Promise<boolean>;
  getRuns: (id: string) => Promise<RoutineRun[]>;
  markSeen: () => Promise<void>;
}

interface MascotsAPI {
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

interface MemoryAPI {
  decide: (offerId: string, keep: boolean) => Promise<MemoryResult>;
  edit: (factId: string, text: string) => Promise<MemoryResult>;
  forget: (factId: string) => Promise<boolean>;
  clear: (mascotId: string) => Promise<boolean>;
}

interface AiKeyAPI {
  state: () => Promise<AiKeyState>;
  tryKey: (service: AiService, key: string) => Promise<{ outcome: AiKeyTried; state: AiKeyState }>;
  remove: () => Promise<{ removed: boolean; state: AiKeyState }>;
  find: (service: AiService) => Promise<void>;
  paste: (service: AiService) => Promise<string | null>;
  onUpdated: (callback: (state: AiKeyState) => void) => Unsubscribe;
}

interface AccountAPI {
  state: () => Promise<AccountState>;
  signIn: (email: string, password: string) => Promise<AccountState>;
  signUp: (email: string, password: string) => Promise<AccountState>;
  signOut: () => Promise<AccountState>;
  onUpdated: (callback: (state: AccountState) => void) => Unsubscribe;
}

interface SuggestionsAPI {
  list: () => Promise<Suggestion[]>;
  dismiss: (id: string) => Promise<Suggestion[]>;
  // Its prompt was sent or its form saved.
  used: (id: string) => Promise<Suggestion[]>;
  onUpdated: (callback: (suggestions: Suggestion[]) => void) => Unsubscribe;
}

interface DownloadsAPI {
  list: () => Promise<DownloadInfo[]>;
  act: (id: string, action: DownloadAction) => Promise<boolean>;
  chooseFolder: () => Promise<void>;
  openFolder: () => Promise<boolean>;
  onUpdated: (callback: (downloads: DownloadInfo[]) => void) => Unsubscribe;
}

interface PermissionsAPI {
  saved: () => Promise<SavedSitePermission[]>;
  set: (origin: string, permission: SitePermission, decision: SiteDecision | null) => Promise<boolean>;
  onSavedUpdated: (callback: (saved: SavedSitePermission[]) => void) => Unsubscribe;
  // Only the prompt view may call these.
  current: () => Promise<PermissionPrompt | null>;
  decide: (promptId: string, allow: boolean) => Promise<boolean>;
  resizePrompt: (height: number) => Promise<void>;
  onPrompt: (callback: (prompt: PermissionPrompt | null) => void) => Unsubscribe;
}

interface PhoneAPI {
  state: () => Promise<PhoneState>;
  connect: (token: string) => Promise<PhoneState>;
  newLink: () => Promise<PhoneState>;
  openLink: () => Promise<void>;
  disconnect: () => Promise<PhoneState>;
  onUpdated: (callback: (state: PhoneState) => void) => Unsubscribe;
  onAnswered: (callback: (answered: PhoneAnswered) => void) => Unsubscribe;
}

interface McpAPI {
  state: () => Promise<McpState>;
  setOn: (on: boolean) => Promise<McpState>;
  revoke: () => Promise<McpState>;
  copy: (app: string) => Promise<boolean>;
  onUpdated: (callback: (state: McpState) => void) => Unsubscribe;
}

interface CloudAPI {
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

interface DesktopAPI {
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
