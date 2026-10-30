// The one IPC contract between main and the chrome renderers.
// Types only: sandboxed preloads can't load shared runtime code, so nothing here may survive compilation.

export type ChromeRegion = "topbar" | "sidebar";

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  favicon: string | null;
  isActive: boolean;
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

// Renderer asks, main answers. `region` is the only chrome view main accepts the call from.
export interface InvokeChannels {
  "tabs:list": { region: "topbar"; args: []; result: TabInfo[] };
  "tabs:create": { region: "topbar"; args: [url?: string]; result: TabInfo };
  "tabs:close": { region: "topbar"; args: [tabId: string]; result: boolean };
  "tabs:switch": { region: "topbar"; args: [tabId: string]; result: boolean };
  "tab:navigate": { region: "topbar"; args: [tabId: string, url: string]; result: boolean };
  "tab:back": { region: "topbar"; args: [tabId: string]; result: boolean };
  "tab:forward": { region: "topbar"; args: [tabId: string]; result: boolean };
  "tab:reload": { region: "topbar"; args: [tabId: string]; result: boolean };
  "sidebar:toggle": { region: "topbar"; args: []; result: void };
  "chat:send": { region: "sidebar"; args: [request: ChatRequest]; result: void };
  "chat:clear": { region: "sidebar"; args: []; result: void };
  "chat:messages": { region: "sidebar"; args: []; result: ChatMessage[] };
  "page:text": { region: "sidebar"; args: []; result: string | null };
}

export type InvokeChannel = keyof InvokeChannels;

// Renderer tells main, with no answer. Any chrome region may send these.
export interface SendChannels {
  "theme:dark-changed": [isDarkMode: boolean];
}

// Main tells renderers.
export interface EventChannels {
  "theme:dark-updated": boolean;
  "chat:chunk": ChatChunk;
  "chat:messages-updated": ChatMessage[];
}

export type Unsubscribe = () => void;

export interface DarkModeAPI {
  notifyChanged: (isDarkMode: boolean) => void;
  onUpdated: (callback: (isDarkMode: boolean) => void) => Unsubscribe;
}

export interface TopBarAPI {
  getTabs: () => Promise<TabInfo[]>;
  createTab: (url?: string) => Promise<TabInfo>;
  closeTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<boolean>;
  navigateTab: (tabId: string, url: string) => Promise<boolean>;
  goBack: (tabId: string) => Promise<boolean>;
  goForward: (tabId: string) => Promise<boolean>;
  reload: (tabId: string) => Promise<boolean>;
  toggleSidebar: () => Promise<void>;
}

export interface SidebarAPI {
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  clearChat: () => Promise<void>;
  getMessages: () => Promise<ChatMessage[]>;
  getPageText: () => Promise<string | null>;
  onChatChunk: (callback: (chunk: ChatChunk) => void) => Unsubscribe;
  onMessagesUpdated: (callback: (messages: ChatMessage[]) => void) => Unsubscribe;
}
