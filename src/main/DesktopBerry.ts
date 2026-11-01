import { BaseWindow, globalShortcut, Menu, screen, type Display } from "electron";
import { createChromeView, type ChromeView } from "./chromeView";
import { sendToRenderer } from "./ipc";
import {
  DESKTOP_BIRD_SIZE,
  DESKTOP_DEFAULT_FRACTION,
  desktopBounds,
  desktopFlightPoint,
  desktopFractionAt,
  desktopHit,
  desktopSide,
  type Rect,
} from "./Layout";
import { desktopFace, firstLine, type DesktopResult, type DesktopTarget } from "./desktopBerryState";
import type { DesktopBerryLayout, DesktopBerrySpot, DesktopBerryState, Settings, ThemeState } from "../shared/ipc";
import type { LibrarySnapshot, MascotProfile } from "../shared/library";
import { BERRY } from "../shared/mascots";

export const DESKTOP_SHORTCUT = "Alt+Space";

// How often the pointer is checked against what can be clicked. Nothing else tells a window that lets clicks through.
const POINTER_POLL_MS = 50;
const FADE_MS = 170;
const FLIGHT_FRAME_MS = 16;
const FLIGHT_MIN_MS = 700;
const FLIGHT_MAX_MS = 1200;
const MAX_RESULTS = 5;
// A window being minimised only says so when it's finished, so leaving waits a moment to see which this is.
const LEAVING_SETTLES_MS = 800;
const BIRD_BOX = { width: DESKTOP_BIRD_SIZE, height: DESKTOP_BIRD_SIZE };
// In the composer these go to the text box. Anything else would reach the browser's menu, behind the user's back.
const COMPOSER_MENU_KEYS = new Set(["a", "c", "v", "x", "z"]);

export interface DesktopBerryHost {
  settings: () => Settings;
  update: (patch: Partial<Settings>) => void;
  library: () => LibrarySnapshot;
  mascot: (id: string | null) => MascotProfile;
  nameOf: (mascotId: string) => string;
  // Blueberry's window is what the user is using, so the bird belongs in there.
  inFront: () => boolean;
  stillMotion: () => boolean;
  theme: () => ThemeState;
  // Where the chrome's own bird is on the screen right now, for taking off from.
  takeOffPoint: () => Promise<{ x: number; y: number }>;
  setAway: (away: boolean) => void;
  // A chat that has just ended. Null if the user stopped it or it's gone.
  ended: (chatId: string) => { mascotId: string; text: string; error: string | null } | null;
  chatOnScreen: (chatId: string) => boolean;
  send: (text: string, mascotId: string) => boolean;
  open: (target: Exclude<DesktopTarget, null>) => void;
  showBlueberry: () => void;
}

// The bird that stands at the edge of the screen while the user is in other apps, with the shortcut that gives it a job.
// All it can do is start a chat with no page and open Blueberry, so it can't do anything a chat can't, or anything
// without asking. It never reads the screen, other apps or the clipboard, and there's no route from a tool to here.
export class DesktopBerry {
  private window: BaseWindow | null = null;
  private view: ChromeView | null = null;
  private outside = false;
  private composing = false;
  private flying: "left" | "right" | null = null;
  private flightTimer: NodeJS.Timeout | null = null;
  private flightId = 0;
  private fadeTimer: NodeJS.Timeout | null = null;
  private leavingTimer: NodeJS.Timeout | null = null;
  private pointerTimer: NodeJS.Timeout | null = null;
  private passingClicks = true;
  private dragging = false;
  private content: { width: number; height: number } = BIRD_BOX;
  private hits: Rect[] = [];
  private bounds: Rect = { x: 0, y: 0, ...BIRD_BOX };
  private results: DesktopResult[] = [];
  private wasRunning = new Set<string>();
  private spot: DesktopBerrySpot | null = null;
  private registered = false;
  private _shortcutTaken = false;

  constructor(private readonly host: DesktopBerryHost) {}

  get chromeView(): ChromeView | null {
    return this.view;
  }

  get shortcutTaken(): boolean {
    return this._shortcutTaken;
  }

  private get on(): boolean {
    const { desktopBerry, onboarded } = this.host.settings();
    return desktopBerry && onboarded;
  }

