import { app, BaseWindow, dialog, globalShortcut, session, shell } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { Window } from "./Window";
import { AppMenu } from "./Menu";
import { EventManager } from "./EventManager";
import { SettingsStore } from "./SettingsStore";
import { BookmarkStore } from "./BookmarkStore";
import { ChatStore } from "./ChatStore";
import { RoutineStore } from "./RoutineStore";
import { MascotStore } from "./MascotStore";
import { Downloads } from "./Downloads";
import { SitePermissions } from "./SitePermissions";
import { installSessionHandlers } from "./sessionHandlers";
import { HistoryStore } from "./HistoryStore";
import { SessionStore } from "./Session";
import { openStore, type StoreProblem } from "./database";
import { holdQuit } from "./holdQuit";
import type { CloudTabs } from "./CloudTabs";
import { join } from "path";

let mainWindow: Window | null = null;
let eventManager: EventManager | null = null;
let menu: AppMenu | null = null;
let settings: SettingsStore | null = null;
let chatStore: ChatStore | null = null;
let routineStore: RoutineStore | null = null;
let mascotStore: MascotStore | null = null;
let downloads: Downloads | null = null;
let sitePermissions: SitePermissions | null = null;
let historyStore: HistoryStore | null = null;
// Kept after its window closes, so Quit can wait for its session to end.
let cloud: CloudTabs | null = null;
// Said once, after the window it sits on is open.
let storeNotices: string[] = [];

const storeNotice = (what: string, isAre: "is" | "are") => ({ movedTo }: StoreProblem) =>
  storeNotices.push(
    movedTo
      ? `${what} ${isAre === "is" ? "was" : "were"} damaged and couldn't be read, so Blueberry started empty. The old file is at ${movedTo}.`
      : `${what} couldn't be opened. The file wasn't changed, but anything new won't be kept after you quit.`
  );

const showStoreNotices = (window: Window): void => {
  if (storeNotices.length === 0) return;
  void dialog.showMessageBox(window.baseWindow, {
    type: "warning",
    message: "Some saved data couldn't be used",
    detail: storeNotices.join("\n\n"),
  });
  storeNotices = [];
};

const createWindow = (): Window => {
  settings ??= new SettingsStore(join(app.getPath("userData"), "settings.json"));
  chatStore ??= openStore(
    join(app.getPath("userData"), "chats.db"),
    (file) => new ChatStore(file),
    storeNotice("Your saved chats", "are")
  );
  historyStore ??= openStore(
    join(app.getPath("userData"), "history.db"),
    (file) => new HistoryStore(file),
    storeNotice("Your browsing history", "is")
  );
  const bookmarks = new BookmarkStore(join(app.getPath("userData"), "bookmarks.json"));
  const pinned = new BookmarkStore(join(app.getPath("userData"), "pinned.json"));
  routineStore ??= openStore(
    join(app.getPath("userData"), "routines.db"),
    (file) => new RoutineStore(file),
    storeNotice("Your routines", "are")
  );
  mascotStore ??= new MascotStore(join(app.getPath("userData"), "mascots.json"));
  const savedSettings = settings;
  if (!downloads || !sitePermissions) {
    downloads = new Downloads(join(app.getPath("userData"), "downloads.json"), {
      settings: () => savedSettings.get(),
      systemFolder: () => app.getPath("downloads"),
      openPath: (path) => shell.openPath(path),
      showItemInFolder: (path) => shell.showItemInFolder(path),
    });
    sitePermissions = new SitePermissions(join(app.getPath("userData"), "site-permissions.json"));
    installSessionHandlers(session.defaultSession, sitePermissions, downloads);
  }
  const sessionStore = new SessionStore(join(app.getPath("userData"), "session.json"));
  const window = new Window(settings, chatStore, bookmarks, pinned, routineStore, mascotStore, downloads, sitePermissions, historyStore, sessionStore);
  cloud = window.cloud;
  showStoreNotices(window);
  menu = new AppMenu(window);
  eventManager = new EventManager(window);
  return window;
};

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.electron");

  mainWindow = createWindow();

  app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BaseWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else if (mainWindow && !mainWindow.baseWindow.isVisible() && !mainWindow.baseWindow.isMinimized()) {
      // Hidden on its own, with the bird still out on the desktop.
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

// A cloud session left running costs until it times out, and a local test browser would be left behind.
holdQuit(app, () => cloud?.destroy());

app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("window-all-closed", () => {
  if (eventManager) {
    eventManager.cleanup();
    eventManager = null;
  }

  // Clean up references
  if (mainWindow) {
    mainWindow = null;
  }
  if (menu) {
    menu = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
