import { app, BaseWindow, session, shell } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { Window } from "./Window";
import { AppMenu } from "./Menu";
import { EventManager } from "./EventManager";
import { SettingsStore } from "./SettingsStore";
import { BookmarkStore } from "./BookmarkStore";
import { ChatStore } from "./ChatStore";
import { RoutineStore } from "./RoutineStore";
import { Downloads } from "./Downloads";
import { SitePermissions } from "./SitePermissions";
import { installSessionHandlers } from "./sessionHandlers";
import { join } from "path";

let mainWindow: Window | null = null;
let eventManager: EventManager | null = null;
let menu: AppMenu | null = null;
let settings: SettingsStore | null = null;
let chatStore: ChatStore | null = null;
let routineStore: RoutineStore | null = null;
let downloads: Downloads | null = null;
let sitePermissions: SitePermissions | null = null;

const createWindow = (): Window => {
  settings ??= new SettingsStore(join(app.getPath("userData"), "settings.json"));
  chatStore ??= new ChatStore(join(app.getPath("userData"), "chats.db"));
  const bookmarks = new BookmarkStore(join(app.getPath("userData"), "bookmarks.json"));
  routineStore ??= new RoutineStore(join(app.getPath("userData"), "routines.db"));
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
  const window = new Window(settings, chatStore, bookmarks, routineStore, downloads, sitePermissions);
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
    }
  });
});

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
