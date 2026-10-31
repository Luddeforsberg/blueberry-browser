import { NativeImage, WebContentsView, type WebContents, type WebFrameMain } from "electron";
import type { Layout, TabTrouble } from "../shared/ipc";
import { savedEntries, type SavedWebTab } from "./Session";

// The page card radius from DESIGN.md.
// Matches the card the page sits in, `rounded-panel` in the chrome.
const PAGE_RADIUS = 22;

// An id of our own, away from the page's world (0) and Electron's low numbers.
const AGENT_WORLD = 1000;
// A glow around the page while Berry works in it. Added as a style, not an element, so the page's own content
// and scripts are left alone, and it can't take a click.
const WORKING_CSS = `
  html::after {
    content: "" !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;
    pointer-events: none !important;
    box-shadow: inset 0 0 0 3px rgb(127 139 216), inset 0 0 72px rgb(127 139 216 / 0.6) !important;
    animation: berry-working 1600ms ease-in-out infinite alternate !important;
  }
  @keyframes berry-working { from { opacity: 0.6; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { html::after { animation: none !important; } }
`;

// How long a click gets to start loading something, and that load to end.
const LOAD_START_MS = 300;
const LOAD_END_MS = 10_000;

// Chromium's code for a load that was stopped or replaced, or became a download. Nothing went wrong.
const ERR_ABORTED = -3;

// A crashed or stuck page never answers, and no event says so for a page stuck with no input going to it.
const PAGE_ANSWER_MS = 10_000;

// Pages can carry dozens of frames for ads, and any of them can hang, so none can hold up reading the page.
const FRAME_ANSWER_MS = 2_000;
const MAX_FRAMES_READ = 30;
const FRAME_TEXT = `innerWidth > 1 && innerHeight > 1 ? document.body?.innerText ?? "" : ""`;

export interface TabEvents {
  onChange: () => void;
  onNavigate: (url: string) => void;
  // The page has reported its title or favicon.
  onDetails: () => void;
  // The tab has a view for the window to place.
  onView: (tab: Tab) => void;
}

export class Tab {
  readonly kind = "web";
  // Made when first needed, so a restored tab costs nothing until then.
  private webContentsView: WebContentsView | null = null;
  private _id: string;
  private _title: string;
  private _url: string;
  private _favicon: string | null = null;
  private _isVisible: boolean = false;
  private _berryWorking = false;
  private workingStyle: Promise<string | null> | null = null;
  private _hasLoaded = false;
  private events: TabEvents;
  // A restored tab has no page until it's first needed.
  private unloaded: SavedWebTab | null = null;
  // Coming back to a page after a restart isn't a new visit.
  private notAVisit: string | null = null;
  private _trouble: TabTrouble | null = null;
  private _loadError: { url: string; description: string } | null = null;
  private reloadOnceGone = false;
  // Calls to the page that are waiting for an answer it may never give.
  private readonly waiting = new Set<() => void>();

  constructor(
    id: string,
    url: string,
    events: TabEvents,
    restored?: SavedWebTab
  ) {
    this._id = id;
    this.events = events;
    this._url = url;
    this._title = "New Tab";

    if (restored) {
      this._title = restored.title || this._title;
      this._favicon = restored.favicon;
      this.unloaded = restored;
    } else {
      // Load the initial URL
      this.loadURL(url);
    }
  }

  private createView(): WebContentsView {
    // Create the WebContentsView for web content only
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    view.setBorderRadius(PAGE_RADIUS);
    view.setVisible(this.shouldDraw);
    this.setupEventListeners(view.webContents);
    return view;
  }

