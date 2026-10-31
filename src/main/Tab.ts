import { NativeImage, WebContentsView } from "electron";

// The page card radius from DESIGN.md.
// Matches the card the page sits in, `rounded-panel` in the chrome.
const PAGE_RADIUS = 22;

// An id of our own, away from the page's world (0) and Electron's low numbers.
const AGENT_WORLD = 1000;
// How long a click gets to start loading something, and that load to end.
const LOAD_START_MS = 300;
const LOAD_END_MS = 10_000;

export interface TabEvents {
  onChange: () => void;
  onNavigate: (url: string) => void;
}

export class Tab {
  readonly kind = "web";
  private webContentsView: WebContentsView;
  private _id: string;
  private _title: string;
  private _url: string;
  private _favicon: string | null = null;
  private _isVisible: boolean = false;
  private events: TabEvents;

  constructor(
    id: string,
    url: string,
    events: TabEvents = { onChange: () => {}, onNavigate: () => {} }
  ) {
    this._id = id;
    this.events = events;
    this._url = url;
    this._title = "New Tab";

    // Create the WebContentsView for web content only
    this.webContentsView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    this.webContentsView.setBorderRadius(PAGE_RADIUS);

    // Set up event listeners
    this.setupEventListeners();

    // Load the initial URL
    this.loadURL(url);
  }

  private setupEventListeners(): void {
    const contents = this.webContentsView.webContents;

    contents.on("page-title-updated", (_, title) => {
      this._title = title;
      this.events.onChange();
    });

    contents.on("did-navigate", (_, url) => {
      this._url = url;
      this._favicon = null;
      this.events.onNavigate(url);
      this.events.onChange();
    });

    contents.on("page-favicon-updated", (_, favicons) => {
      this._favicon = favicons[0] ?? null;
      this.events.onChange();
    });

    contents.on("did-navigate-in-page", (_, url) => {
      this._url = url;
      this.events.onChange();
    });

    contents.on("did-start-loading", () => this.events.onChange());
    contents.on("did-stop-loading", () => this.events.onChange());
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
    return this.webContentsView.webContents.isLoading();
  }

  get canGoBack(): boolean {
    return this.webContentsView.webContents.navigationHistory.canGoBack();
  }

  get canGoForward(): boolean {
    return this.webContentsView.webContents.navigationHistory.canGoForward();
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get webContents() {
    return this.webContentsView.webContents;
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }

  // Public methods
  show(): void {
    this._isVisible = true;
    this.webContentsView.setVisible(true);
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView.setVisible(false);
  }

  async screenshot(): Promise<NativeImage> {
    return await this.webContentsView.webContents.capturePage();
  }

  async runJs<T = unknown>(code: string): Promise<T> {
    return await this.webContentsView.webContents.executeJavaScript(code);
  }

  // Runs in a world of its own. The page shares its DOM but can't see its variables.
  async runInPage<T = unknown>(code: string): Promise<T> {
    return await this.webContentsView.webContents.executeJavaScriptInIsolatedWorld(AGENT_WORLD, [{ code }], true);
  }

  // Waits for whatever an action started to load, within reason.
  async settled(): Promise<void> {
    const contents = this.webContentsView.webContents;
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

  loadURL(url: string): Promise<void> {
    this._url = url;
    return this.webContentsView.webContents.loadURL(url);
  }

  goBack(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoBack()) {
      this.webContentsView.webContents.navigationHistory.goBack();
    }
  }

  goForward(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoForward()) {
      this.webContentsView.webContents.navigationHistory.goForward();
    }
  }

  reload(): void {
    this.webContentsView.webContents.reload();
  }

  stop(): void {
    this.webContentsView.webContents.stop();
  }

  destroy(): void {
    this.webContentsView.webContents.close();
  }
}
