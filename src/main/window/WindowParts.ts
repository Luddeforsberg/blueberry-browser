import { app, dialog, nativeTheme, type BaseWindow } from "electron";
import type { MenuView } from "../menus/MenuView";
import type { TabPreviews } from "../tabs/TabPreviews";
import type { SessionStore } from "../tabs/Session";
import type { SettingsStore } from "../settings/SettingsStore";
import type { SiteZoom } from "../settings/siteZoom";
import type { SitePermissions } from "../settings/SitePermissions";
import type { PermissionPromptView } from "../settings/PermissionPromptView";
import type { AiKey } from "../settings/AiKey";
import type { BookmarkStore } from "../library/BookmarkStore";
import type { HistoryStore } from "../library/HistoryStore";
import type { Downloads } from "../library/Downloads";
import type { ChatStore } from "../chats/ChatStore";
import type { Chats } from "../chats/Chats";
import { Attachments } from "../chats/Attachments";
import type { Recordings } from "../recordings/Recordings";
import type { Phone } from "../phone/Phone";
import type { TelegramChannel } from "../phone/TelegramChannel";
import type { RoutineStore } from "../routines/RoutineStore";
import type { Routines } from "../routines/Routines";
import type { MascotStore } from "../mascots/MascotStore";
import type { Gallery } from "../mascots/Gallery";
import { linkThrottle } from "../mascots/mascotLink";
import type { Account } from "../account/Account";
import { GalleryServer, serverConfig } from "../account/galleryServer";
import type { Suggestions } from "../suggestions/Suggestions";
import type { MemoryStore } from "../memory/MemoryStore";
import type { DesktopBerry } from "../desktop/DesktopBerry";
import type { McpConnector } from "../mcp/McpConnector";
import type { CloudTabs } from "../cloud/CloudTabs";
import type { RunnerJobs } from "../remoteJobs/RunnerJobs";
import type { MacJobs } from "../remoteJobs/MacJobs";
import { createChromeView, type ChromeView } from "./chromeView";
import { FindBar } from "./FindBar";
import { AddressSuggestions } from "./AddressSuggestions";
import { TooltipView } from "./TooltipView";
import type { WorkViews } from "./WorkViews";
import { preparePicture } from "./pictures";
import { AppIcon } from "./AppIcon";
import { sendToRenderer } from "./ipc";
import { createBaseWindow, supportsGlass } from "./windowFrame";
import { TabStrip } from "./TabStrip";
import { WebTabs } from "./WebTabs";
import { Panels } from "./Panels";
import { WindowSession } from "./WindowSession";
import { LibraryUpdates } from "./LibraryUpdates";
import { WindowMenus } from "./WindowMenus";
import { SavedSites } from "./SavedSites";
import { BrowsingHistory } from "./BrowsingHistory";
import { SettingsChanges } from "./SettingsChanges";
import { PageCommands } from "./PageCommands";
import { createMenuView, createPermissionPrompt, createPreviews, createSiteZoom, watchDownloads } from "./makeViews";
import { createAccount, createAiKey, createGallery, createPhone, createTelegram } from "./makeAccount";
import { createChats, createMemory, createWorkViews } from "./makeChats";
import { createCloud, createMacJobs, createRunnerJobs } from "./makeCloud";
import { createRecordings, createRoutines, createSuggestions } from "./makeRoutines";
import { createDesktopBerry } from "./makeDesktop";
import { createMcp } from "./makeMcp";
import { startWindow } from "./windowLifecycle";
import { galleryParam } from "../../shared/galleryPlaces";
import { iconMascotId } from "../../shared/appIcon";
import type { EventChannels, Settings, ThemeState } from "../../shared/ipc";

// What the window's parts read and write, handed to each of them.
export interface WindowStores {
  settingsStore: SettingsStore;
  chatStore: ChatStore;
  bookmarkStore: BookmarkStore;
  pinnedStore: BookmarkStore;
  mascotStore: MascotStore;
  history: HistoryStore;
  sessionStore: SessionStore;
}