  private setupEventListeners(contents: WebContents): void {
    contents.on("page-title-updated", (_, title) => {
      this._title = title;
      this.events.onDetails();
      this.events.onChange();
    });

    contents.on("did-navigate", (_, url) => {
      this._hasLoaded = true;
      this._url = url;
      this._favicon = null;
      // A restored page in the back list already has its title, so the page doesn't report it again.
      const { navigationHistory } = contents;
      this._title = navigationHistory.getEntryAtIndex(navigationHistory.getActiveIndex())?.title || this._title;
      // A new document has none of the old one's styles.
      if (this._berryWorking) this.addWorkingStyle();
      if (url !== this.notAVisit) this.events.onNavigate(url);
      this.notAVisit = null;
      this.events.onChange();
    });

    contents.on("page-favicon-updated", (_, favicons) => {
      this._favicon = favicons[0] ?? null;
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
      this._loadError = null;
      this.events.onChange();
    });
    contents.on("did-fail-load", (_, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== ERR_ABORTED) this._loadError = { url, description };
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
    contents.on("destroyed", () => this.stopWaiting());
  }

  // The chrome draws what to do about it, in the space the page leaves.
  private setTrouble(trouble: TabTrouble | null): void {
    if (trouble === this._trouble) return;
    this._trouble = trouble;
    this.webContentsView?.setVisible(this.shouldDraw);
    if (trouble) this.stopWaiting();
    this.events.onChange();
  }

  private stopWaiting(): void {
    this.waiting.forEach((stop) => stop());
  }

  // Anything that needs an answer from the page goes through here, so it fails instead of hanging.
  private async fromPage<T>(ask: () => Promise<T>): Promise<T> {
    this.loadIfUnloaded();
    if (this._trouble) throw new Error(`The page is ${this._trouble}`);
    let timer: NodeJS.Timeout | undefined;
    let stop = () => {};
    const stopped = new Promise<never>((_, reject) => {
      stop = () => reject(new Error("The page stopped answering"));
      timer = setTimeout(stop, PAGE_ANSWER_MS);
      this.waiting.add(stop);
    });
    try {
      return await Promise.race([ask(), stopped]);
    } finally {
      clearTimeout(timer);
      this.waiting.delete(stop);
    }
  }

  private loadIfUnloaded(): void {
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
    const entries = navigationHistory.getAllEntries();
    for (let at = entries.length - 1; at >= 0; at--) {
      if (entries[at].url === url) navigationHistory.removeEntryAtIndex(at);
    }
  }

  get trouble(): TabTrouble | null {
    return this._trouble;
  }

  // Why the last address didn't load, until another load starts.
  get loadError(): { url: string; description: string } | null {
    return this._loadError;
  }

  // Getters
  get id(): string {
    return this._id;
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

  get berryWorking(): boolean {
    return this._berryWorking;
  }

  setBerryWorking(working: boolean): void {
    if (working === this._berryWorking) return;
    this._berryWorking = working;
    if (working) this.addWorkingStyle();
    else this.removeWorkingStyle();
  }

  // A tab with nothing loaded yet gets its style when it navigates.
  private addWorkingStyle(): void {
    if (!this.webContentsView) return;
    this.workingStyle = this.webContentsView.webContents.insertCSS(WORKING_CSS).catch(() => null);
  }

  private removeWorkingStyle(): void {
    if (!this.webContentsView) return;
    const contents = this.webContentsView.webContents;
    void this.workingStyle?.then((key) => {
      if (key && !contents.isDestroyed()) return contents.removeInsertedCSS(key);
      return undefined;
    }).catch(() => {});
    this.workingStyle = null;
  }

  get canGoBack(): boolean {
    return this.webContentsView?.webContents.navigationHistory.canGoBack() ?? false;
  }

  get canGoForward(): boolean {
    return this.webContentsView?.webContents.navigationHistory.canGoForward() ?? false;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get webContents() {
    return this.view.webContents;
  }

  get view(): WebContentsView {
    if (!this.webContentsView) {
      this.webContentsView = this.createView();
      this.events.onView(this);
    }
    return this.webContentsView;
  }

  // The view if there is one, for anything that shouldn't make one just by asking.
  get existingView(): WebContentsView | null {
    return this.webContentsView;
  }

  // Public methods
  show(): void {
    this._isVisible = true;
    this.loadIfUnloaded();
    this.webContentsView?.setVisible(!this._trouble);
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView?.setVisible(false);
  }

  // A view that's never been shown has no width, and a hidden one doesn't draw, so pages hide their content from
  // Berry and a screenshot comes back empty. A tab Berry is working in behind the user's stays drawn, nearly all
  // outside the window, where it can't cover anything.
  get isParked(): boolean {
    return this._berryWorking && !this._isVisible;
  }

  private get shouldDraw(): boolean {
    return (this._isVisible || this.isParked) && !this._trouble;
  }

  // Hides before moving and moves before showing, so the view never crosses the page the user is looking at.
  place({ page, parkedPage }: Pick<Layout, "page" | "parkedPage">): void {
    const view = this.webContentsView;
    if (!view) return;
    const draw = this.shouldDraw;
    if (!draw) view.setVisible(false);
    view.setBounds(this.isParked ? parkedPage : page);
    if (draw) view.setVisible(true);
  }

  async screenshot(): Promise<NativeImage> {
    return await this.fromPage(() => this.view.webContents.capturePage());
  }

  async runJs<T = unknown>(code: string): Promise<T> {
    return await this.fromPage(() => this.view.webContents.executeJavaScript(code));
  }

  // Runs in a world of its own. The page shares its DOM but can't see its variables.
  async runInPage<T = unknown>(code: string): Promise<T> {
    return await this.fromPage(() =>
      this.view.webContents.executeJavaScriptInIsolatedWorld(AGENT_WORLD, [{ code }], true)
    );
  }

  // Frames an isolated world in the top page can't reach into, because they, or one around them, come from another
  // origin. Each runs its own script, in its own page's world, since Electron has no isolated world for a frame.
  get foreignFrames(): WebFrameMain[] {
    const top = this.webContents.mainFrame;
    return top.framesInSubtree.filter((frame) => {
      for (let at = frame; at.parent; at = at.parent) if (at.origin !== top.origin) return true;
      return false;
    });
  }

  // The frame's page can see and change this script and what it returns, so believe nothing it says about itself.
  async runInFrame<T = unknown>(frame: WebFrameMain, code: string): Promise<T> {
    return await this.fromPage(() => frame.executeJavaScript(code, true) as Promise<T>);
  }

  // Waits for whatever an action started to load, within reason.
  async settled(): Promise<void> {
    const contents = this.webContents;
    await new Promise((resolve) => setTimeout(resolve, LOAD_START_MS));
    if (contents.isDestroyed() || !contents.isLoading()) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        contents.off("did-stop-loading", done);
        resolve();
      };
      const timer = setTimeout(done, LOAD_END_MS);
      contents.once("did-stop-loading", done);
    });
  }

