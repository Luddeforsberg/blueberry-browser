interface TabInfo {
  id: string;
  title: string;
  url: string;
  favicon?: string | null;
  isActive: boolean;
}

interface TopBarAPI {
  // Tab management
  createTab: (
    url?: string
  ) => Promise<{ id: string; title: string; url: string } | null>;
  closeTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<boolean>;
  getTabs: () => Promise<TabInfo[]>;

  // Tab navigation
  navigateTab: (tabId: string, url: string) => Promise<void>;
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;

  // Tab actions
  tabScreenshot: (tabId: string) => Promise<string | null>;

  // Sidebar
  toggleSidebar: () => Promise<void>;
}

declare global {
  interface Window {
    topBarAPI: TopBarAPI;
  }
}

export {};
