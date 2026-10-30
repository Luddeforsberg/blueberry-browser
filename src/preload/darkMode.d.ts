import type { DarkModeAPI } from "../shared/ipc";

declare global {
  interface Window {
    darkModeAPI: DarkModeAPI;
  }
}

export {};