  // Goes by the settings, so it's called whenever one may have changed. `turnedOn` is the user pressing the switch, with
  // the window in front: it leaves anyway, as that's what they just asked for. Launching with it on doesn't fly anywhere.
  sync(turnedOn = false): void {
    if (!this.on) return this.turnOff();
    if (!this.window) {
      this.turnOn();
      if (turnedOn) void this.comeOut(true);
      else if (!this.host.inFront()) void this.comeOut(false);
    }
    // Opened on the chat that finished, in front of the user, so there's nothing left to say about it.
    this.results = this.results.filter(({ chatId }) => !this.host.chatOnScreen(chatId));
    this.publish();
  }

  private turnOn(): void {
    this.spot = this.host.settings().desktopBerrySpot;
    this.createWindow();
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
    this.outside = false;
    this.composing = false;
    this.flying = null;
    this.results = [];
    this.host.setAway(false);
    const { window, view } = this;
    this.window = null;
    this.view = null;
    view?.view.webContents.close();
    if (!window?.isDestroyed()) window?.destroy();
  }

  destroy(): void {
    this.turnOff();
  }

  private stopTimers(): void {
    [this.fadeTimer, this.leavingTimer].forEach((timer) => timer && clearTimeout(timer));
    [this.flightTimer, this.pointerTimer].forEach((timer) => timer && clearInterval(timer));
    this.fadeTimer = this.leavingTimer = this.flightTimer = this.pointerTimer = null;
  }