// Everything the window is made of: its `BaseWindow` and the views stacked in it, the services wired to them, and the
// parts that do the window's work, each in a file of its own. `Window` owns one, and each part is handed it to reach the
// others, so the tabs, the panels and the views each have one owner.
export class WindowParts {
  readonly baseWindow: BaseWindow;
  readonly chromeView: ChromeView;
  readonly overlayView: ChromeView;
  readonly tabs: TabStrip;
  readonly webTabs: WebTabs;
  readonly panels: Panels;
  readonly session: WindowSession;
  readonly library: LibraryUpdates;
  readonly windowMenus: WindowMenus;
  readonly savedSites: SavedSites;
  readonly browsing: BrowsingHistory;
  readonly settingsChanges: SettingsChanges;
  readonly pageCommands: PageCommands;
  readonly findBar: FindBar;
  readonly addressSuggestions: AddressSuggestions;
  readonly tooltip: TooltipView;
  readonly previews: TabPreviews;
  // Our menus and Asking first, over everything else in the window.
  readonly menus: MenuView;
  readonly siteZoom: SiteZoom;
  private readonly glassSupported = supportsGlass();
  // `blueberry://mascot/` links come from any page, so a flood of them can't keep taking the front.
  private readonly linkThrottle = linkThrottle();
  readonly telegram: TelegramChannel;
  readonly account: Account;
  readonly aiKey: AiKey;
  readonly gallery: Gallery;
  readonly phone: Phone;
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
  readonly macJobs: MacJobs;
  readonly appIcon: AppIcon;

  constructor(
    readonly stores: WindowStores,
    routineStore: RoutineStore,
    downloads: Downloads,
    sitePermissions: SitePermissions,
  ) {
    const { settingsStore, bookmarkStore, pinnedStore, mascotStore, sessionStore } = stores;
    this.tabs = new TabStrip(this, stores);
    this.webTabs = new WebTabs(this, stores);
    this.panels = new Panels(this, stores);
    this.session = new WindowSession(this, stores);
    this.library = new LibraryUpdates(this, stores);
    this.windowMenus = new WindowMenus(this, stores);
    this.savedSites = new SavedSites(this, stores);
    this.browsing = new BrowsingHistory(this, stores);
    this.settingsChanges = new SettingsChanges(this, stores);
    this.pageCommands = new PageCommands(this);
    nativeTheme.themeSource = settingsStore.get().appearance;
    // Before a site could only be in one list, it could be saved both ways. It stays on top.
    try {
      for (const pin of pinnedStore.get()) bookmarkStore.removeUrl(pin.url);
    } catch (error) {
      console.error("Failed to tidy saved sites:", error);
    }
    const restored = settingsStore.get().onStartup === "restore" ? sessionStore.load() : null;

    this.baseWindow = createBaseWindow(restored, this.settings.layoutMode, this.glassSupported);

    this.appIcon = new AppIcon(app.getPath("userData"), this.baseWindow, () => ({
      mascotId: iconMascotId(this.settings.appIconMascotId, mascotStore.all()),
      ground: this.settings.appIconGround,
    }));
    this.chromeView = createChromeView("chrome");
    this.baseWindow.contentView.addChildView(this.chromeView.view);
    this.webTabs.openLinksInTabs(this.chromeView.view.webContents);

    this.overlayView = createChromeView("overlay");
    this.overlayView.view.setVisible(false);
    this.baseWindow.contentView.addChildView(this.overlayView.view);
    this.webTabs.openLinksInTabs(this.overlayView.view.webContents);

    this.findBar = new FindBar(this.baseWindow.contentView);
    this.webTabs.openLinksInTabs(this.findBar.chromeView.view.webContents);
    this.addressSuggestions = new AddressSuggestions(this.baseWindow.contentView);
    this.webTabs.openLinksInTabs(this.addressSuggestions.chromeView.view.webContents);
    this.tooltip = new TooltipView(this.baseWindow.contentView);
    this.webTabs.openLinksInTabs(this.tooltip.chromeView.view.webContents);
    this.previews = createPreviews(this, stores);
    this.webTabs.openLinksInTabs(this.previews.chromeView.view.webContents);
    this.menus = createMenuView(this);
    this.siteZoom = createSiteZoom(this);
    this.permissionPrompt = createPermissionPrompt(this, sitePermissions);
    const stopWatching = watchDownloads(this, downloads, sitePermissions);

    const config = serverConfig(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, app.isPackaged);
    const server = config && new GalleryServer(config);
    this.account = createAccount(this, server);
    this.aiKey = createAiKey(this);
    this.gallery = createGallery(this, server, stores);
    this.telegram = createTelegram(this);
    this.phone = createPhone(this);
    this.memory = createMemory(this);
    this.cloud = createCloud(this);
    this.cloud.start();
    this.runnerJobs = createRunnerJobs(this, server, stores);
    this.chats = createChats(this, stores);
    this.workViews = createWorkViews(this);
    this.routines = createRoutines(this, routineStore);
    this.recordings = createRecordings(this);
    this.suggestions = createSuggestions(this, stores);
    this.desktopBerry = createDesktopBerry(this, stores);
    this.mcp = createMcp(this, stores);
    this.macJobs = createMacJobs(this, server);

    startWindow(this, stores, restored, stopWatching);
  }

