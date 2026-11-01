import { BaseWindow, globalShortcut, Menu, screen, type Display } from "electron";
import { createChromeView, type ChromeView } from "./chromeView";
import { sendToRenderer } from "./ipc";
import {
  DESKTOP_BIRD_SIZE,
  DESKTOP_DEFAULT_SPOT,
  DESKTOP_PEEK,
  DESKTOP_PEEK_WAITING,
  desktopComposerBounds,
  desktopFlightPoint,
  desktopHit,
  desktopPeekHit,
  desktopPlace,
  desktopSpotAt,
  desktopTucked,
  type DesktopPlace,
  type Rect,
} from "./Layout";
import { desktopFace, firstLine, readingTime, type DesktopResult, type DesktopTarget } from "./desktopBerryState";
import type { DesktopBerrySpot, DesktopBerryState, DesktopComposerState, Point, Settings, ThemeState } from "../shared/ipc";
import type { LibrarySnapshot, MascotProfile } from "../shared/library";
import { BERRY } from "../shared/mascots";

export const DESKTOP_SHORTCUT = "Alt+Space";

// How often the pointer is checked against what can be clicked. Nothing else tells a window that lets clicks through.
const POINTER_POLL_MS = 50;
// Two checks in a row, so a pointer passing along the edge doesn't bring it out.
const HOVER_AFTER_CHECKS = 2;
const TUCK_AFTER_LEAVING_MS = 700;
// About what the view takes to slide it, and then the window can go back to its small size.
const TUCK_MS = 260;
const FADE_MS = 170;
// Long enough to see where it landed, and to see the job was taken.
const STAYS_AFTER_LANDING_MS = 1400;
const STAYS_AFTER_SEND_MS = 1200;
const STAYS_AFTER_CLOSING_MS = 500;
const FLIGHT_MIN_MS = 700;
const FLIGHT_MAX_MS = 1200;
const FLIGHT_POINTS = 30;
const MAX_RESULTS = 5;
// A result can still be read by hovering for this long, and then there's nothing left to say about it.
const RESULT_LASTS_MS = 10 * 60 * 1000;
// A window being minimised only says so when it's finished, so leaving waits a moment to see which this is.
const LEAVING_SETTLES_MS = 800;
const COMPOSER_WIDTH = 400;
const COMPOSER_MIN_HEIGHT = 50;
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
  takeOffPoint: () => Promise<Point>;
  setAway: (away: boolean) => void;
  // A chat that has just ended. Null if the user stopped it or it's gone.
  ended: (chatId: string) => { mascotId: string; text: string; error: string | null } | null;
  chatOnScreen: (chatId: string) => boolean;
  send: (text: string, mascotId: string) => boolean;
  open: (target: Exclude<DesktopTarget, null>) => void;
  showBlueberry: () => void;
}

const offsetBy = ({ x, y }: Point, by: Point): Point => ({ x: x + by.x, y: y + by.y });

// The bird that stands at the edge of the screen while the user is in other apps, with the shortcut that gives it a job.
// All it can do is start a chat with no page and open Blueberry, so it can't do anything a chat can't, or anything
// without asking. It never reads the screen, other apps or the clipboard, and there's no route from a tool to here.
//
// Its window keeps one size wherever it stands, so nothing resizes while it moves or speaks, and all its movement is
// transforms in the view, which keep going whatever the main process is doing. The window only covers the work area for
// a flight or a drag, and goes back to its small size once the bird has tucked away.
export class DesktopBerry {
  private window: BaseWindow | null = null;
  private view: ChromeView | null = null;
  private composerWindow: BaseWindow | null = null;
  private composer: ChromeView | null = null;
  private composerGlass = false;
  private composerHeight = COMPOSER_MIN_HEIGHT;
  private composing = false;
  private outside = false;
  // "wide" means the window covers the work area: for a flight, a drag, or the bird settling after one.
  private motion: "none" | "flying" | "dragging" | "wide" = "none";
  private flight: DesktopBerryState["flight"] = null;
  private flightId = 0;
  private flightTimer: NodeJS.Timeout | null = null;
  private fadeTimer: NodeJS.Timeout | null = null;
  private leavingTimer: NodeJS.Timeout | null = null;
  private pointerTimer: NodeJS.Timeout | null = null;
  private stayTimer: NodeJS.Timeout | null = null;
  private shrinkTimer: NodeJS.Timeout | null = null;
  private expiryTimer: NodeJS.Timeout | null = null;
  // Out for a moment by itself, because it has something to say or has just done something.
  private staying = false;
  // Says it's out and the words are showing, rather than only being out.
  private announcing = false;
  private announced: string | null = null;
  private hovering = false;
  private hoverChecks = 0;
  private leftAt: number | null = null;
  private passingClicks = true;
  private frame = 0;
  private bounds: Rect = { x: 0, y: 0, width: DESKTOP_BIRD_SIZE, height: DESKTOP_BIRD_SIZE };
  private lineBox: Rect | null = null;
  private results: Array<DesktopResult & { endedAt: number }> = [];
  private wasRunning = new Set<string>();
  private spot: DesktopBerrySpot | null = null;
  // With no saved display, the one it came out on, so it doesn't follow the pointer around.
  private pinnedDisplayId: number | null = null;
  private waiting = false;
  private registered = false;
  private _shortcutTaken = false;

