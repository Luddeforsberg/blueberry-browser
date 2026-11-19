// Part of the IPC contract (ipc.ts): the window's layout, its tabs and its theme.
// Types only, like ipc.ts: the sandboxed preload can't load shared runtime code, so nothing here may survive compilation.

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
  | "mascots"
  | "mascot-gallery"
  | "needs-you"
  | "recording"
  | "cloud";

export interface Point {
  x: number;
  y: number;
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
