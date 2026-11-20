import { BaseWindow, nativeTheme } from "electron";
import { release } from "os";
import type { Session } from "../tabs/Session";
import { MIN_WINDOW, TAB_ROW_HEIGHT, TOOLBAR_HEIGHT } from "./Layout";
import type { LayoutMode } from "../../shared/ipc";

// The window's native frame: its glass, the Windows caption buttons and where macOS draws its window buttons, all of
// which follow the layout's top row.

// Window materials need macOS, or Windows 11 22H2 (build 22621) and later.
export const supportsGlass = (): boolean => {
  if (process.platform === "darwin") return true;
  if (process.platform !== "win32") return false;
  return Number(release().split(".")[2]) >= 22621;
};

export const isMac = (): boolean => process.platform === "darwin";

// The foreground tokens from DESIGN.md, for the Windows caption buttons, which CSS can't reach.
const CAPTION_SYMBOL = { light: "#1b1b1e", dark: "#f2f2f3" };

// macOS draws its window buttons 14px tall, so this centres them in the top row.
const MAC_BUTTONS_HEIGHT = 14;

const topRowHeight = (mode: LayoutMode): number => (mode === "vertical" ? TOOLBAR_HEIGHT : TAB_ROW_HEIGHT);

export const titleBarOverlay = (mode: LayoutMode) => ({
  color: "#00000000",
  symbolColor: nativeTheme.shouldUseDarkColors ? CAPTION_SYMBOL.dark : CAPTION_SYMBOL.light,
  height: topRowHeight(mode),
});

export const windowButtonPosition = (mode: LayoutMode) => ({ x: 16, y: Math.round((topRowHeight(mode) - MAC_BUTTONS_HEIGHT) / 2) });

export const createBaseWindow = (restored: Session | null, mode: LayoutMode, glassSupported: boolean): BaseWindow =>
  new BaseWindow({
    width: restored?.width || 1280,
    height: restored?.height || 800,
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    show: true,
    autoHideMenuBar: false,
    titleBarStyle: "hidden",
    trafficLightPosition: windowButtonPosition(mode),
    ...(process.platform === "darwin" && glassSupported ? { vibrancy: "sidebar" as const } : {}),
    ...(process.platform === "win32"
      ? {
          titleBarOverlay: titleBarOverlay(mode),
          ...(glassSupported ? { backgroundMaterial: "mica" as const } : {}),
        }
      : {}),
  });
