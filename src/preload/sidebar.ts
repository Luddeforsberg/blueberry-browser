import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  DarkModeAPI,
  EventChannels,
  InvokeChannel,
  InvokeChannels,
  SendChannels,
  SidebarAPI,
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

const sidebarAPI: SidebarAPI = {
  sendChatMessage: (request) => invoke("chat:send", request),
  clearChat: () => invoke("chat:clear"),
  getMessages: () => invoke("chat:messages"),
  getPageText: () => invoke("page:text"),
  onChatChunk: (callback) => subscribe("chat:chunk", callback),
  onMessagesUpdated: (callback) => subscribe("chat:messages-updated", callback),
};

contextBridge.exposeInMainWorld("darkModeAPI", darkModeAPI);
contextBridge.exposeInMainWorld("sidebarAPI", sidebarAPI);
