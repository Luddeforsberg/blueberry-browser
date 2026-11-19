import type { View } from "electron";
import { createChromeView, type ChromeView } from "../window/chromeView";
import { sendToRenderer } from "../window/ipc";
import { TAB_PREVIEW, tabPreviewRect } from "../window/floatingPlaces";
import type { Layout } from "../window/Layout";
import { Tab } from "./Tab";
import type { Rect, TabPreviewRequest, ThemeState } from "../../shared/ipc";

// The card's picture at twice its width, 16:10 and cut from the top of the page.
const PICTURE_WIDTH = TAB_PREVIEW.width * 2;
const PICTURE_CUT = 10 / 16;

export interface TabPreviewDeps {
  // Any tab, web or not. Only a web tab gets a card.
  tab: (id: string) => object | null;
  layout: () => Pick<Layout, "mode" | "sidebarOpen" | "sidebarWidth" | "tabStrip">;
  window: () => { width: number; height: number };
  // The name of who is working in a tab, from its working mascot's id.
  mascotName: (id: string | null) => string;
  keepStill: () => boolean;
}

// A tab's preview card (DESIGN.md section 8), in a view of its own above the tabs, because in the sidebar it hangs over
// the page and in the tab row it reaches down past the toolbar. The chrome says which tab and where its row is, and when;
// this decides what the card shows and where it goes, and never takes the keyboard: nothing in it can be focused or
// pressed, and it goes as soon as the pointer leaves the tabs or reaches it.
//
// Each web tab has at most one picture, taken when it stops being the one in front, and again while the card shows if a
// mascot is working there. It's kept here, in memory, and goes to the preview view and nowhere else: not to the disk, the
// session, a tool, a chat or any other view. Closing the tab drops it.
export class TabPreviews {
  readonly chromeView: ChromeView = createChromeView("preview");
  private readonly pictures = new Map<string, string>();
  // The capture running for each tab, so a slow one can't land over a newer one.
  private readonly taking = new Map<string, number>();
  private takes = 0;
  private bounds: Rect | null = null;
  // What the card was last asked for, while it shows.
  private shown: TabPreviewRequest | null = null;

  constructor(
    private readonly parent: View,
    private readonly deps: TabPreviewDeps,
  ) {
    this.chromeView.view.setVisible(false);
    parent.addChildView(this.chromeView.view);
  }

  private get contents() {
    return this.chromeView.view.webContents;
  }

  // Keeps how the tab looks now. As the user leaves a tab, it's started before the tab is hidden and never waited for,
  // so it doesn't hold up the switch.
  async keep(tab: Tab): Promise<void> {
    const take = ++this.takes;
    this.taking.set(tab.id, take);
    const picture = await tab.picture(PICTURE_WIDTH, PICTURE_CUT).catch(() => null);
    if (this.taking.get(tab.id) !== take) return;
    this.taking.delete(tab.id);
    // Closed while it was on its way.
    if (this.deps.tab(tab.id) !== tab || !picture) return;
    this.pictures.set(tab.id, `data:image/jpeg;base64,${picture.toString("base64")}`);
  }

  forget(tabId: string): void {
    this.pictures.delete(tabId);
    this.taking.delete(tabId);
    if (this.shown?.tabId === tabId) this.hide();
  }

  show(input: unknown): void {
    const request = validRequest(input);
    const tab = request && this.deps.tab(request.tabId);
    // Blueberry's own pages and the tab in front get no card.
    if (!request || !(tab instanceof Tab) || tab.isVisible) return this.hide();
    this.shown = request;
    this.draw(tab, request);
    // A mascot working in it keeps it drawn behind the user's, so a fresh picture is cheap, and shows what it's doing.
    if (tab.isParked) {
      void this.keep(tab).then(() => {
        if (this.shown === request) this.draw(tab, { ...request, slide: false });
      });
    }
  }

  private draw(tab: Tab, request: TabPreviewRequest): void {
    const picture = this.pictures.get(tab.id) ?? null;
    const working = tab.berryWorking ? this.deps.mascotName(tab.workingMascotId) : null;
    const { view, card } = tabPreviewRect(this.deps.layout(), request.row, { picture: !!picture, working: !!working }, this.deps.window());
    const before = this.bounds;
    const moved = !before || view.x !== before.x || view.y !== before.y || view.width !== before.width || view.height !== before.height;
    if (moved) {
      // Adding a view again moves it to the top, above tabs and other views opened since. Only when it isn't showing, so
      // following the pointer along the tabs never touches the view.
      if (!this.bounds) this.parent.addChildView(this.chromeView.view);
      this.chromeView.view.setBounds(view);
      this.bounds = view;
    }
    sendToRenderer(this.contents, "preview:shown", {
      tabId: tab.id,
      title: tab.title || "New tab",
      site: siteOf(tab.url),
      picture,
      working,
      still: this.deps.keepStill(),
      card,
      slide: request.slide && !moved,
    });
    this.chromeView.view.setVisible(true);
  }

  hide(): void {
    this.shown = null;
    if (!this.bounds) return;
    this.bounds = null;
    this.chromeView.view.setVisible(false);
    sendToRenderer(this.contents, "preview:shown", null);
  }

  notifyTheme(theme: ThemeState): void {
    sendToRenderer(this.contents, "theme:updated", theme);
  }

  destroy(): void {
    this.pictures.clear();
    this.contents.close();
  }
}

// The site under the title: the host without www, or the address itself where there's none, such as about:blank.
const siteOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url.slice(0, 200);
  } catch {
    return url.slice(0, 200);
  }
};

// The chrome is trusted, but it only names a tab and where its row is, and the row must be a sane box.
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validRequest = (input: unknown): TabPreviewRequest | null => {
  const { tabId, row, slide } = (input ?? {}) as { tabId?: unknown; row?: Record<string, unknown>; slide?: unknown };
  const { x, y, width, height } = row ?? {};
  if (typeof tabId !== "string" || tabId.length === 0 || tabId.length > 100) return null;
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width <= 0 || height <= 0 || height > 200) return null;
  return { tabId, row: { x, y, width, height }, slide: slide === true };
};
