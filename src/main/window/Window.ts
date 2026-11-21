import type { BaseWindow } from "electron";
import type { MenuView } from "../menus/MenuView";
import { appMenuItems } from "../menus/Menu";
import type { Tab } from "../tabs/Tab";
import type { TabPreviews } from "../tabs/TabPreviews";
import type { SiteZoom } from "../settings/siteZoom";
import type { SitePermissions } from "../settings/SitePermissions";
import type { PermissionPromptView } from "../settings/PermissionPromptView";
import type { AiKey } from "../settings/AiKey";
import type { Downloads } from "../library/Downloads";
import type { Chats } from "../chats/Chats";
import type { Attachments } from "../chats/Attachments";
import type { Recordings } from "../recordings/Recordings";
import type { TelegramChannel } from "../phone/TelegramChannel";
import type { Routines } from "../routines/Routines";
import type { Gallery } from "../mascots/Gallery";
import type { Account } from "../account/Account";
import type { Suggestions } from "../suggestions/Suggestions";
import type { MemoryStore } from "../memory/MemoryStore";
import type { DesktopBerry } from "../desktop/DesktopBerry";
import type { McpConnector } from "../mcp/McpConnector";
import type { CloudTabs } from "../cloud/CloudTabs";
import type { RunnerJobs } from "../remoteJobs/RunnerJobs";
import type { ChromeView } from "./chromeView";
import type { FindBar } from "./FindBar";
import type { AddressSuggestions } from "./AddressSuggestions";
import type { TooltipView } from "./TooltipView";
import type { WorkViews } from "./WorkViews";
import type { AppIcon } from "./AppIcon";
import type { Layout } from "./Layout";
import { isMac } from "./windowFrame";
import type { BrowserTab, Popup } from "./TabStrip";
import { WindowParts } from "./WindowParts";
import { cloudLoginSuggestions } from "../app/makeCloud";
import type { AppServices } from "../app/AppServices";
import type { FirstJob } from "../../shared/firstRun";
import type {
  ChromeRegion,
  HistoryCursor,
  HistoryImportResult,
  HistoryPage,
  ImportSource,
  InternalPage,
  MascotSaveResult,
  ResizablePanel,
  Settings,
  TabInfo,
  ThemeState,
  Visit,
  VisitedPage,
} from "../../shared/ipc";
import type { ChatThread, LibrarySnapshot, PublishResult, SavedSiteList } from "../../shared/library";

export { HORIZONTAL_TABS_MENU_ID } from "./SettingsChanges";
export { WEB_PAGE_MENU_IDS } from "./PageCommands";

// The window as callers see it: each method hands the call to a part in `WindowParts`, which never come through here.
export class Window {
  private readonly parts: WindowParts;
  constructor(app: AppServices) {
    this.parts = new WindowParts(app);
  }

  get downloads(): Downloads {
    return this.parts.stores.downloads;
  }
  get sitePermissions(): SitePermissions {
    return this.parts.stores.sitePermissions;
  }

  // The window itself, its views and what's wired to them.
  get window(): BaseWindow {
    return this.parts.baseWindow;
  }
  get baseWindow(): BaseWindow {
    return this.parts.baseWindow;
  }
  get chromeView(): ChromeView {
    return this.parts.chromeView;
  }
  get overlayView(): ChromeView {
    return this.parts.overlayView;
  }
  get findBar(): FindBar {
    return this.parts.findBar;
  }
  get addressSuggestions(): AddressSuggestions {
    return this.parts.addressSuggestions;
  }
  get tooltip(): TooltipView {
    return this.parts.tooltip;
  }
  get previews(): TabPreviews {
    return this.parts.previews;
  }
  get menus(): MenuView {
    return this.parts.menus;
  }
  get siteZoom(): SiteZoom {
    return this.parts.siteZoom;
  }
  get permissionPrompt(): PermissionPromptView {
    return this.parts.permissionPrompt;
  }
  get appIcon(): AppIcon {
    return this.parts.appIcon;
  }
  get telegram(): TelegramChannel {
    return this.parts.app.telegram;
  }
  get account(): Account {
    return this.parts.app.account;
  }
  get aiKey(): AiKey {
    return this.parts.stores.aiKey;
  }
  get gallery(): Gallery {
    return this.parts.app.gallery;
  }
  get chats(): Chats {
    return this.parts.app.chats;
  }
  get workViews(): WorkViews {
    return this.parts.workViews;
  }
  get recordings(): Recordings {
    return this.parts.recordings;
  }
  get attachments(): Attachments {
    return this.parts.attachments;
  }
  get routines(): Routines {
    return this.parts.routines;
  }
  get suggestions(): Suggestions {
    return this.parts.app.suggestions;
  }
  get desktopBerry(): DesktopBerry {
    return this.parts.desktopBerry;
  }
  get memory(): MemoryStore {
    return this.parts.app.memory;
  }
  get mcp(): McpConnector {
    return this.parts.app.mcp;
  }
  get cloud(): CloudTabs {
    return this.parts.app.cloud;
  }
  get runnerJobs(): RunnerJobs {
    return this.parts.app.runnerJobs;
  }
  get settings(): Settings {
    return this.parts.settings;
  }
  get theme(): ThemeState {
    return this.parts.theme;
  }
  show(): void {
    this.parts.show();
  }
  hideBlueberry(): void {
    this.parts.hideBlueberry();
  }
  openMascotLink(id: string): void {
    this.parts.openMascotLink(id);
  }
  bringForward(): void {
    this.parts.bringForward();
  }
  close(): void {
    this.parts.close();
  }
  focus(): void {
    this.parts.focus();
  }

