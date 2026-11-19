import { webContents as allContents, type WebContents, type WebContentsView } from "electron";
import { createChromeView, type ChromeView } from "../window/chromeView";
import { sendToRenderer } from "../window/ipc";
import { menuPlacement, type MenuSheetBox } from "../window/floatingPlaces";
import type { Rect } from "../window/Layout";
import { AskBook, buildMenu, MenuBook, type EditRole, type OwnMenuItem } from "./ownMenu";
import type { AskCard, MenuAnchor, MenuEntry, MenuPlacement, MenuViewState, ThemeState } from "../../shared/ipc";

// Where a menu view lives: a window, or a window of its own on the desktop.
export interface MenuSurface {
  // Where menus must stay, in the coordinates anchors are given in.
  area(): Rect;
  // Puts the view at `rect`, in the area's coordinates, over everything else, with the keyboard.
  show(rect: Rect): void;
  hide(): void;
}

export interface MenuOptions {
  label: string;
  mac: boolean;
  // A page the menu is about. It closes when that page goes somewhere else or goes.
  page?: WebContents;
  // After the menu closes, chosen or not, once what was chosen has run.
  onClosed?: (() => void) | undefined;
}

const MAX_SHEETS = 32;
const MAX_SHEET = { width: 640, height: 2000 };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// DESIGN.md section 8: our menus and the Asking first card, in a view of their own over everything else, since a tab's
// view covers the chrome. Main keeps what each row does and which question is waiting, and the view answers with ids
// only, which mean nothing outside the menu or card they came with. Nothing but this view can answer: a page, a tab's
// view, a tool or anything remote has no route here, because the channels accept this view's own top frame alone.
export class MenuView {
  readonly chromeView: ChromeView;
  private readonly surface: MenuSurface;
  private readonly menus = new MenuBook();
  private readonly asks = new AskBook();
  private shown: MenuViewState = null;
  private anchor: MenuAnchor | null = null;
  // The area a menu was placed in. It closes if that changes, since what it hung from may have moved.
  private openedIn: Rect | null = null;
  private onClosed: (() => void) | null = null;
  // What had the keyboard before, which gets it back after Escape, a choice or an answer.
  private returnTo: WebContents | null = null;
  private stopWatchingPage: (() => void) | null = null;
  // Where the view is while it shows.
  private at: Rect | null = null;
  private loaded = false;

  constructor(
    region: "menu" | "drop-menu",
    attach: (view: WebContentsView) => MenuSurface,
    private readonly options: { mascotsHidden: () => boolean; refocus: boolean },
  ) {
    this.chromeView = createChromeView(region);
    this.chromeView.view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.surface = attach(this.chromeView.view);
    this.hide();
    // A press anywhere else, another window or another app takes the keyboard, which closes a menu. A question stays.
    this.contents.on("blur", () => this.closeMenu());
    // The view crashed or its page loaded again: nothing there can answer what was shown, so it goes, and a question is no.
    // Its first load doesn't count, since a question can be asked before the view has finished loading.
    this.contents.once("did-finish-load", () => (this.loaded = true));
    this.contents.on("did-start-navigation", ({ isMainFrame, isSameDocument }) => {
      if (this.loaded && isMainFrame && !isSameDocument) this.lost();
    });
    this.contents.on("did-fail-load", (_event, _code, _description, _url, isMainFrame) => {
      if (isMainFrame) this.lost();
    });
    this.contents.on("render-process-gone", () => {
      this.lost();
      if (!this.contents.isDestroyed()) this.contents.reload();
    });
  }

  private lost(): void {
    this.closeMenu();
    if (this.shown === null) return;
    this.asks.cancel();
    this.shown = null;
    this.hide();
    this.giveBack();
  }

  private get contents(): WebContents {
    return this.chromeView.view.webContents;
  }

  get state(): MenuViewState {
    return this.shown;
  }

  get menuOpen(): boolean {
    return this.shown?.kind === "menu";
  }

  private show(rect: Rect): void {
    this.at = rect;
    this.surface.show(rect);
  }

  private hide(): void {
    this.at = null;
    this.surface.hide();
  }

  // Something new went over everything, such as a tab's view, so whatever this shows goes back on top.
  raise(): void {
    if (this.at) this.surface.show(this.at);
  }

  private publish(state: MenuViewState): void {
    this.shown = state;
    sendToRenderer(this.contents, "menu:shown", state);
  }

  private noteFocus(): void {
    const focused = allContents.getFocusedWebContents();
    this.returnTo = focused && focused !== this.contents ? focused : null;
  }

  private giveBack(): void {
    const target = this.returnTo;
    this.returnTo = null;
    if (this.options.refocus && target && !target.isDestroyed()) target.focus();
  }

