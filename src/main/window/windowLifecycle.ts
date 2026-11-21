import { nativeTheme } from "electron";
import type { Session } from "../tabs/Session";
import { sendToRenderer } from "./ipc";
import { titleBarOverlay } from "./windowFrame";
import type { WindowParts, WindowStores } from "./WindowParts";

// What runs once the window has everything it needs: its first tabs, starting what works in the background, the window
// events it follows, and everything closing the window ends.
export const startWindow = (w: WindowParts, stores: WindowStores, restored: Session | null, stopWatching: () => void): void => {
  if (restored) w.session.restoreSession(restored);
  else w.tabs.createTab();
  w.panels.updateAllBounds();
  w.desktopBerry.sync();
  w.routines.start();
  w.telegram.start();
  w.phone.start();
  w.mcp.start();
  w.macJobs.start();

  w.session.noteSize();
  w.baseWindow.on("resize", () => {
    w.session.noteSize();
    w.panels.updateAllBounds();
    w.session.saveSessionSoon();
  });
  w.baseWindow.on("blur", () => {
    w.panels.hideFloatingSidebar();
    w.phone.sync();
    w.desktopBerry.mainWindowBlurred();
  });
  w.baseWindow.on("focus", () => w.desktopBerry.mainWindowFocused());
  w.baseWindow.on("minimize", () => w.desktopBerry.mainWindowGone());

  const onThemeUpdated = () => notifyTheme(w);
  nativeTheme.on("updated", onThemeUpdated);

  w.baseWindow.on("closed", () => {
    w.desktopBerry.destroy();
    w.workViews.destroy();
    w.recordings.destroy();
    nativeTheme.off("updated", onThemeUpdated);
    w.routines.shutdown();
    w.phone.stop();
    w.telegram.close();
    w.mcp.close();
    void w.cloud.detach();
    w.runnerJobs.destroy();
    w.macJobs.destroy();
    w.permissionPrompt.destroy();
    // A question still waiting is answered no.
    w.menus.destroy();
    stopWatching();
    w.chats.stopAll();
    stores.settingsStore.flush();
    // Before the tabs close below, and nothing after this, which would save a window with none.
    stores.sessionStore.saveSoon(() => w.session.currentSession);
    stores.sessionStore.flush();
    w.session.windowClosed = true;
    w.tabs.destroyAll();
    w.chromeView.view.webContents.close();
    w.overlayView.view.webContents.close();
    w.findBar.destroy();
    w.addressSuggestions.destroy();
    w.tooltip.destroy();
    w.previews.destroy();
  });
};

const notifyTheme = (w: WindowParts): void => {
  if (process.platform === "win32") {
    w.baseWindow.setTitleBarOverlay(titleBarOverlay(w.settings.layoutMode));
  }
  w.broadcast("theme:updated", w.theme);
  w.findBar.notifyTheme(w.theme);
  w.addressSuggestions.notifyTheme(w.theme);
  w.tooltip.notifyTheme(w.theme);
  w.previews.notifyTheme(w.theme);
  w.desktopBerry.notifyTheme();
  w.menus.notifyTheme(w.theme);
  sendToRenderer(w.permissionPrompt.chrome.view.webContents, "theme:updated", w.theme);
};
