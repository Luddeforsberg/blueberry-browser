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
    moveTab: (tabId, toIndex) => invoke("tabs:move", tabId, toIndex),
    moveTabBy: (tabId, delta) => invoke("tabs:move-by", tabId, delta),
    navigateTab: (tabId, url) => invoke("tab:navigate", tabId, url),
    goBack: (tabId) => invoke("tab:back", tabId),
    goForward: (tabId) => invoke("tab:forward", tabId),
    reload: (tabId) => invoke("tab:reload", tabId),
    stop: (tabId) => invoke("tab:stop", tabId),
    openPage: (page, options) => invoke("tabs:open-page", page, options),
    getRecent: () => invoke("history:recent"),
    onTabsUpdated: (callback) => subscribe("tabs:updated", callback),
    onFocusAddress: (callback) => subscribe("toolbar:focus-address", () => callback()),
  },
  layout: {
    getLayout: () => invoke("layout:get"),
    toggleSidebar: () => invoke("layout:toggle-sidebar"),
    toggleChat: () => invoke("layout:toggle-chat"),
    resize: (panel, width) => invoke("layout:resize", panel, width),
    showFloatingSidebar: () => invoke("overlay:show-sidebar"),
    hideFloatingSidebar: () => invoke("overlay:hide"),
    onFloatingSidebarVisibility: (callback) => subscribe("overlay:visibility", callback),
    onLayoutUpdated: (callback) => subscribe("layout:updated", callback),
  },
  theme: {
    getTheme: () => invoke("theme:get"),
    onThemeUpdated: (callback) => subscribe("theme:updated", callback),
  },
  settings: {
    getSettings: () => invoke("settings:get"),
    updateSettings: (patch) => invoke("settings:update", patch),
    showBerryMenu: () => invoke("berry:context-menu"),
    onSettingsUpdated: (callback) => subscribe("settings:updated", callback),
  },
  library: {
    getLibrary: () => invoke("library:get"),
    getChat: (chatId) => invoke("library:chat", chatId),
    onLibraryUpdated: (callback) => subscribe("library:updated", callback),
  },
  chat: {
    send: (chatId, text, options) => invoke("chat:send", chatId, text, options),
    stop: (chatId) => invoke("chat:stop", chatId),
    getPageText: () => invoke("page:text"),
    getPageAccess: () => invoke("chat:page-access"),
    setPageAccess: (enabled) => invoke("chat:set-page-access", enabled),
    onChatChunk: (callback) => subscribe("chat:chunk", callback),
    onChatUpdated: (callback) => subscribe("chat:updated", callback),
  },
};

contextBridge.exposeInMainWorld("chromeAPI", chromeAPI);
