import { WebContentsView, type WebContents } from "electron";
import type { TabLoadError, TabTrouble } from "../../shared/ipc";
import { TabIcons } from "./tabIcons";
import { savedEntries, type SavedWebTab } from "./Session";
import type { NavigationLimits } from "./NavigationLimits";
import type { TabPage } from "./TabPage";
import type { WorkingStyle } from "./WorkingStyle";
import type { Tab, TabEvents } from "./Tab";

// The page sheet's radius from DESIGN.md section 2, `rounded-sheet` in the chrome.
const PAGE_RADIUS = 16;

// Chromium's code for a load that was stopped or replaced, or became a download. Nothing went wrong.
const ERR_ABORTED = -3;

// A shortcut or a scrolling key isn't the user working in the page, and neither is the key-up from a shortcut that
// brought them to this tab.
const isTyping = ({ type, key, meta, control }: Electron.Input): boolean =>
  type === "keyDown" && !meta && !control && ([...key].length === 1 || ["Enter", "Backspace", "Delete"].includes(key));

// A page that never loaded has no title of its own.
const titleForAddress = (url: string): string => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

// Every web page gets these, a popup included: no preload, no Node, sandboxed and isolated.
export const TAB_WEB_PREFERENCES = {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
} as const;

// What the page needs from the tab around it, which owns each of these.
export interface PageOwner {
  readonly tab: Tab;
  readonly events: TabEvents;
  readonly limits: NavigationLimits;
  readonly style: WorkingStyle;
  readonly page: TabPage;
  // Whether the view is drawn, which depends as much on the tab being shown or parked as on the page.
  readonly shouldDraw: () => boolean;
}

// The tab's page in its view: made when first needed, restored from the session, kept up to date from the page's own
// events, and taken back, forward or somewhere new.
export class WebPage {
  // Made when first needed, so a restored tab costs nothing until then.
  private webContentsView: WebContentsView | null = null;
  private _title: string;
  private _url: string;
  private _favicon: string | null = null;
  private readonly icons = new TabIcons();
  private _hasLoaded = false;
  private readonly tab: Tab;
  private readonly events: TabEvents;
  private readonly limits: NavigationLimits;
  private readonly style: WorkingStyle;
  private readonly page: TabPage;
  private readonly shouldDraw: () => boolean;
  // A restored tab has no page until it's first needed.
  unloaded: SavedWebTab | null = null;
  // Coming back to a page after a restart isn't a new visit.
  private notAVisit: string | null = null;
  private _trouble: TabTrouble | null = null;
  private _loadError: TabLoadError | null = null;
  private reloadOnceGone = false;
  // Set once we close the page, so its going isn't taken for the page closing itself.
  private closing = false;
  // A popup's page, made by Electron for `window.open` so the page that opened it can still reach it.
  private readonly opened: WebContents | null;

  constructor(owner: PageOwner, url: string, popup?: { page: WebContents; opener: Tab }) {
    this.tab = owner.tab;
    this.events = owner.events;
    this.limits = owner.limits;
    this.style = owner.style;
    this.page = owner.page;
    this.shouldDraw = owner.shouldDraw;
    this._url = url;
    this._title = "New tab";
    this.opened = popup?.page ?? null;
  }

  // Called once the tab has all its parts, since a popup's view is placed as soon as it's made.
  start(url: string, restored?: SavedWebTab, popup?: { page: WebContents; opener: Tab }): void {
    if (popup) {
      // Its first page is already on the way, so it only needs a view.
      void this.view;
    } else if (restored) {
      this._title = restored.title || this._title;
      this._favicon = restored.favicon;
      this.unloaded = restored;
    } else {
      // Load the initial URL
      void this.loadURL(url);
    }
  }

  private createView(): WebContentsView {
    // Create the WebContentsView for web content only
    const view = new WebContentsView(this.opened ? { webContents: this.opened } : { webPreferences: TAB_WEB_PREFERENCES });
    view.setBorderRadius(PAGE_RADIUS);
    view.setVisible(this.shouldDraw());
    this.setupEventListeners(view.webContents);
    return view;
  }

