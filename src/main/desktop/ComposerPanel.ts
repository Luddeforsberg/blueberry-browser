import {
  checkDecision,
  desktopAsk,
  desktopCloud,
  desktopTray,
  desktopWhere,
  saidWords,
  type ShownAsk,
  type TrayTarget,
} from "./desktopBerryState";
import { desktopBoxPlace, desktopSheetsPlace, type DesktopPlace } from "../window/desktopPlaces";
import type { DesktopBox, DesktopDecided, DesktopPanelState } from "../../shared/ipc";
import type { MascotProfile, NeedsYouItem } from "../../shared/library";
import { DESKTOP_SHADOW, DESKTOP_SHEET } from "../../shared/desktopSizes";
import { BERRY } from "../../shared/mascots";
import { sendToRenderer } from "../window/ipc";
import type { DesktopParts } from "./DesktopParts";
import { SIZE_MS, whenLoaded } from "./desktopWindows";

// How long the ask says what happened before it goes.
const SAID_MS = 1500;
// How long opening the tray waits for the view to say how tall it is, so the window shows at its size.
const HEIGHT_WAIT_MS = 150;

// The panel: the window that can take the keyboard without bringing Blueberry forward, drawing the prompt box, the
// tray or the ask, and what each of them sends. Main holds the ask that's showing, so the view never names it.
export class ComposerPanel {
  // The panel: what it shows, and the ask main holds so the view never names it.
  panelOpen: "box" | "sheets" | null = null;
  trayOpen = false;
  asking: ShownAsk | null = null;
  private asksShown = 0;
  said: string | null = null;
  private opened = 0;
  closing = false;
  private panelBounds: DesktopPlace | null = null;
  private boxThick = 0;
  private sheetsHeight = 0;
  heightWaiters: Array<() => void> = [];
  private trayKeys = new Map<string, TrayTarget>();
  private keyCount = 0;

  panelHideTimer: NodeJS.Timeout | null = null;
  saidTimer: NodeJS.Timeout | null = null;

  constructor(private readonly d: DesktopParts) {}

  // --- The panel: the prompt box, the tray and the ask ---

  toggleBox(): void {
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

  openTray(): void {
    if (this.panelOpen !== "sheets" || this.closing) this.opened++;
    this.panelOpen = "sheets";
    this.trayOpen = true;
    this.asking = null;
    this.said = null;
    void this.showPanel();
  }

  // The exact words only ever reach the view from here, after Answer was pressed.
  openAsk(item: NeedsYouItem, withTray: boolean): void {
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
    const window = this.d.panelWindow;
    if (!window) return;
    if (this.panelHideTimer) clearTimeout(this.panelHideTimer);
    this.panelHideTimer = null;
    this.closing = false;
    this.d.drop.hovering = false;
    void this.d.drop.comeOut();
    await whenLoaded(this.d.panel?.view.webContents);
    // Closed while it waited, so it stays closed, and the keyboard stays where it is.
    if (!this.panelOpen || this.closing || this.d.panelWindow !== window) return;
    // The tray and the ask are as tall as what's in them, so the window waits to hear that before it shows.
    const sized = this.panelOpen === "sheets" ? this.nextHeight() : Promise.resolve();
    this.placePanel();
    this.publishPanel();
    this.d.publish();
    await sized;
    if (!this.panelOpen || this.closing || this.d.panelWindow !== window || window.isDestroyed()) return;
    this.placePanel();
    this.publishPanel();
    window.showInactive();
    window.focus();
    this.d.panel?.view.webContents.focus();
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
    if (this.d.panelWindow?.isVisible()) {
      this.placePanel();
      this.publishPanel();
    }
  }

  private get sheetsWidth(): number {
    const sheets = this.trayOpen && this.asking ? 2 * DESKTOP_SHEET.width + DESKTOP_SHEET.gap : DESKTOP_SHEET.width;
    return sheets + 2 * DESKTOP_SHADOW;
  }

  placePanel(): void {
    const window = this.d.panelWindow;
    if (!window || window.isDestroyed() || !this.panelOpen) return;
    const { display, spot } = this.d.drop.standing;
    const place =
      this.panelOpen === "box"
        ? desktopBoxPlace(display.workArea, spot, this.boxThick)
        : desktopSheetsPlace(display.workArea, spot, { width: this.sheetsWidth, height: this.sheetsHeight || 200 });
    this.panelBounds = place;
    window.setBounds(place.window);
    this.d.panel?.view.setBounds({ x: 0, y: 0, width: place.window.width, height: place.window.height });
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
      this.d.panelWindow?.hide();
      this.publishPanel();
      this.d.publish();
      if (this.d.host.inFront()) this.d.drop.goInside();
    };
    if (this.d.still) return finish();
    this.panelHideTimer = setTimeout(finish, SIZE_MS);
  }

  get chosen(): MascotProfile {
    const mascot = this.d.host.mascot(this.d.host.settings().chosenMascotId);
    return mascot.deletedAt === null ? mascot : BERRY;
  }