  get settings(): Settings {
    return this.stores.settingsStore.get();
  }

  get theme(): ThemeState {
    return {
      isDark: nativeTheme.shouldUseDarkColors,
      glass: this.glassSupported && !nativeTheme.prefersReducedTransparency,
      platform: process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "other",
    };
  }

  get windowShowing(): boolean {
    return !this.baseWindow.isDestroyed() && this.baseWindow.isVisible() && !this.baseWindow.isMinimized();
  }

  // The system's own dialog, for the prompt box's A file. The paths stay here.
  private async pickFiles(): Promise<string[]> {
    const { canceled, filePaths } = await dialog.showOpenDialog(this.baseWindow, { properties: ["openFile", "multiSelections"] });
    return canceled ? [] : filePaths;
  }

  show(): void {
    this.baseWindow.show();
  }

  // Hiding the whole app takes the mascot with it, and showing the mascot again brings everything back. So while it's out
  // on the desktop, Hide Blueberry hides this window alone.
  hideBlueberry(): void {
    if (!this.settings.desktopBerry) return app.hide();
    this.baseWindow.hide();
    this.desktopBerry.mainWindowGone();
  }

  // A `blueberry://mascot/<id>` link, from any website, already checked to be only an id. It shows that Gallery entry,
  // fetched again, and nothing more: adding it still takes Add. The event is for a Gallery already showing this param.
  openMascotLink(id: string): void {
    const { open, forward } = this.linkThrottle(id);
    if (!open) return;
    if (forward) this.bringForward();
    this.tabs.openPage("mascot-gallery", { param: galleryParam({ page: "linked", id }) });
    sendToRenderer(this.chromeView.view.webContents, "gallery:linked", id);
  }

  // The user pressed something outside Blueberry to come here, so this one time it may take the front.
  bringForward(): void {
    if (this.baseWindow.isMinimized()) this.baseWindow.restore();
    if (process.platform === "darwin") app.show();
    this.baseWindow.show();
    app.focus({ steal: true });
    this.baseWindow.focus();
  }

  close(): void {
    this.baseWindow.close();
  }

  focus(): void {
    this.baseWindow.focus();
  }

  broadcast<C extends keyof EventChannels>(channel: C, payload: EventChannels[C]): void {
    sendToRenderer(this.chromeView.view.webContents, channel, payload);
    sendToRenderer(this.overlayView.view.webContents, channel, payload);
  }
}
