import { BaseWindow, WebContentsView } from "electron";
import { createChromeView } from "./chromeView";
import type { Rect } from "./Layout";

export class TopBar {
  private webContentsView: WebContentsView;
  private _url: string;

  constructor(baseWindow: BaseWindow) {
    const { view, url } = createChromeView("topbar");
    this.webContentsView = view;
    this._url = url;
    baseWindow.contentView.addChildView(this.webContentsView);
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
}
