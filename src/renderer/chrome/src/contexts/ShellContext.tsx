import React, { useEffect } from "react";
import type { Layout, Settings, ThemeState } from "@shared/ipc";
import { StillContext } from "@common/components/motion";
import { ShellContext, type ShellContextType } from "./useShell";
import { useFromMain } from "@common/lib/latest";

// Layout, theme and settings all come from main, which owns the window.
export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const api = window.chromeAPI;
  const [layout] = useFromMain<Layout | null>(null, api.layout.getLayout, api.layout.onLayoutUpdated);
  const [theme] = useFromMain<ThemeState | null>(null, api.theme.getTheme, api.theme.onThemeUpdated);
  const [settings] = useFromMain<Settings | null>(null, api.settings.getSettings, api.settings.onSettingsUpdated);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme?.isDark ?? false);
  }, [theme?.isDark]);

  if (!layout || !theme || !settings) return null;

  const value: ShellContextType = {
    layout,
    theme,
    settings,
    toggleSidebar: () => void window.chromeAPI.layout.toggleSidebar(),
    toggleChat: () => void window.chromeAPI.layout.toggleChat(),
    updateSettings: (patch) => void window.chromeAPI.settings.updateSettings(patch),
  };

  return (
    <ShellContext.Provider value={value}>
      <StillContext.Provider value={settings.keepBerryStill}>{children}</StillContext.Provider>
    </ShellContext.Provider>
  );
};
