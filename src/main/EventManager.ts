import { ipcMain } from "electron";
import type { Window } from "./Window";
import type { Tab } from "./Tab";
import {
  CHANNEL_REGIONS,
  findTrustedRegion,
  isTrustedSender,
  sendToRenderer,
  type ChromeEndpoint,
} from "./ipc";
import type {
  ChromeRegion,
  InvokeChannel,
  InvokeChannels,
  SendChannels,
  TabInfo,
} from "../shared/ipc";

type Result<C extends InvokeChannel> =
  | InvokeChannels[C]["result"]
  | Promise<InvokeChannels[C]["result"]>;

export class EventManager {
  private mainWindow: Window;
  private handledChannels: string[] = [];
  private listenedChannels: string[] = [];

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.setupEventHandlers();
  }

  private get endpoints(): Record<ChromeRegion, ChromeEndpoint> {
    return {
      topbar: {
        webContents: this.mainWindow.topBar.view.webContents,
        url: this.mainWindow.topBar.url,
      },
      sidebar: {
        webContents: this.mainWindow.sidebar.view.webContents,
        url: this.mainWindow.sidebar.url,
      },
    };
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

  private on<C extends keyof SendChannels>(
    channel: C,
    listener: (from: ChromeRegion, ...args: SendChannels[C]) => void
  ): void {
    ipcMain.on(channel, (event, ...args) => {
      const from = findTrustedRegion(event, this.endpoints);
      if (!from) {
        console.warn(`Rejected ${channel} from ${event.senderFrame?.url ?? "an unknown frame"}`);
        return;
      }
      listener(from, ...(args as SendChannels[C]));
    });
    this.listenedChannels.push(channel);
  }

  private setupEventHandlers(): void {
    this.handleTabEvents();
    this.handleSidebarEvents();
    this.handleDarkModeEvents();
  }

  private withTab(tabId: string, action: (tab: Tab) => unknown): boolean {
    const tab = this.mainWindow.getTab(tabId);
    if (!tab) return false;
    action(tab);
    return true;
  }

  private tabInfo(tab: Tab): TabInfo {
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favicon: tab.favicon,
      isActive: this.mainWindow.activeTab?.id === tab.id,
    };
  }

  private handleTabEvents(): void {
    this.handle("tabs:list", () =>
      this.mainWindow.allTabs.map((tab) => this.tabInfo(tab))
    );

    this.handle("tabs:create", (url) => this.tabInfo(this.mainWindow.createTab(url)));

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
  }

  private handleSidebarEvents(): void {
    this.handle("sidebar:toggle", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
    });

    this.handle("chat:send", (request) =>
      this.mainWindow.sidebar.client.sendChatMessage(request)
    );

    this.handle("chat:clear", () => this.mainWindow.sidebar.client.clearMessages());

    this.handle("chat:messages", () => this.mainWindow.sidebar.client.getMessages());

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

  private handleDarkModeEvents(): void {
    this.on("theme:dark-changed", (from, isDarkMode) => {
      const endpoints = this.endpoints;
      (Object.keys(endpoints) as ChromeRegion[])
        .filter((region) => region !== from)
        .forEach((region) =>
          sendToRenderer(endpoints[region].webContents, "theme:dark-updated", isDarkMode)
        );
    });
  }

  public cleanup(): void {
    this.handledChannels.forEach((channel) => ipcMain.removeHandler(channel));
    this.listenedChannels.forEach((channel) => ipcMain.removeAllListeners(channel));
  }
}
