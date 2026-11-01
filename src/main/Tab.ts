import { NativeImage, WebContentsView, type WebContents, type WebFrameMain } from "electron";
import type { Layout, TabLoadError, TabTrouble } from "../shared/ipc";
import { PageActor, type ActorOptions } from "./PageActor";
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

const PICTURE_QUALITY = 72;
// A job has let go of a tab with a picture on screen, and that picture gets to show the bird leaving.
const LEAVING_MS = 720;

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

export interface TabEvents {
  onChange: () => void;
  onNavigate: (url: string) => void;
  // The page has reported its title or favicon.
  onDetails: () => void;
  // The tab has a view for the window to place.
  onView: (tab: Tab) => void;
  // It's no longer drawn behind the user, so it needs placing again.
  onStoppedLeaving: () => void;
  // The user clicked or typed in the page, or went back or forward in it. Berry's own input doesn't count.
  onUserInput: () => void;
  // What the bird on this page looks like and may do, read each time so a setting reaches it straight away.
  actorOptions: () => ActorOptions;
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
  private _loadError: TabLoadError | null = null;
  private reloadOnceGone = false;
  // Who is working here, if a mascot other than Berry is.
  workingMascotId: string | null = null;
  // Addresses this tab may not go to while a limited mascot is acting in it, and any it tried.
  private readonly navigationLimits = new Set<(url: string) => boolean>();
  // One set for each limited call running now, so overlapping calls each hear about every refusal.
  private readonly refusalListeners = new Set<Set<string>>();
  // Calls to the page that are waiting for an answer it may never give.
  private readonly waiting = new Set<() => void>();
  // True only inside `sendAgentInput`.
  private sendingAgentInput = false;
  // What's drawn on the page while a job works in it.
  readonly actor: PageActor;
  private _pictureScale: number | null = null;
  private leavingTimer: NodeJS.Timeout | null = null;

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
    this.actor = new PageActor(this, events.actorOptions, () => this.webContentsView?.webContents.getZoomFactor() ?? 1);

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
    // Both are for the page itself: `will-navigate` for a link or script, `will-redirect` for a server sending it on.
    const limit = (event: { preventDefault: () => void }, url: string) => {
      if (this.refusesNavigation(url)) {
        this.refusalListeners.forEach((refused) => refused.add(url));
        event.preventDefault();
      }
    };
    contents.on("will-navigate", (event) => limit(event, event.url));
    contents.on("will-redirect", (event) => limit(event, event.url));

    // Electron emits both of these from inside `sendInputEvent`, so `sendingAgentInput` tells Berry's input from a person's.
    contents.on("before-mouse-event", (_, { type }) => {
      if (type === "mouseDown" && !this.sendingAgentInput) this.userInput();
    });
    contents.on("before-input-event", (_, input) => {
      if (isTyping(input) && !this.sendingAgentInput) this.userInput();
    });

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