  send(text: string, cloud: boolean): boolean {
    if (this.panelOpen !== "box" || this.closing || typeof text !== "string" || typeof cloud !== "boolean") return false;
    const chosen = this.chosen;
    if (!this.d.host.send(text, chosen.id, desktopWhere(chosen, this.d.host.cloud(), cloud))) return false;
    this.closePanel();
    return true;
  }

  choose(mascotId: string): void {
    if (typeof mascotId !== "string") return;
    const mascot = this.d.host.library().mascots.find(({ id }) => id === mascotId);
    if (!mascot || mascot.deletedAt !== null) return;
    this.d.host.update({ chosenMascotId: mascot.id === BERRY.id ? null : mascot.id });
  }

  openBlueberry(): void {
    this.closePanel();
    this.d.host.showBlueberry();
  }

  trayPress(key: string): void {
    // Not while it's going away: what was pressed is no longer there to press.
    const target = typeof key === "string" && this.trayOpen && !this.closing ? this.trayKeys.get(key) : undefined;
    if (!target) return;
    if (target.kind === "ask") {
      const item = this.d.news.facts.needsYou.find(({ id, approval }) => id === target.chatId && approval.id === target.approvalId);
      if (item) this.openAsk(item, true);
      return;
    }
    this.closePanel();
    if (target.target.page === "chat") this.d.news.forgetResult(target.target.chatId);
    this.d.host.open(target.target);
    this.d.publish();
  }

  // Applied to the ask main showed, through the same path as Needs you, once. Nothing goes if that ask isn't the one
  // waiting any more or has changed since it was shown, if the press was on an earlier showing, or once the sheet is
  // going away, and a handoff or a code never goes from here.
  decide(decision: unknown): DesktopDecided {
    if (this.panelOpen !== "sheets" || this.closing) return "gone";
    const shown = this.asking;
    const check = checkDecision(shown, this.d.news.facts.needsYou, decision);
    if (!check.ok || !shown) {
      if (check.ok === false && check.why === "code") return "code";
      if (check.ok === false && check.why === "gone" && shown && !shown.decided) this.askGone();
      return "gone";
    }
    shown.decided = true;
    if (!this.d.host.decide(check.chatId, check.approvalId, check.allow, check.answer)) {
      this.askGone();
      return "gone";
    }
    this.said = saidWords(this.d.host.nameOf(shown.item.mascotId), !!shown.item.approval.question, check.allow);
    this.publishPanel();
    if (this.saidTimer) clearTimeout(this.saidTimer);
    this.saidTimer = setTimeout(() => {
      this.saidTimer = null;
      if (this.asking === shown) this.askGone();
    }, SAID_MS);
    return "done";
  }

  // The ask goes, and with the tray beside it the tray stays.
  askGone(): void {
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
    this.d.host.seePage(shown.item);
  }

  private get box(): DesktopBox {
    const chosen = this.chosen;
    const library = this.d.host.library();
    const face = (mascot: MascotProfile) => ({ id: mascot.id, name: this.d.host.nameOf(mascot.id), look: mascot.look });
    return {
      chosen: face(chosen),
      mascots: library.mascots.filter(({ deletedAt }) => deletedAt === null).map(face),
      cloud: desktopCloud(chosen, this.d.host.cloud()),
      recent: this.panelOpen === "box" ? this.d.host.recentJobs() : [],
      shortcut: this.d.registered,
    };
  }

  get panelState(): DesktopPanelState {
    const { showBerry } = this.d.host.settings();
    const facts = this.d.news.facts;
    const library = this.d.host.library();
    let tray: DesktopPanelState["tray"] = null;
    if (this.trayOpen && this.panelOpen === "sheets") {
      // A row keeps its key while it's showing, so a press made just as the tray changes still reaches it.
      const before = new Map([...this.trayKeys].map(([key, target]) => [JSON.stringify(target), key]));
      this.trayKeys.clear();
      const mascots = library.mascots.filter(({ deletedAt }) => deletedAt === null);
      tray = desktopTray({ ...facts, running: facts.running.map((job) => this.d.news.withProgress(job)) }, mascots, (target) => {
        const key = before.get(JSON.stringify(target)) ?? `k${++this.keyCount}`;
        this.trayKeys.set(key, target);
        return key;
      });
    }
    const shown = this.asking;
    const askFace = shown && {
      name: this.d.host.nameOf(shown.item.mascotId),
      look: this.d.host.mascot(shown.item.mascotId).look,
      mood: "asking" as const,
    };
    const place = this.panelBounds;
    return {
      open: this.panelOpen,
      opened: this.opened,
      closing: this.closing,
      edge: this.d.drop.standing.spot.edge,
      anchor: place?.anchor ?? { x: 0, y: 0 },
      box: this.box,
      tray,
      ask: shown && askFace ? { ...desktopAsk(shown.item, askFace), key: shown.key, said: this.said } : null,
      showBerry,
      still: this.d.still,
    };
  }

  publishPanel(): void {
    if (this.d.panel) sendToRenderer(this.d.panel.view.webContents, "desktop:panel-state", this.panelState);
  }
}