  private setupEventListeners(contents: WebContents): void {
    // Both are for the page itself: `will-navigate` for a link or script, `will-redirect` for a server sending it on.
    const limit = (event: { preventDefault: () => void }, url: string) => {
      if (this.limits.refusesNavigation(url)) {
        this.limits.refusalListeners.forEach((refused) => refused.add(url));
        event.preventDefault();
      }
    };
    contents.on("will-navigate", (event) => limit(event, event.url));
    contents.on("will-redirect", (event) => limit(event, event.url));

    // Electron emits both of these from inside `sendInputEvent`, so `sendingAgentInput` tells Berry's input from a person's.
    contents.on("before-mouse-event", (_, { type }) => {
      if (type === "mouseDown" && !this.page.sendingAgentInput) this.userInput();
    });
    contents.on("before-input-event", (_, input) => {
      if (isTyping(input) && !this.page.sendingAgentInput) this.userInput();
    });

    contents.on("page-title-updated", (_, title) => {
      this._title = title;
      this.events.onDetails();
      this.events.onChange();
    });

    contents.on("did-navigate", (_, url) => {
      this._hasLoaded = true;
      // Back, Forward and Reload report no icon, so the tab gives the page the one it had (`tabIcons.ts`).
      this._favicon = this.icons.after(this._url, url, this._favicon);
      this._url = url;
      // A restored page in the back list already has its title, so the page doesn't report it again.
      const { navigationHistory } = contents;
      this._title = navigationHistory.getEntryAtIndex(navigationHistory.getActiveIndex())?.title || this._title;
      // A new document has none of the old one's styles.
      if (this.tab.berryWorking) this.style.add();
      if (url !== this.notAVisit) this.events.onNavigate(url);
      this.notAVisit = null;
      this.events.onChange();
    });

    contents.on("dom-ready", () => this.tab.actor.pageReady());

    contents.on("page-favicon-updated", (_, favicons) => {
      this._favicon = favicons[0] ?? null;
      this.icons.remember(this._url, this._favicon);
      this.events.onDetails();
      this.events.onChange();
    });

    contents.on("did-navigate-in-page", (_, url, isMainFrame) => {
      if (!isMainFrame) return;
      this._url = url;
      this.events.onNavigate(url);
      this.events.onChange();
    });

    // A reload, a typed address or going back all bring the page back in a new process.
    contents.on("did-start-loading", () => {
      this.setTrouble(null);
      this.setLoadError(null);
      this.events.onChange();
    });
    contents.on("did-fail-load", (_, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === ERR_ABORTED) return;
      this._url = url;
      this._title = titleForAddress(url);
      this._favicon = null;
      this.setLoadError({ url, description });
      this.events.onChange();
    });
    contents.on("did-stop-loading", () => this.events.onChange());

