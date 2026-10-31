import type { BaseWindow, WebContents } from "electron";
import { createChromeView, type ChromeView } from "./chromeView";
import { sendToRenderer } from "./ipc";
import { promptRect, PROMPT_DEFAULT_HEIGHT, type Rect } from "./Layout";
import type { SitePermissions } from "./SitePermissions";
import type { PermissionPrompt } from "../shared/ipc";

// The card that asks about a site's request. A tab view covers the chrome, so it has a view of its own, and it
// answers to nobody else: only this view may decide, which keeps pages and Berry's tools away from it.
export class PermissionPromptView {
  readonly chrome: ChromeView = createChromeView("prompt");
  private shown: PermissionPrompt | null = null;
  private height = PROMPT_DEFAULT_HEIGHT;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly parent: BaseWindow,
    private readonly permissions: SitePermissions,
    private readonly host: { activeContents: () => WebContents | null; page: () => Rect }
  ) {
    this.chrome.view.setVisible(false);
    this.parent.contentView.addChildView(this.chrome.view);
    this.unsubscribe = permissions.onChange(() => this.sync());
  }

  get current(): PermissionPrompt | null {
    return this.shown;
  }

  // Only what's on screen can be answered, so a request can't be decided behind the user's back.
  decide(id: string, allow: boolean): boolean {
    return this.shown?.id === id && this.permissions.decide(id, allow);
  }

  resize(height: number): void {
    if (!Number.isFinite(height)) return;
    this.height = height;
    this.sync();
  }

  sync(): void {
    const contents = this.host.activeContents();
    const prompt = contents ? this.permissions.promptFor(contents) : null;
    const wasShown = this.shown;
    this.shown = prompt;
    if (JSON.stringify(prompt) !== JSON.stringify(wasShown)) {
      sendToRenderer(this.chrome.view.webContents, "permissions:prompt", prompt);
    }

    if (!prompt) {
      if (!wasShown) return;
      this.chrome.view.setVisible(false);
      if (contents && !contents.isDestroyed()) contents.focus();
      return;
    }

    this.chrome.view.setBounds(promptRect(this.host.page(), this.height));
    if (wasShown?.id === prompt.id) return;
    // Adding a view again moves it to the top, above tabs opened since.
    this.parent.contentView.addChildView(this.chrome.view);
    this.chrome.view.setVisible(true);
    // The card has no button focused, so typing meant for the page can't answer it.
    this.chrome.view.webContents.focus();
  }

  destroy(): void {
    this.unsubscribe();
    this.chrome.view.webContents.close();
  }
}
