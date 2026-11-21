import { screen, type Display } from "electron";
import type { Rect } from "../window/Layout";
import type { LibrarySnapshot } from "../../shared/library";
import {
  DESKTOP_DEFAULT_SPOT,
  desktopHit,
  desktopPlace,
  desktopRestingDrop,
  desktopSpotAt,
  type DesktopPlace,
} from "../window/desktopPlaces";
import { anythingGoing, desktopDrop } from "./desktopBerryState";
import type { DesktopBerrySpot, DesktopDropPart, DesktopDropState } from "../../shared/ipc";
import type { DesktopParts } from "./DesktopParts";
import { SIZE_MS, whenLoaded } from "./desktopWindows";

// How often the pointer is checked against what can be clicked. Nothing else tells a window that lets clicks through.
const POINTER_POLL_MS = 50;
// Two checks in a row, so a pointer passing along the edge doesn't make it grow.
const HOVER_AFTER_CHECKS = 2;
const SHRINK_AFTER_LEAVING_MS = 700;
// A window being minimised only says so when it's finished, so leaving waits a moment to see which this is.
const LEAVING_SETTLES_MS = 800;
const DROP_PARTS: readonly DesktopDropPart[] = ["drop", "answer", "open", "dismiss"];

// The drop's own window on the edge of the screen: where it stands, coming out and going in, what the pointer is over,
// a press, a drag or a right-click on it, and what it shows.
export class DropWindow {
  outside = false;
  dragging = false;
  private frame = 0;
  bounds: Rect = { x: 0, y: 0, width: 1, height: 1 };
  private dropBox: Rect | null = null;
  hovering = false;
  private hoverChecks = 0;
  private leftAt: number | null = null;
  passingClicks = true;

  spot: DesktopBerrySpot | null = null;
  // With no saved display, the one it came out on, so it doesn't follow the pointer around.
  private pinnedDisplayId: number | null = null;

  hideTimer: NodeJS.Timeout | null = null;
  leavingTimer: NodeJS.Timeout | null = null;
  pointerTimer: NodeJS.Timeout | null = null;

  constructor(private readonly d: DesktopParts) {}

  // Where it is. A saved display that has gone means the same place on the edge of one that's there, and being a
  // fraction along an edge, that's always on screen.
  get standing(): { display: Display; spot: Pick<DesktopBerrySpot, "edge" | "fraction"> } {
    const displays = screen.getAllDisplays();
    const display =
      displays.find(({ id }) => id === this.spot?.displayId) ??
      displays.find(({ id }) => id === this.pinnedDisplayId) ??
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.pinnedDisplayId = display.id;
    return { display, spot: this.spot ?? DESKTOP_DEFAULT_SPOT };
  }

  get here(): DesktopPlace {
    const { display, spot } = this.standing;
    return desktopPlace(display.workArea, spot);
  }

  private setBounds(bounds: Rect): void {
    const before = this.bounds;
    if (before.x === bounds.x && before.y === bounds.y && before.width === bounds.width && before.height === bounds.height) return;
    this.bounds = bounds;
    this.frame++;
    this.dropBox = null;
    this.d.window?.setBounds(bounds);
    if (before.width !== bounds.width || before.height !== bounds.height) {
      this.d.view?.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    }
  }

  place(): void {
    if (!this.d.window || this.d.window.isDestroyed()) return;
    this.setBounds(this.here.window);
  }

  // --- Coming and going ---

  // It pours out of the edge: the view grows it from nothing once it's shown.
  async comeOut(): Promise<void> {
    if (!this.d.window || this.outside) return;
    this.outside = true;
    this.pinnedDisplayId = null;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    await whenLoaded(this.d.view?.view.webContents);
    if (!this.d.window || !this.outside) return;
    this.place();
    this.d.publish();
    this.d.window.showInactive();
    this.watchPointer();
  }

  goInside(): void {
    if (!this.outside || this.d.composer.panelOpen) return;
    this.outside = false;
    this.dragging = false;
    this.d.publish();
    this.stopWatchingPointer();
    this.hideTimer = setTimeout(
      () => {
        this.hideTimer = null;
        if (this.outside || !this.d.window || this.d.window.isDestroyed()) return;
        this.d.window.hide();
      },
      this.d.still ? 0 : SIZE_MS,
    );
  }

  // Blueberry's window has gone away, so the drop comes out.
  mainWindowGone(): void {
    if (this.leavingTimer) clearTimeout(this.leavingTimer);
    this.leavingTimer = null;
    void this.comeOut();
  }

  // The user has gone to another app. If it's still there a moment later, the drop comes out.
  mainWindowBlurred(): void {
    if (this.leavingTimer || !this.d.window) return;
    this.leavingTimer = setTimeout(() => {
      this.leavingTimer = null;
      if (!this.d.host.inFront()) void this.comeOut();
    }, LEAVING_SETTLES_MS);
  }

  mainWindowFocused(): void {
    if (this.leavingTimer) clearTimeout(this.leavingTimer);
    this.leavingTimer = null;
    this.goInside();
    this.d.sync();
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
    return {
      window: this.bounds,
      anchor: { x: here.anchor.x + here.window.x - this.bounds.x, y: here.anchor.y + here.window.y - this.bounds.y },
    };
  }

