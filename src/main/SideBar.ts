import { is } from "@electron-toolkit/utils";
import { BaseWindow, WebContentsView } from "electron";
import { join } from "path";
import { LLMClient } from "./LLMClient";
import type { Rect } from "./Layout";

export class SideBar {
  private webContentsView: WebContentsView;
  private llmClient: LLMClient;
  private isVisible: boolean = true;

  constructor(baseWindow: BaseWindow) {
    this.webContentsView = this.createWebContentsView();
    baseWindow.contentView.addChildView(this.webContentsView);

    // Initialize LLM client
    this.llmClient = new LLMClient(this.webContentsView.webContents);
  }

  private createWebContentsView(): WebContentsView {
    const webContentsView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/sidebar.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Need to disable sandbox for preload to work
      },
    });

    // Load the Sidebar React app
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      // In development, load through Vite dev server
      const sidebarUrl = new URL(
        "/sidebar/",
        process.env["ELECTRON_RENDERER_URL"]
      );
      webContentsView.webContents.loadURL(sidebarUrl.toString());
    } else {
      webContentsView.webContents.loadFile(
        join(__dirname, "../renderer/sidebar/index.html")
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