  constructor(private readonly host: DesktopBerryHost) {}

  get chromeView(): ChromeView | null {
    return this.view;
  }

  get composerView(): ChromeView | null {
    return this.composer;
  }

  get shortcutTaken(): boolean {
    return this._shortcutTaken;
  }

  private get on(): boolean {
    const { desktopBerry, onboarded } = this.host.settings();
    return desktopBerry && onboarded;
  }

  // Goes by the settings, so it's called whenever one may have changed. `turnedOn` is the user pressing the switch: it
  // flies out to show where it lives. With Blueberry in front it then comes back in, once it has tucked away, because
  // that's where it belongs while they're here. Launching with it on doesn't fly anywhere.
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
    this.createComposer();
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
    this.motion = "none";
    this.flight = null;
    this.staying = this.announcing = this.hovering = false;
    this.announced = null;
    this.results = [];
    this.host.setAway(false);
    const { window, view } = this;
    this.window = null;
    this.view = null;
    view?.view.webContents.close();
    if (!window?.isDestroyed()) window?.destroy();
    this.destroyComposer();
  }

  destroy(): void {
    this.turnOff();
  }

  private stopTimers(): void {
    [this.fadeTimer, this.leavingTimer, this.stayTimer, this.shrinkTimer, this.flightTimer, this.expiryTimer].forEach((timer) => timer && clearTimeout(timer));
    if (this.pointerTimer) clearInterval(this.pointerTimer);
    this.fadeTimer = this.leavingTimer = this.stayTimer = this.shrinkTimer = this.flightTimer = this.expiryTimer = this.pointerTimer = null;
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
      ...(process.platform === "darwin" ? { type: "panel" as const, hiddenInMissionControl: true } : { type: "toolbar" as const }),
    };
  }

  private floatEverywhere(window: BaseWindow): void {
    window.setAlwaysOnTop(true, "floating");
    // Without the last option this flips the app's Dock icon off and on.
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }

  private createWindow(): void {
    this.bounds = { x: 0, y: 0, width: DESKTOP_BIRD_SIZE, height: DESKTOP_BIRD_SIZE };
    const window = new BaseWindow({
      ...this.panelOptions,
      width: this.bounds.width,
      height: this.bounds.height,
      transparent: true,
      hasShadow: false,
      roundedCorners: false,
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

  // Made up front, so the first keys after the shortcut aren't lost to it loading. With glass, the system's own material
  // fills the window, as CSS can't blur what's behind a window. It takes the window's shape, so the corners are the
  // system's. Otherwise it's a solid box in a clear window.
  private createComposer(): void {
    const { glass } = this.host.theme();
    this.composerGlass = glass && process.platform === "darwin";
    const window = new BaseWindow({
      ...this.panelOptions,
      width: COMPOSER_WIDTH,
      height: this.composerHeight,
      ...(this.composerGlass ? { vibrancy: "popover" as const, visualEffectState: "active" as const, hasShadow: true } : { transparent: true, hasShadow: false, roundedCorners: false }),
    });
    this.floatEverywhere(window);
    const chrome = createChromeView("composer");
    chrome.view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    chrome.view.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && (input.meta || input.control) && !COMPOSER_MENU_KEYS.has(input.key.toLowerCase())) event.preventDefault();
    });
    window.contentView.addChildView(chrome.view);
    chrome.view.setBounds({ x: 0, y: 0, width: COMPOSER_WIDTH, height: this.composerHeight });
    window.on("blur", () => this.closeComposer());
    this.composerWindow = window;
    this.composer = chrome;
    window.hide();
  }

  private destroyComposer(): void {
    const { composerWindow, composer } = this;
    this.composerWindow = null;
    this.composer = null;
    composer?.view.webContents.close();
    if (composerWindow && !composerWindow.isDestroyed()) composerWindow.destroy();
  }

  private registerShortcut(): void {
    this.registered = globalShortcut.register(DESKTOP_SHORTCUT, () => this.toggleComposer());
    this._shortcutTaken = !this.registered;
  }

  private readonly onDisplays = (): void => {
    if (this.motion !== "none") return;
    this.place();
    this.publish();
  };

  // Where it stands. A saved display that has gone means the same place on the edge of one that's there, and being a
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

  private get peek(): number {
    return this.waiting ? DESKTOP_PEEK_WAITING : DESKTOP_PEEK;
  }

  // Everything's worked out for where the small window goes, and this is how far that is from where the window is now.
  private get offset(): Point {
    const { window } = this.here;
    return { x: window.x - this.bounds.x, y: window.y - this.bounds.y };
  }

  private setBounds(bounds: Rect): void {
    const before = this.bounds;
    if (before.x === bounds.x && before.y === bounds.y && before.width === bounds.width && before.height === bounds.height) return;
    this.bounds = bounds;
    this.frame++;
    this.window?.setBounds(bounds);
    if (before.width !== bounds.width || before.height !== bounds.height) {
      this.view?.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    }
  }

  private place(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.setBounds(this.here.window);
    this.placeComposer();
  }

  private widen(area: Rect): void {
    if (this.shrinkTimer) clearTimeout(this.shrinkTimer);
    this.shrinkTimer = null;
    this.setBounds(area);
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
    this.pinnedDisplayId = null;
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    const from = fly && this.flightAllowed ? await this.host.takeOffPoint() : null;
    await this.whenLoaded();
    if (!this.window || !this.outside) return;
    this.host.setAway(true);
    if (from) this.fly(from);
    else {
      this.place();
      if (fly) this.stayFor(STAYS_AFTER_LANDING_MS);
    }
    this.publish();
    this.window.showInactive();
    this.watchPointer();
  }

  private goInside(): void {
    if (!this.outside) return;
    this.cancelFlight();
    if (this.shrinkTimer) clearTimeout(this.shrinkTimer);
    this.shrinkTimer = null;
    this.motion = "none";
    this.outside = false;
    this.publish();
    this.host.setAway(false);
    this.stopWatchingPointer();
    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = null;
      if (this.outside || !this.window || this.window.isDestroyed()) return;
      this.window.hide();
      this.place();
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

  // Drawn by the view along a path, so the window keeps still for all of it. It lands standing, and tucks after a moment.
  private fly(from: Point): void {
    const { display } = this.standing;
    const area = display.workArea;
    this.motion = "flying";
    this.widen(area);
    const here = this.here;
    const land = offsetBy(here.out, this.offset);
    // In the window, which is on one display. It takes off from the edge of that if the browser is on another.
    const start = {
      x: Math.min(Math.max(from.x - DESKTOP_BIRD_SIZE / 2 - area.x, 0), area.width - DESKTOP_BIRD_SIZE),
      y: Math.min(Math.max(from.y - DESKTOP_BIRD_SIZE / 2 - area.y, 0), area.height - DESKTOP_BIRD_SIZE),
    };
    const ms = Math.round(Math.min(Math.max(Math.hypot(land.x - start.x, land.y - start.y) * 0.9, FLIGHT_MIN_MS), FLIGHT_MAX_MS));
    this.flight = {
      id: ++this.flightId,
      ms,
      left: land.x < start.x,
      path: Array.from({ length: FLIGHT_POINTS + 1 }, (_, index) => desktopFlightPoint(start, land, index / FLIGHT_POINTS)),
    };
    if (this.flightTimer) clearTimeout(this.flightTimer);
    this.flightTimer = setTimeout(() => this.landed(), ms);
  }

  private landed(): void {
    this.flightTimer = null;
    this.flight = null;
    this.motion = "wide";
    this.stayFor(STAYS_AFTER_LANDING_MS);
    this.publish();
  }

  private cancelFlight(): void {
    if (this.flightTimer) clearTimeout(this.flightTimer);
    this.flightTimer = null;
    this.flight = null;
    if (this.motion === "flying") this.motion = "wide";
  }

  // --- Out or tucked ---

  private get tucked(): boolean {
    return !this.composing && !this.hovering && !this.staying && this.motion !== "flying" && this.motion !== "dragging";
  }

  private stayFor(ms: number, announcing = false): void {
    this.staying = true;
    this.announcing = announcing;
    if (this.stayTimer) clearTimeout(this.stayTimer);
    this.stayTimer = setTimeout(() => {
      this.stayTimer = null;
      this.staying = this.announcing = false;
      this.afterChange();
    }, ms);
  }

  // Once it's tucked, the window can go back to its small size, with only its head to blink if that takes a frame.
  // Turned on with Blueberry in front, this is also when it comes back in.
  private afterChange(): void {
    this.publish();
    if (!this.tucked || this.shrinkTimer) return;
    this.shrinkTimer = setTimeout(() => {
      this.shrinkTimer = null;
      if (!this.tucked || !this.window) return;
      this.motion = "none";
      this.place();
      this.publish();
      if (this.host.inFront() && !this.composing) this.goInside();
    }, TUCK_MS);
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

  private get hits(): Rect[] {
    const here = this.here;
    const { edge } = this.standing.spot;
    const by = this.offset;
    const bird = this.tucked
      ? (() => {
          const peek = desktopPeekHit(here, edge, this.peek);
          return { ...peek, ...offsetBy(peek, by) };
        })()
      : { ...offsetBy(here.out, by), width: DESKTOP_BIRD_SIZE, height: DESKTOP_BIRD_SIZE };
    return this.lineShowing && this.lineBox ? [bird, this.lineBox] : [bird];
  }

  private checkPointer(): void {
    if (this.motion === "dragging") return;
    if (this.motion === "flying") return this.setPassingClicks(true);
    const over = desktopHit(screen.getCursorScreenPoint(), this.bounds, this.hits);
    this.setPassingClicks(!over);
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
    if (Date.now() - this.leftAt < TUCK_AFTER_LEAVING_MS) return;
    this.leftAt = null;
    this.hovering = false;
    this.afterChange();
  }

  private setPassingClicks(passing: boolean): void {
    if (passing === this.passingClicks || !this.window || this.window.isDestroyed()) return;
    this.passingClicks = passing;
    this.window.setIgnoreMouseEvents(passing);
  }

  // --- From the views ---

  setLineBox(box: Rect | null): void {
    const valid = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);
    this.lineBox = box && [box.x, box.y, box.width, box.height].every(valid) ? box : null;
  }

  setComposerHeight(height: number): void {
    if (typeof height !== "number" || !Number.isFinite(height)) return;
    this.composerHeight = Math.max(Math.round(height), COMPOSER_MIN_HEIGHT);
    this.placeComposer();
  }

  private placeComposer(): void {
    const window = this.composerWindow;
    if (!window || window.isDestroyed() || !this.composing) return;
    const { display, spot } = this.standing;
    const bounds = desktopComposerBounds(display.workArea, spot, { width: COMPOSER_WIDTH, height: this.composerHeight });
    window.setBounds(bounds);
    this.composer?.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  }

  get composerState(): DesktopComposerState {
    return { open: this.composing, name: this.host.nameOf(this.chosen.id) };
  }

  private publishComposer(): void {
    if (this.composer) sendToRenderer(this.composer.view.webContents, "desktop:composer-state", this.composerState);
  }

  send(text: string): boolean {
    if (typeof text !== "string" || !this.composing) return false;
    if (!this.host.send(text, this.chosen.id)) return false;
    this.closeComposer(STAYS_AFTER_SEND_MS);
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
    if (!this.window || !this.composerWindow) return;
    this.cancelFlight();
    this.composing = true;
    await this.comeOut(false);
    if (!this.window || !this.composerWindow || !this.composing) return;
    this.publish();
    this.publishComposer();
    this.placeComposer();
    this.composerWindow.showInactive();
    this.composerWindow.focus();
    this.composer?.view.webContents.focus();
  }

  // Hiding it gives the keyboard back to the app in front, which never stopped being the one in front.
  closeComposer(staysFor = STAYS_AFTER_CLOSING_MS): void {
    if (!this.composing || !this.composerWindow) return;
    this.composing = false;
    this.composerWindow.hide();
    this.publishComposer();
    this.stayFor(staysFor);
    this.publish();
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

  // Free for as long as the pointer has it, over the whole work area, and the view moves it.
  dragStart(): void {
    if (!this.window || this.motion === "flying") return;
    this.closeComposer();
    this.motion = "dragging";
    this.widen(this.standing.display.workArea);
    this.setPassingClicks(false);
    this.publish();
  }

  // Goes to the nearest edge. It glides there if that's on the same display, and it stays out while the pointer is on it.
  dragEnd(): void {
    if (this.motion !== "dragging" || !this.window) return;
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const sameDisplay = display.id === this.standing.display.id;
    this.spot = desktopSpotAt(display.workArea, display.id, point);
    this.motion = "wide";
    if (!sameDisplay) this.widen(display.workArea);
    this.hovering = true;
    this.leftAt = Date.now();
    this.publish();
    this.host.update({ desktopBerrySpot: this.spot });
  }

  showMenu(): void {
    if (!this.window) return;
    const { keepBerryStill, showBerry } = this.host.settings();
    const { target } = this.face;
    const result = target?.page === "chat" && this.results.some(({ chatId }) => chatId === target.chatId) ? target.chatId : null;
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
          { chatId, mascotId: chat.mascotId, failed: chat.error !== null, text: chat.error ?? (firstLine(chat.text) || "Done."), endedAt: Date.now() },
        ].slice(-MAX_RESULTS);
        if (this.expiryTimer) clearTimeout(this.expiryTimer);
        this.expiryTimer = setTimeout(() => {
          this.expiryTimer = null;
          this.results = this.results.filter(({ endedAt }) => Date.now() - endedAt < RESULT_LASTS_MS);
          this.publish();
        }, RESULT_LASTS_MS);
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
        ...library.chats.filter(({ running }) => running).map(({ id, mascotId, title }) => ({ chatId: id, mascotId: mascotId ?? BERRY.id, title })),
        ...library.routines.filter(({ latestRun }) => latestRun?.status === "running").map(({ mascotId, name }) => ({ chatId: null, mascotId: mascotId ?? BERRY.id, title: name })),
      ],
      chosen: this.chosen,
      mascot: (id) => this.host.mascot(id),
      nameOf: ({ id }) => this.host.nameOf(id),
    });
  }

  // Something new to say brings it out, once, for as long as it takes to read.
  private announce({ announce, line }: ReturnType<typeof desktopFace>): void {
    if (!this.outside || announce === this.announced) return;
    this.announced = announce;
    if (!announce || !line) return;
    this.stayFor(readingTime(line), true);
  }

  private get lineShowing(): boolean {
    return !this.composing && this.motion !== "flying" && this.motion !== "dragging" && (this.announcing || this.hovering);
  }

  get state(): DesktopBerryState {
    const { showBerry, keepBerryStill } = this.host.settings();
    const { mood, name, look, line, sign } = this.face;
    const here = this.here;
    const { edge } = this.standing.spot;
    const by = this.offset;
    const { tucked } = this;
    return {
      mood,
      name,
      look,
      line,
      sign: tucked ? sign : null,
      lineShowing: this.lineShowing && line !== null,
      lineAnchor: {
        ...here.line,
        // The window may be wider than the small one for now, and everything is measured from the small one.
        fromSide: here.line.side === "left" ? here.line.fromSide + by.x : here.line.fromSide + (this.bounds.width - by.x - here.window.width),
        middle: here.line.middle + by.y,
      },
      shown: this.outside,
      frame: this.frame,
      origin: { x: this.bounds.x, y: this.bounds.y },
      at: offsetBy(tucked ? desktopTucked(here, edge, this.peek) : here.out, by),
      edge,
      flip: here.flip,
      tucked,
      dragging: this.motion === "dragging",
      flight: this.flight,
      showBerry,
      still: keepBerryStill || this.host.stillMotion(),
    };
  }

  private publish(): void {
    if (!this.view) return;
    const face = this.face;
    this.waiting = face.sign === "waiting";
    this.announce(face);
    sendToRenderer(this.view.view.webContents, "desktop:state", this.state);
    if (this.composing) this.publishComposer();
  }

  notifyTheme(): void {
    const theme = this.host.theme();
    if (this.view) sendToRenderer(this.view.view.webContents, "theme:updated", theme);
    if (this.composer) sendToRenderer(this.composer.view.webContents, "theme:updated", theme);
    // Reduce Transparency changed, and a window can't change from having a material to being clear.
    const wantsGlass = theme.glass && process.platform === "darwin";
    if (this.window && wantsGlass !== this.composerGlass && !this.composing) {
      this.destroyComposer();
      this.createComposer();
    }
  }
}
