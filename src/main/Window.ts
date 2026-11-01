import { BaseWindow, Menu, app, dialog, nativeTheme, powerMonitor, session, type WebContents } from "electron";
import { release } from "os";
import { Tab } from "./Tab";
import { InternalTab } from "./InternalTab";
import type { SettingsStore } from "./SettingsStore";
import type { BookmarkStore } from "./BookmarkStore";
import type { ChatStore } from "./ChatStore";
import type { HistoryStore } from "./HistoryStore";
import type { SavedTab, SavedWebTab, Session, SessionStore } from "./Session";
import { Chats } from "./Chats";
import { Phone } from "./Phone";
import { TelegramChannel } from "./TelegramChannel";
import type { RoutineStore } from "./RoutineStore";
import { Routines } from "./Routines";
import { confirmDeleteMascot, confirmDeleteRoutine, notifyNeedsYou, notifyRoutine } from "./routineNotices";
import type { MascotStore } from "./MascotStore";
import { Account } from "./Account";
import { Gallery } from "./Gallery";
import { GalleryServer, serverConfig } from "./galleryServer";
import { generateTitle, hasModel, streamReply, writeWithCheapModel } from "./agent";
import { join } from "path";
import { Suggestions } from "./Suggestions";
import { PATTERN_WINDOW_MS } from "./suggestionPatterns";
import { createChromeView, type ChromeView } from "./chromeView";
import { FindBar } from "./FindBar";
import { attachPageMenu, printPage } from "./pageMenu";
import { SiteZoom } from "./siteZoom";
import type { Downloads } from "./Downloads";
import type { SitePermissions } from "./SitePermissions";
import { PermissionPromptView } from "./PermissionPromptView";
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
  HistoryCursor,
  HistoryPage,
  InternalPage,
  LayoutMode,
  ResizablePanel,
  MascotSaveResult,
  Settings,
  TabInfo,
  ThemeState,
  Visit,
} from "../shared/ipc";
import type { ChatThread, LibrarySnapshot, NeedsYouItem, PublishResult } from "../shared/library";
import { BERRY } from "../shared/mascots";

export type BrowserTab = Tab | InternalTab;

// Only one of these pages is open at a time, so opening it again switches to it.
const SINGLE_INSTANCE_PAGES: InternalPage[] = ["routines", "settings", "downloads", "history", "flock", "mascot-gallery", "needs-you"];

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
// Plenty for a habit to show, and few enough to look through on every new tab.
// How long with no input before the phone gets what's waiting, even with the window in front.
const AWAY_AFTER_IDLE_SECONDS = 60;
const MAX_SUGGESTION_VISITS = 5000;
const MAX_SUGGESTION_CHATS = 100;

export const HORIZONTAL_TABS_MENU_ID = "horizontal-tabs";
// App menu items that only do something on a web page.
export const WEB_PAGE_MENU_IDS = ["zoom-in", "zoom-in-equals", "zoom-out", "zoom-reset", "print"];

