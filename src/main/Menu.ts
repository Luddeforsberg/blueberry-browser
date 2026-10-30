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
            label: "Close Tab",
            accelerator: "CmdOrCtrl+W",
            click: () => this.handleCloseTab(),
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
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
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
