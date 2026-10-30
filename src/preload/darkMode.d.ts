interface DarkModeAPI {
  notifyChanged: (isDarkMode: boolean) => void;
  onUpdated: (callback: (isDarkMode: boolean) => void) => () => void;
}

declare global {
  interface Window {
    darkModeAPI: DarkModeAPI;
  }
}

export {};
