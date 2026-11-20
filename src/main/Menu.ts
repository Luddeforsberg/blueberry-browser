import { Menu, app } from "electron";
import { HORIZONTAL_TABS_MENU_ID, WEB_PAGE_MENU_IDS, type Window } from "./Window";
import { toElectronMenu, type OwnMenuItem } from "./ownMenu";
import { SHORTCUTS } from "../shared/shortcuts";

// The app's menu: the Mac's menu bar, the keys it holds everywhere, and off a Mac the ☰ menu, which our menu view draws
// from this same description, read again each time it opens.
export const appMenuItems = (mainWindow: Window): OwnMenuItem[] => {
  const mac = process.platform === "darwin";
  const pageOnly = (id: string) => ({ id, enabled: !WEB_PAGE_MENU_IDS.includes(id) || mainWindow.activeTab !== null });
  return [
    {
      label: "File",
      submenu: [
        { label: "Settings…", accelerator: SHORTCUTS.settings, click: () => mainWindow.openPage("settings") },
        ...(mac ? [{ label: "Hide Blueberry", accelerator: "Command+H", click: () => mainWindow.hideBlueberry() }] : []),
        { label: "Downloads", accelerator: SHORTCUTS.downloads, click: () => mainWindow.openPage("downloads") },
        { label: "Open Location", accelerator: "CmdOrCtrl+L", click: () => mainWindow.focusAddressBar() },
        { label: "New Tab", icon: "new-tab", accelerator: SHORTCUTS.newTab, click: () => mainWindow.createTab() },
        { label: "Reopen Closed Tab", accelerator: "CmdOrCtrl+Shift+T", click: () => mainWindow.reopenClosedTab() },
        { label: "Bookmark This Page", icon: "bookmark", accelerator: SHORTCUTS.bookmark, click: () => mainWindow.toggleBookmark() },
        { label: "Keep This Page on Top", icon: "pin", click: () => mainWindow.keepOnTop() },
        // Any tab closes, including internal pages, which have no web view.
        { label: "Close Tab", accelerator: SHORTCUTS.closeTab, click: () => closeTab(mainWindow) },
        { type: "separator" },
        { ...pageOnly("print"), label: "Print…", icon: "print", accelerator: "CmdOrCtrl+P", click: () => mainWindow.printActiveTab() },
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
        { label: "Find…", accelerator: "CmdOrCtrl+F", click: () => mainWindow.openFindBar() },
        { label: "Find Next", accelerator: "CmdOrCtrl+G", click: () => mainWindow.findStep(true) },
        { label: "Find Previous", accelerator: "CmdOrCtrl+Shift+G", click: () => mainWindow.findStep(false) },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Reload", icon: "reload", accelerator: SHORTCUTS.reload, click: () => mainWindow.activeTab?.reload() },
        {
          label: "Force Reload",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            const tab = mainWindow.activeTab;
            if (tab?.loadError) tab.reload();
            else tab?.webContents.reloadIgnoringCache();
          },
        },
        { type: "separator" },
        { ...pageOnly("zoom-reset"), label: "Actual Size", accelerator: "CmdOrCtrl+0", click: () => mainWindow.resetActiveTabZoom() },
        { ...pageOnly("zoom-in"), label: "Zoom In", accelerator: "CmdOrCtrl+Plus", click: () => mainWindow.zoomActiveTab(1) },
        // On US keyboards + is Shift and =, and people press it without the Shift.
        { ...pageOnly("zoom-in-equals"), label: "Zoom In", accelerator: "CmdOrCtrl+=", visible: false, click: () => mainWindow.zoomActiveTab(1) },
        { ...pageOnly("zoom-out"), label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => mainWindow.zoomActiveTab(-1) },
        { type: "separator" },
        { label: "Toggle Sidebar", accelerator: SHORTCUTS.sidebar, click: () => mainWindow.toggleSidebar() },
        { label: "Toggle Chat", accelerator: SHORTCUTS.chat, click: () => mainWindow.toggleChat() },
        {
          id: HORIZONTAL_TABS_MENU_ID,
          label: "Horizontal Tabs",
          type: "checkbox",
          checked: mainWindow.settings.layoutMode === "horizontal",
          click: () => mainWindow.updateSettings({ layoutMode: mainWindow.settings.layoutMode === "horizontal" ? "vertical" : "horizontal" }),
        },
        { type: "separator" },
        // For working on Blueberry itself, so a packaged app leaves them out.
        ...(app.isPackaged
          ? []
          : [
              { label: "Component Gallery", click: () => mainWindow.openPage("gallery") },
              {
                label: "Toggle Developer Tools",
                accelerator: mac ? "Alt+Command+I" : "Ctrl+Shift+I",
                click: () => mainWindow.activeTab?.webContents.toggleDevTools(),
              },
            ]),
        {
          label: "Toggle Fullscreen",
          accelerator: mac ? "Ctrl+Command+F" : "F11",
          click: () => mainWindow.baseWindow.setFullScreen(!mainWindow.baseWindow.isFullScreen()),
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
          click: () => {
            const tab = mainWindow.activeEntry;
            if (tab) mainWindow.goBack(tab.id);
          },
        },
        { label: "Forward", icon: "forward", accelerator: SHORTCUTS.forward, click: () => mainWindow.activeTab?.goForward() },
        { type: "separator" },
        { label: "History", accelerator: SHORTCUTS.history, click: () => mainWindow.openPage("history") },
        { label: "Routines", click: () => mainWindow.openPage("routines") },
        { label: "Your Mascots", click: () => mainWindow.openPage("flock") },
        { label: "Gallery", click: () => mainWindow.openPage("mascot-gallery") },
        {
          label: "Show Berry How",
          icon: "show-how",
          click: () => void (mainWindow.recordings.isRecording ? mainWindow.recordings.stop() : mainWindow.recordings.start()),
        },
        { label: "Needs You", click: () => mainWindow.openPage("needs-you") },
      ],
    },
  ];
};

const closeTab = (mainWindow: Window): void => {
  const tab = mainWindow.activeEntry;
  if (tab) mainWindow.closeTab(tab.id);
};

export class AppMenu {
  constructor(private readonly mainWindow: Window) {
    Menu.setApplicationMenu(Menu.buildFromTemplate(toElectronMenu(appMenuItems(mainWindow))));
    this.mainWindow.syncMenu();
  }
}
