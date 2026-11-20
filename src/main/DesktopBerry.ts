import { BaseWindow, globalShortcut, screen, type Display, type WebContents } from "electron";
import { createChromeView, type ChromeView } from "./chromeView";
import { MenuView } from "./MenuView";
import type { OwnMenuItem } from "./ownMenu";
import { sendToRenderer } from "./ipc";
import {
  DESKTOP_DEFAULT_SPOT,
  desktopBoxPlace,
  desktopHit,
  desktopPlace,
  desktopRestingDrop,
  desktopSheetsPlace,
  desktopSpotAt,
  type DesktopPlace,
  type Rect,
} from "./Layout";
import {
  anythingGoing,
  checkDecision,
  desktopAsk,
  desktopCloud,
  desktopDrop,
  desktopTray,
  desktopWhere,
  firstLine,
  readingTime,
  saidWords,
  sameAsk,
  sameDay,
  type DesktopEnded,
  type DesktopFacts,
  type DesktopResult,
  type DesktopRunning,
  type DesktopTarget,
  type ShownAsk,
  type TrayTarget,
} from "./desktopBerryState";
import type { DesktopBerrySpot, DesktopBox, DesktopDecided, DesktopDropPart, DesktopDropState, DesktopPanelState, Settings, ThemeState } from "../shared/ipc";
import type { LibrarySnapshot, MascotProfile, NeedsYouItem } from "../shared/library";
import { DESKTOP_SHADOW, DESKTOP_SHEET } from "../shared/desktopSizes";
import { BERRY } from "../shared/mascots";
import { SHORTCUTS } from "../shared/shortcuts";

const DESKTOP_SHORTCUT = SHORTCUTS.desktop;

// How often the pointer is checked against what can be clicked. Nothing else tells a window that lets clicks through.
const POINTER_POLL_MS = 50;
// Two checks in a row, so a pointer passing along the edge doesn't make it grow.
const HOVER_AFTER_CHECKS = 2;
const SHRINK_AFTER_LEAVING_MS = 700;
// What the view takes to grow or shrink the drop, after which a window can hide.
const SIZE_MS = 200;
// A window being minimised only says so when it's finished, so leaving waits a moment to see which this is.
const LEAVING_SETTLES_MS = 800;
// How long the ask says what happened before it goes.
const SAID_MS = 1500;
// How long opening the tray waits for the view to say how tall it is, so the window shows at its size.
const HEIGHT_WAIT_MS = 150;
const MAX_RESULTS = 5;
// A result can still be seen in the stack of faces this long, and then there's nothing left to say about it.
const RESULT_LASTS_MS = 10 * 60 * 1000;
const MAX_FINISHED = 30;
// The first sentence of a reply, in two lines.
const RESULT_LENGTH = 64;
// In the panel these go to the text box, for selecting, copying and moving around in it. Anything else would reach the
// browser's menu, behind the user's back.
const PANEL_MENU_KEYS = new Set(["a", "c", "v", "x", "z", "arrowleft", "arrowright", "arrowup", "arrowdown", "backspace", "delete", "home", "end"]);
const DROP_PARTS: readonly DesktopDropPart[] = ["drop", "answer", "open", "dismiss"];

export interface DesktopBerryHost {
  settings: () => Settings;
  update: (patch: Partial<Settings>) => void;
  library: () => LibrarySnapshot;
  mascot: (id: string | null) => MascotProfile;
  nameOf: (mascotId: string) => string;
  // Blueberry's window is what the user is using, so the drop isn't needed.
  inFront: () => boolean;
  stillMotion: () => boolean;
  theme: () => ThemeState;
  // A chat that has just ended. Null if the user stopped it or it's gone.
  ended: (chatId: string) => { mascotId: string; title: string; text: string; error: string | null } | null;
  chatOnScreen: (chatId: string) => boolean;
  // A working chat's latest step and when its reply began, for the tray and the drop pointed at.
  progress: (chatId: string) => { step: string | null; since: number | null };
  // Jobs the user sent before, newest first, as chips over the box.
  recentJobs: () => Array<{ label: string; prompt: string }>;
  // Whether the cloud runner or a cloud browser can take a job.
  cloud: () => { runner: boolean; cloud: boolean };
  send: (text: string, mascotId: string, where: { runner: boolean; cloud: boolean }) => boolean;
  // The same as Needs you's `chat:decide`.
  decide: (chatId: string, approvalId: string, allow: boolean, answer?: string) => boolean;
  open: (target: DesktopTarget) => void;
  // The tab an ask is about, or its chat or routine when it has none here.
  seePage: (item: NeedsYouItem) => void;
  showBlueberry: () => void;
}

