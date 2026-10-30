import { ipcRenderer, type IpcRendererEvent } from "electron";

export const darkModeAPI = {
  notifyChanged: (isDarkMode: boolean) =>
    ipcRenderer.send("dark-mode-changed", isDarkMode),

  onUpdated: (callback: (isDarkMode: boolean) => void) => {
    const listener = (_: IpcRendererEvent, isDarkMode: boolean) =>
      callback(isDarkMode);
    ipcRenderer.on("dark-mode-updated", listener);
    return () => ipcRenderer.removeListener("dark-mode-updated", listener);
  },
};
