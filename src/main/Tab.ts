import { NativeImage, WebContentsView } from "electron";

// The page card radius from DESIGN.md.
const PAGE_RADIUS = 8;

export class Tab {
  private webContentsView: WebContentsView;
  private _id: string;
  private _title: string;
  private _url: string;
  private _favicon: string | null = null;
  private _isVisible: boolean = false;
  private onChange: () => void;

  constructor(id: string, url: string = "https://www.google.com", onChange: () => void = () => {}) {
    this._id = id;
    this.onChange = onChange;
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
      this.onChange();
    });

    contents.on("did-navigate", (_, url) => {
      this._url = url;
      this._favicon = null;
      this.onChange();
    });

    contents.on("page-favicon-updated", (_, favicons) => {
      this._favicon = favicons[0] ?? null;
      this.onChange();
    });

    contents.on("did-navigate-in-page", (_, url) => {
      this._url = url;
      this.onChange();
    });

    contents.on("did-start-loading", () => this.onChange());
    contents.on("did-stop-loading", () => this.onChange());
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
