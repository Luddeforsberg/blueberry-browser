import type { WebContents } from "electron";
import { Tab } from "../tabs/Tab";
import { InternalTab } from "../tabs/InternalTab";
import type { SavedTab } from "../tabs/Session";
import { withTabAt } from "./tabOrder";
import type { InternalPage, TabInfo } from "../../shared/ipc";
import type { ChatThread } from "../../shared/library";
import type { WindowParts, WindowStores } from "./WindowParts";

export type BrowserTab = Tab | InternalTab;

// A page opened by another with `window.open`, and the tab that opened it.
export type Popup = { page: WebContents; opener: Tab };

// Only one of these pages is open at a time, so opening it again switches to it.
const SINGLE_INSTANCE_PAGES: InternalPage[] = [
  "routines",
  "settings",
  "downloads",
  "history",
  "mascots",
  "mascot-gallery",
  "needs-you",
  "recording",
];

// The window's tabs: which are open, in what order and which is in front, and opening, moving and closing them. Nothing
// else holds the list, so everything reads it through here.
export class TabStrip {
  private tabsMap: Map<string, BrowserTab> = new Map();
  private activeTabId: string | null = null;
  private tabCounter: number = 0;
  // For Reopen Closed Tab, newest last.
  closedTabs: TabInfo[] = [];
  // Tabs Berry opened behind the chat. Where it goes in them isn't the user's history until they go there too.
  private readonly backgroundTabs = new Set<string>();
  // Tabs a job opened that became the user's before they went there. Saved with the session, and kept out of history
  // until they do, like a background tab.
  private readonly unvisitedTabs = new Set<string>();

  constructor(
    private readonly w: WindowParts,
    private readonly stores: WindowStores,
  ) {}

  get activeId(): string | null {
    return this.activeTabId;
  }

  get activeEntry(): BrowserTab | null {
    return (this.activeTabId && this.tabsMap.get(this.activeTabId)) || null;
  }

  // The active web tab. Internal pages have no page for Berry to read.
  get activeTab(): Tab | null {
    const entry = this.activeEntry;
    return entry instanceof Tab ? entry : null;
  }

  get allTabs(): Tab[] {
    return this.entries.filter((tab): tab is Tab => tab instanceof Tab);
  }

  get entries(): BrowserTab[] {
    return Array.from(this.tabsMap.values());
  }

  get tabCount(): number {
    return this.tabsMap.size;
  }

  get tabInfos(): TabInfo[] {
    return this.entries.map((tab) => this.tabInfo(tab));
  }

  find(tabId: string): BrowserTab | undefined {
    return this.tabsMap.get(tabId);
  }

  has(tabId: string): boolean {
    return this.tabsMap.has(tabId);
  }

  isBackground(tabId: string): boolean {
    return this.backgroundTabs.has(tabId);
  }

