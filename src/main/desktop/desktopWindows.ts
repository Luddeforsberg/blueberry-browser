import type { BaseWindow, WebContents } from "electron";

// What the view takes to grow or shrink the drop, after which a window can hide.
export const SIZE_MS = 200;

// A panel never brings its app forward, and floats over full-screen apps.
export function panelOptions() {
  return {
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: false,
    roundedCorners: false,
    ...(process.platform === "darwin" ? { type: "panel" as const, hiddenInMissionControl: true } : { type: "toolbar" as const }),
  };
}

export function floatEverywhere(window: BaseWindow): void {
  window.setAlwaysOnTop(true, "floating");
  // Without the last option this flips the app's Dock icon off and on.
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
}

export function whenLoaded(contents: WebContents | undefined): Promise<void> {
  if (!contents || !contents.isLoading()) return Promise.resolve();
  return new Promise((resolve) => contents.once("did-finish-load", () => resolve()));
}
