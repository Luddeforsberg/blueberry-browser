import { app, BaseWindow, globalShortcut } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { Window } from "./window/Window";
import { setAppMenu } from "./menus/Menu";
import { EventManager } from "./window/EventManager";
import { AppServices } from "./app/AppServices";
import { openAppStores } from "./app/appStores";
import type { StoreProblem } from "./library/database";
import { holdQuit } from "./window/holdQuit";
import { LINK_SCHEME, mascotFromArgs, mascotFromLink } from "./mascots/mascotLink";
import { loadAhead } from "./chats/agent";
import { join } from "path";
import * as dotenv from "dotenv";

// A packaged app leaves `.env` out of its bundle, so it reads one from the user data folder instead, for the model and the
// Gallery server. Both are read only once the window opens, after this.
if (app.isPackaged) dotenv.config({ path: join(app.getPath("userData"), ".env"), quiet: true });

// One copy per profile, so a link or a second launch goes to the window that's already open.
const firstCopy = app.requestSingleInstanceLock();
if (!firstCopy) app.quit();

// `blueberry://` links, which any website can hand to the system. A packaged app is registered through its bundle and
// installer (`protocols` in electron-builder.yml), and an unpackaged one names Electron and this app's folder.
if (process.defaultApp) app.setAsDefaultProtocolClient(LINK_SCHEME, process.execPath, [app.getAppPath()]);
else app.setAsDefaultProtocolClient(LINK_SCHEME);

let mainWindow: Window | null = null;
let eventManager: EventManager | null = null;
// Made with the first window and kept for as long as the app runs, so a Mac's window can close and open again on it.
let services: AppServices | null = null;
// Said once, after the window it sits on is open.
let storeNotices: string[] = [];

const NOT_KEPT = "anything new won't be kept after you quit";
const storeWords = (what: string, was: string, problem: StoreProblem): string => {
  if (problem.kind === "untouched") return `${what} couldn't be opened. The file wasn't changed, but ${NOT_KEPT}.`;
  if (problem.kind === "split") {
    return `${what} ${was} damaged and couldn't be read, so Blueberry started empty. Moving the file aside stopped partway, so some of it is at ${problem.movedTo} and the rest is where it was, and ${NOT_KEPT}.`;
  }
  const started = `${what} ${was} damaged and couldn't be read, so Blueberry started empty. The old file is at ${problem.movedTo}`;
  return problem.replaced ? `${started}.` : `${started}, and a new one couldn't be made, so ${NOT_KEPT}.`;
};

const storeNotice = (what: string, isAre: "is" | "are") => (problem: StoreProblem) =>
  storeNotices.push(storeWords(what, isAre === "is" ? "was" : "were", problem));

// Our own card with only OK, once the window's chrome has drawn.
const showStoreNotices = (window: Window): void => {
  if (storeNotices.length === 0) return;
  void window.notice("Some saved data couldn't be used", storeNotices.join("\n\n"));
  storeNotices = [];
};

const createWindow = (): Window => {
  const folder = app.getPath("userData");
  services ??= new AppServices(openAppStores(folder, storeNotice), folder);
  const window = new Window(services);
  showStoreNotices(window);
  setAppMenu(window, openWindow);
  eventManager = new EventManager(window);
  return window;
};

const openWindow = (): Window => (mainWindow = createWindow());

// A Gallery entry a link asked for before there was a window to show it in. Windows and Linux start with it in argv.
let linkedMascot: string | null = mascotFromArgs(process.argv);

const openLinked = (id: string): void => {
  if (!app.isReady()) {
    linkedMascot = id;
    return;
  }
  if (!mainWindow || BaseWindow.getAllWindows().length === 0) mainWindow = createWindow();
  mainWindow.openMascotLink(id);
};

// Only `blueberry://mascot/<uuid>` is read. Anything else does nothing at all.
app.on("open-url", (event, url) => {
  event.preventDefault();
  const id = mascotFromLink(url);
  if (id) openLinked(id);
});

app.on("second-instance", (_event, argv) => {
  const id = mascotFromArgs(argv);
  if (id) openLinked(id);
  // A plain second launch brings this one forward. A link we don't read does nothing.
  else if (!argv.some((arg) => arg.toLowerCase().startsWith(`${LINK_SCHEME}:`))) mainWindow?.bringForward();
});

void app.whenReady().then(() => {
  if (!firstCopy) return;
  electronApp.setAppUserModelId("com.ludwigforsberg.blueberry");
  // A packaged app gets the icon from its bundle. Unpackaged, the Dock would show Electron's.
  if (!app.isPackaged) app.dock?.setIcon(join(__dirname, "../../resources/icon.png"));

  mainWindow ??= createWindow();
  // Once the chrome has drawn and asked for what it shows, so opening the window never waits for it.
  mainWindow.chromeView.view.webContents.once("did-finish-load", loadAhead);
  if (linkedMascot) mainWindow.openMascotLink(linkedMascot);
  linkedMascot = null;

  app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BaseWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else if (mainWindow && !mainWindow.baseWindow.isVisible() && !mainWindow.baseWindow.isMinimized()) {
      // Hidden on its own, with the mascot still out on the desktop.
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

holdQuit(app, () => services?.quit());

app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("window-all-closed", () => {
  if (eventManager) {
    eventManager.cleanup();
    eventManager = null;
  }

  mainWindow = null;
  // A Mac keeps the menu bar with no window, so nothing in it may hold the one that closed.
  setAppMenu(null, openWindow);

  if (process.platform !== "darwin") {
    app.quit();
  }
});
