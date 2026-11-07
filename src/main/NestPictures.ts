import { sendToRenderer } from "./ipc";
import type { Tab } from "./Tab";
import type { WebContents } from "electron";

// A tab card the user put there is pictured at a low rate, since it's only a reminder of the page. One of a working card's
// tabs is pictured as the working view pictures one, faster while it's where the job is and the bird is busy there.
const USER_TAB_MS = 3000;
const OTHER_JOB_TAB_MS = 3000;
const CURRENT_MS = 500;
const LIVELY_MS = 160;
const SHARPNESS = 2;
const MAX_WIDTH = 480;
// How many cards' pictures can be on screen at once. Past it, the rest show without one.
const MAX_WATCHED = 12;

// A page card on screen, as main knows it: its tab, and whether it's where a running job is working now, which may
// then have its bird drawn on it.
export interface WatchedPage {
  tab: Tab;
  job: { current: boolean } | null;
}

interface NestPicturesDeps {
  chrome: () => WebContents;
  // The page card's tab, if it's a page card of this Nest with an open tab that may be pictured. Null otherwise.
  resolve: (nestId: string, cardId: string) => WatchedPage | null;
  // The Nest is the tab in front, in a window that's showing.
  onScreen: (nestId: string) => boolean;
  pageWidth: () => number;
}

interface Seen {
  at: number;
  picture: Buffer;
}

const clampWidth = (width: unknown): number => (typeof width === "number" && Number.isFinite(width) ? Math.max(0, Math.min(width, MAX_WIDTH)) : 0);

// Small live pictures of the page cards on a Nest's board, while they're on screen. Like the working view's, a picture
// exists only here for a moment and in the chrome renderer while it's shown. It never goes to a tool, a chat or the disk.
export class NestPictures {
  private watching: { nestId: string; cards: Map<string, number> } | null = null;
  private readonly seen = new Map<string, Seen>();
  private readonly pictured = new Set<Tab>();
  private timer: NodeJS.Timeout | null = null;
  private capturing = false;
  private destroyed = false;

  constructor(private readonly deps: NestPicturesDeps) {}

  // The page cards the board has on screen now, each with the width its picture is drawn at. Null when none is.
  watch(nestId: unknown, cards: unknown): void {
    const entries = typeof nestId === "string" && Array.isArray(cards) ? cards.slice(0, MAX_WATCHED) : [];
    const valid = entries.flatMap((entry) => {
      const { cardId, width } = (entry ?? {}) as { cardId?: unknown; width?: unknown };
      const clamped = clampWidth(width);
      return typeof cardId === "string" && clamped > 0 ? [[cardId, clamped] as const] : [];
    });
    const next = valid.length > 0 ? { nestId: nestId as string, cards: new Map(valid) } : null;
    if (next?.nestId !== this.watching?.nestId) this.seen.clear();
    for (const cardId of this.seen.keys()) if (!next?.cards.has(cardId)) this.seen.delete(cardId);
    this.watching = next;
    this.sync();
  }

  // What's on screen, or whether a tab may be pictured, may have changed.
  sync(): void {
    if (this.destroyed) return;
    this.setScales();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.watched().length > 0) this.timer = setTimeout(() => void this.tick(), this.nextDelay());
  }

  private watched(): { cardId: string; width: number; page: WatchedPage }[] {
    const { watching } = this;
    if (!watching || !this.deps.onScreen(watching.nestId)) return [];
    return [...watching.cards].flatMap(([cardId, width]) => {
      const page = this.deps.resolve(watching.nestId, cardId);
      return page ? [{ cardId, width, page }] : [];
    });
  }

  private intervalOf(cardId: string, page: WatchedPage): number {
    if (!this.seen.has(cardId)) return 0;
    if (!page.job) return USER_TAB_MS;
    if (!page.job.current) return OTHER_JOB_TAB_MS;
    return page.tab.actor.lively ? LIVELY_MS : CURRENT_MS;
  }

  private nextDelay(): number {
    const now = Date.now();
    const waits = this.watched().map(({ cardId, page }) => (this.seen.get(cardId)?.at ?? 0) + this.intervalOf(cardId, page) - now);
    return Math.max(16, Math.min(USER_TAB_MS, ...waits));
  }

  // Where a job is working now, on a card on screen, the bird draws as it would for the working view's picture.
  private setScales(): void {
    const pageWidth = this.deps.pageWidth();
    const live = new Map(this.watched().flatMap(({ width, page }) => (page.job?.current && pageWidth > 0 ? [[page.tab, width / pageWidth] as const] : [])));
    this.pictured.forEach((tab) => {
      if (!live.has(tab)) {
        tab.setPictureScale(null);
        this.pictured.delete(tab);
      }
    });
    live.forEach((scale, tab) => {
      // Another view already pictures it, such as a chat's working view, which keeps it.
      if (!this.pictured.has(tab) && tab.pictureScale !== null) return;
      if (tab.pictureScale !== scale) tab.setPictureScale(scale);
      this.pictured.add(tab);
    });
  }

  private async tick(): Promise<void> {
    if (this.capturing || this.destroyed) return;
    this.capturing = true;
    try {
      const now = Date.now();
      const due = this.watched().filter(({ cardId, page }) => (this.seen.get(cardId)?.at ?? 0) + this.intervalOf(cardId, page) <= now);
      await Promise.all(due.map(({ cardId, width, page }) => this.capture(cardId, width, page.tab)));
    } finally {
      this.capturing = false;
    }
    this.sync();
  }

  private async capture(cardId: string, width: number, tab: Tab): Promise<void> {
    const nestId = this.watching?.nestId;
    if (!nestId) return;
    const before = this.seen.get(cardId);
    const picture = await tab.picture(Math.round(width * SHARPNESS));
    // The board may have gone, or the tab changed hands, while that was on its way, and then it goes no further.
    if (!picture || this.destroyed || this.watching?.nestId !== nestId || !this.watching.cards.has(cardId) || this.deps.resolve(nestId, cardId)?.tab !== tab) return;
    this.seen.set(cardId, { at: Date.now(), picture });
    if (before?.picture.equals(picture)) return;
    sendToRenderer(this.deps.chrome(), "nests:frame", { nestId, cardId, picture: `data:image/jpeg;base64,${picture.toString("base64")}` });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    this.pictured.forEach((tab) => tab.setPictureScale(null));
    this.pictured.clear();
    this.watching = null;
    this.seen.clear();
  }
}
