import { BaseWindow, WebContentsView } from "electron";
import { createChromeView } from "./chromeView";
import { LLMClient } from "./LLMClient";
import type { Rect } from "./Layout";

export class SideBar {
  private webContentsView: WebContentsView;
  private _url: string;
  private llmClient: LLMClient;
  private isVisible: boolean = true;

  constructor(baseWindow: BaseWindow) {
    const { view, url } = createChromeView("sidebar");
    this.webContentsView = view;
    this._url = url;
    baseWindow.contentView.addChildView(this.webContentsView);

    // Initialize LLM client
    this.llmClient = new LLMClient(this.webContentsView.webContents);
  }

  setBounds(bounds: Rect): void {
    this.webContentsView.setBounds(bounds);
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }

  get url(): string {
    return this._url;
  }

  get client(): LLMClient {
    return this.llmClient;
  }

  toggle(): void {
    this.isVisible = !this.isVisible;
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }
}
