import { Menu, app } from "electron";
import { HORIZONTAL_TABS_MENU_ID, type Window } from "./Window";

export class AppMenu {
  private mainWindow: Window;

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.createMenu();
  }

  private createMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "File",
        submenu: [
          {
            label: "Settings…",
            accelerator: "CmdOrCtrl+,",
            click: () => this.mainWindow.openPage("settings"),
          },
          {
            label: "Downloads",
            accelerator: "CmdOrCtrl+Shift+J",
            click: () => this.mainWindow.openPage("downloads"),
          },
          {
            label: "Open Location",
            accelerator: "CmdOrCtrl+L",
            click: () => this.mainWindow.focusAddressBar(),
          },
          {
            label: "New Tab",
            accelerator: "CmdOrCtrl+T",
            click: () => this.handleNewTab(),
          },
          {
            label: "Reopen Closed Tab",
            accelerator: "CmdOrCtrl+Shift+T",
            click: () => this.mainWindow.reopenClosedTab(),
          },
          {
            label: "Bookmark This Page",
            accelerator: "CmdOrCtrl+D",
            click: () => this.mainWindow.toggleBookmark(),
          },
          {
            label: "Pin This Page",
            click: () => this.mainWindow.togglePin(),
          },
          {
            label: "Close Tab",
            accelerator: "CmdOrCtrl+W",
            click: () => this.handleCloseTab(),
          },
          { type: "separator" },
          {
            id: "print",
            label: "Print…",
            accelerator: "CmdOrCtrl+P",
            click: () => this.mainWindow.printActiveTab(),
          },
          { type: "separator" },
          {
            label: "Quit",
            accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
            click: () => app.quit(),
          },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { label: "Undo", accelerator: "CmdOrCtrl+Z", role: "undo" },
          { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
          { type: "separator" },
          { label: "Cut", accelerator: "CmdOrCtrl+X", role: "cut" },
          { label: "Copy", accelerator: "CmdOrCtrl+C", role: "copy" },
          { label: "Paste", accelerator: "CmdOrCtrl+V", role: "paste" },
          {
            label: "Select All",
            accelerator: "CmdOrCtrl+A",
            role: "selectAll",
          },
          { type: "separator" },
          {
            label: "Find…",
            accelerator: "CmdOrCtrl+F",
            click: () => this.mainWindow.openFindBar(),
          },
          {
            label: "Find Next",
            accelerator: "CmdOrCtrl+G",
            click: () => this.mainWindow.findStep(true),
          },
          {
            label: "Find Previous",
            accelerator: "CmdOrCtrl+Shift+G",
            click: () => this.mainWindow.findStep(false),
          },
        ],
      },
      {
        label: "View",
        submenu: [
          {
            label: "Reload",
            accelerator: "CmdOrCtrl+R",
            click: () => this.handleReload(),
          },
          {
            label: "Force Reload",
            accelerator: "CmdOrCtrl+Shift+R",
            click: () => this.handleForceReload(),
          },
          { type: "separator" },
          {
            id: "zoom-reset",
            label: "Actual Size",
            accelerator: "CmdOrCtrl+0",
            click: () => this.mainWindow.resetActiveTabZoom(),
          },
          {
            id: "zoom-in",
            label: "Zoom In",
            accelerator: "CmdOrCtrl+Plus",
            click: () => this.mainWindow.zoomActiveTab(1),
          },
          // On US keyboards + is Shift and =, and people press it without the Shift.
          {
            id: "zoom-in-equals",
            label: "Zoom In",
            accelerator: "CmdOrCtrl+=",
            visible: false,
            click: () => this.mainWindow.zoomActiveTab(1),
          },
          {
            id: "zoom-out",
            label: "Zoom Out",
            accelerator: "CmdOrCtrl+-",
            click: () => this.mainWindow.zoomActiveTab(-1),
          },
          { type: "separator" },
          {
            label: "Toggle Sidebar",
            accelerator: "CmdOrCtrl+S",
            click: () => this.mainWindow.toggleSidebar(),
          },
          {
            label: "Toggle Chat",
            accelerator: "CmdOrCtrl+E",
            click: () => this.mainWindow.toggleChat(),
          },
          {
            id: HORIZONTAL_TABS_MENU_ID,
            label: "Horizontal Tabs",
            type: "checkbox",
            checked: this.mainWindow.settings.layoutMode === "horizontal",
            click: (item) =>
              this.mainWindow.updateSettings({ layoutMode: item.checked ? "horizontal" : "vertical" }),
          },
          { type: "separator" },
          {
            label: "Component Gallery",
            click: () => this.mainWindow.openPage("gallery"),
          },
          {
            label: "Toggle Developer Tools",
            accelerator:
              process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
            click: () => this.handleToggleDevTools(),
          },
          {
            label: "Toggle Fullscreen",
            accelerator:
              process.platform === "darwin" ? "Ctrl+Command+F" : "F11",
            click: () => this.handleToggleFullscreen(),
          },
        ],
      },
      {
        label: "Go",
        submenu: [
          {
            label: "Back",
            accelerator: "CmdOrCtrl+Left",
            click: () => this.handleGoBack(),
          },
          {
            label: "Forward",
            accelerator: "CmdOrCtrl+Right",
            click: () => this.handleGoForward(),
          },
          { type: "separator" },
          {
            label: "History",
            accelerator: "CmdOrCtrl+Y",
            click: () => this.mainWindow.openPage("history"),
          },
          {
            label: "Flock",
            click: () => this.mainWindow.openPage("flock"),
          },
          {
            label: "Needs You",
            click: () => this.mainWindow.openPage("needs-you"),
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    this.mainWindow.syncMenu();
  }

  // Menu action handlers
  private handleNewTab(): void {
    this.mainWindow.createTab();
  }

  private handleCloseTab(): void {
    // Any tab closes, including internal pages, which have no web view.
    const tab = this.mainWindow.activeEntry;
    if (tab) {
      this.mainWindow.closeTab(tab.id);
    }
  }

  private handleReload(): void {
    if (this.mainWindow.activeTab) {
      this.mainWindow.activeTab.reload();
    }
  }

  private handleForceReload(): void {
    if (this.mainWindow.activeTab) {
      this.mainWindow.activeTab.webContents.reloadIgnoringCache();
    }
  }

  private handleToggleDevTools(): void {
    if (this.mainWindow.activeTab) {
      this.mainWindow.activeTab.webContents.toggleDevTools();
    }
  }

  private handleToggleFullscreen(): void {
    const isFullScreen = this.mainWindow.baseWindow.isFullScreen();
    this.mainWindow.baseWindow.setFullScreen(!isFullScreen);
  }

  private handleGoBack(): void {
    if (this.mainWindow.activeTab) {
      this.mainWindow.activeTab.goBack();
    }
  }

  private handleGoForward(): void {
    if (this.mainWindow.activeTab) {
      this.mainWindow.activeTab.goForward();
    }
  }
}
