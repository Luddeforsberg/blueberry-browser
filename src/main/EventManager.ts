import { ipcMain } from "electron";
import type { Window } from "./Window";
import type { Tab } from "./Tab";
import { CHANNEL_REGIONS, isTrustedSender, type ChromeEndpoint } from "./ipc";
import type { ChromeRegion, InvokeChannel, InvokeChannels } from "../shared/ipc";

type Result<C extends InvokeChannel> =
  | InvokeChannels[C]["result"]
  | Promise<InvokeChannels[C]["result"]>;

export class EventManager {
  private mainWindow: Window;
  private handledChannels: string[] = [];

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.handleTabEvents();
    this.handleLayoutEvents();
    this.handleThemeEvents();
    this.handleChatEvents();
  }

  private get endpoints(): Record<ChromeRegion, ChromeEndpoint> {
    const endpoint = ({ view, url }: { view: { webContents: ChromeEndpoint["webContents"] }; url: string }) => ({
      webContents: view.webContents,
      url,
    });
    return {
      chrome: endpoint(this.mainWindow.chromeView),
      overlay: endpoint(this.mainWindow.overlayView),
    };
  }

  private handle<C extends InvokeChannel>(
    channel: C,
    listener: (...args: InvokeChannels[C]["args"]) => Result<C>
  ): void {
    ipcMain.handle(channel, (event, ...args) => {
      const endpoints = this.endpoints;
      if (!CHANNEL_REGIONS[channel].some((region) => isTrustedSender(event, endpoints[region]))) {
        throw new Error(`Rejected ${channel} from ${event.senderFrame?.url ?? "an unknown frame"}`);
      }
      return listener(...(args as InvokeChannels[C]["args"]));
    });
    this.handledChannels.push(channel);
  }

  private withTab(tabId: string, action: (tab: Tab) => unknown): boolean {
    const tab = this.mainWindow.getTab(tabId);
    if (!tab) return false;
    action(tab);
    return true;
  }

  private handleTabEvents(): void {
    this.handle("tabs:list", () => this.mainWindow.tabInfos);

    this.handle("tabs:create", (url) =>
      this.mainWindow.tabInfo(this.mainWindow.createTab(url))
    );

    this.handle("tabs:close", (tabId) => this.mainWindow.closeTab(tabId));

    this.handle("tabs:switch", (tabId) => this.mainWindow.switchActiveTab(tabId));

    this.handle("tabs:move", (tabId, toIndex) => this.mainWindow.moveTab(tabId, toIndex));

    this.handle("tabs:move-by", (tabId, delta) => this.mainWindow.moveTabBy(tabId, delta));

    this.handle("tabs:open-page", (page, options) =>
      this.mainWindow.tabInfo(this.mainWindow.openPage(page, options))
    );

    this.handle("tab:navigate", (tabId, url) => this.mainWindow.navigateTab(tabId, url));

    this.handle("history:recent", () => this.mainWindow.recentVisits);

    this.handle("tab:back", (tabId) => this.withTab(tabId, (tab) => tab.goBack()));

    this.handle("tab:forward", (tabId) => this.withTab(tabId, (tab) => tab.goForward()));

    this.handle("tab:reload", (tabId) => this.withTab(tabId, (tab) => tab.reload()));

    this.handle("tab:stop", (tabId) => this.withTab(tabId, (tab) => tab.stop()));
  }

  private handleLayoutEvents(): void {
    this.handle("layout:get", () => this.mainWindow.layout);

    this.handle("layout:toggle-sidebar", () => this.mainWindow.toggleSidebar());

    this.handle("layout:toggle-chat", () => this.mainWindow.toggleChat());

    this.handle("layout:resize", (panel, width) => this.mainWindow.resizePanel(panel, width));

    this.handle("overlay:show-sidebar", () => this.mainWindow.showFloatingSidebar());

    this.handle("overlay:hide", () => this.mainWindow.hideFloatingSidebar());
  }

  private handleThemeEvents(): void {
    this.handle("theme:get", () => this.mainWindow.theme);

    this.handle("library:get", () => this.mainWindow.librarySnapshot);

    this.handle("bookmarks:toggle", () => this.mainWindow.toggleBookmark());

    this.handle("bookmarks:menu", (id) => this.mainWindow.showBookmarkMenu(id));

    this.handle("library:chat", (chatId) => this.mainWindow.chats.thread(chatId));

    this.handle("settings:get", () => this.mainWindow.settings);

    this.handle("settings:update", (patch) => this.mainWindow.updateSettings(patch));
  }

  private handleChatEvents(): void {
    this.handle("chat:send", (chatId, text, options) =>
      typeof text === "string" ? this.mainWindow.chats.send(chatId, text, options) : null
    );

    this.handle("chat:stop", (chatId) => this.mainWindow.chats.stop(chatId));

    this.handle("chat:rename", (chatId, title) =>
      typeof title === "string" ? this.mainWindow.chats.rename(chatId, title) : false
    );

    this.handle("chat:menu", (chatId) => this.mainWindow.showChatMenu(chatId));

    this.handle("chat:page-access", () => this.mainWindow.chats.canSeePage);

    this.handle("chat:set-page-access", (enabled) => this.mainWindow.chats.setPageAccess(enabled));

    this.handle("berry:context-menu", () => this.mainWindow.showBerryMenu());

    this.handle("page:text", async () => {
      const tab = this.mainWindow.activeTab;
      if (!tab) return null;
      try {
        return await tab.getTabText();
      } catch (error) {
        console.error("Error getting page text:", error);
        return null;
      }
    });
  }

  public cleanup(): void {
    this.handledChannels.forEach((channel) => ipcMain.removeHandler(channel));
  }
}
