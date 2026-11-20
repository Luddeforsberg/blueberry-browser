import React, { useEffect, useState, useCallback } from "react";
import type { TabInfo } from "@shared/ipc";
import { BrowserContext, type BrowserContextType } from "./useBrowser";

const browser = () => window.chromeAPI.browser;

export const BrowserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<TabInfo[]>([]);

  const activeTab = tabs.find((tab) => tab.isActive) || null;

  // Main pushes every change, so the list only needs fetching once.
  useEffect(() => {
    browser()
      .getTabs()
      .then(setTabs)
      .catch((error) => console.error("Failed to load tabs:", error));
    return browser().onTabsUpdated(setTabs);
  }, []);

  const run = useCallback(async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      console.error(`Failed to ${label}:`, error);
    }
  }, []);

  const createTab = useCallback((url?: string) => run("create tab", () => browser().createTab(url)), [run]);
  const closeTab = useCallback((tabId: string) => run("close tab", () => browser().closeTab(tabId)), [run]);
  const switchTab = useCallback((tabId: string) => run("switch tab", () => browser().switchTab(tabId)), [run]);

  const moveTab = useCallback((tabId: string, toIndex: number) => run("move tab", () => browser().moveTab(tabId, toIndex)), [run]);

  const moveTabBy = useCallback((tabId: string, delta: number) => run("move tab", () => browser().moveTabBy(tabId, delta)), [run]);

  const withActiveTab = useCallback(
    (label: string, action: (tabId: string) => Promise<unknown>) =>
      activeTab ? run(label, () => action(activeTab.id)) : Promise.resolve(),
    [activeTab, run],
  );

  const navigateToUrl = useCallback((url: string) => withActiveTab("navigate", (id) => browser().navigateTab(id, url)), [withActiveTab]);
  const goBack = useCallback(() => withActiveTab("go back", browser().goBack), [withActiveTab]);
  const goForward = useCallback(() => withActiveTab("go forward", browser().goForward), [withActiveTab]);
  const reload = useCallback(() => withActiveTab("reload", browser().reload), [withActiveTab]);
  const stop = useCallback(() => withActiveTab("stop", browser().stop), [withActiveTab]);

  const value: BrowserContextType = {
    tabs,
    activeTab,
    createTab,
    closeTab,
    switchTab,
    moveTab,
    moveTabBy,
    navigateToUrl,
    goBack,
    goForward,
    reload,
    stop,
  };

  return <BrowserContext.Provider value={value}>{children}</BrowserContext.Provider>;
};
