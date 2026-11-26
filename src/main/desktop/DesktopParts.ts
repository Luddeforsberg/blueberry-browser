import { BaseWindow, globalShortcut, screen } from "electron";
import { createChromeView, type ChromeView } from "../window/chromeView";
import { MenuView } from "../menus/MenuView";
import { sendToRenderer } from "../window/ipc";
import type { Rect } from "../window/Layout";
import type { LibrarySnapshot } from "../../shared/library";
import { SHORTCUTS } from "../../shared/shortcuts";
import { ComposerPanel } from "./ComposerPanel";
import type { DesktopBerryHost } from "./DesktopBerry";
import { floatEverywhere, panelOptions } from "./desktopWindows";
import { DropWindow } from "./DropWindow";
import { JobNews } from "./JobNews";

const DESKTOP_SHORTCUT = SHORTCUTS.desktop;
// In the panel these go to the text box, for selecting, copying and moving around in it. Anything else would reach the
// browser's menu, behind the user's back.
const PANEL_MENU_KEYS = new Set([
  "a",
  "c",
  "v",
  "x",
  "z",
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
  "backspace",
  "delete",
  "home",
  "end",
]);

// What DesktopBerry is made of: the three windows, which it makes when it's turned on and destroys when it's off, and
// the parts that work them, `DropWindow` the drop on the edge, `ComposerPanel` the prompt box, the tray and the ask, and
// `JobNews` what the jobs have done. The parts reach each other through here, never through DesktopBerry.
export class DesktopParts {
  readonly drop: DropWindow;
  readonly composer: ComposerPanel;
  readonly news: JobNews;
  window: BaseWindow | null = null;
  view: ChromeView | null = null;
  panelWindow: BaseWindow | null = null;
  panel: ChromeView | null = null;
  // Right-clicking the drop: our menu, in a panel of its own, so it can take the keyboard without bringing Blueberry
  // forward, and stays inside the screen it opened on.
  private menuWindow: BaseWindow | null = null;
  menus: MenuView | null = null;
  menuArea: Rect | null = null;

  registered = false;
  private _shortcutTaken = false;

  constructor(readonly host: DesktopBerryHost) {
    this.drop = new DropWindow(this);
    this.composer = new ComposerPanel(this);
    this.news = new JobNews(this);
  }

  private get on(): boolean {
    const { desktopBerry, onboarded } = this.host.settings();
    return desktopBerry && onboarded;
  }

  get still(): boolean {
    return this.host.settings().keepBerryStill || this.host.stillMotion();
  }

  // Goes by the settings, so it's called whenever one may have changed. Turned on with Blueberry in front, it waits
  // until the user goes to another app.
  sync(): void {
    if (!this.on) return this.turnOff();
    if (!this.window) {
      this.turnOn();
      if (!this.host.inFront()) void this.drop.comeOut();
    }
    // Opened on the chat that finished, in front of the user, so there's nothing left to say about it.
    this.news.results = this.news.results.filter(({ chatId }) => !this.host.chatOnScreen(chatId));
    if (this.news.announcing && !this.news.results.some(({ chatId }) => chatId === this.news.announcing)) this.news.stopAnnouncing();
    this.publish();
  }

  private turnOn(): void {
    this.drop.spot = this.host.settings().desktopBerrySpot;
    this.createWindow();
    this.createPanel();
    this.createMenu();
    this.registerShortcut();
    screen.on("display-metrics-changed", this.onDisplays);
    screen.on("display-added", this.onDisplays);
    screen.on("display-removed", this.onDisplays);
    this.news.wasRunning = this.news.runningChats(this.host.library());
  }

  private turnOff(): void {
    if (!this.window) return;
    this.stopTimers();
    if (this.registered) globalShortcut.unregister(DESKTOP_SHORTCUT);
    this.registered = false;
    this._shortcutTaken = false;
    screen.off("display-metrics-changed", this.onDisplays);
    screen.off("display-added", this.onDisplays);
    screen.off("display-removed", this.onDisplays);
    this.drop.outside = this.drop.dragging = this.drop.hovering = this.composer.trayOpen = this.composer.closing = false;
    this.composer.panelOpen = null;
    this.composer.asking = null;
    this.composer.said = null;
    this.news.announcing = null;
    this.news.results = [];
    this.news.finished = [];
    this.composer.heightWaiters.splice(0).forEach((resolve) => resolve());
    const { window, view, panelWindow, panel, menuWindow, menus } = this;
    this.window = this.panelWindow = this.menuWindow = null;
    this.view = this.panel = null;
    this.menus = null;
    view?.view.webContents.close();
    panel?.view.webContents.close();
    menus?.destroy();
    if (window && !window.isDestroyed()) window.destroy();
    if (panelWindow && !panelWindow.isDestroyed()) panelWindow.destroy();
    if (menuWindow && !menuWindow.isDestroyed()) menuWindow.destroy();
  }

