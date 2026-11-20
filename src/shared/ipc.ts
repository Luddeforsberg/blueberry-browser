// The one IPC contract between main and the chrome renderer.
// Types only: sandboxed preloads can't load shared runtime code, so nothing here may survive compilation.
// Its parts are in ipc/, and this file is the one everything imports them from.

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

export type { ChromeAPI } from "./ipc/api";
export type {
  DownloadAction,
  DownloadInfo,
  DownloadState,
  HistoryCursor,
  HistoryEntry,
  HistoryImportResult,
  HistoryPage,
  ImportSource,
  PermissionPrompt,
  SavedSitePermission,
  SiteDecision,
  SitePermission,
  Visit,
  VisitedPage,
} from "./ipc/browsing";
export type { ChatSendOptions, MascotSaveResult } from "./ipc/chats";
export type {
  AccountState,
  CloudLogin,
  CloudLoginStatus,
  CloudState,
  CloudView,
  McpActivity,
  McpSnippet,
  McpState,
  PhoneState,
  RunnerState,
} from "./ipc/connections";
export type {
  DesktopAsk,
  DesktopBerrySpot,
  DesktopBox,
  DesktopDecided,
  DesktopDropPart,
  DesktopDropSays,
  DesktopDropState,
  DesktopEdge,
  DesktopFace,
  DesktopPanelState,
  DesktopTray,
} from "./ipc/desktop";
export type { EventChannels } from "./ipc/events";
export type { InvokeChannel, InvokeChannels } from "./ipc/invoke";
export type {
  AddressSuggestion,
  AddressSuggestionsRequest,
  AddressSuggestionsShown,
  AskCard,
  FindResult,
  MenuAnchor,
  MenuEntry,
  MenuIcon,
  MenuPlacement,
  MenuShown,
  MenuViewState,
  TabPreviewRequest,
  TabPreviewShown,
  TooltipRequest,
  TooltipShown,
} from "./ipc/overPage";
export type { ActionApproval, Appearance, Settings, StartupChoice } from "./ipc/settings";
export type {
  InternalPage,
  Layout,
  LayoutMode,
  Point,
  Popover,
  Rect,
  ResizablePanel,
  TabInfo,
  TabLoadError,
  TabTrouble,
  ThemeState,
} from "./ipc/window";