  // The tabs.
  get activeTab(): Tab | null {
    return this.parts.tabs.activeTab;
  }
  get activeEntry(): BrowserTab | null {
    return this.parts.tabs.activeEntry;
  }
  get allTabs(): Tab[] {
    return this.parts.tabs.allTabs;
  }
  get tabCount(): number {
    return this.parts.tabs.tabCount;
  }
  get tabInfos(): TabInfo[] {
    return this.parts.tabs.tabInfos;
  }
  tabInfo(tab: BrowserTab): TabInfo {
    return this.parts.tabs.tabInfo(tab);
  }
  getTab(tabId: string): Tab | null {
    return this.parts.tabs.getTab(tabId);
  }
  createTab(url: string, popup?: Popup): Tab;
  createTab(url?: string): BrowserTab;
  createTab(url?: string, popup?: Popup): BrowserTab {
    return this.parts.tabs.createTab(url, popup);
  }
  openPage(page: InternalPage, options: { param?: string | undefined; title?: string } = {}): BrowserTab {
    return this.parts.tabs.openPage(page, options);
  }
  navigateTab(tabId: string, url: string): Promise<boolean> {
    return this.parts.tabs.navigateTab(tabId, url);
  }
  reopenClosedTab(): void {
    this.parts.tabs.reopenClosedTab();
  }
  closeTab(tabId: string, remember = true): boolean {
    return this.parts.tabs.closeTab(tabId, remember);
  }
  switchActiveTab(tabId: string): boolean {
    return this.parts.tabs.switchActiveTab(tabId);
  }
  moveTab(tabId: string, toIndex: number): boolean {
    return this.parts.tabs.moveTab(tabId, toIndex);
  }
  moveTabBy(tabId: string, delta: number): boolean {
    return this.parts.tabs.moveTabBy(tabId, delta);
  }
  goBack(tabId: string): boolean {
    return this.parts.tabs.goBack(tabId);
  }

  // The panels around the page and where everything goes.
  get layout(): Layout {
    return this.parts.panels.layout;
  }
  updateAllBounds(): void {
    this.parts.panels.updateAllBounds();
  }
  panelShows(chatId: string | null): void {
    this.parts.panels.panelShows(chatId);
  }
  toggleSidebar(): void {
    this.parts.panels.toggleSidebar();
  }
  toggleChat(): void {
    this.parts.panels.toggleChat();
  }
  openPopover(request: unknown): void {
    this.parts.panels.openPopover(request);
  }
  closePopover(refocus: boolean): void {
    this.parts.panels.closePopover(refocus);
  }
  showFloatingSidebar(): void {
    this.parts.panels.showFloatingSidebar();
  }
  hideFloatingSidebar(): void {
    this.parts.panels.hideFloatingSidebar();
  }