// The mascot on the edge of the screen while the user is in other apps: a drop that says what the mascots are doing, a
// prompt box that's the drop grown, the tray and the ask. All it can do is start a chat with no page, answer what Needs
// you answers, the same way, and open Blueberry. It never reads the screen, other apps or the clipboard, and there's no
// route from a tool to here.
//
// Two windows make it. The drop's own lets clicks through everywhere but the drop, never takes the keyboard, and keeps
// one size wherever it stands, so the drop grows and shrinks inside it and nothing native moves. The panel is the window
// that can take the keyboard without bringing Blueberry forward: it draws the prompt box, starting from the drop's own
// size at the drop's own place and growing from there, over the drop, so the two read as one shape, or the tray and the
// ask beside it. It changes size only before it shows and between one thing and the next, never while anything moves.
export class DesktopBerry {
  private window: BaseWindow | null = null;
  private view: ChromeView | null = null;
  private panelWindow: BaseWindow | null = null;
  private panel: ChromeView | null = null;
  // Right-clicking the drop: our menu, in a panel of its own, so it can take the keyboard without bringing Blueberry
  // forward, and stays inside the screen it opened on.
  private menuWindow: BaseWindow | null = null;
  private menus: MenuView | null = null;
  private menuArea: Rect | null = null;
  private outside = false;
  private dragging = false;
  private frame = 0;
  private bounds: Rect = { x: 0, y: 0, width: 1, height: 1 };
  private dropBox: Rect | null = null;
  private hovering = false;
  private hoverChecks = 0;
  private leftAt: number | null = null;
  private passingClicks = true;
  private results: Array<DesktopResult & { endedAt: number }> = [];
  private finished: DesktopEnded[] = [];
  private wasRunning = new Set<string>();
  // The result that has come out by itself, by its chat, and whether it waits for the pointer to leave to go back in.
  private announcing: string | null = null;
  private endsOnLeaving = false;
  private spot: DesktopBerrySpot | null = null;
  // With no saved display, the one it came out on, so it doesn't follow the pointer around.
  private pinnedDisplayId: number | null = null;
  private registered = false;
  private _shortcutTaken = false;
  // The panel: what it shows, and the ask main holds so the view never names it.
  private panelOpen: "box" | "sheets" | null = null;
  private trayOpen = false;
  private asking: ShownAsk | null = null;
  private asksShown = 0;
  private said: string | null = null;
  private opened = 0;
  private closing = false;
  private panelBounds: DesktopPlace | null = null;
  private boxThick = 0;
  private sheetsHeight = 0;
  private heightWaiters: Array<() => void> = [];
  private trayKeys = new Map<string, TrayTarget>();
  private keyCount = 0;
  private hideTimer: NodeJS.Timeout | null = null;
  private panelHideTimer: NodeJS.Timeout | null = null;
  private leavingTimer: NodeJS.Timeout | null = null;
  private pointerTimer: NodeJS.Timeout | null = null;
  private announceTimer: NodeJS.Timeout | null = null;
  private expiryTimer: NodeJS.Timeout | null = null;
  private saidTimer: NodeJS.Timeout | null = null;

  constructor(private readonly host: DesktopBerryHost) {}

  get chromeView(): ChromeView | null {
    return this.view;
  }

  get composerView(): ChromeView | null {
    return this.panel;
  }

  get menuView(): MenuView | null {
    return this.menus;
  }

  get shortcutTaken(): boolean {
    return this._shortcutTaken;
  }

  private get on(): boolean {
    const { desktopBerry, onboarded } = this.host.settings();
    return desktopBerry && onboarded;
  }

  private get still(): boolean {
    return this.host.settings().keepBerryStill || this.host.stillMotion();
  }

  // Goes by the settings, so it's called whenever one may have changed. Turned on with Blueberry in front, it waits
  // until the user goes to another app.
  sync(): void {
    if (!this.on) return this.turnOff();
    if (!this.window) {
      this.turnOn();
      if (!this.host.inFront()) void this.comeOut();
    }
    // Opened on the chat that finished, in front of the user, so there's nothing left to say about it.
    this.results = this.results.filter(({ chatId }) => !this.host.chatOnScreen(chatId));
    if (this.announcing && !this.results.some(({ chatId }) => chatId === this.announcing)) this.stopAnnouncing();
    this.publish();
  }

