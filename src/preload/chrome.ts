import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { ChromeAPI, EventChannels, InvokeChannel, InvokeChannels } from "../shared/ipc";

const invoke = <C extends InvokeChannel>(
  channel: C,
  ...args: InvokeChannels[C]["args"]
): Promise<InvokeChannels[C]["result"]> => ipcRenderer.invoke(channel, ...args);

const subscribe = <C extends keyof EventChannels>(
  channel: C,
  callback: (payload: EventChannels[C]) => void
) => {
  const listener = (_: IpcRendererEvent, payload: EventChannels[C]) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const chromeAPI: ChromeAPI = {
  browser: {
    getTabs: () => invoke("tabs:list"),
    createTab: (url) => invoke("tabs:create", url),
    closeTab: (tabId) => invoke("tabs:close", tabId),
    switchTab: (tabId) => invoke("tabs:switch", tabId),
    navigateTab: (tabId, url) => invoke("tab:navigate", tabId, url),
    goBack: (tabId) => invoke("tab:back", tabId),
    goForward: (tabId) => invoke("tab:forward", tabId),
    reload: (tabId) => invoke("tab:reload", tabId),
    stop: (tabId) => invoke("tab:stop", tabId),
    onTabsUpdated: (callback) => subscribe("tabs:updated", callback),
    onFocusAddress: (callback) => subscribe("toolbar:focus-address", () => callback()),
  },
  layout: {
    getLayout: () => invoke("layout:get"),
    toggleSidebar: () => invoke("layout:toggle-sidebar"),
    toggleChat: () => invoke("layout:toggle-chat"),
    onLayoutUpdated: (callback) => subscribe("layout:updated", callback),
  },
  theme: {
    getTheme: () => invoke("theme:get"),
    toggleDark: () => invoke("theme:toggle-dark"),
    onThemeUpdated: (callback) => subscribe("theme:updated", callback),
  },
  chat: {
    sendChatMessage: (request) => invoke("chat:send", request),
    clearChat: () => invoke("chat:clear"),
    getMessages: () => invoke("chat:messages"),
    getPageText: () => invoke("page:text"),
    onChatChunk: (callback) => subscribe("chat:chunk", callback),
    onMessagesUpdated: (callback) => subscribe("chat:messages-updated", callback),
  },
};

contextBridge.exposeInMainWorld("chromeAPI", chromeAPI);