  private createWindow(): void {
    const window = new BaseWindow({
      ...BIRD_BOX,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      roundedCorners: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // A panel takes the keyboard without bringing its app forward, so the app the user is in stays the one in front,
      // and gets the keyboard back when this hides. It also floats over full-screen apps.
      ...(process.platform === "darwin" ? { type: "panel" as const, hiddenInMissionControl: true } : { type: "toolbar" as const }),
      focusable: false,
      alwaysOnTop: true,
      acceptFirstMouse: true,
    });
    window.setAlwaysOnTop(true, "floating");
    // Without the last option this flips the app's Dock icon off and on.
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    window.setIgnoreMouseEvents(true);
    this.passingClicks = true;

    const chrome = createChromeView("desktop");
    chrome.view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    chrome.view.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && (input.meta || input.control) && !COMPOSER_MENU_KEYS.has(input.key.toLowerCase())) event.preventDefault();
    });
    window.contentView.addChildView(chrome.view);
    chrome.view.setBounds({ x: 0, y: 0, ...BIRD_BOX });
    window.on("blur", () => this.closeComposer());
    this.window = window;
    this.view = chrome;
  }

  private registerShortcut(): void {
    this.registered = globalShortcut.register(DESKTOP_SHORTCUT, () => this.toggleComposer());
    this._shortcutTaken = !this.registered;
  }

  private readonly onDisplays = (): void => {
    if (!this.flying) this.place();
  };

  private display(): Display {
    const displays = screen.getAllDisplays();
    return displays.find(({ id }) => id === this.spot?.displayId) ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  }

  private get fraction(): number {
    return this.spot && screen.getAllDisplays().some(({ id }) => id === this.spot?.displayId) ? this.spot.fraction : DESKTOP_DEFAULT_FRACTION;
  }

  private place(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.setBounds(desktopBounds(this.display().workArea, this.fraction, this.flying ? BIRD_BOX : this.content));
  }

  private setBounds(bounds: Rect): void {
    const before = this.bounds;
    this.bounds = bounds;
    this.window?.setBounds(bounds);
    if (before.width !== bounds.width || before.height !== bounds.height) {
      this.view?.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    }
  }

  // --- Coming and going ---

  private get flightAllowed(): boolean {
    const { keepBerryStill, showBerry } = this.host.settings();
    return showBerry && !keepBerryStill && !this.host.stillMotion();
  }

  private whenLoaded(): Promise<void> {
    const contents = this.view?.view.webContents;
    if (!contents || !contents.isLoading()) return Promise.resolve();
    return new Promise((resolve) => contents.once("did-finish-load", () => resolve()));
  }

  private async comeOut(fly: boolean): Promise<void> {
    if (!this.window || this.outside) return;
    this.outside = true;
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    const flight = fly && this.flightAllowed;
    const from = flight ? await this.host.takeOffPoint() : null;
    await this.whenLoaded();
    if (!this.window || !this.outside) return;
    this.host.setAway(true);
    this.place();
    this.window.showInactive();
    this.watchPointer();
    if (from) this.fly(from);
    this.publish();
  }

  private goInside(): void {
    if (!this.outside) return;
    this.cancelFlight();
    this.outside = false;
    this.publish();
    this.host.setAway(false);
    this.stopWatchingPointer();
    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = null;
      if (!this.outside && this.window && !this.window.isDestroyed()) this.window.hide();
    }, FADE_MS);
  }

  // Blueberry's window has gone away, so the bird comes out of it.
  mainWindowGone(): void {
    if (this.leavingTimer) clearTimeout(this.leavingTimer);
    this.leavingTimer = null;
    void this.comeOut(true);
  }

  // The user has gone to another app. If it's still there a moment later, the bird comes out quietly.
  mainWindowBlurred(): void {
    if (this.leavingTimer || !this.window) return;
    this.leavingTimer = setTimeout(() => {
      this.leavingTimer = null;
      if (!this.host.inFront()) void this.comeOut(false);
    }, LEAVING_SETTLES_MS);
  }

  mainWindowFocused(): void {
    if (this.leavingTimer) clearTimeout(this.leavingTimer);
    this.leavingTimer = null;
    if (!this.composing) this.goInside();
    this.sync();
  }

  private fly(from: { x: number; y: number }): void {
    const land = desktopBounds(this.display().workArea, this.fraction, BIRD_BOX);
    const start = { x: from.x - DESKTOP_BIRD_SIZE / 2, y: from.y - DESKTOP_BIRD_SIZE / 2 };
    const distance = Math.hypot(land.x - start.x, land.y - start.y);
    const duration = Math.min(Math.max(distance * 0.9, FLIGHT_MIN_MS), FLIGHT_MAX_MS);
    const startedAt = Date.now();
    const id = ++this.flightId;
    this.flying = land.x < start.x ? "left" : "right";
    this.setBounds({ ...start, ...BIRD_BOX });
    this.flightTimer = setInterval(() => {
      if (id !== this.flightId || !this.window) return;
      const t = Math.min((Date.now() - startedAt) / duration, 1);
      this.setBounds({ ...desktopFlightPoint(start, land, t), ...BIRD_BOX });
      if (t < 1) return;
      this.cancelFlight();
      this.place();
      this.publish();
    }, FLIGHT_FRAME_MS);
  }

  private cancelFlight(): void {
    this.flightId++;
    if (this.flightTimer) clearInterval(this.flightTimer);
    this.flightTimer = null;
    this.flying = null;
  }

  // --- The pointer ---

  private watchPointer(): void {
    if (this.pointerTimer) return;
    this.pointerTimer = setInterval(() => this.checkPointer(), POINTER_POLL_MS);
  }

  private stopWatchingPointer(): void {
    if (this.pointerTimer) clearInterval(this.pointerTimer);
    this.pointerTimer = null;
    this.setPassingClicks(true);
  }

  private checkPointer(): void {
    if (this.dragging) return;
    this.setPassingClicks(!!this.flying || !desktopHit(screen.getCursorScreenPoint(), this.bounds, this.hits));
  }

  private setPassingClicks(passing: boolean): void {
    if (passing === this.passingClicks || !this.window || this.window.isDestroyed()) return;
    this.passingClicks = passing;
    this.window.setIgnoreMouseEvents(passing);
  }

  // --- From the view ---

  setLayout(layout: DesktopBerryLayout): void {
    const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
    if (!layout || !valid(layout.width) || !valid(layout.height) || !Array.isArray(layout.hits)) return;
    this.content = { width: layout.width, height: layout.height };
    this.hits = layout.hits.filter((hit) => hit && [hit.x, hit.y, hit.width, hit.height].every(valid));
    if (!this.flying && !this.dragging) this.place();
  }

  send(text: string): boolean {
    if (typeof text !== "string" || !this.composing) return false;
    const { chosen } = this;
    if (!this.host.send(text, chosen.id)) return false;
    this.closeComposer();
    return true;
  }

  private get chosen(): MascotProfile {
    const mascot = this.host.mascot(this.host.settings().chosenMascotId);
    return mascot.deletedAt === null ? mascot : BERRY;
  }

  private toggleComposer(): void {
    if (this.composing) this.closeComposer();
    else void this.openComposer();
  }

  private async openComposer(): Promise<void> {
    if (!this.window) return;
    this.cancelFlight();
    this.composing = true;
    await this.comeOut(false);
    if (!this.window || !this.composing) return;
    this.place();
    this.publish();
    this.window.setFocusable(true);
    this.window.showInactive();
    this.window.focus();
    this.view?.view.webContents.focus();
  }

  closeComposer(): void {
    if (!this.composing || !this.window) return;
    this.composing = false;
    this.publish();
    this.window.setFocusable(false);
    // A panel that hides gives the keyboard back to the app in front. The bird's window is back before anything draws.
    this.window.hide();
    this.window.showInactive();
    if (this.host.inFront()) this.goInside();
  }

  press(): void {
    const { target } = this.face;
    if (!target) return this.toggleComposer();
    this.closeComposer();
    if (target.page === "chat") this.results = this.results.filter(({ chatId }) => chatId !== target.chatId);
    this.host.open(target);
    this.publish();
  }

  drag(screenX: number): void {
    if (typeof screenX !== "number" || !Number.isFinite(screenX) || !this.window || this.flying) return;
    this.dragging = true;
    if (this.composing) this.closeComposer();
    const { y } = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint({ x: Math.round(screenX), y });
    this.spot = { displayId: display.id, fraction: desktopFractionAt(display.workArea, screenX - DESKTOP_BIRD_SIZE / 2) };
    this.setBounds(desktopBounds(display.workArea, this.spot.fraction, BIRD_BOX));
  }

  dragEnd(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.place();
    this.publish();
    if (this.spot) this.host.update({ desktopBerrySpot: this.spot });
  }

  showMenu(): void {
    if (!this.window) return;
    const { keepBerryStill, showBerry } = this.host.settings();
    const { target } = this.face;
    const result = target?.page === "chat" ? target.chatId : null;
    Menu.buildFromTemplate([
      ...(result
        ? [
            {
              label: "Not Now",
              click: () => {
                this.results = this.results.filter(({ chatId }) => chatId !== result);
                this.publish();
              },
            },
            { type: "separator" as const },
          ]
        : []),
      { label: "Open Blueberry", click: () => this.host.showBlueberry() },
      { type: "separator" },
      { label: "Keep Berry Still", type: "checkbox", checked: keepBerryStill, click: () => this.host.update({ keepBerryStill: !keepBerryStill }) },
      { label: "Hide Berry", type: "checkbox", checked: !showBerry, click: () => this.host.update({ showBerry: !showBerry }) },
      { label: "Take Off the Desktop", click: () => this.host.update({ desktopBerry: false }) },
    ]).popup({ window: this.window });
  }

  // --- What it says ---

  private runningChats(library: LibrarySnapshot): Set<string> {
    return new Set(library.chats.filter(({ running }) => running).map(({ id }) => id));
  }

  // Anything ending while the user is in Blueberry, they can see for themselves.
  libraryChanged(library: LibrarySnapshot): void {
    if (!this.window) return;
    const running = this.runningChats(library);
    const ended = [...this.wasRunning].filter((id) => !running.has(id));
    this.wasRunning = running;
    if (!this.host.inFront()) {
      ended.forEach((chatId) => {
        const chat = this.host.ended(chatId);
        if (!chat) return;
        this.results = [
          ...this.results.filter((result) => result.chatId !== chatId),
          { chatId, mascotId: chat.mascotId, failed: chat.error !== null, text: chat.error ?? (firstLine(chat.text) || "Done.") },
        ].slice(-MAX_RESULTS);
      });
    }
    this.publish();
  }

  private get face(): ReturnType<typeof desktopFace> {
    const library = this.host.library();
    return desktopFace({
      needsYou: library.needsYou,
      results: this.results,
      running: [
        ...library.chats.filter(({ running }) => running).map(({ mascotId, title }) => ({ mascotId: mascotId ?? BERRY.id, title })),
        ...library.routines.filter(({ latestRun }) => latestRun?.status === "running").map(({ mascotId, name }) => ({ mascotId: mascotId ?? BERRY.id, title: name })),
      ],
      chosen: this.chosen,
      mascot: (id) => this.host.mascot(id),
      nameOf: ({ id }) => this.host.nameOf(id),
    });
  }

  get state(): DesktopBerryState {
    const { showBerry, keepBerryStill } = this.host.settings();
    const { mood, name, look, line } = this.face;
    return {
      mood,
      name,
      look,
      line,
      shown: this.outside,
      flying: this.flying,
      composing: this.composing,
      side: desktopSide(this.fraction),
      showBerry,
      still: keepBerryStill || this.host.stillMotion(),
    };
  }

  private publish(): void {
    if (this.view) sendToRenderer(this.view.view.webContents, "desktop:state", this.state);
  }

  notifyTheme(): void {
    if (this.view) sendToRenderer(this.view.view.webContents, "theme:updated", this.host.theme());
  }
}
