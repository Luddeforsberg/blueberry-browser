import { createContext, useContext } from "react";
import type { Layout, Settings, ThemeState } from "@shared/ipc";

export interface ShellContextType {
  layout: Layout;
  theme: ThemeState;
  settings: Settings;
  toggleSidebar: () => void;
  toggleChat: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

export const ShellContext = createContext<ShellContextType | null>(null);

export const useShell = () => {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error("useShell must be used within a ShellProvider");
  }
  return context;
};