    contents.on("dom-ready", () => this.actor.pageReady());

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
      this.stopWaiting();
      this.actor.destroyed();
    });
  }

  private userInput(): void {
    this.actor.userTouched();
    this.events.onUserInput();
  }

  refusesNavigation(url: string): boolean {
    return [...this.navigationLimits].some((allows) => !allows(url));
  }

  // For as long as `act` runs, the page can't take this tab anywhere `allows` says no to. The user's own use of the tab
  // is left alone outside these moments. Says which addresses it stopped.
  async withNavigationLimit<T>(allows: (url: string) => boolean, act: () => Promise<T>): Promise<{ result: T; refused: string[] }> {
    // One of its own for each call, because calls can overlap and one ending mustn't lift the other's limit.
    const limit = (url: string) => allows(url);
    const refused = new Set<string>();
    this.navigationLimits.add(limit);
    this.refusalListeners.add(refused);
    try {
      const result = await act();
      return { result, refused: [...refused] };
    } finally {
      this.navigationLimits.delete(limit);
      this.refusalListeners.delete(refused);
    }
  }

  // Opened by a page a limited mascot is acting in, so its first load can't go where the opener couldn't.
  limitFirstLoadLike(opener: Tab): void {
    const limits = [...opener.navigationLimits].map((allows) => (url: string) => allows(url));
    if (limits.length === 0) return;
    limits.forEach((limit) => this.navigationLimits.add(limit));
    this.webContents.once("did-stop-loading", () => limits.forEach((limit) => this.navigationLimits.delete(limit)));
  }

  // The chrome draws what to do about it, in the space the page leaves.
  private setTrouble(trouble: TabTrouble | null): void {
    if (trouble === this._trouble) return;
    this._trouble = trouble;
    this.webContentsView?.setVisible(this.shouldDraw);
    if (trouble) this.stopWaiting();
    this.events.onChange();
  }

  private setLoadError(error: TabLoadError | null): void {
    this._loadError = error;
    this.webContentsView?.setVisible(this.shouldDraw);
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
  get loadError(): TabLoadError | null {
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
    if (working) {
      this.addWorkingStyle();
    } else {
      this.removeWorkingStyle();
      this.actor.leave();
      if (this._pictureScale !== null && !this._isVisible) {
        this.leavingTimer = setTimeout(() => {
          this.leavingTimer = null;
          this.events.onStoppedLeaving();
        }, LEAVING_MS);
      }
    }
  }

  // A tab with nothing loaded yet gets its style when it navigates. The bird says all this does and more, so it's only for
  // anyone who has turned the bird off, and a capture for the model has one less thing in it.
  private addWorkingStyle(): void {
    if (!this.webContentsView || this.actor.enabled) return;
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
    this.webContentsView?.setVisible(this.shouldDraw);
    this.actor.shown();
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView?.setVisible(false);
    if (this._pictureScale === null) this.actor.hidden();
  }

  // How much smaller the picture of this tab on the main chat is, while there is one on screen. To the bird that's as
  // good as someone looking at the tab, with the same pacing.
  get pictureScale(): number | null {
    return this._pictureScale;
  }

  setPictureScale(scale: number | null): void {
    const was = this._pictureScale;
    this._pictureScale = scale;
    if (this._isVisible || (was === null) === (scale === null)) return;
    if (scale === null) this.actor.hidden();
    else this.actor.shown();
  }

  // A small picture of the page, with the bird in it, for the working view in the chrome and for nothing else. Tools use
  // `screenshot`, which is separate and keeps the bird out. It's asked again after the capture, because the user may have
  // been handed the tab while that was on its way, and may even have finished and given it back, so that counts too.
  async picture(width: number): Promise<Buffer | null> {
    const view = this.webContentsView;
    if (!view || !this.canBePictured) return null;
    const { holdsStarted } = this;
    const image = await this.fromPage(() => view.webContents.capturePage()).catch(() => null);
    if (!image || image.isEmpty() || !this.canBePictured || holdsStarted !== this.holdsStarted) return null;
    return image.resize({ width, quality: "good" }).toJPEG(PICTURE_QUALITY);
  }

  private get canBePictured(): boolean {
    return !this._heldForUser && !this.mayShowCode && !this._trouble && !this._loadError && !this.unloaded;
  }

  // A view that's never been shown has no width, and a hidden one doesn't draw, so pages hide their content from
  // Berry and a screenshot comes back empty. A tab Berry is working in behind the user's stays drawn, nearly all
  // outside the window, where it can't cover anything.
  get isParked(): boolean {
    return (this._berryWorking || this.isLeaving) && !this._isVisible;
  }

  // The job has ended here, and a picture of the tab is still showing the bird on its way out.
  get isLeaving(): boolean {
    return this.leavingTimer !== null;
  }

  private get shouldDraw(): boolean {
    return (this._isVisible || this.isParked) && !this._trouble && !this._loadError;
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

  // The user has been handed this tab. Everything Berry does to a page goes through these methods, so a call already
  // on its way when that happened stops here, rather than clicking or reading in the middle of their sign-in.
  private _heldForUser = false;
  private holdsStarted = 0;

  get heldForUser(): boolean {
    return this._heldForUser;
  }

  set heldForUser(held: boolean) {
    if (held && !this._heldForUser) this.holdsStarted++;
    this._heldForUser = held;
    if (held) this.actor.held();
  }

  // A code from the phone went in here, and the page may show it, which can't be taken out of a picture.
  noScreenshotsUntil = 0;

  get mayShowCode(): boolean {
    return Date.now() < this.noScreenshotsUntil;
  }

  private refuseWhileHeld(): void {
    if (this.heldForUser) throw new Error("The user has this tab");
  }

  // Berry's real mouse and keyboard. Anything else that reaches the page is the user's.
  sendAgentInput(event: Parameters<WebContents["sendInputEvent"]>[0]): void {
    this.refuseWhileHeld();
    this.sendingAgentInput = true;
    try {
      this.webContents.sendInputEvent(event);
    } finally {
      this.sendingAgentInput = false;
    }
  }

  // The one thing that may use a held tab: a code the user sent from their phone, typed for them by `codeEntry.ts`. They
  // refuse any tab that isn't held, so they can't stand in for the methods above. No tool calls these, and no job can
  // reach a held tab to try, because the hold itself stays on throughout.
  sendInputWhileHeld(event: Parameters<WebContents["sendInputEvent"]>[0]): void {
    if (!this.heldForUser) throw new Error("This tab isn't held");
    this.sendingAgentInput = true;
    try {
      this.webContents.sendInputEvent(event);
    } finally {
      this.sendingAgentInput = false;
    }
  }

  async runInPageWhileHeld<T = unknown>(code: string): Promise<T> {
    if (!this.heldForUser) throw new Error("This tab isn't held");
    return await this.fromPage(() => this.view.webContents.executeJavaScriptInIsolatedWorld(AGENT_WORLD, [{ code }], true));
  }

  async screenshot(): Promise<NativeImage> {
    this.refuseWhileHeld();
    if (this.mayShowCode) throw new Error("This page may show a code");
    return await this.fromPage(() => this.actor.whileHidden(() => this.view.webContents.capturePage()));
  }

  async runJs<T = unknown>(code: string): Promise<T> {
    this.refuseWhileHeld();
    return await this.fromPage(() => this.view.webContents.executeJavaScript(code));
  }

  // Runs in a world of its own. The page shares its DOM but can't see its variables.
  async runInPage<T = unknown>(code: string): Promise<T> {
    this.refuseWhileHeld();
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
    this.refuseWhileHeld();
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
  async getTextWithFrames(allowsFrame: (origin: string) => boolean = () => true): Promise<string> {
    const text = await this.getTabText();
    const frames = this.webContents.mainFrame.framesInSubtree.filter((frame) => frame.parent && allowsFrame(frame.origin)).slice(0, MAX_FRAMES_READ);
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

  destroy(): void {
    if (this.leavingTimer) clearTimeout(this.leavingTimer);
    this.leavingTimer = null;
    this.webContentsView?.webContents.close();
  }
}
