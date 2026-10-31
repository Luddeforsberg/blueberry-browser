import type { Result, View, WebContents } from "electron";
import { createChromeView, type ChromeView } from "./chromeView";
import { sendToRenderer } from "./ipc";
import type { Rect, ThemeState } from "../shared/ipc";

// Find in page, in an overlay view of its own, because the chrome view can't draw over a tab view.
export class FindBar {
  readonly chromeView: ChromeView = createChromeView("find");
  private target: WebContents | null = null;
  private query = "";
  private requestId: number | null = null;

  constructor(private readonly parent: View) {
    this.chromeView.view.setVisible(false);
    parent.addChildView(this.chromeView.view);
  }

  private get contents(): WebContents {
    return this.chromeView.view.webContents;
  }

  private readonly onFound = (_: unknown, result: Result): void => {
    if (result.requestId !== this.requestId) return;
    sendToRenderer(this.contents, "find:result", { active: result.activeMatchOrdinal, total: result.matches });
  };

  // A new document has none of the old one's highlights.
  private readonly onLoaded = (): void => {
    if (this.query) this.search(this.query);
  };

  open(target: WebContents): void {
    this.closeUnlessOn(target);
    if (!this.target) {
      this.target = target;
      target.on("found-in-page", this.onFound);
      target.on("did-finish-load", this.onLoaded);
    }
    // Adding a view again moves it to the top, above tabs opened since.
    this.parent.addChildView(this.chromeView.view);
    this.chromeView.view.setVisible(true);
    this.contents.focus();
    sendToRenderer(this.contents, "find:opened", null);
  }

  search(text: string): void {
    if (!this.target || this.target.isDestroyed()) return;
    this.query = text;
    if (!text) {
      this.requestId = null;
      this.target.stopFindInPage("clearSelection");
      return;
    }
    this.requestId = this.target.findInPage(text, { findNext: true });
  }

  step(forward: boolean): void {
    if (!this.target || this.target.isDestroyed() || !this.query) return;
    this.requestId = this.target.findInPage(this.query, { forward, findNext: false });
  }

  // Esc and the close button put the keyboard back on the page.
  close(): void {
    const target = this.target;
    this.closeUnlessOn(null);
    if (target && !target.isDestroyed()) target.focus();
  }

  // The bar belongs to one page. Internal pages share a target, so going to another tab passes null.
  closeUnlessOn(target: WebContents | null): void {
    const current = this.target;
    if (!current || current === target) return;
    if (!current.isDestroyed()) {
      current.stopFindInPage("keepSelection");
      current.off("found-in-page", this.onFound);
      current.off("did-finish-load", this.onLoaded);
    }
    this.target = null;
    this.query = "";
    this.requestId = null;
    this.chromeView.view.setVisible(false);
  }

  get isOpen(): boolean {
    return this.target !== null;
  }

  setBounds(bounds: Rect): void {
    this.chromeView.view.setBounds(bounds);
  }

  notifyTheme(theme: ThemeState): void {
    sendToRenderer(this.contents, "theme:updated", theme);
  }

  destroy(): void {
    this.contents.close();
  }
}
