import { app, dialog, nativeTheme, type BaseWindow } from "electron";
import type { MenuView } from "../menus/MenuView";
import type { TabPreviews } from "../tabs/TabPreviews";
import type { SiteZoom } from "../settings/siteZoom";
import type { PermissionPromptView } from "../settings/PermissionPromptView";
import { Attachments } from "../chats/Attachments";
import type { Recordings } from "../recordings/Recordings";
import type { Phone } from "../phone/Phone";
import type { Routines } from "../routines/Routines";
import { linkThrottle } from "../mascots/mascotLink";
import type { DesktopBerry } from "../desktop/DesktopBerry";
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
import { listenToAiKey, createPhone } from "./makeAccount";
import { createWorkViews } from "./makeChats";
import { createMacJobs } from "./makeCloud";
import { createRecordings, createRoutines } from "./makeRoutines";
import { createDesktopBerry } from "./makeDesktop";
import { windowMcpTools } from "./makeMcp";
import type { McpTool } from "../mcp/mcpTools";
import type { AppServices } from "../app/AppServices";
import type { AppStores } from "../app/appStores";
import { startWindow } from "./windowLifecycle";
import { galleryParam } from "../../shared/galleryPlaces";
import { iconMascotId } from "../../shared/appIcon";
import type { EventChannels, Settings, ThemeState } from "../../shared/ipc";

// Everything the window is made of: its `BaseWindow` and the views stacked in it, the parts that do the window's work,
// each in a file of its own, and what works only through its tabs. `Window` owns one, and each part is handed it to
// reach the others, so the tabs, the panels and the views each have one owner. What outlives the window, the stores and
// the app's services, it reaches through `app`, and never makes its own (see `AppServices`).
export class WindowParts {
  readonly stores: AppStores;
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
  readonly phone: Phone;
  readonly workViews: WorkViews;
  readonly recordings: Recordings;
  // Files added to a prompt box, kept in main until they're sent or let go.
  readonly attachments = new Attachments(() => this.pickFiles(), preparePicture);
  readonly routines: Routines;
  readonly permissionPrompt: PermissionPromptView;
  readonly desktopBerry: DesktopBerry;
  // What apps over MCP can do in this window, for the app's MCP server while it's open.
  readonly mcpTools: () => McpTool[];
  readonly macJobs: MacJobs;
  readonly appIcon: AppIcon;

  constructor(readonly app: AppServices) {
    this.stores = app.stores;
    const { stores } = this;
    const { settingsStore, mascotStore, sessionStore } = stores;
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
    const restored = settingsStore.get().onStartup === "restore" ? sessionStore.load() : null;

    this.baseWindow = createBaseWindow(restored, this.settings.layoutMode, this.glassSupported);

    this.appIcon = new AppIcon(app.folder, this.baseWindow, () => ({
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
    this.permissionPrompt = createPermissionPrompt(this, stores.sitePermissions);
    const stopWatching = watchDownloads(this, stores.downloads, stores.sitePermissions);

    listenToAiKey(this);
    this.phone = createPhone(this);
    this.workViews = createWorkViews(this);
    this.routines = createRoutines(this);
    this.recordings = createRecordings(this);
    this.desktopBerry = createDesktopBerry(this, stores);
    this.mcpTools = windowMcpTools(this, stores);
    this.macJobs = createMacJobs(this);

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
