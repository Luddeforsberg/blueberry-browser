import type { TopBarAPI } from "../shared/ipc";

declare global {
  interface Window {
    topBarAPI: TopBarAPI;
  }
}

export {};