export class Window {
  private _baseWindow: BaseWindow;
  private tabsMap: Map<string, BrowserTab> = new Map();
  private activeTabId: string | null = null;
  private tabCounter: number = 0;
  private closedTabs: TabInfo[] = [];
  private chrome: ChromeView;
  private overlay: ChromeView;
  readonly findBar: FindBar;
  readonly siteZoom: SiteZoom;
  private floatingSidebarVisible = false;
  private sidebarOpen = true;
  private chatOpen = false;
  private windowClosed = false;
  // Tabs Berry opened behind the chat. Where it goes in them isn't the user's history until they go there too.
  private readonly backgroundTabs = new Set<string>();
  // Kept here because a closed window, which is when this is saved last, can't be asked.
  private windowSize = { width: 0, height: 0 };
  private readonly glassSupported = supportsGlass();
  private readonly tabsUnderChrome = new WeakSet<Tab>();
  // What Needs you held last time, so only something new gets a notification.
  private knownWaiting = new Set<string>();
  readonly telegram: TelegramChannel;
  readonly account: Account;
  readonly gallery: Gallery;
  private readonly phone: Phone;
  readonly chats: Chats;
  readonly routines: Routines;
  readonly suggestions: Suggestions;
  readonly permissionPrompt: PermissionPromptView;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly chatStore: ChatStore,
    private readonly bookmarkStore: BookmarkStore,
    private readonly pinnedStore: BookmarkStore,
    routineStore: RoutineStore,
    private readonly mascotStore: MascotStore,
    readonly downloads: Downloads,
    readonly sitePermissions: SitePermissions,
    private readonly history: HistoryStore,
    private readonly sessionStore: SessionStore
  ) {
    nativeTheme.themeSource = settingsStore.get().appearance;
    const restored = settingsStore.get().onStartup === "restore" ? sessionStore.load() : null;

    this._baseWindow = new BaseWindow({
      width: restored?.width || 1280,
      height: restored?.height || 800,
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

    this.findBar = new FindBar(this._baseWindow.contentView);
    this.openLinksInTabs(this.findBar.chromeView.view.webContents);
    this.siteZoom = new SiteZoom({
      levels: () => this.settings.siteZoom,
      save: (siteZoom) => {
        this.updateSettings({ siteZoom });
        this.notifyTabs();
      },
      // A restored tab that hasn't loaded gets its zoom when it does.
      tabs: () => this.allTabs.filter((tab) => tab.existingView),
    });
    this.permissionPrompt = new PermissionPromptView(this._baseWindow, sitePermissions, {
      activeContents: () => (this.settings.onboarded ? this.activeTab?.webContents ?? null : null),
      page: () => this.layout.page,
    });
    const offDownloads = downloads.onChange((list) => sendToRenderer(this.chrome.view.webContents, "downloads:updated", list));
    const offSaved = sitePermissions.onChange(() =>
      sendToRenderer(this.chrome.view.webContents, "permissions:saved-updated", sitePermissions.saved)
    );

    const onDownload = (_: unknown, __: unknown, contents: WebContents) => this.closeTabLeftEmpty(contents);
    session.defaultSession.on("will-download", onDownload);

    const config = serverConfig(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, app.isPackaged);
    const server = config && new GalleryServer(config);
    this.account = new Account(server, join(app.getPath("userData"), "account.json"), () => {
      sendToRenderer(this.chrome.view.webContents, "account:updated", this.account.state);
    });
    this.gallery = new Gallery(server, this.account, mascotStore, join(app.getPath("userData"), "gallery.json"), process.env.BLUEBERRY_SITE_URL, () => {
      this.broadcast("library:updated", this.librarySnapshot);
    });

    this.telegram = new TelegramChannel(join(app.getPath("userData"), "phone.json"), () => {
      sendToRenderer(this.chrome.view.webContents, "phone:updated", this.telegram.state);
      this.phone.sync();
    });
    this.phone = new Phone(this.telegram, {
      waiting: () => this.needsYou,
      nameOf: ({ mascotId }) => this.mascotName(mascotId),
      away: () => this.userIsAway,
      decide: (id, approvalId, allow, answer) => this.chats.decide(id, approvalId, allow, answer),
      enterCode: (id, approvalId, code) => this.chats.enterCode(id, approvalId, code),
      onAnswered: (approvalId, said) => sendToRenderer(this.chrome.view.webContents, "phone:answered", { approvalId, said }),
    });

    this.chats = new Chats(chatStore, streamReply, generateTitle, {
      activeTab: () => this.activeTab,
      allTabs: () => this.allTabs,
      openBackgroundTab: (url) => this.createBackgroundTab(url),
      // The window closes with its last tab, so Berry never takes that one, or the one the user is looking at.
      closeTab: (tabId) => this.tabCount > 1 && tabId !== this.activeTabId && this.closeTab(tabId, false),
      actionApproval: () => this.settings.actionApproval,
      assistantName: () => (this.settings.showBerry ? BERRY.name : "Assistant"),
    }, {
      onChunk: (chatId, content) =>
        sendToRenderer(this.chrome.view.webContents, "chat:chunk", { chatId, content }),
      onThread: (thread) => {
        this.syncChatTabTitle(thread);
        sendToRenderer(this.chrome.view.webContents, "chat:updated", thread);
      },
      onListChanged: () => this.publishLibrary(),
      onDecided: (approvalId, allow) => this.phone.noteDecided(approvalId, allow),
      onWorkingTabs: (working, mascots) => {
        // A reply stopped by the window closing ends after the window has gone.
        if (this._baseWindow.isDestroyed()) return;
        const { layout } = this;
        this.allTabs.forEach((tab) => {
          tab.setBerryWorking(working.has(tab));
          tab.workingMascotId = mascots.get(tab) ?? null;
          this.placeTab(tab, layout);
        });
        this.notifyTabs();
      },
    }, (id) => this.mascotStore.resolve(id));

    this.routines = new Routines(routineStore, this.chats, {
      onChanged: () => this.publishLibrary(),
      onAttention: (routine, kind) => {
        // The Routines row and the toolbar say so anyway, and that holds until the user is free. Anything asking
        // is notified from Needs you, along with every chat's.
        if (kind === "needs-approval" || this.userIsBusyOrHere) return;
        notifyRoutine(routine.name, kind, () => {
          this.show();
          this.openPage("routines");
        });
      },
      // A tab the user has been to stays, even if they only looked.
      closeTab: (tabId) => {
        if (this.backgroundTabs.has(tabId)) this.closeTab(tabId, false);
      },
    });

    this.suggestions = new Suggestions(join(app.getPath("userData"), "suggestions.json"), {
      enabled: () => this.settings.suggestions,
      // Both newest first.
      visits: () => this.history.since(Date.now() - PATTERN_WINDOW_MS, MAX_SUGGESTION_VISITS),
      chats: () => chatStore.firstMessages(MAX_SUGGESTION_CHATS),
      routines: () => this.routines.list(),
      mascots: () => this.mascotStore.all(),
      hasModel,
      // Page titles go in this, and a careless page may have put a code from the phone in its title.
      write: (system, data) => writeWithCheapModel(system, this.chats.withoutCodes(data)),
      onChanged: () => this.publishSuggestions(),
    });

    if (restored) this.restoreSession(restored);
    else this.createTab();
    this.updateAllBounds();
    this.routines.start();
    this.telegram.start();
    this.phone.start();

    this.windowSize = this._baseWindow.getBounds();
    this._baseWindow.on("resize", () => {
      this.windowSize = this._baseWindow.getBounds();
      this.updateAllBounds();
      this.saveSessionSoon();
    });
    this._baseWindow.on("blur", () => {
      this.hideFloatingSidebar();
      this.phone.sync();
    });

    const onThemeUpdated = () => this.notifyTheme();
    nativeTheme.on("updated", onThemeUpdated);

    this._baseWindow.on("closed", () => {
      nativeTheme.off("updated", onThemeUpdated);
      this.routines.shutdown();
      this.phone.stop();
      this.telegram.close();
      this.permissionPrompt.destroy();
      session.defaultSession.off("will-download", onDownload);
      offDownloads();
      offSaved();
      this.chats.stopAll();
      this.settingsStore.flush();
      // Before the tabs close below, and nothing after this, which would save a window with none.
      this.sessionStore.saveSoon(() => this.currentSession);
      this.sessionStore.flush();
      this.windowClosed = true;
      this.tabsMap.forEach((tab) => tab.destroy());
      this.tabsMap.clear();
      this.chrome.view.webContents.close();
      this.overlay.view.webContents.close();
      this.findBar.destroy();
    });
  }

  // Without a handler, window.open starts a new window that inherits the opener's preload.
  private openLinksInTabs(webContents: WebContents): void {
    webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        // A page behind the current one, perhaps one Berry is using, doesn't get to come to the front.
        const opener = this.allTabs.find((tab) => tab.existingView?.webContents === webContents);
        // A limited mascot's click can't open what it couldn't go to.
        if (opener?.refusesNavigation(url)) return { action: "deny" };
        // Nor does one Berry opened, even with the user watching. If they had clicked here, it would be theirs by now.
        const behind = !!opener && (opener.id !== this.activeTabId || this.chats.isOwnTab(opener.id));
        const popup = behind ? this.createBackgroundTab(url) : this.createTab(url);
        if (opener) popup.limitFirstLoadLike(opener);
        if (behind) this.chats.notePopup(opener.id, popup.id);
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

  private publishSuggestions(): void {
    sendToRenderer(this.chrome.view.webContents, "suggestions:updated", this.suggestions.list());
  }

  private get needsYou(): NeedsYouItem[] {
    const routines = this.routines.list();
    return this.chats.waiting().map(({ chatTitle, ...waiting }) => {
      const routine = routines.find(({ latestRun }) => latestRun?.id === waiting.id);
      return { ...waiting, job: chatTitle ?? routine?.name ?? "A job", routineId: routine?.id ?? null };
    });
  }

  private publishLibrary(): void {
    // A reply stopped by the window closing ends after the window has gone.
    if (this._baseWindow.isDestroyed()) return;
    const snapshot = this.librarySnapshot;
    const known = this.knownWaiting;
    this.knownWaiting = new Set(snapshot.needsYou.map(({ approval }) => approval.id));
    if (!this.userIsBusyOrHere) {
      snapshot.needsYou
        .filter(({ approval }) => !known.has(approval.id))
        .forEach(({ approval, mascotId }) => {
          notifyNeedsYou(this.mascotName(mascotId), approval, () => {
            this.show();
            this.focus();
            this.openPage("needs-you", { param: approval.id });
          });
        });
    }
    this.broadcast("library:updated", snapshot);
    this.phone.sync();
  }

  private mascotName(mascotId: string): string {
    const mascot = this.mascotStore.resolve(mascotId);
    return mascot.id === BERRY.id && !this.settings.showBerry ? "Assistant" : mascot.name;
  }

  get librarySnapshot(): LibrarySnapshot {
    return {
      pinned: this.pinnedStore.get(),
      bookmarks: this.bookmarkStore.get(),
      chats: this.chatStore.summaries().map((chat) => ({ ...chat, running: this.chats.isRunning(chat.id) })),
      routines: this.routines.list(),
      mascots: this.mascotStore.all(),
      needsYou: this.needsYou,
    };
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
      berryWorking: tab.berryWorking,
      workingMascotId: tab.workingMascotId,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      zoomPercent: tab instanceof Tab ? this.siteZoom.percent(tab.url) : 100,
      page: tab instanceof InternalTab ? tab.page : null,
      pageParam: tab instanceof InternalTab ? tab.param : null,
      trouble: tab.trouble,
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
  createTab(url: string): Tab;
  createTab(url?: string): BrowserTab;
  createTab(url?: string): BrowserTab {
    if (!url) return this.openPage("new-tab");
    const tab = this.createWebTab(`tab-${++this.tabCounter}`, url);
    this.tabsMap.set(tab.id, tab);
    this.switchActiveTab(tab.id);
    return tab;
  }

  private restoreSession({ tabs, active, sidebarOpen, chatOpen }: Session): void {
    this.sidebarOpen = sidebarOpen;
    this.chatOpen = chatOpen;
    const ids = tabs.map((saved) => this.restoreTab(saved));
    const open = ids.filter((id) => id !== null);
    if (open.length === 0) this.createTab();
    else this.switchActiveTab(ids[active] ?? open[0]);
  }

  // A web tab waits to load until it's first needed. A chat may have been deleted since, so it has no tab.
  private restoreTab(saved: SavedTab): string | null {
    const id = `tab-${++this.tabCounter}`;
    if ("url" in saved) {
      this.tabsMap.set(id, this.createWebTab(id, saved.url, saved));
      return id;
    }
    const chat = saved.page === "chat" && saved.param ? this.chatStore.summaries().find(({ id: chatId }) => chatId === saved.param) : null;
    if (saved.page === "chat" && saved.param && !chat) return null;
    this.tabsMap.set(id, new InternalTab(id, saved.page, saved.param, chat?.title ?? saved.title));
    return id;
  }

  private get currentSession(): Session | null {
    if (this.settings.onStartup !== "restore") return null;
    const { width, height } = this.windowSize;
    // A chat's or routine's own tabs last as long as its work, so they aren't the user's to get back.
    const entries = this.entries.filter((tab) => !this.backgroundTabs.has(tab.id));
    return {
      tabs: entries.map(
        (tab): SavedTab =>
          tab instanceof Tab ? tab.saved : { page: tab.page, param: tab.param, title: tab.title }
      ),
      active: entries.findIndex((tab) => tab.id === this.activeTabId),
      sidebarOpen: this.sidebarOpen,
      chatOpen: this.chatOpen,
      width,
      height,
    };
  }

  private saveSessionSoon(): void {
    if (!this.windowClosed) this.sessionStore.saveSoon(() => this.currentSession);
  }

  private createBackgroundTab(url: string): Tab {
    const id = `tab-${++this.tabCounter}`;
    this.backgroundTabs.add(id);
    const tab = this.createWebTab(id, url);
    // Berry never makes a sound. Going to the tab turns it back on.
    tab.webContents.setAudioMuted(true);
    this.tabsMap.set(tab.id, tab);
    this.notifyTabs();
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
      // A one-of-a-kind page can be asked to show something else, such as the item a notification was about.
      if (existing instanceof InternalTab && param !== null) existing.param = param;
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
      // Only the address bar comes here, so the user has taken this tab from any job that opened it.
      this.chats.releaseTab(tabId);
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

  private createWebTab(tabId: string, url: string, restored?: SavedWebTab): Tab {
    // Loading starts inside the constructor, so these can run before `tab` is assigned.
    let tab: Tab | null = null;
    tab = new Tab(
      tabId,
      url,
      {
        onChange: () => this.notifyTabs(),
        // The title at this point is still the last page's, so the new page's arrives through `onDetails`.
        onNavigate: (address) => this.saveVisit(tabId, () => this.history.record(address, "", null)),
        onUserInput: () => this.chats.releaseTab(tabId),
        onDetails: () =>
          this.saveVisit(tabId, () => {
            if (tab) this.history.update(tab.url, { title: tab.title, favicon: tab.favicon });
          }),
        onView: (withView) => {
          this._baseWindow.contentView.addChildView(withView.view);
          this.placeTab(withView, this.layout);
          this.openLinksInTabs(withView.webContents);
          this.siteZoom.track(withView);
          attachPageMenu(withView, this._baseWindow, {
            openTab: (address) => this.createTab(address),
            askBerry: (text) => this.askBerryAbout(text),
            assistantName: () => (this.settings.showBerry ? "Berry" : "Assistant"),
          });
        },
      },
      restored
    );
    return tab;
  }

  // A full disk or a damaged file shouldn't get in the way of browsing.
  private saveVisit(tabId: string, save: () => void): void {
    if (this.backgroundTabs.has(tabId)) return;
    try {
      save();
    } catch (error) {
      console.error("Failed to save a visit:", error);
    }
  }

  searchHistory(options: { query?: string; before?: HistoryCursor }): HistoryPage {
    return this.history.search(options);
  }

  deleteHistoryEntry(id: number): boolean {
    const url = this.history.delete(id);
    if (url === null) return false;
    this.forgetPages(url);
    this.publishSuggestions();
    return true;
  }

  async clearHistory(): Promise<boolean> {
    const { response } = await dialog.showMessageBox(this._baseWindow, {
      type: "warning",
      message: "Clear all browsing history?",
      detail: "It will be permanently removed from this computer. Open tabs stay open, but lose their back and forward pages.",
      buttons: ["Clear History", "Cancel"],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return false;
    this.history.clear();
    this.forgetPages();
    this.publishSuggestions();
    return true;
  }

  // History isn't really gone while back buttons, Reopen Closed Tab and the saved session still hold it.
  private forgetPages(url?: string): void {
    this.allTabs.forEach((tab) => tab.forget(url));
    this.closedTabs = this.closedTabs.filter((tab) => tab.page !== null || (url !== undefined && tab.url !== url));
    this.notifyTabs();
    this.sessionStore.flush();
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
    if (tab instanceof Tab && tab.existingView) this._baseWindow.contentView.removeChildView(tab.existingView);
    tab.destroy();
    this.tabsMap.delete(tabId);
    this.backgroundTabs.delete(tabId);
    this.chats.tabClosed(tabId);

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

    if (tabId !== this.activeTabId) this.findBar.closeUnlessOn(null);
    this.activeTabId = tabId;
    if (tab instanceof Tab) tab.webContents.setAudioMuted(false);
    if (this.backgroundTabs.delete(tabId) && tab instanceof Tab) {
      this.saveVisit(tabId, () => this.history.record(tab.url, tab.title, tab.favicon));
    }
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
    this.findBar.closeUnlessOn(this.findTarget);
  }

  // Internal pages are drawn by the chrome view, so finding on one searches that.
  private get findTarget(): WebContents | null {
    if (!this.settings.onboarded) return null;
    return this.activeTab?.webContents ?? this.chrome.view.webContents;
  }

  openFindBar(): void {
    const target = this.findTarget;
    if (target) this.findBar.open(target);
  }

  // With the bar closed there's nothing to step through yet, so this opens it.
  findStep(forward: boolean): void {
    if (this.findBar.isOpen) this.findBar.step(forward);
    else this.openFindBar();
  }

  zoomActiveTab(direction: 1 | -1): void {
    if (this.activeTab) this.siteZoom.step(this.activeTab, direction);
  }

  resetActiveTabZoom(): void {
    if (this.activeTab) this.siteZoom.reset(this.activeTab);
  }

  printActiveTab(): void {
    if (this.activeTab) printPage(this.activeTab.webContents);
  }

  syncMenu(): void {
    const menu = Menu.getApplicationMenu();
    WEB_PAGE_MENU_IDS.forEach((id) => {
      const item = menu?.getMenuItemById(id);
      if (item) item.enabled = this.activeTab !== null;
    });
  }

  // Puts the text in the panel's composer and leaves sending to the user.
  private askBerryAbout(text: string): void {
    this.chatOpen = true;
    this.updateAllBounds();
    this.chrome.view.webContents.focus();
    sendToRenderer(this.chrome.view.webContents, "chat:draft", text);
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

  // In the app already, or somewhere a notification would interrupt: fullscreen, or anything playing sound.
  private get userIsBusyOrHere(): boolean {
    const window = this._baseWindow;
    return window.isFocused() || window.isFullScreen() || this.allTabs.some((tab) => tab.existingView?.webContents.isCurrentlyAudible());
  }

  // The window isn't in front, or nobody has touched the computer for a little while. So nothing buzzes on someone
  // reading the page, and a job asking during lunch gets through even with the window left in front.
  private get userIsAway(): boolean {
    return this.settings.phoneAlways || !this._baseWindow.isFocused() || powerMonitor.getSystemIdleTime() >= AWAY_AFTER_IDLE_SECONDS;
  }

  async confirmDeleteRoutine(id: string): Promise<boolean> {
    const routine = this.routines.list().find((candidate) => candidate.id === id);
    if (!routine || !(await confirmDeleteRoutine(this._baseWindow, routine.name))) return false;
    return this.routines.delete(id);
  }

  saveMascot(id: string | null, draft: unknown): MascotSaveResult {
    const result = this.mascotStore.save(id, draft);
    if (result.ok) this.broadcast("library:updated", this.librarySnapshot);
    return result;
  }

  async addFromGallery(galleryId: string, name: string | null): Promise<MascotSaveResult> {
    const entry = this.gallery.entry(galleryId);
    if (!entry) return { ok: false, error: "This mascot is no longer in the Gallery." };
    const result = this.mascotStore.addFromGallery(galleryId, name === null ? entry.draft : { ...entry.draft, name });
    if (result.ok) {
      this.gallery.countAdd(galleryId);
      this.broadcast("library:updated", this.librarySnapshot);
    }
    return result;
  }

  async confirmUnpublish(id: string): Promise<PublishResult> {
    const { response } = await dialog.showMessageBox(this._baseWindow, {
      type: "warning",
      message: "Take this mascot out of the Gallery?",
      detail: "Its public page and its count go. Your own mascot stays, and so do copies other people have already added, because nothing here can reach them.",
      buttons: ["Unpublish", "Cancel"],
      defaultId: 1,
      cancelId: 1,
    });
    return response === 0 ? this.gallery.unpublish(id) : { ok: false, error: "" };
  }

  // Its routines pause rather than move to Berry, which could do more than the user set them up to.
  async confirmDeleteMascot(id: string): Promise<boolean> {
    const mascot = this.mascotStore.find(id);
    if (!mascot || mascot.id === BERRY.id || mascot.deletedAt !== null) return false;
    const runs = this.routines.list().filter((routine) => routine.mascotId === id);
    if (!(await confirmDeleteMascot(this._baseWindow, mascot.name, runs.length, Boolean(mascot.publishedId)))) return false;
    if (!this.mascotStore.delete(id)) return false;
    runs.forEach((routine) => this.routines.setPaused(routine.id, true));
    this.broadcast("library:updated", this.librarySnapshot);
    return true;
  }

  toggleBookmark(): void {
    const tab = this.activeTab;
    if (!tab) return;
    this.saveBookmarks(() => this.bookmarkStore.toggle(tab.url, tab.title));
  }

  togglePin(): void {
    const tab = this.activeTab;
    if (!tab) return;
    this.saveBookmarks(() => this.pinnedStore.toggle(tab.url, tab.title));
  }

  // One button can stand for a site that's both pinned and bookmarked, so it offers whatever applies.
  showBookmarkMenu(id: string): void {
    const pins = this.pinnedStore.get();
    const bookmarks = this.bookmarkStore.get();
    const site = [...pins, ...bookmarks].find((candidate) => candidate.id === id);
    if (!site) return;
    const pin = pins.find((candidate) => candidate.url === site.url);
    const bookmark = bookmarks.find((candidate) => candidate.url === site.url);
    Menu.buildFromTemplate([
      ...(pin ? [{ label: "Unpin", click: () => this.saveBookmarks(() => this.pinnedStore.remove(pin.id)) }] : []),
      ...(bookmark ? [{ label: "Remove Bookmark", click: () => this.saveBookmarks(() => this.bookmarkStore.remove(bookmark.id)) }] : []),
    ]).popup({ window: this._baseWindow });
  }

  private saveBookmarks(save: () => void): void {
    try {
      save();
      this.broadcast("library:updated", this.librarySnapshot);
    } catch (error) {
      console.error("Failed to save pinned sites and bookmarks:", error);
      void dialog.showMessageBox(this._baseWindow, {
        type: "error",
        message: "Could not save your pinned sites and bookmarks",
        detail: "Check that there is space on your disk and try again.",
      });
    }
  }

  // A link to a download in a new tab would otherwise leave that tab empty for good.
  private closeTabLeftEmpty(contents: WebContents): void {
    const tab = this.allTabs.find((candidate) => candidate.existingView?.webContents === contents);
    if (tab && !tab.hasLoaded && this.tabCount > 1) this.closeTab(tab.id, false);
  }

  async chooseDownloadFolder(): Promise<void> {
    const { canceled, filePaths } = await dialog.showOpenDialog(this._baseWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (!canceled && filePaths[0]) this.updateSettings({ downloadFolder: filePaths[0] });
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
    this.saveSessionSoon();
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
    if (after.onStartup !== before.onStartup) this.saveSessionSoon();
    if (after.suggestions !== before.suggestions) this.publishSuggestions();
    if (after.phoneAlways !== before.phoneAlways) this.phone.sync();

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
    this.saveSessionSoon();
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

  // A parked tab goes under the chrome, which then takes any click on the one pixel it leaves in the window.
  private placeTab(tab: Tab, layout: Layout): void {
    const view = tab.existingView;
    if (!view) return;
    if (tab.isParked !== this.tabsUnderChrome.has(tab)) {
      const { contentView } = this._baseWindow;
      if (tab.isParked) {
        contentView.addChildView(view, 0);
        this.tabsUnderChrome.add(tab);
      } else {
        contentView.addChildView(view, contentView.children.indexOf(this.chrome.view) + 1);
        this.tabsUnderChrome.delete(tab);
      }
    }
    tab.place(layout);
  }

  updateAllBounds(): void {
    const { width, height } = this._baseWindow.getContentBounds();
    const layout = this.layout;
    this.chrome.view.setBounds({ x: 0, y: 0, width, height });
    this.allTabs.forEach((tab) => this.placeTab(tab, layout));
    if (layout.floatingSidebar.width === 0) this.hideFloatingSidebar();
    else if (this.floatingSidebarVisible) this.overlay.view.setBounds(layout.floatingSidebar);
    this.findBar.setBounds(layout.findBar);
    this.broadcast("layout:updated", layout);
    this.permissionPrompt.sync();
  }

  private notifyTabs(): void {
    const active = this.activeEntry;
    if (active) this._baseWindow.setTitle(active.title || "Blueberry Browser");
    this.syncMenu();
    this.broadcast("tabs:updated", this.tabInfos);
    this.saveSessionSoon();
  }

  private notifyTheme(): void {
    if (process.platform === "win32") {
      this._baseWindow.setTitleBarOverlay(this.titleBarOverlay());
    }
    this.broadcast("theme:updated", this.theme);
    this.findBar.notifyTheme(this.theme);
    sendToRenderer(this.permissionPrompt.chrome.view.webContents, "theme:updated", this.theme);
  }

  private broadcast<C extends keyof EventChannels>(channel: C, payload: EventChannels[C]): void {
    sendToRenderer(this.chrome.view.webContents, channel, payload);
    sendToRenderer(this.overlay.view.webContents, channel, payload);
  }
}
