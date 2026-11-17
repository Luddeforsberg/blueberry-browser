import { BaseWindow, Menu, app, dialog, nativeTheme, powerMonitor, session, shell, systemPreferences, type WebContents } from "electron";
import { release } from "os";
import { TAB_WEB_PREFERENCES, Tab } from "./Tab";
import { InternalTab } from "./InternalTab";
import type { SettingsStore } from "./SettingsStore";
import type { BookmarkStore } from "./BookmarkStore";
import type { ChatStore } from "./ChatStore";
import type { HistoryStore } from "./HistoryStore";
import { browserDataFor, findBrowsers, readBrowserHistory } from "./browserHistory";
import type { SavedTab, SavedWebTab, Session, SessionStore } from "./Session";
import { Chats } from "./Chats";
import { Attachments } from "./Attachments";
import { preparePicture } from "./pictures";
import { WorkViews } from "./WorkViews";
import { Recordings } from "./Recordings";
import { Phone } from "./Phone";
import { TelegramChannel } from "./TelegramChannel";
import type { RoutineStore } from "./RoutineStore";
import { Routines } from "./Routines";
import { confirmClearMemory, confirmDeleteMascot, confirmDeleteRoutine, notifyNeedsYou, notifyRoutine } from "./routineNotices";
import type { MascotStore } from "./MascotStore";
import { Account } from "./Account";
import { AiKey, KEY_PAGES } from "./AiKey";
import { isAiService } from "../shared/aiKey";
import { PLAIN_WORDS, type FirstJob } from "../shared/firstRun";
import { Gallery } from "./Gallery";
import { GalleryServer, serverConfig } from "./galleryServer";
import { linkThrottle } from "./mascotLink";
import { generateTitle, hasModel, streamReply, setSavedKeyReader, writeWithCheapModel } from "./agent";
import { join } from "path";
import { Suggestions } from "./Suggestions";
import { MemoryStore } from "./MemoryStore";
import { PATTERN_WINDOW_MS } from "./suggestionPatterns";
import { createChromeView, type ChromeView } from "./chromeView";
import { FindBar } from "./FindBar";
import { AddressSuggestions } from "./AddressSuggestions";
import { attachPageMenu, printPage } from "./pageMenu";
import { SiteZoom } from "./siteZoom";
import type { Downloads } from "./Downloads";
import type { SitePermissions } from "./SitePermissions";
import { PermissionPromptView } from "./PermissionPromptView";
import { DesktopBerry } from "./DesktopBerry";
import { McpConnector } from "./McpConnector";
import { createMcpTools, type McpTool } from "./mcpTools";
import { readTabText } from "./mcpPages";
import { CloudTabs } from "./CloudTabs";
import { RunnerJobs } from "./RunnerJobs";
import { MacJobs } from "./MacJobs";
import { confirmCloudLogin, readSiteCookies } from "./cloudLoginAccess";
import { suggestLoginSites } from "./cloudLogins";
import {
  computeLayout,
  MIN_WINDOW,
  TAB_ROW_HEIGHT,
  TOOLBAR_HEIGHT,
  type Layout,
} from "./Layout";
import { sendToRenderer } from "./ipc";
import type {
  EventChannels,
  HistoryCursor,
  HistoryImportResult,
  HistoryPage,
  ImportSource,
  InternalPage,
  LayoutMode,
  Popover,
  ResizablePanel,
  MascotSaveResult,
  Settings,
  TabInfo,
  ThemeState,
  Visit,
  VisitedPage,
} from "../shared/ipc";
import type { ChatThread, LibrarySnapshot, NeedsYouItem, PublishResult, SavedSiteList } from "../shared/library";
import { BERRY } from "../shared/mascots";
import { iconMascotId } from "../shared/appIcon";
import { AppIcon } from "./AppIcon";

export type BrowserTab = Tab | InternalTab;

// Only one of these pages is open at a time, so opening it again switches to it.
const SINGLE_INSTANCE_PAGES: InternalPage[] = ["routines", "settings", "downloads", "history", "flock", "mascot-gallery", "needs-you", "recording"];

// Window materials need macOS, or Windows 11 22H2 (build 22621) and later.
const supportsGlass = (): boolean => {
  if (process.platform === "darwin") return true;
  if (process.platform !== "win32") return false;
  return Number(release().split(".")[2]) >= 22621;
};

