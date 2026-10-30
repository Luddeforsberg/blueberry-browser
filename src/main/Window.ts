import { BaseWindow, nativeTheme, type WebContents } from "electron";
import { release } from "os";
import { Tab } from "./Tab";
import { createChromeView, type ChromeView } from "./chromeView";
import { LLMClient } from "./LLMClient";
import { computeLayout, MIN_WINDOW, TOOLBAR_HEIGHT, type Layout } from "./Layout";
import { sendToRenderer } from "./ipc";
import type { TabInfo, ThemeState } from "../shared/ipc";

// Window materials need macOS, or Windows 11 22H2 (build 22621) and later.
const supportsGlass = (): boolean => {
  if (process.platform === "darwin") return true;
  if (process.platform !== "win32") return false;
  return Number(release().split(".")[2]) >= 22621;
};

// The foreground tokens from DESIGN.md, for the Windows caption buttons, which CSS can't reach.
const CAPTION_SYMBOL = { light: "#1b1b1e", dark: "#f2f2f3" };

export class Window {
  private _baseWindow: BaseWindow;
  private tabsMap: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private tabCounter: number = 0;
  private chrome: ChromeView;
  private llmClient: LLMClient;
  private sidebarOpen = true;
  private chatOpen = false;
  private readonly glassSupported = supportsGlass();

  constructor() {
    this._baseWindow = new BaseWindow({
      width: 1280,
      height: 800,
      minWidth: MIN_WINDOW.width,
      minHeight: MIN_WINDOW.height,
      show: true,
      autoHideMenuBar: false,
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 16, y: 15 },
      ...(process.platform === "darwin" && this.glassSupported
        ? { vibrancy: "sidebar" as const }
        : {}),
      ...(process.platform === "win32"
        ? {
            titleBarOverlay: this.titleBarOverlay(),
            ...(this.glassSupported ? { backgroundMaterial: "mica" as const } : {}),
          }
        : {}),
    });

    this.chrome = createChromeView("chrome");
    this._baseWindow.contentView.addChildView(this.chrome.view);
    this.openLinksInTabs(this.chrome.view.webContents);

    this.llmClient = new LLMClient(this.chrome.view.webContents);
    this.llmClient.setWindow(this);

    this.createTab();
    this.updateAllBounds();

    this._baseWindow.on("resize", () => this.updateAllBounds());

    const onThemeUpdated = () => this.notifyTheme();
    nativeTheme.on("updated", onThemeUpdated);

    this._baseWindow.on("closed", () => {
      nativeTheme.off("updated", onThemeUpdated);
      this.tabsMap.forEach((tab) => tab.destroy());
      this.tabsMap.clear();
      this.chrome.view.webContents.close();
    });
  }

  // Without a handler, window.open starts a new window that inherits the opener's preload.
  private openLinksInTabs(webContents: WebContents): void {
    webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        this.createTab(url);
      }
      return { action: "deny" };
    });
  }

  private titleBarOverlay() {
    return {
      color: "#00000000",
      symbolColor: nativeTheme.shouldUseDarkColors ? CAPTION_SYMBOL.dark : CAPTION_SYMBOL.light,
      height: TOOLBAR_HEIGHT,
    };
  }

  get window(): BaseWindow {
    return this._baseWindow;
  }

  get baseWindow(): BaseWindow {
    return this._baseWindow;
  }

  get chromeView(): ChromeView {
    return this.chrome;
  }

  get chat(): LLMClient {
    return this.llmClient;
  }

  get activeTab(): Tab | null {
    if (this.activeTabId) {
      return this.tabsMap.get(this.activeTabId) || null;
    }
    return null;
  }

  get allTabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get tabCount(): number {
    return this.tabsMap.size;
  }

  get tabInfos(): TabInfo[] {
    return this.allTabs.map((tab) => this.tabInfo(tab));
  }

  tabInfo(tab: Tab): TabInfo {
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favicon: tab.favicon,
      isActive: this.activeTabId === tab.id,
      isLoading: tab.isLoading,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
    };
  }

  get theme(): ThemeState {
    return {
      isDark: nativeTheme.shouldUseDarkColors,
      glass: this.glassSupported && !nativeTheme.prefersReducedTransparency,
      platform:
        process.platform === "darwin"
          ? "mac"
          : process.platform === "win32"
            ? "windows"
            : "other",
    };
  }

  createTab(url?: string): Tab {
    const tabId = `tab-${++this.tabCounter}`;
    const tab = new Tab(tabId, url, () => this.notifyTabs());

    this._baseWindow.contentView.addChildView(tab.view);
    tab.view.setBounds(this.layout.page);

    this.tabsMap.set(tabId, tab);

    this.openLinksInTabs(tab.webContents);
    this.switchActiveTab(tabId);

    return tab;
  }

  closeTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    this._baseWindow.contentView.removeChildView(tab.view);
    tab.destroy();
    this.tabsMap.delete(tabId);

    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      const remainingTabs = Array.from(this.tabsMap.keys());
      if (remainingTabs.length > 0) {
        this.switchActiveTab(remainingTabs[0]);
      }
    }

    if (this.tabsMap.size === 0) {
      this._baseWindow.close();
    } else {
      this.notifyTabs();
    }

    return true;
  }

  switchActiveTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    if (this.activeTabId && this.activeTabId !== tabId) {
      this.tabsMap.get(this.activeTabId)?.hide();
    }

    tab.show();
    this.activeTabId = tabId;
    this._baseWindow.setTitle(tab.title || "Blueberry Browser");
    this.notifyTabs();

    return true;
  }

  getTab(tabId: string): Tab | null {
    return this.tabsMap.get(tabId) || null;
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.layout.sidebarOpen;
    this.updateAllBounds();
  }

  toggleChat(): void {
    this.chatOpen = !this.layout.chatOpen;
    this.updateAllBounds();
  }

  toggleDarkMode(): void {
    nativeTheme.themeSource = nativeTheme.shouldUseDarkColors ? "light" : "dark";
  }

  focusAddressBar(): void {
    this.chrome.view.webContents.focus();
    sendToRenderer(this.chrome.view.webContents, "toolbar:focus-address", null);
  }

  show(): void {
    this._baseWindow.show();
  }

  close(): void {
    this._baseWindow.close();
  }

  focus(): void {
    this._baseWindow.focus();
  }

  get layout(): Layout {
    const { width, height } = this._baseWindow.getContentBounds();
    return computeLayout(
      { width, height },
      {
        sidebarOpen: this.sidebarOpen,
        chatOpen: this.chatOpen,
        platform: process.platform,
      }
    );
  }

  updateAllBounds(): void {
    const { width, height } = this._baseWindow.getContentBounds();
    const layout = this.layout;
    this.chrome.view.setBounds({ x: 0, y: 0, width, height });
    this.tabsMap.forEach((tab) => tab.view.setBounds(layout.page));
    sendToRenderer(this.chrome.view.webContents, "layout:updated", layout);
  }

  private notifyTabs(): void {
    const active = this.activeTab;
    if (active) this._baseWindow.setTitle(active.title || "Blueberry Browser");
    sendToRenderer(this.chrome.view.webContents, "tabs:updated", this.tabInfos);
  }

  private notifyTheme(): void {
    if (process.platform === "win32") {
      this._baseWindow.setTitleBarOverlay(this.titleBarOverlay());
    }
    sendToRenderer(this.chrome.view.webContents, "theme:updated", this.theme);
  }
}