    contents.on("render-process-gone", () => {
      if (contents.isDestroyed()) return;
      if (this.reloadOnceGone) {
        this.reloadOnceGone = false;
        contents.reload();
        return;
      }
      this.setTrouble("crashed");
    });
    contents.on("unresponsive", () => this.setTrouble("unresponsive"));
    contents.on("responsive", () => {
      if (this._trouble === "unresponsive") this.setTrouble(null);
    });
    contents.on("destroyed", () => {
      this.page.stopWaiting();
      this.tab.actor.destroyed();
      if (!this.closing) this.events.onClosedByPage();
    });
    // A popup may ask to be resized or moved, but it's a tab, so the window stays as it is.
    contents.on("content-bounds-updated", (event) => event.preventDefault());
  }

  private userInput(): void {
    this.tab.actor.userTouched();
    this.events.onUserInput();
  }

  // The chrome draws what to do about it, in the space the page leaves.
  private setTrouble(trouble: TabTrouble | null): void {
    if (trouble === this._trouble) return;
    this._trouble = trouble;
    this.webContentsView?.setVisible(this.shouldDraw());
    if (trouble) this.page.stopWaiting();
    this.events.onChange();
  }

  private setLoadError(error: TabLoadError | null): void {
    this._loadError = error;
    this.webContentsView?.setVisible(this.shouldDraw());
  }

  loadIfUnloaded(): void {
    const saved = this.unloaded;
    if (!saved) return;
    this.unloaded = null;
    this.notAVisit = saved.url;
    const { webContents } = this.view;
    // The two differ if the app quit before the address the tab was going to had loaded.
    const load =
      saved.entries[saved.index]?.url === saved.url
        ? webContents.navigationHistory.restore({ entries: saved.entries, index: saved.index })
        : webContents.loadURL(saved.url);
    load.catch((error) => console.error("Failed to restore a tab:", error));
  }

  // What it takes to open this tab again.
  get saved(): SavedWebTab {
    const details = { url: this._url, title: this._title, favicon: this._favicon };
    if (this.unloaded) return { ...this.unloaded, ...details };
    const { navigationHistory } = this.view.webContents;
    return { ...details, ...savedEntries(navigationHistory.getAllEntries(), navigationHistory.getActiveIndex()) };
  }

  // Takes pages out of the tab's back and forward lists, or all of them when no address is given.
  // The page it's showing stays.
  forget(url?: string): void {
    if (this.unloaded) {
      const { entries, index } = this.unloaded;
      const current = entries[index];
      const kept = entries.filter((entry) => entry === current || (url !== undefined && entry.url !== url));
      this.unloaded = { ...this.unloaded, entries: kept, index: current ? kept.indexOf(current) : 0 };
      return;
    }
    const { navigationHistory } = this.view.webContents;
    if (url === undefined) {
      navigationHistory.clear();
      return;
    }
    // From the end, so removing one doesn't move those still to come. The current page refuses to go.
    const entries = [...navigationHistory.getAllEntries().entries()].reverse();
    for (const [at, entry] of entries) {
      if (entry.url === url) navigationHistory.removeEntryAtIndex(at);
    }
  }

  get trouble(): TabTrouble | null {
    return this._trouble;
  }

  // Why the last address didn't load, until another load starts.
  get loadError(): TabLoadError | null {
    return this._loadError;
  }

  get title(): string {
    return this._title;
  }

  get url(): string {
    return this._url;
  }

  get favicon(): string | null {
    return this._favicon;
  }

  get isLoading(): boolean {
    return this.webContentsView?.webContents.isLoading() ?? false;
  }

  // False while the first address hasn't become a page, which a download never does.
  get hasLoaded(): boolean {
    return this._hasLoaded;
  }

  get canGoBack(): boolean {
    return this.webContentsView?.webContents.navigationHistory.canGoBack() ?? false;
  }

  get canGoForward(): boolean {
    return this.webContentsView?.webContents.navigationHistory.canGoForward() ?? false;
  }

  get webContents() {
    return this.view.webContents;
  }

  get view(): WebContentsView {
    if (!this.webContentsView) {
      this.webContentsView = this.createView();
      this.events.onView(this.tab);
    }
    return this.webContentsView;
  }

  // The view if there is one, for anything that shouldn't make one just by asking.
  get existingView(): WebContentsView | null {
    return this.webContentsView;
  }

  loadURL(url: string): Promise<void> {
    this.unloaded = null;
    this._url = url;
    return this.webContents.loadURL(url);
  }

  // Where going back would land.
  get backUrl(): string | null {
    if (!this.canGoBack) return null;
    const { navigationHistory } = this.webContents;
    return navigationHistory.getEntryAtIndex(navigationHistory.getActiveIndex() - 1)?.url ?? null;
  }

  // `byAgent` is for Berry's own tool. Every other caller is the user, so the tab is theirs from here.
  goBack(byAgent = false): void {
    if (!byAgent) this.events.onUserInput();
    if (this.canGoBack) this.webContents.navigationHistory.goBack();
  }

  goForward(): void {
    this.events.onUserInput();
    if (this.canGoForward) this.webContents.navigationHistory.goForward();
  }

  reload(): void {
    if (this.unloaded) {
      this.loadIfUnloaded();
    } else if (this._trouble === "unresponsive") {
      // A stuck page can't be reloaded from inside. A new process comes once this one has gone.
      this.reloadOnceGone = true;
      this.webContents.forcefullyCrashRenderer();
    } else if (this._loadError) {
      // A failed first load may leave nothing for a reload to go back to. How it goes shows on the tab.
      this.loadURL(this._loadError.url).catch(() => {});
    } else {
      this.webContents.reload();
    }
  }

  stop(): void {
    this.webContentsView?.webContents.stop();
  }

  close(): void {
    this.closing = true;
    const contents = this.webContentsView?.webContents;
    if (contents && !contents.isDestroyed()) contents.close();
  }
}
