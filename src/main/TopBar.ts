import { is } from "@electron-toolkit/utils";
import { BaseWindow, WebContentsView } from "electron";
import { join } from "path";
import type { Rect } from "./Layout";

export class TopBar {
  private webContentsView: WebContentsView;

  constructor(baseWindow: BaseWindow) {
    this.webContentsView = this.createWebContentsView();
    baseWindow.contentView.addChildView(this.webContentsView);
  }

  private createWebContentsView(): WebContentsView {
    const webContentsView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/topbar.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Need to disable sandbox for preload to work
      },
    });

    // Load the TopBar React app
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      // In development, load through Vite dev server
      const topbarUrl = new URL(
        "/topbar/",
        process.env["ELECTRON_RENDERER_URL"]
      );
      webContentsView.webContents.loadURL(topbarUrl.toString());
    } else {
      webContentsView.webContents.loadFile(
        join(__dirname, "../renderer/topbar/index.html")
      );
    }

    return webContentsView;
  }

  setBounds(bounds: Rect): void {
    this.webContentsView.setBounds(bounds);
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }
}
