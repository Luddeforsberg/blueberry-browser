import { createContext, useContext } from "react";
import type { TabInfo } from "@shared/ipc";

export interface BrowserContextType {
  tabs: TabInfo[];
  activeTab: TabInfo | null;

  // Tab management
  createTab: (url?: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => Promise<void>;
  moveTab: (tabId: string, toIndex: number) => Promise<void>;
  moveTabBy: (tabId: string, delta: number) => Promise<void>;

  // Navigation
  navigateToUrl: (url: string) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  reload: () => Promise<void>;
  stop: () => Promise<void>;
}

export const BrowserContext = createContext<BrowserContextType | null>(null);

export const useBrowser = () => {
  const context = useContext(BrowserContext);
  if (!context) {
    throw new Error("useBrowser must be used within a BrowserProvider");
  }
  return context;
};
