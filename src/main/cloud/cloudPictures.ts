import type { WebContents } from "electron";
import type { CdpTab } from "../tools/CdpTab";
import { sendToRenderer } from "../window/ipc";
import { Latest } from "../../shared/lateWork";

// The pictures of the cloud tab in front, for a browser with no live view, and the size each tab's page is shown at.
// Both go to the chrome only.

// What a cloud tab may ask its page's viewport to be, in pixels.
const FIT = { min: { width: 320, height: 200 }, max: { width: 3840, height: 2160 } };

export interface PicturesHooks {
  page: (id: string) => CdpTab | null;
  // Whether a job works in that page now, and not the user, so it keeps its size.
  working: (id: string) => boolean;
  chrome: () => WebContents | null;
}

export class CloudPictures {
  private watching: CdpTab | null = null;
  // Stopping the last tab's picture takes a moment, and the user may have moved on again by then.
  private readonly watches = new Latest();
  // The size the chrome last asked for, for a page a job is working in. A job's input aims at fixed points, so the page
  // only changes size once the job lets go of it.
  private readonly pendingFits = new Map<string, { width: number; height: number }>();

  constructor(private readonly hooks: PicturesHooks) {}

  async watch(id: unknown): Promise<void> {
    const page = typeof id === "string" ? this.hooks.page(id) : null;
    if (page === this.watching) return;
    const was = this.watching;
    this.watching = page;
    const turn = this.watches.next();
    await was?.watch(null);
    if (!turn.current) return;
    try {
      await page?.watch((data) => {
        const chrome = this.hooks.chrome();
        if (this.watching === page && chrome && !chrome.isDestroyed()) sendToRenderer(chrome, "cloud:frame", { tabId: page.id, data });
      });
    } catch {
      // The browser wouldn't start the pictures, so it isn't watching, and the next ask for this tab tries again.
      if (turn.current && this.watching === page) this.watching = null;
    }
  }

  // The chrome says how big the tab shows the page, and the page's viewport follows, as a window's own tab does on a resize.
  async fit(id: unknown, width: unknown, height: unknown): Promise<void> {
    const page = typeof id === "string" ? this.hooks.page(id) : null;
    if (!page || typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height)) return;
    const within = (value: number, axis: "width" | "height") => Math.round(Math.min(Math.max(value, FIT.min[axis]), FIT.max[axis]));
    this.pendingFits.set(page.id, { width: within(width, "width"), height: within(height, "height") });
    await this.applyFit(page.id);
  }

  async applyFit(id: string): Promise<void> {
    const size = this.pendingFits.get(id);
    const page = this.hooks.page(id);
    if (!size || !page || this.hooks.working(id)) return;
    this.pendingFits.delete(id);
    await page.fitTo(size.width, size.height);
  }

  // The tab closed.
  forget(id: string): void {
    this.pendingFits.delete(id);
    if (this.watching?.id === id) void this.watch(null);
  }

  // Everything stops, as the session ends.
  stop(): void {
    const was = this.watching;
    this.watching = null;
    this.watches.end();
    void was?.watch(null).catch(() => {});
    this.pendingFits.clear();
  }
}
