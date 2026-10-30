import type { ChromeAPI } from "../shared/ipc";

declare global {
  interface Window {
    chromeAPI: ChromeAPI;
  }
}

export {};
