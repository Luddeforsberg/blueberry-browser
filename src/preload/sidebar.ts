import { contextBridge, ipcRenderer } from "electron";
import { darkModeAPI } from "./darkMode";

interface ChatRequest {
  message: string;
  context: {
    url: string | null;
    content: string | null;
    text: string | null;
  };
  messageId: string;
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

// Sidebar specific APIs
const sidebarAPI = {
  // Chat functionality
  sendChatMessage: (request: Partial<ChatRequest>) =>
    ipcRenderer.invoke("sidebar-chat-message", request),

  clearChat: () => ipcRenderer.invoke("sidebar-clear-chat"),

  getMessages: () => ipcRenderer.invoke("sidebar-get-messages"),

  onChatResponse: (callback: (data: ChatResponse) => void) => {
    ipcRenderer.on("chat-response", (_, data) => callback(data));
  },

  onMessagesUpdated: (callback: (messages: unknown[]) => void) => {
    ipcRenderer.on("chat-messages-updated", (_, messages) =>
      callback(messages)
    );
  },

  removeChatResponseListener: () => {
    ipcRenderer.removeAllListeners("chat-response");
  },

  removeMessagesUpdatedListener: () => {
    ipcRenderer.removeAllListeners("chat-messages-updated");
  },

  // Page content access
  getPageContent: () => ipcRenderer.invoke("get-page-content"),
  getPageText: () => ipcRenderer.invoke("get-page-text"),
  getCurrentUrl: () => ipcRenderer.invoke("get-current-url"),

  // Tab information
  getActiveTabInfo: () => ipcRenderer.invoke("get-active-tab-info"),
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("darkModeAPI", darkModeAPI);
    contextBridge.exposeInMainWorld("sidebarAPI", sidebarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.darkModeAPI = darkModeAPI;
  // @ts-ignore (define in dts)
  window.sidebarAPI = sidebarAPI;
}