  private checkPointer(): void {
    if (this.dragging) return;
    const over = desktopHit(screen.getCursorScreenPoint(), this.bounds, [this.hit]);
    this.setPassingClicks(!over);
    // While the panel is open, the drop stays as it is beside it, and only takes a press.
    if (this.d.composer.panelOpen) return;
    if (over) {
      this.leftAt = null;
      if (this.hovering || ++this.hoverChecks < HOVER_AFTER_CHECKS) return;
      this.hovering = true;
      this.d.publish();
      return;
    }
    this.hoverChecks = 0;
    if (!this.hovering) return;
    this.leftAt ??= Date.now();
    if (Date.now() - this.leftAt < SHRINK_AFTER_LEAVING_MS) return;
    this.leftAt = null;
    this.hovering = false;
    if (this.d.news.endsOnLeaving) this.d.news.stopAnnouncing();
    this.d.publish();
  }

  private setPassingClicks(passing: boolean): void {
    if (passing === this.passingClicks || !this.d.window || this.d.window.isDestroyed()) return;
    this.passingClicks = passing;
    this.d.window.setIgnoreMouseEvents(passing);
  }

  // --- From the drop ---

  setDropBox(box: Rect, frame: number): void {
    const valid = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);
    if (frame !== this.frame || !box || ![box.x, box.y, box.width, box.height].every(valid)) return;
    this.dropBox = { x: box.x, y: box.y, width: box.width, height: box.height };
  }

  press(part: DesktopDropPart): void {
    if (!this.d.window || !DROP_PARTS.includes(part)) return;
    const facts = this.d.news.factsOf(this.d.host.library());
    if (part === "answer") {
      const [first] = facts.needsYou;
      if (first) this.d.composer.openAsk(first, false);
      return;
    }
    if (part === "open" || part === "dismiss") {
      const chatId = this.d.news.announcing;
      if (!chatId) return;
      this.d.news.forgetResult(chatId);
      if (part === "open") {
        this.d.composer.closePanel();
        this.d.host.open({ page: "chat", chatId });
      }
      return this.d.publish();
    }
    if (this.d.composer.panelOpen) return this.d.composer.closePanel();
    if (anythingGoing(facts)) this.d.composer.openTray();
    else this.d.composer.openBox();
  }

  // Free for as long as the pointer has it, over the whole work area, and the view moves it.
  dragStart(): void {
    if (!this.d.window || !this.outside) return;
    this.d.composer.closePanel();
    this.dragging = true;
    this.setBounds(this.standing.display.workArea);
    this.setPassingClicks(false);
    this.d.publish();
  }

  // It goes to the nearest edge, where it was let go.
  dragEnd(): void {
    if (!this.dragging || !this.d.window) return;
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    this.spot = desktopSpotAt(display.workArea, display.id, point);
    this.pinnedDisplayId = display.id;
    this.dragging = false;
    this.place();
    this.d.publish();
    this.d.host.update({ desktopBerrySpot: this.spot });
  }

  // At the pointer, on the screen it's on.
  showMenu(): void {
    if (!this.d.window || !this.d.menus) return;
    const { keepBerryStill, showBerry } = this.d.host.settings();
    const result = this.d.news.announcing ?? this.d.news.results.at(-1)?.chatId ?? null;
    const items: Parameters<NonNullable<DesktopParts["menus"]>["open"]>[0] = [
      ...(result
        ? [
            {
              label: "Not Now",
              click: () => {
                this.d.news.forgetResult(result);
                this.d.publish();
              },
            },
            { type: "separator" as const },
          ]
        : []),
      { label: "Open Blueberry", icon: "open", click: () => this.d.host.showBlueberry() },
      { type: "separator" },
      {
        label: "Keep Mascots Still",
        type: "checkbox",
        checked: keepBerryStill,
        click: () => this.d.host.update({ keepBerryStill: !keepBerryStill }),
      },
      { label: "Hide Mascots", type: "checkbox", checked: !showBerry, click: () => this.d.host.update({ showBerry: !showBerry }) },
      { label: "Take Off the Desktop", click: () => this.d.host.update({ desktopBerry: false }) },
    ];
    const point = screen.getCursorScreenPoint();
    this.d.menuArea = screen.getDisplayNearestPoint(point).workArea;
    this.d.menus.open(items, { ...point, width: 0, height: 0 }, { label: "Mascots", mac: process.platform === "darwin" });
  }

  stateOf(library: LibrarySnapshot): DesktopDropState {
    const { showBerry } = this.d.host.settings();
    const facts = this.d.news.factsOf(library);
    const pointed = this.hovering && !this.d.composer.panelOpen;
    if (pointed && facts.running.length === 1) facts.running = facts.running.map((job) => this.d.news.withProgress(job));
    const { faces, working, says } = desktopDrop(facts, { pointed, announcing: this.d.news.announcing, shortcut: this.d.registered });
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
      says: this.d.composer.panelOpen ? { kind: "rest" } : says,
      showBerry,
      still: this.d.still,
    };
  }
}