  private turnOn(): void {
    this.spot = this.host.settings().desktopBerrySpot;
    this.createWindow();
    this.createPanel();
    this.createMenu();
    this.registerShortcut();
    screen.on("display-metrics-changed", this.onDisplays);
    screen.on("display-added", this.onDisplays);
    screen.on("display-removed", this.onDisplays);
    this.wasRunning = this.runningChats(this.host.library());
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
    this.outside = this.dragging = this.hovering = this.trayOpen = this.closing = false;
    this.panelOpen = null;
    this.asking = null;
    this.said = null;
    this.announcing = null;
    this.results = [];
    this.finished = [];
    this.heightWaiters.splice(0).forEach((resolve) => resolve());
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
    [this.hideTimer, this.panelHideTimer, this.leavingTimer, this.announceTimer, this.expiryTimer, this.saidTimer].forEach((timer) => timer && clearTimeout(timer));
    if (this.pointerTimer) clearInterval(this.pointerTimer);
    this.hideTimer = this.panelHideTimer = this.leavingTimer = this.announceTimer = this.expiryTimer = this.saidTimer = this.pointerTimer = null;
  }

  // A panel never brings its app forward, and floats over full-screen apps.
  private get panelOptions() {
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

  private floatEverywhere(window: BaseWindow): void {
    window.setAlwaysOnTop(true, "floating");
    // Without the last option this flips the app's Dock icon off and on.
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }

  private createWindow(): void {
    // Placed when it first comes out.
    const { width, height } = this.here.window;
    this.bounds = { x: 0, y: 0, width, height };
    const window = new BaseWindow({
      ...this.panelOptions,
      width,
      height,
      // It never takes the keyboard, so the app the user is in is never interrupted.
      focusable: false,
      acceptFirstMouse: true,
    });
    this.floatEverywhere(window);
    window.setIgnoreMouseEvents(true);
    this.passingClicks = true;
    const chrome = createChromeView("desktop");
    chrome.view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.contentView.addChildView(chrome.view);
    chrome.view.setBounds({ x: 0, y: 0, width: this.bounds.width, height: this.bounds.height });
    this.window = window;
    this.view = chrome;
    window.hide();
  }

  // Made up front, so the first keys after the shortcut aren't lost to it loading. A clear window: everything in it is
  // drawn by the view.
  private createPanel(): void {
    const window = new BaseWindow({ ...this.panelOptions, width: 1, height: 1 });
    this.floatEverywhere(window);
    const chrome = createChromeView("composer");
    chrome.view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    chrome.view.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && (input.meta || input.control) && !PANEL_MENU_KEYS.has(input.key.toLowerCase())) event.preventDefault();
    });
    window.contentView.addChildView(chrome.view);
    window.on("blur", () => this.closePanel());
    this.panelWindow = window;
    this.panel = chrome;
    window.hide();
  }

  // A clear window as big as the menu, which closes when anything else takes the keyboard.
  private createMenu(): void {
    const window = new BaseWindow({ ...this.panelOptions, width: 1, height: 1 });
    this.floatEverywhere(window);
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
      { mascotsHidden: () => !this.host.settings().showBerry, refocus: false }
    );
    window.on("blur", () => this.menus?.closeMenu());
    this.menuWindow = window;
  }

  private registerShortcut(): void {
    this.registered = globalShortcut.register(DESKTOP_SHORTCUT, () => this.toggleBox());
    this._shortcutTaken = !this.registered;
  }

  private readonly onDisplays = (): void => {
    if (this.dragging) return;
    this.place();
    this.placePanel();
    this.publish();
  };

  // Where it is. A saved display that has gone means the same place on the edge of one that's there, and being a
  // fraction along an edge, that's always on screen.
  private get standing(): { display: Display; spot: Pick<DesktopBerrySpot, "edge" | "fraction"> } {
    const displays = screen.getAllDisplays();
    const display =
      displays.find(({ id }) => id === this.spot?.displayId) ??
      displays.find(({ id }) => id === this.pinnedDisplayId) ??
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.pinnedDisplayId = display.id;
    return { display, spot: this.spot ?? DESKTOP_DEFAULT_SPOT };
  }

  private get here(): DesktopPlace {
    const { display, spot } = this.standing;
    return desktopPlace(display.workArea, spot);
  }

  private setBounds(bounds: Rect): void {
    const before = this.bounds;
    if (before.x === bounds.x && before.y === bounds.y && before.width === bounds.width && before.height === bounds.height) return;
    this.bounds = bounds;
    this.frame++;
    this.dropBox = null;
    this.window?.setBounds(bounds);
    if (before.width !== bounds.width || before.height !== bounds.height) {
      this.view?.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    }
  }

  private place(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.setBounds(this.here.window);
  }

  // --- Coming and going ---

  private whenLoaded(contents: WebContents | undefined): Promise<void> {
    if (!contents || !contents.isLoading()) return Promise.resolve();
    return new Promise((resolve) => contents.once("did-finish-load", () => resolve()));
  }

  // It pours out of the edge: the view grows it from nothing once it's shown.
  private async comeOut(): Promise<void> {
    if (!this.window || this.outside) return;
    this.outside = true;
    this.pinnedDisplayId = null;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    await this.whenLoaded(this.view?.view.webContents);
    if (!this.window || !this.outside) return;
    this.place();
    this.publish();
    this.window.showInactive();
    this.watchPointer();
  }

  private goInside(): void {
    if (!this.outside || this.panelOpen) return;
    this.outside = false;
    this.dragging = false;
    this.publish();
    this.stopWatchingPointer();
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (this.outside || !this.window || this.window.isDestroyed()) return;
      this.window.hide();
    }, this.still ? 0 : SIZE_MS);
  }

  // Blueberry's window has gone away, so the drop comes out.
  mainWindowGone(): void {
    if (this.leavingTimer) clearTimeout(this.leavingTimer);
    this.leavingTimer = null;
    void this.comeOut();
  }

  // The user has gone to another app. If it's still there a moment later, the drop comes out.
  mainWindowBlurred(): void {
    if (this.leavingTimer || !this.window) return;
    this.leavingTimer = setTimeout(() => {
      this.leavingTimer = null;
      if (!this.host.inFront()) void this.comeOut();
    }, LEAVING_SETTLES_MS);
  }

  mainWindowFocused(): void {
    if (this.leavingTimer) clearTimeout(this.leavingTimer);
    this.leavingTimer = null;
    this.goInside();
    this.sync();
  }

  // --- The pointer ---

  private watchPointer(): void {
    if (this.pointerTimer) return;
    this.pointerTimer = setInterval(() => this.checkPointer(), POINTER_POLL_MS);
  }

  private stopWatchingPointer(): void {
    if (this.pointerTimer) clearInterval(this.pointerTimer);
    this.pointerTimer = null;
    this.hovering = false;
    this.hoverChecks = 0;
    this.leftAt = null;
    this.setPassingClicks(true);
  }

  // What's drawn takes the pointer, and nothing else in the window does.
  private get hit(): Rect {
    return this.dropBox ?? desktopRestingDrop(this.anchored, this.standing.spot.edge);
  }

  // The drop's place in the window as it is now, which covers the work area during a drag.
  private get anchored(): DesktopPlace {
    const here = this.here;
    return { window: this.bounds, anchor: { x: here.anchor.x + here.window.x - this.bounds.x, y: here.anchor.y + here.window.y - this.bounds.y } };
  }

  private checkPointer(): void {
    if (this.dragging) return;
    const over = desktopHit(screen.getCursorScreenPoint(), this.bounds, [this.hit]);
    this.setPassingClicks(!over);
    // While the panel is open, the drop stays as it is beside it, and only takes a press.
    if (this.panelOpen) return;
    if (over) {
      this.leftAt = null;
      if (this.hovering || ++this.hoverChecks < HOVER_AFTER_CHECKS) return;
      this.hovering = true;
      this.publish();
      return;
    }
    this.hoverChecks = 0;
    if (!this.hovering) return;
    this.leftAt ??= Date.now();
    if (Date.now() - this.leftAt < SHRINK_AFTER_LEAVING_MS) return;
    this.leftAt = null;
    this.hovering = false;
    if (this.endsOnLeaving) this.stopAnnouncing();
    this.publish();
  }

  private setPassingClicks(passing: boolean): void {
    if (passing === this.passingClicks || !this.window || this.window.isDestroyed()) return;
    this.passingClicks = passing;
    this.window.setIgnoreMouseEvents(passing);
  }

  // --- From the drop ---

  setDropBox(box: Rect, frame: number): void {
    const valid = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);
    if (frame !== this.frame || !box || ![box.x, box.y, box.width, box.height].every(valid)) return;
    this.dropBox = { x: box.x, y: box.y, width: box.width, height: box.height };
  }

  press(part: DesktopDropPart): void {
    if (!this.window || !DROP_PARTS.includes(part)) return;
    const facts = this.facts;
    if (part === "answer") {
      const [first] = facts.needsYou;
      if (first) this.openAsk(first, false);
      return;
    }
    if (part === "open" || part === "dismiss") {
      const chatId = this.announcing;
      if (!chatId) return;
      this.forgetResult(chatId);
      if (part === "open") {
        this.closePanel();
        this.host.open({ page: "chat", chatId });
      }
      return this.publish();
    }
    if (this.panelOpen) return this.closePanel();
    if (anythingGoing(facts)) this.openTray();
    else this.openBox();
  }

  // Free for as long as the pointer has it, over the whole work area, and the view moves it.
  dragStart(): void {
    if (!this.window || !this.outside) return;
    this.closePanel();
    this.dragging = true;
    this.setBounds(this.standing.display.workArea);
    this.setPassingClicks(false);
    this.publish();
  }

  // It goes to the nearest edge, where it was let go.
  dragEnd(): void {
    if (!this.dragging || !this.window) return;
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    this.spot = desktopSpotAt(display.workArea, display.id, point);
    this.pinnedDisplayId = display.id;
    this.dragging = false;
    this.place();
    this.publish();
    this.host.update({ desktopBerrySpot: this.spot });
  }

  // At the pointer, on the screen it's on.
  showMenu(): void {
    if (!this.window || !this.menus) return;
    const { keepBerryStill, showBerry } = this.host.settings();
    const result = this.announcing ?? this.results.at(-1)?.chatId ?? null;
    const items: OwnMenuItem[] = [
      ...(result
        ? [
            {
              label: "Not Now",
              click: () => {
                this.forgetResult(result);
                this.publish();
              },
            },
            { type: "separator" as const },
          ]
        : []),
      { label: "Open Blueberry", icon: "open", click: () => this.host.showBlueberry() },
      { type: "separator" },
      { label: "Keep Mascots Still", type: "checkbox", checked: keepBerryStill, click: () => this.host.update({ keepBerryStill: !keepBerryStill }) },
      { label: "Hide Mascots", type: "checkbox", checked: !showBerry, click: () => this.host.update({ showBerry: !showBerry }) },
      { label: "Take Off the Desktop", click: () => this.host.update({ desktopBerry: false }) },
    ];
    const point = screen.getCursorScreenPoint();
    this.menuArea = screen.getDisplayNearestPoint(point).workArea;
    this.menus.open(items, { ...point, width: 0, height: 0 }, { label: "Mascots", mac: process.platform === "darwin" });
  }

  // --- The panel: the prompt box, the tray and the ask ---

  private toggleBox(): void {
    if (this.panelOpen === "box" && !this.closing) this.closePanel();
    else this.openBox();
  }

  openBox(): void {
    if (this.panelOpen !== "box" || this.closing) this.opened++;
    this.panelOpen = "box";
    this.trayOpen = false;
    this.asking = null;
    this.said = null;
    void this.showPanel();
  }

  private openTray(): void {
    if (this.panelOpen !== "sheets" || this.closing) this.opened++;
    this.panelOpen = "sheets";
    this.trayOpen = true;
    this.asking = null;
    this.said = null;
    void this.showPanel();
  }

  // The exact words only ever reach the view from here, after Answer was pressed.
  private openAsk(item: NeedsYouItem, withTray: boolean): void {
    if (this.saidTimer) clearTimeout(this.saidTimer);
    this.saidTimer = null;
    if (this.panelOpen !== "sheets" || this.closing) this.opened++;
    this.panelOpen = "sheets";
    this.trayOpen = withTray;
    this.asking = { key: `a${++this.asksShown}`, item: structuredClone(item), decided: false };
    this.said = null;
    void this.showPanel();
  }

  private async showPanel(): Promise<void> {
    const window = this.panelWindow;
    if (!window) return;
    if (this.panelHideTimer) clearTimeout(this.panelHideTimer);
    this.panelHideTimer = null;
    this.closing = false;
    this.hovering = false;
    void this.comeOut();
    await this.whenLoaded(this.panel?.view.webContents);
    // Closed while it waited, so it stays closed, and the keyboard stays where it is.
    if (!this.panelOpen || this.closing || this.panelWindow !== window) return;
    // The tray and the ask are as tall as what's in them, so the window waits to hear that before it shows.
    const sized = this.panelOpen === "sheets" ? this.nextHeight() : Promise.resolve();
    this.placePanel();
    this.publishPanel();
    this.publish();
    await sized;
    if (!this.panelOpen || this.closing || this.panelWindow !== window || window.isDestroyed()) return;
    this.placePanel();
    this.publishPanel();
    window.showInactive();
    window.focus();
    this.panel?.view.webContents.focus();
  }

  private nextHeight(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, HEIGHT_WAIT_MS);
      this.heightWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  setPanelHeight(height: number): void {
    if (typeof height !== "number" || !Number.isFinite(height) || height <= 0 || !this.panelOpen) return;
    const rounded = Math.round(height);
    if (this.panelOpen === "box") {
      if (rounded === this.boxThick) return;
      this.boxThick = rounded;
    } else {
      this.heightWaiters.splice(0).forEach((resolve) => resolve());
      if (rounded === this.sheetsHeight) return;
      this.sheetsHeight = rounded;
    }
    if (this.panelWindow?.isVisible()) {
      this.placePanel();
      this.publishPanel();
    }
  }

  private get sheetsWidth(): number {
    const sheets = this.trayOpen && this.asking ? 2 * DESKTOP_SHEET.width + DESKTOP_SHEET.gap : DESKTOP_SHEET.width;
    return sheets + 2 * DESKTOP_SHADOW;
  }

  private placePanel(): void {
    const window = this.panelWindow;
    if (!window || window.isDestroyed() || !this.panelOpen) return;
    const { display, spot } = this.standing;
    const place =
      this.panelOpen === "box"
        ? desktopBoxPlace(display.workArea, spot, this.boxThick)
        : desktopSheetsPlace(display.workArea, spot, { width: this.sheetsWidth, height: this.sheetsHeight || 200 });
    this.panelBounds = place;
    window.setBounds(place.window);
    this.panel?.view.setBounds({ x: 0, y: 0, width: place.window.width, height: place.window.height });
  }

  // The view shrinks what it shows back into the drop, and then the window hides, which gives the keyboard back to the
  // app in front, which never stopped being the one in front.
  closePanel(): void {
    if (!this.panelOpen || this.closing) return;
    this.closing = true;
    this.publishPanel();
    const finish = () => {
      this.panelHideTimer = null;
      if (!this.closing) return;
      this.closing = false;
      this.panelOpen = null;
      this.trayOpen = false;
      this.asking = null;
      this.said = null;
      this.trayKeys.clear();
      this.panelWindow?.hide();
      this.publishPanel();
      this.publish();
      if (this.host.inFront()) this.goInside();
    };
    if (this.still) return finish();
    this.panelHideTimer = setTimeout(finish, SIZE_MS);
  }

  private get chosen(): MascotProfile {
    const mascot = this.host.mascot(this.host.settings().chosenMascotId);
    return mascot.deletedAt === null ? mascot : BERRY;
  }

  send(text: string, cloud: boolean): boolean {
    if (this.panelOpen !== "box" || this.closing || typeof text !== "string" || typeof cloud !== "boolean") return false;
    const chosen = this.chosen;
    if (!this.host.send(text, chosen.id, desktopWhere(chosen, this.host.cloud(), cloud))) return false;
    this.closePanel();
    return true;
  }

  choose(mascotId: string): void {
    if (typeof mascotId !== "string") return;
    const mascot = this.host.library().mascots.find(({ id }) => id === mascotId);
    if (!mascot || mascot.deletedAt !== null) return;
    this.host.update({ chosenMascotId: mascot.id === BERRY.id ? null : mascot.id });
  }

  openBlueberry(): void {
    this.closePanel();
    this.host.showBlueberry();
  }

  trayPress(key: string): void {
    // Not while it's going away: what was pressed is no longer there to press.
    const target = typeof key === "string" && this.trayOpen && !this.closing ? this.trayKeys.get(key) : undefined;
    if (!target) return;
    if (target.kind === "ask") {
      const item = this.facts.needsYou.find(({ id, approval }) => id === target.chatId && approval.id === target.approvalId);
      if (item) this.openAsk(item, true);
      return;
    }
    this.closePanel();
    if (target.target.page === "chat") this.forgetResult(target.target.chatId);
    this.host.open(target.target);
    this.publish();
  }

  // Applied to the ask main showed, through the same path as Needs you, once. Nothing goes if that ask isn't the one
  // waiting any more or has changed since it was shown, if the press was on an earlier showing, or once the sheet is
  // going away, and a handoff or a code never goes from here.
  decide(decision: unknown): DesktopDecided {
    if (this.panelOpen !== "sheets" || this.closing) return "gone";
    const shown = this.asking;
    const check = checkDecision(shown, this.facts.needsYou, decision);
    if (!check.ok || !shown) {
      if (check.ok === false && check.why === "code") return "code";
      if (check.ok === false && check.why === "gone" && shown && !shown.decided) this.askGone();
      return "gone";
    }
    shown.decided = true;
    if (!this.host.decide(check.chatId, check.approvalId, check.allow, check.answer)) {
      this.askGone();
      return "gone";
    }
    this.said = saidWords(this.host.nameOf(shown.item.mascotId), !!shown.item.approval.question, check.allow);
    this.publishPanel();
    if (this.saidTimer) clearTimeout(this.saidTimer);
    this.saidTimer = setTimeout(() => {
      this.saidTimer = null;
      if (this.asking === shown) this.askGone();
    }, SAID_MS);
    return "done";
  }

  // The ask goes, and with the tray beside it the tray stays.
  private askGone(): void {
    this.asking = null;
    this.said = null;
    if (!this.trayOpen) return this.closePanel();
    this.placePanel();
    this.publishPanel();
  }

  seePage(): void {
    const shown = this.asking;
    if (!shown) return;
    this.closePanel();
    this.host.seePage(shown.item);
  }

  // --- What it says ---

  private runningChats(library: LibrarySnapshot): Set<string> {
    return new Set(library.chats.filter(({ running }) => running).map(({ id }) => id));
  }

  private forgetResult(chatId: string): void {
    this.results = this.results.filter((result) => result.chatId !== chatId);
    if (this.announcing === chatId) this.stopAnnouncing();
  }

  private stopAnnouncing(): void {
    if (this.announceTimer) clearTimeout(this.announceTimer);
    this.announceTimer = null;
    this.announcing = null;
    this.endsOnLeaving = false;
  }

  // A result comes out for as long as it takes to read, and stays while the pointer is on it.
  private announce(chatId: string, text: string): void {
    this.stopAnnouncing();
    this.announcing = chatId;
    this.announceTimer = setTimeout(() => {
      this.announceTimer = null;
      if (this.hovering) this.endsOnLeaving = true;
      else this.stopAnnouncing();
      this.publish();
    }, readingTime(text));
  }

  // Anything ending while the user is in Blueberry, they can see for themselves. It's still in the tray.
  libraryChanged(library: LibrarySnapshot): void {
    if (!this.window) return;
    const running = this.runningChats(library);
    const ended = [...this.wasRunning].filter((id) => !running.has(id));
    this.wasRunning = running;
    const away = !this.host.inFront();
    ended.forEach((chatId) => {
      const chat = this.host.ended(chatId);
      if (!chat) return;
      const endedAt = Date.now();
      this.finished = [...this.finished.filter((each) => each.chatId !== chatId), { chatId, mascotId: chat.mascotId, title: chat.title, problem: chat.error, endedAt }].slice(-MAX_FINISHED);
      if (!away) return;
      const text = chat.error ?? (firstLine(chat.text, RESULT_LENGTH) || "Done.");
      this.results = [...this.results.filter((result) => result.chatId !== chatId), { chatId, mascotId: chat.mascotId, failed: chat.error !== null, text, endedAt }].slice(-MAX_RESULTS);
      this.announce(chatId, text);
      if (this.expiryTimer) clearTimeout(this.expiryTimer);
      this.expiryTimer = setTimeout(() => {
        this.expiryTimer = null;
        this.results = this.results.filter(({ endedAt: at }) => Date.now() - at < RESULT_LASTS_MS);
        this.publish();
      }, RESULT_LASTS_MS);
    });
    // Answered somewhere else, or changed, while it was showing here.
    const shown = this.asking;
    if (shown && !shown.decided) {
      const live = library.needsYou.find(({ id }) => id === shown.item.id);
      if (!live || !sameAsk(shown.item.approval, live.approval)) this.askGone();
    }
    this.publish();
  }

  private get facts(): DesktopFacts {
    const library = this.host.library();
    const now = Date.now();
    const running: DesktopRunning[] = [
      ...library.chats.filter(({ running }) => running).map(({ id, mascotId, title }) => ({ chatId: id, routineId: null, mascotId: mascotId ?? BERRY.id, title })),
      ...library.routines
        .filter(({ latestRun }) => latestRun?.status === "running")
        .map(({ id, mascotId, name, latestRun }) => ({
          chatId: null,
          routineId: id,
          mascotId: mascotId ?? BERRY.id,
          title: name,
          step: latestRun?.steps.at(-1)?.text ?? null,
          since: latestRun?.startedAt ?? null,
        })),
    ];
    return {
      needsYou: library.needsYou,
      results: this.results,
      running,
      finishedToday: this.finished.filter(({ endedAt }) => sameDay(endedAt, now)),
      chosen: this.chosen,
      mascot: (id) => this.host.mascot(id),
      nameOf: ({ id }) => this.host.nameOf(id),
    };
  }

  // A chat's step and when it began, filled in only where they're shown.
  private withProgress(job: DesktopRunning): DesktopRunning {
    return job.chatId ? { ...job, ...this.host.progress(job.chatId) } : job;
  }

  get state(): DesktopDropState {
    const { showBerry } = this.host.settings();
    const facts = this.facts;
    const pointed = this.hovering && !this.panelOpen;
    if (pointed && facts.running.length === 1) facts.running = facts.running.map((job) => this.withProgress(job));
    const { faces, working, says } = desktopDrop(facts, { pointed, announcing: this.announcing, shortcut: this.registered });
    const { anchor } = this.anchored;
    return {
      shown: this.outside,
      frame: this.frame,
      origin: { x: this.bounds.x, y: this.bounds.y },
      edge: this.standing.spot.edge,
      anchor,
      dragging: this.dragging,
      faces,
      working,
      // While the tray or the ask is open beside it, the drop stays small: they say it all.
      says: this.panelOpen ? { kind: "rest" } : says,
      showBerry,
      still: this.still,
    };
  }

  private get box(): DesktopBox {
    const chosen = this.chosen;
    const library = this.host.library();
    const face = (mascot: MascotProfile) => ({ id: mascot.id, name: this.host.nameOf(mascot.id), look: mascot.look });
    return {
      chosen: face(chosen),
      flock: library.mascots.filter(({ deletedAt }) => deletedAt === null).map(face),
      cloud: desktopCloud(chosen, this.host.cloud()),
      recent: this.panelOpen === "box" ? this.host.recentJobs() : [],
      shortcut: this.registered,
    };
  }

  get panelState(): DesktopPanelState {
    const { showBerry } = this.host.settings();
    const facts = this.facts;
    const library = this.host.library();
    let tray: DesktopPanelState["tray"] = null;
    if (this.trayOpen && this.panelOpen === "sheets") {
      // A row keeps its key while it's showing, so a press made just as the tray changes still reaches it.
      const before = new Map([...this.trayKeys].map(([key, target]) => [JSON.stringify(target), key]));
      this.trayKeys.clear();
      const flock = library.mascots.filter(({ deletedAt }) => deletedAt === null);
      tray = desktopTray({ ...facts, running: facts.running.map((job) => this.withProgress(job)) }, flock, (target) => {
        const key = before.get(JSON.stringify(target)) ?? `k${++this.keyCount}`;
        this.trayKeys.set(key, target);
        return key;
      });
    }
    const shown = this.asking;
    const askFace = shown && { name: this.host.nameOf(shown.item.mascotId), look: this.host.mascot(shown.item.mascotId).look, mood: "asking" as const };
    const place = this.panelBounds;
    return {
      open: this.panelOpen,
      opened: this.opened,
      closing: this.closing,
      edge: this.standing.spot.edge,
      anchor: place?.anchor ?? { x: 0, y: 0 },
      box: this.box,
      tray,
      ask: shown && askFace ? { ...desktopAsk(shown.item, askFace), key: shown.key, said: this.said } : null,
      showBerry,
      still: this.still,
    };
  }

  private publish(): void {
    if (this.view) sendToRenderer(this.view.view.webContents, "desktop:state", this.state);
    if (this.panelOpen && !this.closing) this.publishPanel();
  }

  private publishPanel(): void {
    if (this.panel) sendToRenderer(this.panel.view.webContents, "desktop:panel-state", this.panelState);
  }

  notifyTheme(): void {
    const theme = this.host.theme();
    if (this.view) sendToRenderer(this.view.view.webContents, "theme:updated", theme);
    if (this.panel) sendToRenderer(this.panel.view.webContents, "theme:updated", theme);
    this.menus?.notifyTheme(theme);
  }
}
