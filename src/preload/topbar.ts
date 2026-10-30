import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  DarkModeAPI,
  EventChannels,
  InvokeChannel,
  InvokeChannels,
  SendChannels,
  TopBarAPI,
} from "../shared/ipc";

// Repeated in each preload, because a sandboxed preload can't require a shared chunk.
const invoke = <C extends InvokeChannel>(
  channel: C,
  ...args: InvokeChannels[C]["args"]
): Promise<InvokeChannels[C]["result"]> => ipcRenderer.invoke(channel, ...args);

const send = <C extends keyof SendChannels>(channel: C, ...args: SendChannels[C]) =>
  ipcRenderer.send(channel, ...args);

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

const darkModeAPI: DarkModeAPI = {
  notifyChanged: (isDarkMode) => send("theme:dark-changed", isDarkMode),
  onUpdated: (callback) => subscribe("theme:dark-updated", callback),
};

const topBarAPI: TopBarAPI = {
  getTabs: () => invoke("tabs:list"),
  createTab: (url) => invoke("tabs:create", url),
  closeTab: (tabId) => invoke("tabs:close", tabId),
  switchTab: (tabId) => invoke("tabs:switch", tabId),
  navigateTab: (tabId, url) => invoke("tab:navigate", tabId, url),
  goBack: (tabId) => invoke("tab:back", tabId),
  goForward: (tabId) => invoke("tab:forward", tabId),
  reload: (tabId) => invoke("tab:reload", tabId),
  toggleSidebar: () => invoke("sidebar:toggle"),
};

contextBridge.exposeInMainWorld("darkModeAPI", darkModeAPI);
contextBridge.exposeInMainWorld("topBarAPI", topBarAPI);
