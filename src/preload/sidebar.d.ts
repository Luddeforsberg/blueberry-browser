import type { SidebarAPI } from "../shared/ipc";

declare global {
  interface Window {
    sidebarAPI: SidebarAPI;
  }
}

export {};