  async getTabHtml(): Promise<string> {
    return await this.runJs<string>("document.documentElement.outerHTML");
  }

  async getTabText(): Promise<string> {
    return await this.runJs<string>("document.documentElement.innerText");
  }

  // The page and what's in its frames, each frame labelled with where it really comes from.
  async getTextWithFrames(): Promise<string> {
    const text = await this.getTabText();
    const frames = this.webContents.mainFrame.framesInSubtree.filter((frame) => frame.parent).slice(0, MAX_FRAMES_READ);
    const parts = await Promise.all(
      frames.map(async (frame) => {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), FRAME_ANSWER_MS);
        });
        const found = await Promise.race([frame.executeJavaScript(FRAME_TEXT).catch(() => null), timeout]);
        clearTimeout(timer);
        return typeof found === "string" && found.trim() ? `\n\n[Frame from ${frame.origin}]\n${found}` : "";
      })
    );
    return text + parts.join("");
  }

  loadURL(url: string): Promise<void> {
    this.unloaded = null;
    this._url = url;
    return this.webContents.loadURL(url);
  }

  goBack(): void {
    if (this.canGoBack) this.webContents.navigationHistory.goBack();
  }

  goForward(): void {
    if (this.canGoForward) this.webContents.navigationHistory.goForward();
  }

  reload(): void {
    if (this.unloaded) {
      this.loadIfUnloaded();
    } else if (this._trouble === "unresponsive") {
      // A stuck page can't be reloaded from inside. A new process comes once this one has gone.
      this.reloadOnceGone = true;
      this.webContents.forcefullyCrashRenderer();
    } else {
      this.webContents.reload();
    }
  }

  stop(): void {
    this.webContentsView?.webContents.stop();
  }

  destroy(): void {
    this.webContentsView?.webContents.close();
  }
}
