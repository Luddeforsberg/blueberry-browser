import { Menu, app } from "electron";
import { HORIZONTAL_TABS_MENU_ID, WEB_PAGE_MENU_IDS, type Window } from "../window/Window";
import { toElectronMenu, type OwnMenuItem } from "./ownMenu";
import { SHORTCUTS } from "../../shared/shortcuts";

type Page = Parameters<Window["openPage"]>[0];

// The app's menu: the Mac's menu bar, the keys it holds everywhere, and off a Mac the ☰ menu, which our menu view draws
// from this same description, read again each time it opens. With no window, as on a Mac once the last one has closed,
// a page opens in a new window, and anything that acts on a window or its tabs is off.
export const appMenuItems = (mainWindow: Window | null, openWindow: () => Window): OwnMenuItem[] => {
  const mac = process.platform === "darwin";
  const opens = (page: Page) => ({ click: () => void (mainWindow ?? openWindow()).openPage(page) });
  const on = (act: (window: Window) => void, enabled = true) => ({
    enabled: enabled && mainWindow !== null,
    click: () => {
      if (mainWindow) act(mainWindow);
    },
  });
  const pageOnly = (id: string, act: (window: Window) => void) => ({
    id,
    ...on(act, !WEB_PAGE_MENU_IDS.includes(id) || mainWindow?.activeTab != null),
  });
  return [
    {
      label: "File",
      submenu: [
        ...(mainWindow ? [] : [{ label: "New Window", accelerator: "CmdOrCtrl+N", click: () => void openWindow() }]),
        { label: "Settings…", accelerator: SHORTCUTS.settings, ...opens("settings") },
        ...(mac ? [{ label: "Hide Blueberry", accelerator: "Command+H", ...on((w) => w.hideBlueberry()) }] : []),
        { label: "Downloads", accelerator: SHORTCUTS.downloads, ...opens("downloads") },
        { label: "Open Location", accelerator: "CmdOrCtrl+L", ...on((w) => w.focusAddressBar()) },
        {
          label: "New Tab",
          icon: "new-tab",
          accelerator: SHORTCUTS.newTab,
          click: () => (mainWindow ? mainWindow.createTab() : void openWindow()),
        },
        { label: "Reopen Closed Tab", accelerator: "CmdOrCtrl+Shift+T", ...on((w) => w.reopenClosedTab()) },
        { label: "Bookmark This Page", icon: "bookmark", accelerator: SHORTCUTS.bookmark, ...on((w) => w.toggleBookmark()) },
        { label: "Keep This Page on Top", icon: "pin", ...on((w) => w.keepOnTop()) },
        // Any tab closes, including internal pages, which have no web view.
        { label: "Close Tab", accelerator: SHORTCUTS.closeTab, ...on(closeTab) },
        { type: "separator" },
        { ...pageOnly("print", (w) => w.printActiveTab()), label: "Print…", icon: "print", accelerator: "CmdOrCtrl+P" },
        { type: "separator" },
        { label: "Quit", accelerator: mac ? "Cmd+Q" : "Ctrl+Q", click: () => app.quit() },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", icon: "undo", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "Redo", icon: "redo", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
        { type: "separator" },
        { label: "Cut", icon: "cut", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Copy", icon: "copy", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Paste", icon: "paste", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "Select All", icon: "select-all", accelerator: "CmdOrCtrl+A", role: "selectAll" },
        { type: "separator" },
        { label: "Find…", accelerator: "CmdOrCtrl+F", ...on((w) => w.openFindBar()) },
        { label: "Find Next", accelerator: "CmdOrCtrl+G", ...on((w) => w.findStep(true)) },
        { label: "Find Previous", accelerator: "CmdOrCtrl+Shift+G", ...on((w) => w.findStep(false)) },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Reload", icon: "reload", accelerator: SHORTCUTS.reload, ...on((w) => w.activeTab?.reload()) },
        {
          label: "Force Reload",
          accelerator: "CmdOrCtrl+Shift+R",
          ...on((w) => {
            const tab = w.activeTab;
            if (tab?.loadError) tab.reload();
            else tab?.webContents.reloadIgnoringCache();
          }),
        },
        { type: "separator" },
        { ...pageOnly("zoom-reset", (w) => w.resetActiveTabZoom()), label: "Actual Size", accelerator: "CmdOrCtrl+0" },
        { ...pageOnly("zoom-in", (w) => w.zoomActiveTab(1)), label: "Zoom In", accelerator: "CmdOrCtrl+Plus" },
        // On US keyboards + is Shift and =, and people press it without the Shift.
        {
          ...pageOnly("zoom-in-equals", (w) => w.zoomActiveTab(1)),
          label: "Zoom In",
          accelerator: "CmdOrCtrl+=",
          visible: false,
        },
        { ...pageOnly("zoom-out", (w) => w.zoomActiveTab(-1)), label: "Zoom Out", accelerator: "CmdOrCtrl+-" },
        { type: "separator" },
        { label: "Toggle Sidebar", accelerator: SHORTCUTS.sidebar, ...on((w) => w.toggleSidebar()) },
        { label: "Toggle Chat", accelerator: SHORTCUTS.chat, ...on((w) => w.toggleChat()) },
        {
          id: HORIZONTAL_TABS_MENU_ID,
          label: "Horizontal Tabs",
          type: "checkbox",
          checked: mainWindow?.settings.layoutMode === "horizontal",
          ...on((w) => w.updateSettings({ layoutMode: w.settings.layoutMode === "horizontal" ? "vertical" : "horizontal" })),
        },
        { type: "separator" },
        // For working on Blueberry itself, so a packaged app leaves them out.
        ...(app.isPackaged
          ? []
          : [
              { label: "Component Gallery", ...opens("gallery") },
              {
                label: "Toggle Developer Tools",
                accelerator: mac ? "Alt+Command+I" : "Ctrl+Shift+I",
                ...on((w) => w.activeTab?.webContents.toggleDevTools()),
              },
            ]),
        {
          label: "Toggle Fullscreen",
          accelerator: mac ? "Ctrl+Command+F" : "F11",
          ...on((w) => w.baseWindow.setFullScreen(!w.baseWindow.isFullScreen())),
        },
      ],
    },
    {
      label: "Go",
      submenu: [
        {
          label: "Back",
          icon: "back",
          accelerator: SHORTCUTS.back,
          ...on((w) => {
            const tab = w.activeEntry;
            if (tab) w.goBack(tab.id);
          }),
        },
        { label: "Forward", icon: "forward", accelerator: SHORTCUTS.forward, ...on((w) => w.activeTab?.goForward()) },
        { type: "separator" },
        { label: "History", accelerator: SHORTCUTS.history, ...opens("history") },
        { label: "Routines", ...opens("routines") },
        { label: "Your Mascots", ...opens("mascots") },
        { label: "Gallery", ...opens("mascot-gallery") },
        {
          label: "Show Berry How",
          icon: "show-how",
          ...on((w) => void (w.recordings.isRecording ? w.recordings.stop() : w.recordings.start())),
        },
        { label: "Needs You", ...opens("needs-you") },
      ],
    },
  ];
};

const closeTab = (mainWindow: Window): void => {
  const tab = mainWindow.activeEntry;
  if (tab) mainWindow.closeTab(tab.id);
};

// The Mac's menu bar, for the window that's open or for none. Installed again each time a window opens or the last one
// closes, so nothing in it holds a window that has gone.
export const setAppMenu = (mainWindow: Window | null, openWindow: () => Window): void => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(toElectronMenu(appMenuItems(mainWindow, openWindow))));
  mainWindow?.syncMenu();
};
