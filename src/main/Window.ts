import { BaseWindow, Menu, dialog, nativeTheme, type WebContents } from "electron";
import { release } from "os";
import { Tab } from "./Tab";
import { InternalTab } from "./InternalTab";
import { History } from "./History";
import { MockLibrary } from "./MockLibrary";
import type { SettingsStore } from "./SettingsStore";
import type { BookmarkStore } from "./BookmarkStore";
import type { ChatStore } from "./ChatStore";
import { Chats } from "./Chats";
import { generateTitle, streamReply } from "./agent";
import { createChromeView, type ChromeView } from "./chromeView";
import {
  computeLayout,
  MIN_WINDOW,
  TAB_ROW_HEIGHT,
  VERTICAL_TOP_ROW_HEIGHT,
  type Layout,
} from "./Layout";
import { sendToRenderer } from "./ipc";
import type {
  EventChannels,
  InternalPage,
  LayoutMode,
  ResizablePanel,
  Settings,
  TabInfo,
  ThemeState,
  Visit,
} from "../shared/ipc";
import type { ChatThread, LibrarySnapshot } from "../shared/library";

export type BrowserTab = Tab | InternalTab;

// Only one of these pages is open at a time, so opening it again switches to it.
const SINGLE_INSTANCE_PAGES: InternalPage[] = ["routines", "settings"];

// Window materials need macOS, or Windows 11 22H2 (build 22621) and later.
const supportsGlass = (): boolean => {
  if (process.platform === "darwin") return true;
  if (process.platform !== "win32") return false;
  return Number(release().split(".")[2]) >= 22621;
};

// The foreground tokens from DESIGN.md, for the Windows caption buttons, which CSS can't reach.
const CAPTION_SYMBOL = { light: "#1b1b1e", dark: "#f2f2f3" };

// macOS draws its window buttons 14px tall, so this centres them in the top row.
const MAC_BUTTONS_HEIGHT = 14;

// macOS can report a menu closed before it runs the clicked item, so this waits well past that.
const MENU_CLICK_GRACE_MS = 1000;

export const HORIZONTAL_TABS_MENU_ID = "horizontal-tabs";

