import type { NativeImage, WebContents, WebFrameMain } from "electron";
import type { Tab } from "./Tab";
import { Latest, type Turn } from "../../shared/lateWork";

// An id of our own, away from the page's world (0) and Electron's low numbers.
const AGENT_WORLD = 1000;
// Where the watching for Show Berry runs. It's apart from the tools' world, so no tool can reach what it's holding.
const RECORDER_WORLD = 1001;

// How long a click gets to start loading something, and that load to end.
const LOAD_START_MS = 300;
const LOAD_END_MS = 10_000;

// A crashed or stuck page never answers, and no event says so for a page stuck with no input going to it.
const PAGE_ANSWER_MS = 10_000;

// Pages can carry dozens of frames for ads, and any of them can hang, so none can hold up reading the page.
const FRAME_ANSWER_MS = 2_000;
const MAX_FRAMES_READ = 30;
const FRAME_TEXT = `innerWidth > 1 && innerHeight > 1 ? document.body?.innerText ?? "" : ""`;

// Everything Berry does to a page through its tab: scripts, frames, text, real input and screenshots, each of them
// failing rather than hanging, and the hold that stops all of it once the user has been handed the tab.
export class TabPage {
  // Calls to the page that are waiting for an answer it may never give.
  private readonly waiting = new Set<() => void>();
  // True only inside `sendAgentInput`.
  sendingAgentInput = false;

  constructor(
    private readonly tab: Tab,
    private readonly loadIfUnloaded: () => void,
  ) {}

  stopWaiting(): void {
    this.waiting.forEach((stop) => stop());
  }

  // Anything that needs an answer from the page goes through here, so it fails instead of hanging.
  async fromPage<T>(ask: () => Promise<T>): Promise<T> {
    this.loadIfUnloaded();
    if (this.tab.trouble) throw new Error(`The page is ${this.tab.trouble}`);
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

  // The user has been handed this tab. Everything Berry does to a page goes through these methods, so a call already
  // on its way when that happened stops here, rather than clicking or reading in the middle of their sign-in.
  private _heldForUser = false;
  private readonly holds = new Latest();
  // Ends when the tab is next handed to the user, so work that took a while can tell one started meanwhile, even if it
  // has been given back since.
  sinceHeld: Turn = this.holds.next();

  get heldForUser(): boolean {
    return this._heldForUser;
  }

  set heldForUser(held: boolean) {
    if (held && !this._heldForUser) this.sinceHeld = this.holds.next();
    this._heldForUser = held;
    if (held) this.tab.actor.held();
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
      this.tab.webContents.sendInputEvent(event);
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
      this.tab.webContents.sendInputEvent(event);
    } finally {
      this.sendingAgentInput = false;
    }
  }

  async runInPageWhileHeld<T = unknown>(code: string): Promise<T> {
    if (!this.heldForUser) throw new Error("This tab isn't held");
    return await this.fromPage(() => this.tab.view.webContents.executeJavaScriptInIsolatedWorld(AGENT_WORLD, [{ code }], true));
  }

  // Checked again once it's taken, because the user may have been handed the tab while the capture was on its way, and
  // even finished and given it back, as the tab's picture is.
  async screenshot(): Promise<NativeImage> {
    const mayCapture = () => {
      this.refuseWhileHeld();
      if (this.mayShowCode) throw new Error("This page may show a code");
    };
    mayCapture();
    const { holdsStarted } = this;
    const image = await this.fromPage(() => this.tab.actor.whileHidden(() => this.tab.view.webContents.capturePage()));
    mayCapture();
    if (holdsStarted !== this.holdsStarted) throw new Error("The user had this tab");
    return image;
  }

  // For the model: no wider than it needs, and null for a page that hasn't drawn anything yet.
  async screenshotJpeg(maxWidth: number, quality: number): Promise<Buffer | null> {
    const image = await this.screenshot();
    if (image.isEmpty()) return null;
    const scaled = image.getSize().width > maxWidth ? image.resize({ width: maxWidth }) : image;
    return scaled.toJPEG(quality);
  }

  async runJs<T = unknown>(code: string): Promise<T> {
    this.refuseWhileHeld();
    return await this.fromPage(() => this.tab.view.webContents.executeJavaScript(code));
  }

  // Runs in a world of its own. The page shares its DOM but can't see its variables.
  async runInPage<T = unknown>(code: string): Promise<T> {
    this.refuseWhileHeld();
    return await this.fromPage(() => this.tab.view.webContents.executeJavaScriptInIsolatedWorld(AGENT_WORLD, [{ code }], true));
  }

  // For `Recordings` only. It waits for as long as the page takes, because the answer is the user's next move, so this
  // isn't for anything that needs an answer. A new document never answers at all.
  async listenInPage<T = unknown>(code: string): Promise<T> {
    return await this.tab.webContents.executeJavaScriptInIsolatedWorld(RECORDER_WORLD, [{ code }], false);
  }

  // Frames an isolated world in the top page can't reach into, because they, or one around them, come from another
  // origin. Each runs its own script, in its own page's world, since Electron has no isolated world for a frame.
  get foreignFrames(): WebFrameMain[] {
    const top = this.tab.webContents.mainFrame;
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
    const contents = this.tab.webContents;
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
    const frames = this.tab.webContents.mainFrame.framesInSubtree
      .filter((frame) => frame.parent && allowsFrame(frame.origin))
      .slice(0, MAX_FRAMES_READ);
    const parts = await Promise.all(
      frames.map(async (frame) => {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), FRAME_ANSWER_MS);
        });
        const found = await Promise.race([frame.executeJavaScript(FRAME_TEXT).catch(() => null), timeout]);
        clearTimeout(timer);
        return typeof found === "string" && found.trim() ? `\n\n[Frame from ${frame.origin}]\n${found}` : "";
      }),
    );
    return text + parts.join("");
  }
}