// A page opened by another with `window.open`, and the tab that opened it.
type Popup = { page: WebContents; opener: Tab };

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
// What the address field sends to look up in the history, at most.
const MAX_SUGGEST_TEXT = 200;
// A page in the chrome that's stuck doesn't get to hold up the bird.
const TAKE_OFF_ASK_MS = 300;

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
  readonly addressSuggestions: AddressSuggestions;
  readonly siteZoom: SiteZoom;
  private floatingSidebarVisible = false;
  // What's open over the page from the horizontal toolbar, in the overlay view. Null when nothing is.
  private popover: Popover | null = null;
  private sidebarOpen = true;
  private chatOpen = false;
  // The chat the chat panel has, which the chrome tells us, since a panel chat has no tab to be in front.
  private panelChatId: string | null = null;
  private windowClosed = false;
  // Tabs Berry opened behind the chat. Where it goes in them isn't the user's history until they go there too.
  private readonly backgroundTabs = new Set<string>();
  // Tabs a job opened that became the user's before they went there. Saved with the session, and kept out of history
  // until they do, like a background tab.
  private readonly unvisitedTabs = new Set<string>();
  // Kept here because a closed window, which is when this is saved last, can't be asked.
  private windowSize = { width: 0, height: 0 };
  private readonly glassSupported = supportsGlass();
  private readonly tabsUnderChrome = new WeakSet<Tab>();
  // `blueberry://mascot/` links come from any page, so a flood of them can't keep taking the front.
  private readonly linkThrottle = linkThrottle();
  // What Needs you held last time, so only something new gets a notification.
  private knownWaiting = new Set<string>();
  readonly telegram: TelegramChannel;
  readonly account: Account;
  readonly aiKey: AiKey;
  readonly gallery: Gallery;
  private readonly phone: Phone;
  readonly chats: Chats;
  readonly workViews: WorkViews;
  readonly recordings: Recordings;
  // Files added to a prompt box, kept in main until they're sent or let go.
  readonly attachments = new Attachments(() => this.pickFiles(), preparePicture);
  readonly routines: Routines;
  readonly suggestions: Suggestions;
  readonly permissionPrompt: PermissionPromptView;
  readonly desktopBerry: DesktopBerry;
  readonly memory: MemoryStore;
  readonly mcp: McpConnector;
  readonly cloud: CloudTabs;
  readonly runnerJobs: RunnerJobs;
  private readonly macJobs: MacJobs;
  readonly appIcon: AppIcon;

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
    // Before a site could only be in one list, it could be saved both ways. It stays on top.
    try {
      for (const pin of pinnedStore.get()) bookmarkStore.removeUrl(pin.url);
    } catch (error) {
      console.error("Failed to tidy saved sites:", error);
    }
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

    this.appIcon = new AppIcon(app.getPath("userData"), this._baseWindow, () => ({
      mascotId: iconMascotId(this.settings.appIconMascotId, this.mascotStore.all()),
      ground: this.settings.appIconGround,
    }));
    this.chrome = createChromeView("chrome");
    this._baseWindow.contentView.addChildView(this.chrome.view);
    this.openLinksInTabs(this.chrome.view.webContents);

    this.overlay = createChromeView("overlay");
    this.overlay.view.setVisible(false);
    this._baseWindow.contentView.addChildView(this.overlay.view);
    this.openLinksInTabs(this.overlay.view.webContents);

    this.findBar = new FindBar(this._baseWindow.contentView);
    this.openLinksInTabs(this.findBar.chromeView.view.webContents);
    this.addressSuggestions = new AddressSuggestions(this._baseWindow.contentView);
    this.openLinksInTabs(this.addressSuggestions.chromeView.view.webContents);
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
      this.broadcast("account:updated", this.account.state);
      this.runnerJobs?.accountChanged();
      this.macJobs?.sync();
    });
    // Only the service and the last four characters go to the chrome. The key itself goes to the model and nowhere else.
    this.aiKey = new AiKey(join(app.getPath("userData"), "ai-key.json"), () => {
      sendToRenderer(this.chrome.view.webContents, "ai-key:updated", this.aiKey.state);
      if (this.aiKey.inUse) this.firstJobDone("key");
    });
    setSavedKeyReader(() => this.aiKey.inUse, { ownAddressOnly: app.isPackaged });
    this.gallery = new Gallery(server, this.account, mascotStore, join(app.getPath("userData"), "gallery.json"), process.env.BLUEBERRY_SITE_URL, () => {
      this.broadcast("library:updated", this.librarySnapshot);
    });

    this.telegram = new TelegramChannel(join(app.getPath("userData"), "phone.json"), () => {
      sendToRenderer(this.chrome.view.webContents, "phone:updated", this.telegram.state);
      this.phone.sync();
    });
    this.phone = new Phone(this.telegram, {
      // The runner's are answered in this window only, so the phone isn't offered them.
      waiting: () => this.needsYou.filter(({ id }) => !this.runnerJobs.has(id)),
      nameOf: ({ mascotId }) => this.mascotName(mascotId),
      away: () => this.userIsAway,
      decide: (id, approvalId, allow, answer) => this.chats.decide(id, approvalId, allow, answer, { fromPhone: true }),
      enterCode: (id, approvalId, code) => this.chats.enterCode(id, approvalId, code),
      onAnswered: (approvalId, said) => sendToRenderer(this.chrome.view.webContents, "phone:answered", { approvalId, said }),
    });

    this.memory = new MemoryStore(join(app.getPath("userData"), "memory.json"), {
      onChanged: () => this.publishLibrary(),
      enabled: () => this.settings.memoryOffers,
      hasModel,
      write: (system, data) => writeWithCheapModel(system, this.chats.withoutCodes(data)),
      isClean: (text) => this.chats.withoutCodes(text) === text,
    });

    // Only an unpackaged app can be pointed at a Chrome on this computer instead of Browserbase, like the other test hooks.
    const localCloud = app.isPackaged ? undefined : process.env.BLUEBERRY_CLOUD_LOCAL;
    this.cloud = new CloudTabs(
      join(app.getPath("userData"), "cloud.json"),
      {
        chrome: () => this.chrome.view.webContents,
        openTab: (title) => this.openCloudTab(title),
        updateTab: (id, title) => {
          const tab = this.tabsMap.get(id);
          if (!(tab instanceof InternalTab) || tab.title === title) return;
          tab.title = title;
          this.notifyTabs();
        },
        closeTab: (id) => {
          if (this.tabsMap.has(id) && this.tabCount > 1) this.closeTab(id, false);
          else this.cloud.tabClosed(id);
        },
        takenOver: (id) => this.chats.releaseTab(id),
        showTab: (id) => this.switchActiveTab(id),
        confirmLogin: (site) => confirmCloudLogin(this._baseWindow, site),
        readCookies: (site) => readSiteCookies(site),
      },
      localCloud ? (localCloud === "1" ? { executable: process.env.BLUEBERRY_CLOUD_CHROME || undefined } : { endpoint: localCloud }) : null
    );
    this.cloud.start();

    this.runnerJobs = new RunnerJobs(server, this.account, join(app.getPath("userData"), "runner-jobs.json"), {
      changed: (chatId) => this.chats.runnerChanged(chatId),
      finished: (chatId, result) => this.chats.runnerFinished(chatId, result),
      contextId: () => this.cloud.contextId,
      runnerUpdated: (state) => {
        sendToRenderer(this.chrome.view.webContents, "cloud:runner-updated", state);
        this.macJobs?.sync();
      },
      flock: () => this.mascotStore.all(),
      adopt: ({ prompt, mascotId }) => this.chats.adoptRunnerChat(prompt, mascotId),
      followedUp: (chatId, prompt) => this.chats.runnerFollowedUp(chatId, prompt),
      routinesSettled: () => this.routines.cloudChanged(),
      routines: () =>
        this.routines.cloudRows((id) => this.mascotStore.resolve(id), {
          actionApproval: this.settings.actionApproval,
          contextId: this.cloud.contextId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
    });

    this.chats = new Chats(chatStore, streamReply, generateTitle, {
      activeTab: () => this.activeTab,
      allTabs: () => this.allTabs,
      openBackgroundTab: (url) => this.createBackgroundTab(url),
      // The window closes with its last tab, so Berry never takes that one, or the one the user is looking at.
      closeTab: (tabId) => this.tabCount > 1 && tabId !== this.activeTabId && this.closeTab(tabId, false),
      // Saved with the session from now on, like any other tab of theirs.
      giveToUser: (tabId) => {
        if (!this.backgroundTabs.delete(tabId)) return;
        this.unvisitedTabs.add(tabId);
        this.saveSessionSoon();
      },
      actionApproval: () => this.settings.actionApproval,
      assistantName: () => (this.settings.showBerry ? BERRY.name : "Assistant"),
      chatInFront: (chatId) => this.isChatInFront(chatId),
    }, {
      onChunk: (chatId, content) =>
        sendToRenderer(this.chrome.view.webContents, "chat:chunk", { chatId, content }),
      onThread: (thread) => {
        this.syncChatTabTitle(thread);
        sendToRenderer(this.chrome.view.webContents, "chat:updated", thread);
        this.workViews.sync();
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
        this.workViews.sync();
      },
    }, (id) => this.mascotStore.resolve(id), this.memory, this.cloud, this.runnerJobs);

    this.workViews = new WorkViews({
      chrome: () => this.chrome.view.webContents,
      work: (chatId) => this.chats.work(chatId),
      onScreen: (chatId) => {
        const entry = this.activeEntry;
        return entry instanceof InternalTab && entry.page === "chat" && entry.param === chatId && this.windowShowing;
      },
      pageWidth: () => this.layout.page.width,
    });
    const syncWork = () => this.workViews.sync();
    this._baseWindow.on("minimize", syncWork);
    this._baseWindow.on("restore", syncWork);
    this._baseWindow.on("hide", syncWork);
    this._baseWindow.on("show", syncWork);

    this.routines = new Routines(routineStore, this.chats, {
      onChanged: () => {
        this.publishLibrary();
        void this.runnerJobs.routinesChanged();
      },
      stillInCloud: (id) => this.runnerJobs.stillInCloud(id),
      cloudFailed: (id) => this.runnerJobs.cloudFailed(id),
      // Named the way a chat is titled, from the user's own words for what it does and nothing else.
      writeName: async (instructions) => (hasModel() ? generateTitle([{ role: "user", content: instructions }]) : null),
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

    this.recordings = new Recordings({
      chrome: () => this.chrome.view.webContents,
      activeTab: () => this.activeTab,
      openReview: () => this.openPage("recording"),
      closeReview: () => {
        const review = this.entries.find((tab) => tab instanceof InternalTab && tab.page === "recording");
        if (!review) return;
        if (this.tabCount === 1) this.openPage("new-tab");
        this.closeTab(review.id, false);
      },
      // The new tab says what to do while watching is on, so one already in front is used.
      openStart: () => {
        const front = this.activeEntry;
        if (!(front instanceof InternalTab && front.page === "new-tab")) this.openPage("new-tab");
      },
      hasModel,
      // Page labels go in this, and a careless page may have put a code from the phone in one.
      write: (system, data) => writeWithCheapModel(system, this.chats.withoutCodes(data)),
    });

    this.suggestions = new Suggestions(join(app.getPath("userData"), "suggestions.json"), {
      enabled: () => this.settings.suggestions,
      // Both newest first.
      visits: () => this.history.since(Date.now() - PATTERN_WINDOW_MS, MAX_SUGGESTION_VISITS),
      chats: () =>
        chatStore.firstMessages(MAX_SUGGESTION_CHATS).map((chat) => {
          // Failed and stopped are only known for replies since launch.
          const outcome = this.chats.work(chat.id)?.outcome;
          return { ...chat, outcome: outcome === "failed" || outcome === "stopped" ? outcome : chat.replied ? "done" : "no reply" };
        }),
      routines: () => this.routines.list(),
      runs: (routineId) => this.routines.runs(routineId),
      mascots: () => this.mascotStore.all(),
      hasModel,
      // Page titles go in this, and a careless page may have put a code from the phone in its title.
      write: (system, data) => writeWithCheapModel(system, this.chats.withoutCodes(data)),
      onChanged: () => this.publishSuggestions(),
    });

    this.desktopBerry = new DesktopBerry({
      settings: () => this.settings,
      update: (patch) => this.updateSettings(patch),
      library: () => this.librarySnapshot,
      mascot: (id) => this.mascotStore.resolve(id),
      nameOf: (mascotId) => this.mascotName(mascotId),
      inFront: () => this._baseWindow.isFocused() && this.windowShowing,
      stillMotion: () => systemPreferences.getAnimationSettings().prefersReducedMotion,
      theme: () => this.theme,
      takeOffPoint: () => this.birdOnScreen(),
      setAway: (away) => sendToRenderer(this.chrome.view.webContents, "desktop:away", away),
      ended: (chatId) => {
        const chat = this.chats.thread(chatId);
        if (!chat || this.chats.work(chatId)?.outcome === "stopped") return null;
        const last = chat.messages.at(-1);
        return { mascotId: chat.mascotId ?? BERRY.id, error: chat.error, text: last?.role === "assistant" ? last.content : "" };
      },
      chatOnScreen: (chatId) => {
        const entry = this.activeEntry;
        return this._baseWindow.isFocused() && this.windowShowing && entry instanceof InternalTab && entry.page === "chat" && entry.param === chatId;
      },
      send: (text, mascotId) => this.chats.send(null, text, { seePage: false, mascotId }) !== null,
      open: (target) => {
        this.bringForward();
        if (target.page === "chat") this.openPage("chat", { param: target.chatId });
        else this.openPage("needs-you", { param: target.approvalId });
      },
      showBlueberry: () => this.bringForward(),
    });

    this.mcp = new McpConnector(join(app.getPath("userData"), "mcp.json"), () => this.mcpTools, () => sendToRenderer(this.chrome.view.webContents, "mcp:updated", this.mcp.state));

    // Relay jobs on this Mac, run as an MCP job is: no page, a `from`, and every limit and approval of the chat.
    this.macJobs = new MacJobs(server, this.account, {
      enabled: () => this.settings.relayOnMac,
      linked: () => this.runnerJobs.available(),
      // The bird from the row only narrows the one here with its id, and one that isn't here doesn't start.
      start: (prompt, { bird, askAtLeast, from }, onEnd) => {
        const clean = (text: string) => this.chats.withoutCodes(text);
        const sent = this.chats.send(null, prompt, {
          seePage: false,
          mascotId: bird.id === BERRY.id ? null : bird.id,
          sites: bird.sites,
          tools: bird.tools,
          askAtLeast,
          from,
          onEnd: (ended) => onEnd({ ...ended, reply: clean(ended.reply), steps: ended.steps.map((step) => ({ ...step, text: clean(step.text) })), error: ended.error && clean(ended.error) }),
        });
        return sent?.id ?? null;
      },
      progress: (chatId) => {
        const chat = this.chats.thread(chatId);
        if (!chat) return null;
        const clean = (text: string) => this.chats.withoutCodes(text);
        return {
          reply: clean(chat.partial ?? ""),
          steps: chat.steps.map((step) => ({ ...step, text: clean(step.text) })),
          waiting: this.chats.waiting().some(({ id }) => id === chatId),
        };
      },
      stop: (chatId) => this.chats.stop(chatId),
    });

    if (restored) this.restoreSession(restored);
    else this.createTab();
    this.updateAllBounds();
    this.desktopBerry.sync();
    this.routines.start();
    this.telegram.start();
    this.phone.start();
    this.mcp.start();
    this.macJobs.start();

    this.windowSize = this._baseWindow.getBounds();
    this._baseWindow.on("resize", () => {
      this.windowSize = this._baseWindow.getBounds();
      this.updateAllBounds();
      this.saveSessionSoon();
    });
    this._baseWindow.on("blur", () => {
      this.hideFloatingSidebar();
      this.phone.sync();
      this.desktopBerry.mainWindowBlurred();
    });
    this._baseWindow.on("focus", () => this.desktopBerry.mainWindowFocused());
    this._baseWindow.on("minimize", () => this.desktopBerry.mainWindowGone());

    const onThemeUpdated = () => this.notifyTheme();
    nativeTheme.on("updated", onThemeUpdated);

    this._baseWindow.on("closed", () => {
      this.desktopBerry.destroy();
      this.workViews.destroy();
      this.recordings.destroy();
      nativeTheme.off("updated", onThemeUpdated);
      this.routines.shutdown();
      this.phone.stop();
      this.telegram.close();
      this.mcp.close();
      void this.cloud.destroy();
      this.runnerJobs.destroy();
      this.macJobs.destroy();
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
      this.addressSuggestions.destroy();
    });
  }

  // Without a handler, window.open starts a new window that inherits the opener's preload.
  private openLinksInTabs(webContents: WebContents): void {
    webContents.setWindowOpenHandler(({ url }) => {
      if (!/^https?:/i.test(url)) return { action: "deny" };
      const opener = this.allTabs.find((tab) => tab.existingView?.webContents === webContents);
      // The chrome's own links open as plain tabs, so no page is ever a child of the chrome.
      if (!opener) {
        this.createTab(url);
        return { action: "deny" };
      }
      // A limited mascot's click can't open what it couldn't go to.
      if (opener.refusesNavigation(url)) return { action: "deny" };
      // A page behind the current one, perhaps one Berry is using, doesn't get to come to the front.
      // Nor does one Berry opened, even with the user watching. If they had clicked here, it would be theirs by now.
      const behind = opener.id !== this.activeTabId || this.chats.isOwnTab(opener.id);
      // A real popup, so the page that opened it can talk to it, as a sign-in with Google needs. It's a tab with a
      // tab's preferences, its size is ignored, and it stays when its opener goes, like any tab.
      return {
        action: "allow",
        outlivesOpener: true,
        overrideBrowserWindowOptions: { webPreferences: TAB_WEB_PREFERENCES },
        createWindow: (options) => {
          // Electron passes the page it made for the popup along with the options, though its types leave it out.
          const page = (options as { webContents?: WebContents }).webContents;
          if (!page) throw new Error("Electron gave no page for the popup");
          const popup = { page, opener };
          const tab = behind ? this.createBackgroundTab(url, popup) : this.createTab(url, popup);
          tab.limitFirstLoadLike(opener);
          if (behind) this.chats.notePopup(opener.id, tab.id);
          return tab.webContents;
        },
      };
    });
  }

  // A popup that closes itself takes the user back to the page that opened it, if they were looking at the popup.
  private closedByPage(tabId: string, openerId: string | undefined): void {
    if (this.windowClosed || !this.tabsMap.has(tabId)) return;
    // Its page is gone, so the tab goes before anything else looks at it.
    const wasActive = this.activeTabId === tabId;
    this.closeTab(tabId, false);
    if (wasActive && openerId && this.tabsMap.has(openerId)) this.switchActiveTab(openerId);
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
    return this.mode === "vertical" ? TOOLBAR_HEIGHT : TAB_ROW_HEIGHT;
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

  // What Claude and other apps can do over MCP, each through the path the user's own action takes. Made once, since it
  // remembers the routine runs it started.
  private mcpToolList: McpTool[] | null = null;
  private get mcpTools(): McpTool[] {
    return (this.mcpToolList ??= createMcpTools({
      mascots: () => this.mascotStore.all(),
      startChat: (task, { mascotId, sites, from }) => this.chats.send(null, task, { seePage: false, mascotId, sites, from }),
      chat: (id) => this.chats.thread(id),
      chatsFromApps: () => this.chatStore.summaries().filter((chat) => chat.from),
      isRunning: (id) => this.chats.isRunning(id),
      outcome: (id) => this.chats.work(id)?.outcome ?? null,
      stop: (id) => this.chats.stop(id),
      waiting: () => this.chats.waiting(),
      answer: (id, approvalId, answer) => this.chats.decide(id, approvalId, true, answer, { fromApp: true }),
      routines: () => this.routines.list(),
      runRoutine: (id, onStart) => this.routines.runNow(id, onStart),
      routineRuns: (id) => this.routines.runs(id),
      stopRoutineRun: (runId) => this.routines.stop(runId),
      cancelRoutineRequest: (id) => this.routines.cancelRequest(id),
      tabs: () =>
        this.allTabs.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url, active: tab.id === this.activeTabId, working: tab.berryWorking, heldForUser: tab.heldForUser })),
      readTab: (tabId, offset) => {
        const tab = this.allTabs.find(({ id }) => id === tabId);
        return tab ? readTabText(tab, offset) : Promise.resolve(`There is no web page in tab ${tabId}.`);
      },
      searchHistory: (query, limit) => this.history.search({ query, limit }).entries,
      recentHistory: (limit) => this.history.recent(limit),
      bookmarks: () => ({ bookmarks: this.bookmarkStore.get(), pinned: this.pinnedStore.get() }),
      facts: () => this.mascotStore.all().flatMap(({ id }) => this.memory.factsOf(id)),
      clean: (text) => this.chats.withoutCodes(text),
    }));
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
    // The bird on the desktop says so instead, and it isn't one more thing to clear.
    if (!this.userIsBusyOrHere && !this.settings.desktopBerry) {
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
    this.desktopBerry.libraryChanged(snapshot);
  }

  private mascotName(mascotId: string): string {
    const mascot = this.mascotStore.resolve(mascotId);
    return mascot.id === BERRY.id && !this.settings.showBerry ? "Assistant" : mascot.name;
  }

  get librarySnapshot(): LibrarySnapshot {
    return {
      pinned: this.pinnedStore.get(),
      bookmarks: this.bookmarkStore.get(),
      chats: this.chatStore.summaries().map((chat) => ({ ...chat, running: this.chats.isRunning(chat.id), cloud: this.chats.inCloud(chat.id) })),
      routines: this.routines.list(),
      mascots: this.mascotStore.all(),
      needsYou: this.needsYou,
      memory: this.memory.state,
    };
  }

  // The active web tab. Internal pages have no page for Berry to read.
  private get windowShowing(): boolean {
    return !this._baseWindow.isDestroyed() && this._baseWindow.isVisible() && !this._baseWindow.isMinimized();
  }

  get activeTab(): Tab | null {
    const entry = this.activeEntry;
    return entry instanceof Tab ? entry : null;
  }

  private isChatInFront(chatId: string): boolean {
    const entry = this.activeEntry;
    return (entry instanceof InternalTab && entry.page === "chat" && entry.param === chatId) || this.panelChatShowing === chatId;
  }

  // Null while the panel is closed or has no place, as on the new tab.
  private get panelChatShowing(): string | null {
    return this.chatOpen && this.chatAvailable ? this.panelChatId : null;
  }

  private seePanelChat(): void {
    const chatId = this.panelChatShowing;
    if (chatId) this.chats.markSeen(chatId);
  }

  panelShows(chatId: string | null): void {
    this.panelChatId = chatId;
    this.seePanelChat();
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
      jobChatId: this.chats.jobChatOf(tab.id),
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      zoomPercent: tab instanceof Tab ? this.siteZoom.percent(tab.url) : 100,
      page: tab instanceof InternalTab ? tab.page : null,
      pageParam: tab instanceof InternalTab ? tab.param : null,
      trouble: tab.trouble,
      loadError: tab.loadError,
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
  createTab(url: string, popup?: Popup): Tab;
  createTab(url?: string): BrowserTab;
  createTab(url?: string, popup?: Popup): BrowserTab {
    if (!url) return this.openPage("new-tab");
    const tab = this.createWebTab(`tab-${++this.tabCounter}`, url, undefined, popup);
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
    // A cloud tab's page went with the session.
    if (saved.page === "cloud") return null;
    const chat = saved.page === "chat" && saved.param ? this.chatStore.summaries().find(({ id: chatId }) => chatId === saved.param) : null;
    if (saved.page === "chat" && saved.param && !chat) return null;
    this.tabsMap.set(id, new InternalTab(id, saved.page, saved.param, chat?.title ?? saved.title));
    return id;
  }

  private get currentSession(): Session | null {
    if (this.settings.onStartup !== "restore") return null;
    const { width, height } = this.windowSize;
    // A chat's or routine's own tabs last as long as its work, so they aren't the user's to get back.
    const entries = this.entries.filter((tab) => !this.backgroundTabs.has(tab.id) && !(tab instanceof InternalTab && tab.page === "cloud"));
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

  private createBackgroundTab(url: string, popup?: Popup): Tab {
    const id = `tab-${++this.tabCounter}`;
    this.backgroundTabs.add(id);
    const tab = this.createWebTab(id, url, undefined, popup);
    // Berry never makes a sound. Going to the tab turns it back on.
    tab.webContents.setAudioMuted(true);
    this.tabsMap.set(tab.id, tab);
    this.notifyTabs();
    return tab;
  }

  // Sites to offer in Settings > Cloud > Signed in to, from history and bookmarks. Names only.
  cloudLoginSuggestions(): string[] {
    const urls = [...this.history.recent(500), ...this.bookmarkStore.get(), ...this.pinnedStore.get()].map(({ url }) => url);
    return suggestLoginSites(urls, this.cloud.state.logins.map(({ site }) => site));
  }

  // A page in the cloud browser, shown by the chrome. Opened behind the user, like any tab a job opens.
  private openCloudTab(title: string): string {
    const id = `tab-${++this.tabCounter}`;
    this.tabsMap.set(id, new InternalTab(id, "cloud", id, title));
    this.notifyTabs();
    return id;
  }

  openPage(page: InternalPage, options: { param?: string; title?: string } = {}): BrowserTab {
    // Only a job opens one, with a page behind it.
    if (page === "cloud") return this.openPage("new-tab");
    const param = options.param ?? null;
    // A chat only starts from the new tab page, so a chat tab always has a chat.
    if (page === "chat" && param === null) return this.openPage("new-tab");
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

    // The chat's own title, whoever asked, or the tab says "Chat" until the thread next changes.
    const chatTitle = page === "chat" && param ? this.chatStore.chat(param)?.title : undefined;
    const tab = new InternalTab(`tab-${++this.tabCounter}`, page, param, chatTitle ?? options.title);
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
      this.recordings.addressBarUsed(tabId);
      await entry.loadURL(url);
      return true;
    }

    this.recordings.addressBarUsed(tabId);
    // A cloud tab goes there in the cloud, and the user typing an address has taken it from the job.
    if (entry instanceof InternalTab && entry.page === "cloud") {
      const page = this.cloud.page(tabId);
      if (!page) return false;
      this.cloud.takeOver(tabId);
      await page.loadURL(url).catch(() => {});
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

  private createWebTab(tabId: string, url: string, restored?: SavedWebTab, popup?: Popup): Tab {
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
        onStoppedLeaving: () => {
          if (this._baseWindow.isDestroyed()) return;
          if (tab) this.placeTab(tab, this.layout);
          this.workViews.sync();
        },
        actorOptions: () => ({
          on: this.settings.birdOnPages,
          plain: !this.settings.showBerry,
          still: this.settings.keepBerryStill || systemPreferences.getAnimationSettings().prefersReducedMotion,
          look: this.mascotStore.resolve(tab?.workingMascotId ?? null).look,
          dark: nativeTheme.shouldUseDarkColors,
          windowShowing: this.windowShowing,
        }),
        onClosedByPage: () => this.closedByPage(tabId, popup?.opener.id),
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
            recording: () => this.recordings.isRecording,
            startRecording: () => void this.recordings.start(),
            stopRecording: () => void this.recordings.stop(),
            assistantName: () => (this.settings.showBerry ? "Berry" : "Assistant"),
          });
        },
      },
      restored,
      popup
    );
    return tab;
  }

  // A full disk or a damaged file shouldn't get in the way of browsing.
  private saveVisit(tabId: string, save: () => void): void {
    if (this.backgroundTabs.has(tabId) || this.unvisitedTabs.has(tabId)) return;
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

  private get browserData() {
    return browserDataFor(process.platform, {
      appData: app.getPath("appData"),
      localAppData: process.env.LOCALAPPDATA,
      home: app.getPath("home"),
      programFiles: [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]],
      override: process.env.BLUEBERRY_BROWSER_DATA,
      packaged: app.isPackaged,
    });
  }

  // Each browser with the icon of its app as installed here, read by the system, never fetched.
  importSources(): Promise<ImportSource[]> {
    return findBrowsers(this.browserData, async (file) => {
      const icon = await app.getFileIcon(file, { size: "normal" });
      return icon.isEmpty() ? null : icon.toDataURL();
    });
  }

  async importHistory(sourceId: string): Promise<HistoryImportResult> {
    const visits = await readBrowserHistory(this.browserData, sourceId);
    if (!visits) return { ok: false };
    try {
      const added = this.history.importVisits(visits);
      this.firstJobDone("history");
      if (added > 0) {
        this.suggestions.historyImported();
        this.publishSuggestions();
      }
      return { ok: true, added };
    } catch (error) {
      console.error("Failed to save imported history:", (error as Error).message);
      return { ok: false };
    }
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

    // Leaving the review is the same as throwing it away, so a trail never outlasts the page showing it.
    if (tab instanceof InternalTab && tab.page === "recording") this.recordings.discard();
    const isCloud = tab instanceof InternalTab && tab.page === "cloud";
    if (isCloud) this.cloud.tabClosed(tabId);
    if (remember && !isCloud && !(tab instanceof InternalTab && tab.page === "recording")) this.closedTabs.push(this.tabInfo(tab));
    if (tab instanceof Tab && tab.existingView) this._baseWindow.contentView.removeChildView(tab.existingView);
    tab.destroy();
    this.tabsMap.delete(tabId);
    this.backgroundTabs.delete(tabId);
    this.unvisitedTabs.delete(tabId);
    this.chats.tabClosed(tabId);
    this.workViews.sync();

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
    this.addressSuggestions.close();
    // Opening anything from Chats or a card is done with it, even the tab already in front.
    this.closePopover(false);
    this.activeTabId = tabId;
    if (tab instanceof InternalTab && tab.page === "chat" && tab.param) this.chats.markSeen(tab.param);
    this.seePanelChat();
    if (tab instanceof Tab) tab.webContents.setAudioMuted(false);
    const unvisited = this.unvisitedTabs.delete(tabId);
    if ((this.backgroundTabs.delete(tabId) || unvisited) && tab instanceof Tab) {
      this.saveVisit(tabId, () => this.history.record(tab.url, tab.title, tab.favicon));
    }
    this.syncTabViews();
    this.workViews.sync();
    this.notifyTabs();
    this.updateAllBounds();
    this.desktopBerry.sync();

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
    if (result.ok) this.mascotsChanged();
    return result;
  }

  async addFromGallery(galleryId: string, version: string, name: string | null): Promise<MascotSaveResult> {
    const result = this.gallery.add(galleryId, version, name);
    if (result.ok) this.mascotsChanged();
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
    this.memory.clear(id);
    runs.forEach((routine) => this.routines.setPaused(routine.id, true));
    this.mascotsChanged();
    return true;
  }

  private mascotsChanged(): void {
    this.broadcast("library:updated", this.librarySnapshot);
    void this.runnerJobs.flockChanged();
    // A bird's limits go with its routines in the cloud.
    void this.runnerJobs.routinesChanged();
  }

  async confirmClearMemory(mascotId: string): Promise<boolean> {
    const count = this.memory.factsOf(mascotId).length;
    if (count === 0 || !(await confirmClearMemory(this._baseWindow, this.mascotName(mascotId), count))) return false;
    this.memory.clear(mascotId);
    return true;
  }

  // A favourite is a bookmark kept on top, so the star counts both, and taking it off takes the site away from both.
  toggleBookmark(): void {
    const tab = this.activeTab;
    if (!tab) return;
    const saved = this.bookmarkStore.has(tab.url) || this.pinnedStore.has(tab.url);
    this.saveBookmarks(() => {
      if (!saved) return this.bookmarkStore.add(tab.url, tab.title, tab.favicon);
      this.bookmarkStore.removeUrl(tab.url);
      this.pinnedStore.removeUrl(tab.url);
    });
  }

  keepOnTop(): void {
    const tab = this.activeTab;
    if (!tab || this.pinnedStore.has(tab.url)) return;
    const saved = this.bookmarkStore.get().find((bookmark) => bookmark.url === tab.url);
    if (saved) this.placeSavedSite(saved.id, "favourites", this.pinnedStore.get().length);
    else this.saveBookmarks(() => this.pinnedStore.add(tab.url, tab.title, tab.favicon));
  }

  // A saved site lives in one list or the other: on top as a tile, or in the bookmarks.
  placeSavedSite(id: string, list: SavedSiteList, index: number): void {
    const site = [...this.pinnedStore.get(), ...this.bookmarkStore.get()].find((candidate) => candidate.id === id);
    if (!site) return;
    const [into, outOf] = list === "favourites" ? [this.pinnedStore, this.bookmarkStore] : [this.bookmarkStore, this.pinnedStore];
    this.saveBookmarks(() => {
      into.place(site, index);
      outOf.removeUrl(site.url);
    });
  }

  showBookmarkMenu(id: string): void {
    const pin = this.pinnedStore.get().find((candidate) => candidate.id === id);
    const site = pin ?? this.bookmarkStore.get().find((candidate) => candidate.id === id);
    if (!site) return;
    Menu.buildFromTemplate([
      pin
        ? { label: "Move to Bookmarks", click: () => this.placeSavedSite(id, "bookmarks", 0) }
        : { label: "Keep on Top", click: () => this.placeSavedSite(id, "favourites", this.pinnedStore.get().length) },
      {
        label: "Remove Bookmark",
        click: () => this.saveBookmarks(() => {
          this.bookmarkStore.removeUrl(site.url);
          this.pinnedStore.removeUrl(site.url);
        }),
      },
    ]).popup({ window: this._baseWindow });
  }

  private saveBookmarks(save: () => void): void {
    try {
      save();
      this.broadcast("library:updated", this.librarySnapshot);
      // The horizontal layout's bookmarks bar comes and goes with what's saved.
      this.updateAllBounds();
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

  // The system's own dialog, for the prompt box's A file. The paths stay here.
  private async pickFiles(): Promise<string[]> {
    const { canceled, filePaths } = await dialog.showOpenDialog(this._baseWindow, { properties: ["openFile", "multiSelections"] });
    return canceled ? [] : filePaths;
  }

  async chooseDownloadFolder(): Promise<void> {
    const { canceled, filePaths } = await dialog.showOpenDialog(this._baseWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (!canceled && filePaths[0]) this.updateSettings({ downloadFolder: filePaths[0] });
  }

  // The window has no menu bar off a Mac, so the menu button opens the same menu, just under itself.
  showAppMenu(): void {
    const { menuButton } = this.layout;
    if (menuButton.width === 0) return;
    Menu.getApplicationMenu()?.popup({ window: this._baseWindow, x: menuButton.x, y: menuButton.y + menuButton.height });
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

  // A web tab goes back in its history. Settings and the mascots' page go back from a page one step in.
  goBack(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (tab instanceof Tab) tab.goBack();
    else if (tab instanceof InternalTab && tab.canGoBack) {
      tab.goBack();
      this.notifyTabs();
    }
    return tab !== undefined;
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

  // A row of First jobs on the new tab, done by what really happened.
  firstJobDone(job: FirstJob): void {
    const done = this.settings.firstJobsDone;
    if (!done.includes(job)) this.updateSettings({ firstJobsDone: [...done, job] });
  }

  // A message the user sent from Blueberry's own composer: a first job, and meeting Plain Words if it's the one asked.
  sentFromChrome({ mascotId }: ChatThread): void {
    this.firstJobDone("try");
    if (mascotId && this.mascotStore.find(mascotId)?.galleryId === PLAIN_WORDS) this.firstJobDone("meet");
  }

  // The service's own page for making a key. During the first run there are no tabs to show it in, so it opens in the
  // system's browser, where the user is likely signed in to the service already.
  findKey(service: unknown): void {
    if (!isAiService(service)) return;
    if (this.settings.onboarded) this.createTab(KEY_PAGES[service]);
    else void shell.openExternal(KEY_PAGES[service]);
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
    if (after.relayOnMac !== before.relayOnMac) this.macJobs.sync();
    this.desktopBerry.sync(after.desktopBerry && !before.desktopBerry);

    this.broadcast("settings:updated", after);
    this.updateAllBounds();
    return after;
  }

  resizePanel(panel: ResizablePanel, width: number): void {
    if (panel === "sidebar") this.updateSettings({ sidebarWidth: width });
    else if (panel === "chat") this.updateSettings({ chatWidth: width });
  }

  // Chats or a mascot's card, opened from the horizontal toolbar. A tab's view covers the chrome, so they're drawn in the
  // overlay view, which takes everything under the toolbar's own row: a press anywhere in it outside the panel closes it.
  openPopover(request: unknown): void {
    const area = this.layout.popover;
    const popover = validPopover(request);
    if (area.width === 0 || !popover) return;
    this.hideFloatingSidebar();
    this.popover = popover;
    // Adding a view again moves it to the top, above tabs opened since.
    this._baseWindow.contentView.addChildView(this.overlay.view);
    this.overlay.view.setBounds(area);
    this.overlay.view.setVisible(true);
    this.overlay.view.webContents.focus();
    this.broadcast("overlay:popover", { shown: popover, refocus: false });
  }

  // With `refocus`, the keyboard goes back to what opened it, as after Escape.
  closePopover(refocus: boolean): void {
    if (!this.popover) return;
    this.popover = null;
    this.overlay.view.setVisible(false);
    if (refocus) this.chrome.view.webContents.focus();
    this.broadcast("overlay:popover", { shown: null, refocus });
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
    this.seePanelChat();
    this.updateAllBounds();
    this.saveSessionSoon();
  }

  // Pages in the history for the address field's suggestions. Only the chrome asks, and only while the field is edited.
  suggestHistory(text: unknown): VisitedPage[] {
    if (typeof text !== "string") return [];
    return this.history.suggest(text.slice(0, MAX_SUGGEST_TEXT));
  }

  showAddressSuggestions(request: unknown): void {
    const { width, height } = this._baseWindow.getContentBounds();
    this.addressSuggestions.show(request, { width, height });
  }

  // A row pressed in the list goes back to the chrome, which acts on it as it would on Enter. The press took the keyboard
  // to the list's view, so it comes back first.
  pickAddressSuggestion(index: unknown): void {
    const row = this.addressSuggestions.pick(index);
    if (!row) return;
    this.chrome.view.webContents.focus();
    sendToRenderer(this.chrome.view.webContents, "address:picked", row);
  }

  focusAddressBar(): void {
    this.chrome.view.webContents.focus();
    sendToRenderer(this.chrome.view.webContents, "toolbar:focus-address", null);
  }

  show(): void {
    this._baseWindow.show();
  }

  // Hiding the whole app takes the bird with it, and showing the bird again brings everything back. So while it's out
  // on the desktop, Hide Blueberry hides this window alone.
  hideBlueberry(): void {
    if (!this.settings.desktopBerry) return app.hide();
    this._baseWindow.hide();
    this.desktopBerry.mainWindowGone();
  }

  // A `blueberry://mascot/<id>` link, from any website, already checked to be only an id. It shows that Gallery entry,
  // fetched again, and nothing more: adding it still takes Add. The event is for a Gallery already showing this param.
  openMascotLink(id: string): void {
    const { open, forward } = this.linkThrottle(id);
    if (!open) return;
    if (forward) this.bringForward();
    this.openPage("mascot-gallery", { param: id });
    sendToRenderer(this.chrome.view.webContents, "gallery:linked", id);
  }

  // The user pressed something outside Blueberry to come here, so this one time it may take the front.
  bringForward(): void {
    if (this._baseWindow.isMinimized()) this._baseWindow.restore();
    if (process.platform === "darwin") app.show();
    this._baseWindow.show();
    app.focus({ steal: true });
    this._baseWindow.focus();
  }

  // The chrome's own bird, on the screen, or the middle of the window if it isn't drawing one right now.
  private async birdOnScreen(): Promise<{ x: number; y: number }> {
    const { x, y, width, height } = this._baseWindow.getContentBounds();
    const middle = { x: x + width / 2, y: y + height / 2 };
    const asked = this.chrome.view.webContents
      .executeJavaScript(
        `(() => {
          const drawn = [...document.querySelectorAll("[data-berry-perched] svg")].map((bird) => bird.getBoundingClientRect()).find(({ width }) => width > 0);
          return drawn ? { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height / 2 } : null;
        })()`
      )
      .catch(() => null) as Promise<{ x: number; y: number } | null>;
    const inChrome = await Promise.race([asked, new Promise<null>((resolve) => setTimeout(() => resolve(null), TAKE_OFF_ASK_MS))]);
    return inChrome ? { x: x + inChrome.x, y: y + inChrome.y } : middle;
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
        savedSites: this.pinnedStore.get().length + this.bookmarkStore.get().length > 0,
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
    if (layout.popover.width === 0) this.closePopover(false);
    else if (this.popover) this.overlay.view.setBounds(layout.popover);
    this.findBar.setBounds(layout.findBar);
    this.broadcast("layout:updated", layout);
    this.permissionPrompt.sync();
  }

  private notifyTabs(): void {
    this.recordings.sync();
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
    this.addressSuggestions.notifyTheme(this.theme);
    this.desktopBerry.notifyTheme();
    sendToRenderer(this.permissionPrompt.chrome.view.webContents, "theme:updated", this.theme);
  }

  private broadcast<C extends keyof EventChannels>(channel: C, payload: EventChannels[C]): void {
    sendToRenderer(this.chrome.view.webContents, channel, payload);
    sendToRenderer(this.overlay.view.webContents, channel, payload);
  }
}

// What a renderer asked to open, checked: a known kind, a mascot named by a string, and a rect of finite numbers.
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validPopover = (input: unknown): Popover | null => {
  const { kind, mascotId, anchor } = (input ?? {}) as { kind?: unknown; mascotId?: unknown; anchor?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } };
  const { x, y, width, height } = anchor ?? {};
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) return null;
  const rect = { x, y, width, height };
  if (kind === "chats") return { kind: "chats", anchor: rect };
  if (kind === "mascot" && typeof mascotId === "string") return { kind: "mascot", mascotId, anchor: rect };
  if (kind === "account") return { kind: "account", anchor: rect };
  return null;
};
