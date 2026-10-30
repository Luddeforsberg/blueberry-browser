// The one IPC contract between main and the chrome renderer.
// Types only: sandboxed preloads can't load shared runtime code, so nothing here may survive compilation.

import type { ChatThread, LibrarySnapshot } from "./library";

// The chrome view under the tabs, and the overlay view that floats the collapsed sidebar over a page.
export type ChromeRegion = "chrome" | "overlay";

export type LayoutMode = "vertical" | "horizontal";

export type ResizablePanel = "sidebar" | "chat";

// Pages the chrome draws itself. They open as tabs, on the same card as a web page.
export type InternalPage = "new-tab" | "chat" | "routines" | "settings" | "gallery";

export type Appearance = "system" | "light" | "dark";

// Saved in the main process and kept across restarts.
export interface Settings {
  layoutMode: LayoutMode;
  appearance: Appearance;
  sidebarWidth: number;
  chatWidth: number;
  showBerry: boolean;
  keepBerryStill: boolean;
  // False until the first-launch steps are finished or skipped.
  onboarded: boolean;
}

// A page the user really visited, newest first.
export interface Visit {
  url: string;
  title: string;
  favicon: string | null;
  visitedAt: number;
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
  // Set for internal pages, which have no web view. `pageParam` picks which chat, for example.
  page: InternalPage | null;
  pageParam: string | null;
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
  "tabs:move": { region: "chrome" | "overlay"; args: [tabId: string, toIndex: number]; result: boolean };
  "tabs:open-page": {
    region: "chrome" | "overlay";
    args: [page: InternalPage, options?: { param?: string; title?: string }];
    result: TabInfo;
  };
  "history:recent": { region: "chrome"; args: []; result: Visit[] };
  "tab:navigate": { region: "chrome"; args: [tabId: string, url: string]; result: boolean };
  "tab:back": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:forward": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:reload": { region: "chrome"; args: [tabId: string]; result: boolean };
  "tab:stop": { region: "chrome"; args: [tabId: string]; result: boolean };
  "layout:get": { region: "chrome" | "overlay"; args: []; result: Layout };
  "layout:toggle-sidebar": { region: "chrome" | "overlay"; args: []; result: void };
  "layout:toggle-chat": { region: "chrome"; args: []; result: void };
  "layout:resize": { region: "chrome"; args: [panel: ResizablePanel, width: number]; result: void };
  "overlay:show-sidebar": { region: "chrome"; args: []; result: void };
  "overlay:hide": { region: "overlay"; args: []; result: void };
  "theme:get": { region: "chrome" | "overlay"; args: []; result: ThemeState };
  "library:get": { region: "chrome" | "overlay"; args: []; result: LibrarySnapshot };
  "library:chat": { region: "chrome"; args: [chatId: string]; result: ChatThread | null };
  "library:send-chat": {
    region: "chrome";
    args: [chatId: string | null, text: string];
    result: ChatThread | null;
  };
  "settings:get": { region: "chrome" | "overlay"; args: []; result: Settings };
  "settings:update": { region: "chrome"; args: [patch: Partial<Settings>]; result: Settings };
  "chat:send": { region: "chrome"; args: [request: ChatRequest]; result: void };
  "chat:clear": { region: "chrome"; args: []; result: void };
  "chat:messages": { region: "chrome"; args: []; result: ChatMessage[] };
  "page:text": { region: "chrome"; args: []; result: string | null };
  "chat:page-access": { region: "chrome"; args: []; result: boolean };
  "chat:set-page-access": { region: "chrome"; args: [enabled: boolean]; result: boolean };
  "berry:context-menu": { region: "chrome"; args: []; result: void };
}

export type InvokeChannel = keyof InvokeChannels;

// Main tells renderers.
export interface EventChannels {
  "tabs:updated": TabInfo[];
  "layout:updated": Layout;
  "theme:updated": ThemeState;
  "settings:updated": Settings;
  "library:updated": LibrarySnapshot;
  "toolbar:focus-address": null;
  "overlay:visibility": boolean;
  "chat:chunk": ChatChunk;
  "chat:messages-updated": ChatMessage[];
}

export type Unsubscribe = () => void;

export interface BrowserAPI {
  getTabs: () => Promise<TabInfo[]>;
  createTab: (url?: string) => Promise<TabInfo>;
  closeTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<boolean>;
  moveTab: (tabId: string, toIndex: number) => Promise<boolean>;
  navigateTab: (tabId: string, url: string) => Promise<boolean>;
  goBack: (tabId: string) => Promise<boolean>;
  goForward: (tabId: string) => Promise<boolean>;
  reload: (tabId: string) => Promise<boolean>;
  stop: (tabId: string) => Promise<boolean>;
  openPage: (page: InternalPage, options?: { param?: string; title?: string }) => Promise<TabInfo>;
  getRecent: () => Promise<Visit[]>;
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
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  clearChat: () => Promise<void>;
  getMessages: () => Promise<ChatMessage[]>;
  getPageText: () => Promise<string | null>;
  getPageAccess: () => Promise<boolean>;
  setPageAccess: (enabled: boolean) => Promise<boolean>;
  onChatChunk: (callback: (chunk: ChatChunk) => void) => Unsubscribe;
  onMessagesUpdated: (callback: (messages: ChatMessage[]) => void) => Unsubscribe;
}

export interface LibraryAPI {
  getLibrary: () => Promise<LibrarySnapshot>;
  getChat: (chatId: string) => Promise<ChatThread | null>;
  sendChat: (chatId: string | null, text: string) => Promise<ChatThread | null>;
  onLibraryUpdated: (callback: (library: LibrarySnapshot) => void) => Unsubscribe;
}

export interface ChromeAPI {
  browser: BrowserAPI;
  layout: LayoutAPI;
  theme: ThemeAPI;
  settings: SettingsAPI;
  library: LibraryAPI;
  chat: ChatAPI;
}
