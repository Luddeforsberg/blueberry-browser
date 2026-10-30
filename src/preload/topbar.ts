import { contextBridge, ipcRenderer } from "electron";
import { darkModeAPI } from "./darkMode";

// TopBar specific APIs
const topBarAPI = {
  // Tab management
  createTab: (url?: string) =>
    ipcRenderer.invoke("create-tab", url),
  closeTab: (tabId: string) =>
    ipcRenderer.invoke("close-tab", tabId),
  switchTab: (tabId: string) =>
    ipcRenderer.invoke("switch-tab", tabId),
  getTabs: () => ipcRenderer.invoke("get-tabs"),

  // Tab navigation
  navigateTab: (tabId: string, url: string) =>
    ipcRenderer.invoke("navigate-tab", tabId, url),
  goBack: (tabId: string) =>
    ipcRenderer.invoke("tab-go-back", tabId),
  goForward: (tabId: string) =>
    ipcRenderer.invoke("tab-go-forward", tabId),
  reload: (tabId: string) =>
    ipcRenderer.invoke("tab-reload", tabId),

  // Tab actions
  tabScreenshot: (tabId: string) =>
    ipcRenderer.invoke("tab-screenshot", tabId),

  // Sidebar
  toggleSidebar: () =>
    ipcRenderer.invoke("toggle-sidebar"),
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("darkModeAPI", darkModeAPI);
    contextBridge.exposeInMainWorld("topBarAPI", topBarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.darkModeAPI = darkModeAPI;
  // @ts-ignore (define in dts)
  window.topBarAPI = topBarAPI;
}