  getTab(tabId: string): Tab | null {
    const tab = this.tabsMap.get(tabId);
    return tab instanceof Tab ? tab : null;
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
      jobChatId: this.w.chats.jobChatOf(tab.id),
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      zoomPercent: tab instanceof Tab ? this.w.siteZoom.percent(tab.url) : 100,
      page: tab instanceof InternalTab ? tab.page : null,
      pageParam: tab instanceof InternalTab ? tab.param : null,
      trouble: tab.trouble,
      loadError: tab.loadError,
    };
  }

  // With no address, a tab opens on the new tab page.
  createTab(url: string, popup?: Popup): Tab;
  createTab(url?: string, popup?: Popup): BrowserTab;
  createTab(url?: string, popup?: Popup): BrowserTab {
    if (!url) return this.openPage("new-tab");
    const tab = this.w.webTabs.createWebTab(`tab-${++this.tabCounter}`, url, undefined, popup);
    this.tabsMap.set(tab.id, tab);
    this.switchActiveTab(tab.id);
    return tab;
  }

  // A web tab waits to load until it's first needed. A chat may have been deleted since, so it has no tab.
  restoreTab(saved: SavedTab): string | null {
    const id = `tab-${++this.tabCounter}`;
    if ("url" in saved) {
      this.tabsMap.set(id, this.w.webTabs.createWebTab(id, saved.url, saved));
      return id;
    }
    // A cloud tab's page went with the session.
    if (saved.page === "cloud") return null;
    const chat =
      saved.page === "chat" && saved.param ? this.stores.chatStore.summaries().find(({ id: chatId }) => chatId === saved.param) : null;
    if (saved.page === "chat" && saved.param && !chat) return null;
    this.tabsMap.set(id, new InternalTab(id, saved.page, saved.param, chat?.title ?? saved.title));
    return id;
  }

  createBackgroundTab(url: string, popup?: Popup): Tab {
    const id = `tab-${++this.tabCounter}`;
    this.backgroundTabs.add(id);
    const tab = this.w.webTabs.createWebTab(id, url, undefined, popup);
    // Berry never makes a sound. Going to the tab turns it back on.
    tab.webContents.setAudioMuted(true);
    this.tabsMap.set(tab.id, tab);
    this.notifyTabs();
    return tab;
  }

  // Saved with the session from now on, like any other tab of theirs.
  giveToUser(tabId: string): void {
    if (!this.backgroundTabs.delete(tabId)) return;
    this.unvisitedTabs.add(tabId);
    this.w.session.saveSessionSoon();
  }

  // A page in the cloud browser, shown by the chrome. Opened behind the user, like any tab a job opens.
  openCloudTab(title: string): string {
    const id = `tab-${++this.tabCounter}`;
    this.tabsMap.set(id, new InternalTab(id, "cloud", id, title));
    this.notifyTabs();
    return id;
  }

  openPage(page: InternalPage, options: { param?: string | undefined; title?: string } = {}): BrowserTab {
    // Only a job opens one, with a page behind it.
    if (page === "cloud") return this.openPage("new-tab");
    const param = options.param ?? null;
    // A chat only starts from the new tab page, so a chat tab always has a chat.
    if (page === "chat" && param === null) return this.openPage("new-tab");
    const existing = this.entries.find(
      (tab) =>
        tab instanceof InternalTab &&
        tab.page === page &&
        (SINGLE_INSTANCE_PAGES.includes(page) || (param !== null && tab.param === param)),
    );
    if (existing) {
      // A one-of-a-kind page can be asked to show something else, such as the item a notification was about.
      if (existing instanceof InternalTab && param !== null) existing.param = param;
      this.switchActiveTab(existing.id);
      return existing;
    }

    // The chat's own title, whoever asked, or the tab says "Chat" until the thread next changes.
    const chatTitle = page === "chat" && param ? this.stores.chatStore.chat(param)?.title : undefined;
    const tab = new InternalTab(`tab-${++this.tabCounter}`, page, param, chatTitle ?? options.title);
    // A job's tabs go under its chat, even one it opened before the chat's own tab opened.
    const firstOfJob = this.entries.findIndex((entry) => page === "chat" && this.w.chats.jobChatOf(entry.id) === param);
    this.tabsMap = withTabAt(this.tabsMap, tab, firstOfJob === -1 ? this.tabCount : firstOfJob);
    this.switchActiveTab(tab.id);
    return tab;
  }

  // Typing an address on an internal page turns that tab into a web tab, in the same place.
  async navigateTab(tabId: string, url: string): Promise<boolean> {
    const entry = this.tabsMap.get(tabId);
    if (!entry) return false;
    if (entry instanceof Tab) {
      // Only the address bar comes here, so the user has taken this tab from any job that opened it.
      this.w.chats.releaseTab(tabId);
      this.w.recordings.addressBarUsed(tabId);
      await entry.loadURL(url);
      return true;
    }

    this.w.recordings.addressBarUsed(tabId);
    // A cloud tab goes there in the cloud, and the user typing an address has taken it from the job.
    if (entry instanceof InternalTab && entry.page === "cloud") {
      const page = this.w.cloud.page(tabId);
      if (!page) return false;
      this.w.cloud.takeOver(tabId);
      await page.loadURL(url).catch(() => {});
      return true;
    }

    const tab = this.w.webTabs.createWebTab(tabId, url);
    this.tabsMap = new Map(this.entries.map((existing) => [existing.id, existing.id === tabId ? tab : existing]));
    this.syncTabViews();
    this.notifyTabs();
    this.w.panels.updateAllBounds();
    return true;
  }

  // A full disk or a damaged file shouldn't get in the way of browsing.
  saveVisit(tabId: string, save: () => void): void {
    if (this.backgroundTabs.has(tabId) || this.unvisitedTabs.has(tabId)) return;
    try {
      save();
    } catch (error) {
      console.error("Failed to save a visit:", error);
    }
  }

  // History isn't really gone while back buttons, Reopen Closed Tab and the saved session still hold it.
  forgetPages(url?: string): void {
    this.allTabs.forEach((tab) => tab.forget(url));
    this.closedTabs = this.closedTabs.filter((tab) => tab.page !== null || (url !== undefined && tab.url !== url));
    this.notifyTabs();
    this.stores.sessionStore.flush();
  }

  reopenClosedTab(): void {
    const tab = this.closedTabs.pop();
    if (!tab) return;
    if (tab.page) {
      const chat = tab.page === "chat" && tab.pageParam ? this.w.chats.thread(tab.pageParam) : null;
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
    if (tab instanceof InternalTab && tab.page === "recording") this.w.recordings.discard();
    const isCloud = tab instanceof InternalTab && tab.page === "cloud";
    if (isCloud) this.w.cloud.tabClosed(tabId);
    if (remember && !isCloud && !(tab instanceof InternalTab && tab.page === "recording")) this.closedTabs.push(this.tabInfo(tab));
    if (tab instanceof Tab && tab.existingView) this.w.baseWindow.contentView.removeChildView(tab.existingView);
    tab.destroy();
    this.tabsMap.delete(tabId);
    this.w.previews.forget(tabId);
    this.backgroundTabs.delete(tabId);
    this.unvisitedTabs.delete(tabId);
    this.w.chats.tabClosed(tabId);
    this.w.workViews.sync();

    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      const [firstTab] = this.tabsMap.keys();
      if (firstTab !== undefined) {
        this.switchActiveTab(firstTab);
      }
    }

    if (this.tabsMap.size === 0) {
      this.w.baseWindow.close();
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

    if (tabId !== this.activeTabId) this.w.findBar.closeUnlessOn(null);
    this.w.addressSuggestions.close();
    this.w.tooltip.hide();
    this.w.previews.hide();
    this.w.menus.closeMenu();
    const leaving = this.activeTab;
    const left = leaving && tabId !== this.activeTabId;
    // Opening anything from Chats or a card is done with it, even the tab already in front.
    this.w.panels.closePopover(false);
    this.activeTabId = tabId;
    if (tab instanceof InternalTab && tab.page === "chat" && tab.param) this.w.chats.markSeen(tab.param);
    this.w.panels.seePanelChat();
    if (tab instanceof Tab) tab.webContents.setAudioMuted(false);
    const unvisited = this.unvisitedTabs.delete(tabId);
    if ((this.backgroundTabs.delete(tabId) || unvisited) && tab instanceof Tab) {
      this.saveVisit(tabId, () => this.stores.history.record(tab.url, tab.title, tab.favicon));
    }
    this.syncTabViews();
    this.w.workViews.sync();
    this.notifyTabs();
    this.w.panels.updateAllBounds();
    this.w.desktopBerry.sync();
    // How the page looked as the user left it, for its card, taken once it's out of sight and not waited for.
    if (left) void this.w.previews.keep(leaving);

    return true;
  }

  moveTab(tabId: string, toIndex: number): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) return false;
    this.tabsMap = withTabAt(this.tabsMap, tab, toIndex);
    this.notifyTabs();
    return true;
  }

  // Relative to the real order here, because key presses can outrun the order the chrome has drawn.
  moveTabBy(tabId: string, delta: number): boolean {
    return this.moveTab(tabId, this.entries.findIndex((tab) => tab.id === tabId) + delta);
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

  // Only the active web tab shows, and none while onboarding fills the window.
  syncTabViews(): void {
    const { onboarded } = this.w.settings;
    this.allTabs.forEach((tab) => (onboarded && tab.id === this.activeTabId ? tab.show() : tab.hide()));
    this.w.findBar.closeUnlessOn(this.w.pageCommands.findTarget);
  }

  chatTabs(chatId: string): InternalTab[] {
    return this.entries.filter((tab): tab is InternalTab => tab instanceof InternalTab && tab.page === "chat" && tab.param === chatId);
  }

  syncChatTabTitle({ id, title }: ChatThread): void {
    const stale = this.chatTabs(id).filter((tab) => tab.title !== title);
    stale.forEach((tab) => (tab.title = title));
    if (stale.length > 0) this.notifyTabs();
  }

  notifyTabs(): void {
    this.w.recordings.sync();
    const active = this.activeEntry;
    if (active) this.w.baseWindow.setTitle(active.title || "Blueberry Browser");
    this.w.pageCommands.syncMenu();
    this.w.broadcast("tabs:updated", this.tabInfos);
    this.w.session.saveSessionSoon();
  }

  // When the window has closed.
  destroyAll(): void {
    this.tabsMap.forEach((tab) => tab.destroy());
    this.tabsMap.clear();
  }
}
