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
    const { view, url } = this.mainWindow.chromeView;
    return { chrome: { webContents: view.webContents, url } };
  }

  private handle<C extends InvokeChannel>(
    channel: C,
    listener: (...args: InvokeChannels[C]["args"]) => Result<C>
  ): void {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedSender(event, this.endpoints[CHANNEL_REGIONS[channel]])) {
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

    this.handle("tab:navigate", async (tabId, url) => {
      const tab = this.mainWindow.getTab(tabId);
      if (!tab) return false;
      await tab.loadURL(url);
      return true;
    });

    this.handle("tab:back", (tabId) => this.withTab(tabId, (tab) => tab.goBack()));

    this.handle("tab:forward", (tabId) => this.withTab(tabId, (tab) => tab.goForward()));

    this.handle("tab:reload", (tabId) => this.withTab(tabId, (tab) => tab.reload()));

    this.handle("tab:stop", (tabId) => this.withTab(tabId, (tab) => tab.stop()));
  }

  private handleLayoutEvents(): void {
    this.handle("layout:get", () => this.mainWindow.layout);

    this.handle("layout:toggle-sidebar", () => this.mainWindow.toggleSidebar());

    this.handle("layout:toggle-chat", () => this.mainWindow.toggleChat());
  }

  private handleThemeEvents(): void {
    this.handle("theme:get", () => this.mainWindow.theme);

    this.handle("theme:toggle-dark", () => this.mainWindow.toggleDarkMode());
  }

  private handleChatEvents(): void {
    this.handle("chat:send", (request) => this.mainWindow.chat.sendChatMessage(request));

    this.handle("chat:clear", () => this.mainWindow.chat.clearMessages());

    this.handle("chat:messages", () => this.mainWindow.chat.getMessages());

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