  destroy(): void {
    this.turnOff();
  }

  private stopTimers(): void {
    [
      this.drop.hideTimer,
      this.composer.panelHideTimer,
      this.drop.leavingTimer,
      this.news.announceTimer,
      this.news.expiryTimer,
      this.composer.saidTimer,
    ].forEach((timer) => timer && clearTimeout(timer));
    if (this.drop.pointerTimer) clearInterval(this.drop.pointerTimer);
    this.drop.hideTimer =
      this.composer.panelHideTimer =
      this.drop.leavingTimer =
      this.news.announceTimer =
      this.news.expiryTimer =
      this.composer.saidTimer =
      this.drop.pointerTimer =
        null;
  }

  private createWindow(): void {
    // Placed when it first comes out.
    const { width, height } = this.drop.here.window;
    this.drop.bounds = { x: 0, y: 0, width, height };
    const window = new BaseWindow({
      ...panelOptions(),
      width,
      height,
      // It never takes the keyboard, so the app the user is in is never interrupted.
      focusable: false,
      acceptFirstMouse: true,
    });
    floatEverywhere(window);
    window.setIgnoreMouseEvents(true);
    this.drop.passingClicks = true;
    const chrome = createChromeView("desktop");
    chrome.view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.contentView.addChildView(chrome.view);
    chrome.view.setBounds({ x: 0, y: 0, width: this.drop.bounds.width, height: this.drop.bounds.height });
    this.window = window;
    this.view = chrome;
    window.hide();
  }

  // Made up front, so the first keys after the shortcut aren't lost to it loading. A clear window: everything in it is
  // drawn by the view.
  private createPanel(): void {
    const window = new BaseWindow({ ...panelOptions(), width: 1, height: 1 });
    floatEverywhere(window);
    const chrome = createChromeView("composer");
    chrome.view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    chrome.view.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && (input.meta || input.control) && !PANEL_MENU_KEYS.has(input.key.toLowerCase()))
        event.preventDefault();
    });
    window.contentView.addChildView(chrome.view);
    window.on("blur", () => this.composer.closePanel());
    this.panelWindow = window;
    this.panel = chrome;
    window.hide();
  }

  // A clear window as big as the menu, which closes when anything else takes the keyboard.
  private createMenu(): void {
    const window = new BaseWindow({ ...panelOptions(), width: 1, height: 1 });
    floatEverywhere(window);
    this.menus = new MenuView(
      "drop-menu",
      (view) => {
        window.contentView.addChildView(view);
        return {
          area: () => this.menuArea ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
          show: (rect) => {
            window.setBounds(rect);
            view.setBounds({ x: 0, y: 0, width: rect.width, height: rect.height });
            window.showInactive();
            window.focus();
          },
          // Hiding it gives the keyboard back to the app in front, which never stopped being the one in front.
          hide: () => window.hide(),
        };
      },
      { mascotsHidden: () => !this.host.settings().showBerry, refocus: false },
    );
    window.on("blur", () => this.menus?.closeMenu());
    this.menuWindow = window;
  }

  private registerShortcut(): void {
    this.registered = globalShortcut.register(DESKTOP_SHORTCUT, () => this.composer.toggleBox());
    this._shortcutTaken = !this.registered;
  }

  private readonly onDisplays = (): void => {
    if (this.drop.dragging) return;
    this.drop.place();
    this.composer.placePanel();
    this.publish();
  };

  // The drop and the panel from one read of the library, which is built again on every read.
  publish(library: LibrarySnapshot = this.host.library()): void {
    if (this.view) sendToRenderer(this.view.view.webContents, "desktop:state", this.drop.stateOf(library));
    if (this.composer.panelOpen && !this.composer.closing) this.composer.publishPanel(library);
  }

  notifyTheme(): void {
    const theme = this.host.theme();
    if (this.view) sendToRenderer(this.view.view.webContents, "theme:updated", theme);
    if (this.panel) sendToRenderer(this.panel.view.webContents, "theme:updated", theme);
    this.menus?.notifyTheme(theme);
  }

  get shortcutTaken(): boolean {
    return this._shortcutTaken;
  }
}