  // What the sidebar and pages show, and the questions asked before deleting from it.
  get librarySnapshot(): LibrarySnapshot {
    return this.parts.library.librarySnapshot;
  }
  saveMascot(id: string | null, draft: unknown): MascotSaveResult {
    return this.parts.library.saveMascot(id, draft);
  }
  addFromGallery(galleryId: string, version: string, name: string | null): Promise<MascotSaveResult> {
    return this.parts.library.addFromGallery(galleryId, version, name);
  }
  confirmUnpublish(id: string): Promise<PublishResult> {
    return this.parts.windowMenus.confirmUnpublish(id);
  }
  confirmDeleteMascot(id: string): Promise<boolean> {
    return this.parts.windowMenus.confirmDeleteMascot(id);
  }
  confirmClearMemory(mascotId: string): Promise<boolean> {
    return this.parts.windowMenus.confirmClearMemory(mascotId);
  }
  confirmDeleteRoutine(id: string): Promise<boolean> {
    return this.parts.windowMenus.confirmDeleteRoutine(id);
  }
  showChatMenu(chatId: string, anchor: unknown, from: ChromeRegion): Promise<"rename" | null> {
    return this.parts.windowMenus.showChatMenu(chatId, anchor, from);
  }
  showBerryMenu(anchor: unknown): void {
    this.parts.windowMenus.showBerryMenu(anchor);
  }
  notice(question: string, detail: string): Promise<void> {
    return this.parts.windowMenus.notice(question, detail);
  }
  toggleBookmark(): void {
    this.parts.savedSites.toggleBookmark();
  }
  keepOnTop(): void {
    this.parts.savedSites.keepOnTop();
  }
  placeSavedSite(id: string, list: SavedSiteList, index: number): void {
    this.parts.savedSites.placeSavedSite(id, list, index);
  }
  showBookmarkMenu(id: string, anchor: unknown, from: ChromeRegion): Promise<void> {
    return this.parts.savedSites.showBookmarkMenu(id, anchor, from);
  }

  // The window has no menu bar off a Mac, so the menu button opens the same menu, just under itself, read again so it
  // says what's true now.
  showAppMenu(): void {
    const { menuButton } = this.layout;
    if (menuButton.width === 0) return;
    const items = appMenuItems(this, () => this);
    this.menus.open(items, menuButton, { label: "Menu", mac: isMac() });
  }

  // History.
  get recentVisits(): Visit[] {
    return this.parts.stores.history.recent();
  }
  searchHistory(options: { query?: string; before?: HistoryCursor | undefined }): HistoryPage {
    return this.parts.browsing.searchHistory(options);
  }
  deleteHistoryEntry(id: number): boolean {
    return this.parts.browsing.deleteHistoryEntry(id);
  }
  importSources(): Promise<ImportSource[]> {
    return this.parts.browsing.importSources();
  }
  importHistory(sourceId: string): Promise<HistoryImportResult> {
    return this.parts.browsing.importHistory(sourceId);
  }
  clearHistory(): Promise<boolean> {
    return this.parts.browsing.clearHistory();
  }
  suggestHistory(text: unknown): VisitedPage[] {
    return this.parts.browsing.suggestHistory(text);
  }
  cloudLoginSuggestions(): string[] {
    return cloudLoginSuggestions(this.parts.stores, this.parts.app.cloud);
  }

  // Settings, and the First jobs they keep.
  updateSettings(patch: Partial<Settings>): Settings {
    return this.parts.settingsChanges.updateSettings(patch);
  }
  resizePanel(panel: ResizablePanel, width: number): void {
    this.parts.settingsChanges.resizePanel(panel, width);
  }
  chooseDownloadFolder(): Promise<void> {
    return this.parts.settingsChanges.chooseDownloadFolder();
  }
  firstJobDone(job: FirstJob): void {
    this.parts.settingsChanges.firstJobDone(job);
  }
  sentFromChrome(thread: ChatThread): void {
    this.parts.settingsChanges.sentFromChrome(thread);
  }
  findKey(service: unknown): void {
    this.parts.settingsChanges.findKey(service);
  }

  // Commands for what's in front.
  openFindBar(): void {
    this.parts.pageCommands.openFindBar();
  }
  findStep(forward: boolean): void {
    this.parts.pageCommands.findStep(forward);
  }
  zoomActiveTab(direction: 1 | -1): void {
    this.parts.pageCommands.zoomActiveTab(direction);
  }
  resetActiveTabZoom(): void {
    this.parts.pageCommands.resetActiveTabZoom();
  }
  printActiveTab(): void {
    this.parts.pageCommands.printActiveTab();
  }
  syncMenu(): void {
    this.parts.pageCommands.syncMenu();
  }
  showAddressSuggestions(request: unknown): void {
    this.parts.pageCommands.showAddressSuggestions(request);
  }
  showTooltip(request: unknown): void {
    this.parts.pageCommands.showTooltip(request);
  }
  pickAddressSuggestion(listId: unknown, index: unknown): void {
    this.parts.pageCommands.pickAddressSuggestion(listId, index);
  }
  focusAddressBar(): void {
    this.parts.pageCommands.focusAddressBar();
  }
}