export class Window {
  private _baseWindow: BaseWindow;
  private tabsMap: Map<string, BrowserTab> = new Map();
  private activeTabId: string | null = null;
  private tabCounter: number = 0;
  private closedTabs: TabInfo[] = [];
  private chrome: ChromeView;
  private overlay: ChromeView;
  private floatingSidebarVisible = false;
  private sidebarOpen = true;
  private chatOpen = false;
  private readonly glassSupported = supportsGlass();
  private readonly history = new History();
  private readonly library = new MockLibrary();
  readonly chats: Chats;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly chatStore: ChatStore,
    private readonly bookmarkStore: BookmarkStore
  ) {
    nativeTheme.themeSource = settingsStore.get().appearance;

    this._baseWindow = new BaseWindow({
      width: 1280,
      height: 800,
      minWidth: MIN_WINDOW.width,
      minHeight: MIN_WINDOW.height,
      show: true,
      autoHideMenuBar: false,
      titleBarStyle: "hidden",
      trafficLightPosition: this.windowButtonPosition(),
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

    this.overlay = createChromeView("overlay");
    this.overlay.view.setVisible(false);
    this._baseWindow.contentView.addChildView(this.overlay.view);
    this.openLinksInTabs(this.overlay.view.webContents);

    this.chats = new Chats(chatStore, streamReply, generateTitle, () => this.activeTab, {
      onChunk: (chatId, content) =>
        sendToRenderer(this.chrome.view.webContents, "chat:chunk", { chatId, content }),
      onThread: (thread) => {
        this.syncChatTabTitle(thread);
        sendToRenderer(this.chrome.view.webContents, "chat:updated", thread);
      },
      onListChanged: () => this.broadcast("library:updated", this.librarySnapshot),
    });

    this.createTab();
    this.updateAllBounds();

    this._baseWindow.on("resize", () => this.updateAllBounds());
    this._baseWindow.on("blur", () => this.hideFloatingSidebar());

    const onThemeUpdated = () => this.notifyTheme();
    nativeTheme.on("updated", onThemeUpdated);

    this._baseWindow.on("closed", () => {
      nativeTheme.off("updated", onThemeUpdated);
      this.chats.stopAll();
      this.settingsStore.flush();
      this.tabsMap.forEach((tab) => tab.destroy());
      this.tabsMap.clear();
      this.chrome.view.webContents.close();
      this.overlay.view.webContents.close();
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
      height: this.topRowHeight,
    };
  }

  private get mode(): LayoutMode {
    return this.settingsStore.get().layoutMode;
  }

  private get topRowHeight(): number {
    return this.mode === "vertical" ? VERTICAL_TOP_ROW_HEIGHT : TAB_ROW_HEIGHT;
  }

  private windowButtonPosition() {
    return { x: 16, y: Math.round((this.topRowHeight - MAC_BUTTONS_HEIGHT) / 2) };
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

  get overlayView(): ChromeView {
    return this.overlay;
  }

  get librarySnapshot(): LibrarySnapshot {
    return { ...this.library.snapshot(), bookmarks: this.bookmarkStore.get(), chats: this.chatStore.summaries() };
  }

  // The active web tab. Internal pages have no page for Berry to read.
  get activeTab(): Tab | null {
    const entry = this.activeEntry;
    return entry instanceof Tab ? entry : null;
  }

  get activeEntry(): BrowserTab | null {
    return (this.activeTabId && this.tabsMap.get(this.activeTabId)) || null;
  }

  get allTabs(): Tab[] {
    return this.entries.filter((tab): tab is Tab => tab instanceof Tab);
  }

  private get entries(): BrowserTab[] {
    return Array.from(this.tabsMap.values());
  }

  get tabCount(): number {
    return this.tabsMap.size;
  }

  get tabInfos(): TabInfo[] {
    return this.entries.map((tab) => this.tabInfo(tab));
  }

  get recentVisits(): Visit[] {
    return this.history.recent();
  }

  get settings(): Settings {
    return this.settingsStore.get();
  }

  tabInfo(tab: BrowserTab): TabInfo {
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favicon: tab.favicon,
      isActive: this.activeTabId === tab.id,
      isLoading: tab.isLoading,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      page: tab instanceof InternalTab ? tab.page : null,
      pageParam: tab instanceof InternalTab ? tab.param : null,
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

  // With no address, a tab opens on the new tab page.
  createTab(url?: string): BrowserTab {
    if (!url) return this.openPage("new-tab");
    const tab = this.createWebTab(`tab-${++this.tabCounter}`, url);
    this.tabsMap.set(tab.id, tab);
    this.switchActiveTab(tab.id);
    return tab;
  }

  openPage(page: InternalPage, options: { param?: string; title?: string } = {}): BrowserTab {
    const param = options.param ?? null;
    const existing = this.entries.find(
      (tab) =>
        tab instanceof InternalTab &&
        tab.page === page &&
        (SINGLE_INSTANCE_PAGES.includes(page) || (param !== null && tab.param === param))
    );
    if (existing) {
      this.switchActiveTab(existing.id);
      return existing;
    }

    const tab = new InternalTab(`tab-${++this.tabCounter}`, page, param, options.title);
    this.tabsMap.set(tab.id, tab);
    this.switchActiveTab(tab.id);
    return tab;
  }

  // Typing an address on an internal page turns that tab into a web tab, in the same place.
  async navigateTab(tabId: string, url: string): Promise<boolean> {
    const entry = this.tabsMap.get(tabId);
    if (!entry) return false;
    if (entry instanceof Tab) {
      await entry.loadURL(url);
      return true;
    }

    const tab = this.createWebTab(tabId, url);
    this.tabsMap = new Map(
      this.entries.map((existing) => [existing.id, existing.id === tabId ? tab : existing])
    );
    this.syncTabViews();
    this.notifyTabs();
    this.updateAllBounds();
    return true;
  }

  private createWebTab(tabId: string, url: string): Tab {
    // Loading starts inside the constructor, so these can run before `tab` is assigned.
    let tab: Tab | null = null;
    tab = new Tab(tabId, url, {
      onChange: () => {
        if (tab) this.history.update(tab.url, { title: tab.title, favicon: tab.favicon });
        this.notifyTabs();
      },
      onNavigate: (address) => this.history.record(address, tab?.title ?? "", null),
    });
    tab.hide();
    this._baseWindow.contentView.addChildView(tab.view);
    tab.view.setBounds(this.layout.page);
    this.openLinksInTabs(tab.webContents);
    return tab;
  }

  reopenClosedTab(): void {
    const tab = this.closedTabs.pop();
    if (!tab) return;
    if (tab.page) {
      const chat = tab.page === "chat" && tab.pageParam ? this.chats.thread(tab.pageParam) : null;
      this.openPage(tab.page, { param: tab.pageParam ?? undefined, title: chat?.title ?? tab.title });
    } else {
      this.createTab(tab.url);
    }
  }

  closeTab(tabId: string, remember = true): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    if (remember) this.closedTabs.push(this.tabInfo(tab));
    if (tab instanceof Tab) this._baseWindow.contentView.removeChildView(tab.view);
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

    this.activeTabId = tabId;
    this.syncTabViews();
    this.notifyTabs();
    this.updateAllBounds();

    return true;
  }

  moveTab(tabId: string, toIndex: number): boolean {
    const entries = this.entries;
    const from = entries.findIndex((tab) => tab.id === tabId);
    if (from === -1) return false;

    const [tab] = entries.splice(from, 1);
    entries.splice(Math.max(0, Math.min(toIndex, entries.length)), 0, tab);
    this.tabsMap = new Map(entries.map((entry) => [entry.id, entry]));
    this.notifyTabs();
    return true;
  }

  // Relative to the real order here, because key presses can outrun the order the chrome has drawn.
  moveTabBy(tabId: string, delta: number): boolean {
    return this.moveTab(tabId, this.entries.findIndex((tab) => tab.id === tabId) + delta);
  }

  // Only the active web tab shows, and none while onboarding fills the window.
  private syncTabViews(): void {
    const { onboarded } = this.settings;
    this.allTabs.forEach((tab) => (onboarded && tab.id === this.activeTabId ? tab.show() : tab.hide()));
  }

  private chatTabs(chatId: string): InternalTab[] {
    return this.entries.filter(
      (tab): tab is InternalTab => tab instanceof InternalTab && tab.page === "chat" && tab.param === chatId
    );
  }

  private syncChatTabTitle({ id, title }: ChatThread): void {
    const stale = this.chatTabs(id).filter((tab) => tab.title !== title);
    stale.forEach((tab) => (tab.title = title));
    if (stale.length > 0) this.notifyTabs();
  }

  showChatMenu(chatId: string): Promise<"rename" | null> {
    return new Promise((resolve) => {
      Menu.buildFromTemplate([
        { label: "Rename", click: () => resolve("rename") },
        { label: "Delete…", click: () => void this.confirmDeleteChat(chatId) },
      ]).popup({
        window: this._baseWindow,
        callback: () => setTimeout(() => resolve(null), MENU_CLICK_GRACE_MS),
      });
    });
  }

  private async confirmDeleteChat(chatId: string): Promise<void> {
    const chat = this.chats.thread(chatId);
    if (!chat) return;
    const { response } = await dialog.showMessageBox(this._baseWindow, {
      type: "warning",
      message: `Delete “${chat.title}”?`,
      detail: "This chat will be permanently removed from this computer.",
      buttons: ["Delete", "Cancel"],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0 || !this.chats.delete(chatId)) return;

    // Closing the last tab closes the window, and deleting a chat shouldn't do that.
    const tabs = this.chatTabs(chatId);
    if (tabs.length === this.tabCount) this.openPage("new-tab");
    this.closedTabs = this.closedTabs.filter((tab) => tab.page !== "chat" || tab.pageParam !== chatId);
    tabs.forEach((tab) => this.closeTab(tab.id, false));
    sendToRenderer(this.chrome.view.webContents, "chat:deleted", chatId);
  }

  toggleBookmark(): void {
    const tab = this.activeTab;
    if (!tab) return;
    this.saveBookmarks(() => this.bookmarkStore.toggle(tab.url, tab.title));
  }

  showBookmarkMenu(id: string): void {
    if (!this.bookmarkStore.get().some((bookmark) => bookmark.id === id)) return;
    Menu.buildFromTemplate([{
      label: "Remove Bookmark",
      click: () => this.saveBookmarks(() => this.bookmarkStore.remove(id)),
    }]).popup({ window: this._baseWindow });
  }

  private saveBookmarks(save: () => void): void {
    try {
      save();
      this.broadcast("library:updated", this.librarySnapshot);
    } catch (error) {
      console.error("Failed to save bookmarks:", error);
      void dialog.showMessageBox(this._baseWindow, {
        type: "error",
        message: "Could not save your bookmarks",
        detail: "Check that there is space on your disk and try again.",
      });
    }
  }

  showBerryMenu(): void {
    const { keepBerryStill, showBerry } = this.settings;
    Menu.buildFromTemplate([
      {
        label: "Keep Berry Still",
        type: "checkbox",
        checked: keepBerryStill,
        click: () => this.updateSettings({ keepBerryStill: !keepBerryStill }),
      },
      {
        label: "Hide Berry",
        type: "checkbox",
        checked: !showBerry,
        click: () => this.updateSettings({ showBerry: !showBerry }),
      },
    ]).popup({ window: this._baseWindow });
  }

  getTab(tabId: string): Tab | null {
    const tab = this.tabsMap.get(tabId);
    return tab instanceof Tab ? tab : null;
  }

  toggleSidebar(): void {
    this.hideFloatingSidebar();
    this.sidebarOpen = !this.layout.sidebarOpen;
    this.updateAllBounds();
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const before = this.settingsStore.get();
    const after = this.settingsStore.update(patch);

    if (after.layoutMode !== before.layoutMode) {
      this.hideFloatingSidebar();
      if (process.platform === "darwin") {
        this._baseWindow.setWindowButtonPosition(this.windowButtonPosition());
      } else if (process.platform === "win32") {
        this._baseWindow.setTitleBarOverlay(this.titleBarOverlay());
      }
    }
    const item = Menu.getApplicationMenu()?.getMenuItemById(HORIZONTAL_TABS_MENU_ID);
    if (item) item.checked = after.layoutMode === "horizontal";
    if (after.appearance !== before.appearance) nativeTheme.themeSource = after.appearance;

    if (after.onboarded !== before.onboarded) this.syncTabViews();

    this.broadcast("settings:updated", after);
    this.updateAllBounds();
    return after;
  }

  resizePanel(panel: ResizablePanel, width: number): void {
    if (panel === "sidebar") this.updateSettings({ sidebarWidth: width });
    else if (panel === "chat") this.updateSettings({ chatWidth: width });
  }

  showFloatingSidebar(): void {
    const { floatingSidebar } = this.layout;
    if (floatingSidebar.width === 0) return;
    // Adding a view again moves it to the top, above tabs opened since.
    this._baseWindow.contentView.addChildView(this.overlay.view);
    this.overlay.view.setBounds(floatingSidebar);
    this.overlay.view.setVisible(true);
    this.floatingSidebarVisible = true;
    sendToRenderer(this.overlay.view.webContents, "overlay:visibility", true);
  }

  hideFloatingSidebar(): void {
    if (!this.floatingSidebarVisible) return;
    this.overlay.view.setVisible(false);
    this.floatingSidebarVisible = false;
    sendToRenderer(this.overlay.view.webContents, "overlay:visibility", false);
  }

  // The new tab page has its own composer. The panel comes back on the next page if it was open.
  private get chatAvailable(): boolean {
    const entry = this.activeEntry;
    return !(entry instanceof InternalTab && entry.page === "new-tab");
  }

  toggleChat(): void {
    if (!this.chatAvailable) return;
    this.chatOpen = !this.layout.chatOpen;
    this.updateAllBounds();
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
        mode: this.mode,
        sidebarOpen: this.sidebarOpen,
        chatOpen: this.chatOpen && this.chatAvailable,
        sidebarWidth: this.settings.sidebarWidth,
        chatWidth: this.settings.chatWidth,
        platform: process.platform,
      }
    );
  }

  updateAllBounds(): void {
    const { width, height } = this._baseWindow.getContentBounds();
    const layout = this.layout;
    this.chrome.view.setBounds({ x: 0, y: 0, width, height });
    this.allTabs.forEach((tab) => tab.view.setBounds(layout.page));
    if (layout.floatingSidebar.width === 0) this.hideFloatingSidebar();
    else if (this.floatingSidebarVisible) this.overlay.view.setBounds(layout.floatingSidebar);
    this.broadcast("layout:updated", layout);
  }

  private notifyTabs(): void {
    const active = this.activeEntry;
    if (active) this._baseWindow.setTitle(active.title || "Blueberry Browser");
    this.broadcast("tabs:updated", this.tabInfos);
  }

  private notifyTheme(): void {
    if (process.platform === "win32") {
      this._baseWindow.setTitleBarOverlay(this.titleBarOverlay());
    }
    this.broadcast("theme:updated", this.theme);
  }

  private broadcast<C extends keyof EventChannels>(channel: C, payload: EventChannels[C]): void {
    sendToRenderer(this.chrome.view.webContents, channel, payload);
    sendToRenderer(this.overlay.view.webContents, channel, payload);
  }
}