  // Opens a menu at `anchor`, closing any other, and shows it once the view has said how big it is. Editing rows act on
  // what had the keyboard.
  open(items: OwnMenuItem[], anchor: MenuAnchor, options: MenuOptions): void {
    this.closeMenu();
    if (this.shown?.kind === "ask") return options.onClosed?.();
    this.noteFocus();
    const target = this.returnTo;
    const role = (name: EditRole) => () => {
      if (target && !target.isDestroyed()) target[name]();
    };
    const { entries, actions } = buildMenu(items, { mac: options.mac, role });
    if (entries.length === 0) return options.onClosed?.();
    const id = this.menus.start(actions);
    this.anchor = anchor;
    this.openedIn = this.surface.area();
    this.onClosed = options.onClosed ?? null;
    this.watchPage(options.page);
    // Hidden while the view measures what it drew. The sheets are as wide as their words, whatever the view's size.
    this.hide();
    this.publish({ kind: "menu", menu: { id, label: options.label, entries, mascotsHidden: this.options.mascotsHidden() } });
  }

  private watchPage(page: WebContents | undefined): void {
    if (!page) return;
    const close = () => this.closeMenu();
    const onNavigation = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
      if (details.isMainFrame && !details.isSameDocument) close();
    };
    page.on("did-start-navigation", onNavigation);
    page.once("destroyed", close);
    this.stopWatchingPage = () => {
      if (page.isDestroyed()) return;
      page.off("did-start-navigation", onNavigation);
      page.off("destroyed", close);
    };
  }

  // The view says how big it drew each sheet, and main places them, so a menu never leaves the area.
  place(menuId: unknown, sizes: unknown): MenuPlacement | null {
    const shown = this.shown;
    if (shown?.kind !== "menu" || menuId !== shown.menu.id || !this.anchor) return null;
    const sheets = validSheets(sizes, shown.menu.entries);
    const placement = sheets && menuPlacement(this.anchor, sheets, this.surface.area());
    if (!placement) {
      this.closeMenu();
      return null;
    }
    this.show(placement.view);
    this.contents.focus();
    return placement.sheets;
  }

  choose(menuId: unknown, rowId: unknown): void {
    const action = this.menus.take(menuId, rowId);
    if (!action) return;
    this.endMenu(true, action);
  }

  // Escape, from the menu itself: the keyboard goes back to what opened it.
  dismiss(menuId: unknown): void {
    if (this.menus.end(menuId)) this.endMenu(true);
  }

  // A press elsewhere, a tab switch, a page navigating or the window changing size. The keyboard stays where it went.
  closeMenu(): void {
    if (this.menus.end()) this.endMenu(false);
  }

  private endMenu(refocus: boolean, action?: () => void): void {
    this.stopWatchingPage?.();
    this.stopWatchingPage = null;
    this.anchor = this.openedIn = null;
    const onClosed = this.onClosed;
    this.onClosed = null;
    if (this.shown?.kind === "menu") {
      this.hide();
      this.publish(null);
    }
    if (refocus) this.giveBack();
    else this.returnTo = null;
    action?.();
    onClosed?.();
  }

  // Asking first: the card over the whole area, which only an answer from this view for this question settles. Another
  // question, or the view going, is no.
  ask(card: Omit<AskCard, "id">): Promise<boolean> {
    this.closeMenu();
    const { id, answer } = this.asks.start();
    if (this.shown?.kind !== "ask") this.noteFocus();
    this.publish({ kind: "ask", ask: { ...card, id } });
    this.show(this.surface.area());
    this.contents.focus();
    return answer;
  }

  // A warning with only OK.
  notice(question: string, detail: string): Promise<boolean> {
    return this.ask({ question, detail, action: null, mascot: null });
  }

  answer(askId: unknown, yes: unknown): void {
    if (!this.asks.answer(askId, yes)) return;
    this.hide();
    this.publish(null);
    this.giveBack();
  }

  // The layout changed: a question covers the area again, and a menu closes if the area changed size under it.
  fit(): void {
    const area = this.surface.area();
    const opened = this.openedIn;
    if (opened && (opened.width !== area.width || opened.height !== area.height)) this.closeMenu();
    if (this.shown?.kind === "ask") this.show(area);
  }

  notifyTheme(theme: ThemeState): void {
    sendToRenderer(this.contents, "theme:updated", theme);
  }

  destroy(): void {
    this.closeMenu();
    this.asks.cancel();
    if (!this.contents.isDestroyed()) this.contents.close();
  }
}

// What the view measured, checked against the menu it was sent: a size for the menu, and for submenus only of rows that
// have one, each a sane size.
const validSheets = (input: unknown, entries: MenuEntry[]): MenuSheetBox[] | null => {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SHEETS) return null;
  const sheets: MenuSheetBox[] = [];
  for (const sheet of input) {
    const { path, width, height, rowTop } = (sheet ?? {}) as Record<string, unknown>;
    if (typeof path !== "string" || !finite(width) || !finite(height) || !finite(rowTop)) return null;
    if (width <= 0 || width > MAX_SHEET.width || height <= 0 || height > MAX_SHEET.height || rowTop < 0 || rowTop > MAX_SHEET.height)
      return null;
    if (!hasSheet(entries, path)) return null;
    sheets.push({ path, width, height, rowTop });
  }
  return sheets;
};

const hasSheet = (entries: MenuEntry[], path: string): boolean => {
  if (path === "") return true;
  let list: MenuEntry[] | null = entries;
  for (const part of path.split(".")) {
    if (!/^\d+$/.test(part) || !list) return false;
    const entry: MenuEntry | undefined = list[Number(part)];
    list = entry?.kind === "row" ? entry.submenu : null;
  }
  return list !== null;
};
