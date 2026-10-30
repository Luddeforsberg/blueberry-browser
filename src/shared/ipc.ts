// The one IPC contract between main and the chrome renderer.
// Types only: sandboxed preloads can't load shared runtime code, so nothing here may survive compilation.

// The chrome view under the tabs, and the overlay view that floats the collapsed sidebar over a page.
export type ChromeRegion = "chrome" | "overlay";

export type LayoutMode = "vertical" | "horizontal";

export type ResizablePanel = "sidebar" | "chat";

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
  tabStrip: Rect;
  toolbar: Rect;
  chat: Rect;
  page: Rect;
}

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  favicon: string | null;
  isActive: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface ThemeState {
  isDark: boolean;
  // False when the system asks for reduced transparency, or the platform has no window material.
  glass: boolean;
  platform: "mac" | "windows" | "other";
}

export interface ChatRequest {
  message: string;
  messageId: string;
}

export interface ChatChunk {
  messageId: string;
  content: string;
  isComplete: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Renderer asks, main answers. `region` names the views main accepts the call from.
export interface InvokeChannels {
  "tabs:list": { region: "chrome" | "overlay"; args: []; result: TabInfo[] };
  "tabs:create": { region: "chrome" | "overlay"; args: [url?: string]; result: TabInfo };
  "tabs:close": { region: "chrome" | "overlay"; args: [tabId: string]; result: boolean };
  "tabs:switch": { region: "chrome" | "overlay"; args: [tabId: string]; result: boolean };
  "tab:navigate": { region: "chrome"; args: [tabId: string, url: string]; result: boolean };
  "tab:back": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:forward": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:reload": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:stop": { region: "chrome"; args: [tabId: string]; result: boolean };
  "layout:get": { region: "chrome" | "overlay"; args: []; result: Layout };
  "layout:toggle-sidebar": { region: "chrome" | "overlay"; args: []; result: void };
  "layout:toggle-chat": { region: "chrome"; args: []; result: void };
  "layout:set-mode": { region: "chrome"; args: [mode: LayoutMode]; result: void };
  "layout:resize": { region: "chrome"; args: [panel: ResizablePanel, width: number]; result: void };
  "overlay:show-sidebar": { region: "chrome"; args: []; result: void };
  "overlay:hide": { region: "overlay"; args: []; result: void };
  "theme:get": { region: "chrome" | "overlay"; args: []; result: ThemeState };
  "theme:toggle-dark": { region: "chrome"; args: []; result: void };
  "chat:send": { region: "chrome"; args: [request: ChatRequest]; result: void };
  "chat:clear": { region: "chrome"; args: []; result: void };
  "chat:messages": { region: "chrome"; args: []; result: ChatMessage[] };
  "page:text": { region: "chrome"; args: []; result: string | null };
}

export type InvokeChannel = keyof InvokeChannels;

// Main tells renderers.
export interface EventChannels {
  "tabs:updated": TabInfo[];
  "layout:updated": Layout;
  "theme:updated": ThemeState;
  "toolbar:focus-address": null;
  "chat:chunk": ChatChunk;
  "chat:messages-updated": ChatMessage[];
}

export type Unsubscribe = () => void;

export interface BrowserAPI {
  getTabs: () => Promise<TabInfo[]>;
  createTab: (url?: string) => Promise<TabInfo>;
  closeTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<boolean>;
  navigateTab: (tabId: string, url: string) => Promise<boolean>;
  goBack: (tabId: string) => Promise<boolean>;
  goForward: (tabId: string) => Promise<boolean>;
  reload: (tabId: string) => Promise<boolean>;
  stop: (tabId: string) => Promise<boolean>;
  onTabsUpdated: (callback: (tabs: TabInfo[]) => void) => Unsubscribe;
  onFocusAddress: (callback: () => void) => Unsubscribe;
}

export interface LayoutAPI {
  getLayout: () => Promise<Layout>;
  toggleSidebar: () => Promise<void>;
  toggleChat: () => Promise<void>;
  setMode: (mode: LayoutMode) => Promise<void>;
  resize: (panel: ResizablePanel, width: number) => Promise<void>;
  showFloatingSidebar: () => Promise<void>;
  hideFloatingSidebar: () => Promise<void>;
  onLayoutUpdated: (callback: (layout: Layout) => void) => Unsubscribe;
}

export interface ThemeAPI {
  getTheme: () => Promise<ThemeState>;
  toggleDark: () => Promise<void>;
  onThemeUpdated: (callback: (theme: ThemeState) => void) => Unsubscribe;
}

export interface ChatAPI {
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  clearChat: () => Promise<void>;
  getMessages: () => Promise<ChatMessage[]>;
  getPageText: () => Promise<string | null>;
  onChatChunk: (callback: (chunk: ChatChunk) => void) => Unsubscribe;
  onMessagesUpdated: (callback: (messages: ChatMessage[]) => void) => Unsubscribe;
}

export interface ChromeAPI {
  browser: BrowserAPI;
  layout: LayoutAPI;
  theme: ThemeAPI;
  chat: ChatAPI;
}
