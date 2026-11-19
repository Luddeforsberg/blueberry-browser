import React, { useEffect, useState } from "react";
import type { Layout, Settings, ThemeState } from "@shared/ipc";
import { StillContext } from "@common/components/motion";
import { ShellContext, type ShellContextType } from "./useShell";

// Layout, theme and settings all come from main, which owns the window.
export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [theme, setTheme] = useState<ThemeState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    const api = window.chromeAPI;
    void api.layout.getLayout().then(setLayout);
    void api.theme.getTheme().then(setTheme);
    void api.settings.getSettings().then(setSettings);
    const unsubscribe = [
      api.layout.onLayoutUpdated(setLayout),
      api.theme.onThemeUpdated(setTheme),
      api.settings.onSettingsUpdated(setSettings),
    ];
    return () => unsubscribe.forEach((off) => off());
  }, []);

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
