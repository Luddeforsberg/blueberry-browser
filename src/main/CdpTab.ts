import type { CDPSession, Frame, Page } from "playwright-core";
import type { TabLoadError, TabTrouble } from "../shared/ipc";
import type { AgentInput, PageFrame, PageTarget } from "./pageTarget";

// A page in a browser reached over the Chrome DevTools Protocol, such as one in the cloud, behind the same interface as
// the window's own tabs, so Berry's tools work on it unchanged. Plain Node: no Electron, so a runner without a window can
// use it too. Playwright keeps the connection and the frames, and everything the tools need goes through one CDP session
// of our own. There's no bird here, and nothing on this side can tell the user's input from Berry's, so taking over is
// the caller's to notice.

const WORLD_NAME = "blueberry-agent";
// The same limits as `Tab`, so a stuck page fails rather than holding up a reply.
const PAGE_ANSWER_MS = 10_000;
const FRAME_ANSWER_MS = 2_000;
const MAX_FRAMES_READ = 30;
const FRAME_TEXT = `innerWidth > 1 && innerHeight > 1 ? document.body?.innerText ?? "" : ""`;
const LOAD_START_MS = 300;
const LOAD_END_MS = 10_000;
const SCREENCAST_QUALITY = 60;
const SCREENCAST_WIDTH = 1280;

// What `pageInput.ts` names keys, and what CDP needs to know about each.
const KEYS: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  Tab: { key: "Tab", code: "Tab", keyCode: 9 },
  Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  Delete: { key: "Delete", code: "Delete", keyCode: 46 },
  Space: { key: " ", code: "Space", keyCode: 32, text: " " },
  Up: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  Down: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  Left: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  Right: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  Home: { key: "Home", code: "Home", keyCode: 36 },
  End: { key: "End", code: "End", keyCode: 35 },
  PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
  PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
};

const keyOf = (name: string) => {
  const known = KEYS[name] ?? (name === " " ? KEYS.Space : undefined);
  if (known) return known;
  const upper = name.toUpperCase();
  return { key: name, code: "", keyCode: /^[A-Z0-9]$/.test(upper) ? upper.charCodeAt(0) : 0, text: name };
};

const SHIFT = 8;

const withTimeout = async <T>(work: Promise<T>, ms: number, what: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(what)), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
};

// A blank or srcdoc frame belongs to whoever made it.
const originOf = (frame: Frame): string => {
  for (let at: Frame | null = frame; at; at = at.parentFrame()) {
    try {
      const { origin, protocol } = new URL(at.url());
      if (protocol !== "about:" && origin !== "null") return origin;
    } catch {
      // An address that doesn't parse says nothing about where it's from, so look further up.
    }
  }
  return "null";
};

export interface CdpTabEvents {
  // Its address, title or loading changed.
  onChange: () => void;
}

export class CdpTab implements PageTarget {
  readonly actor = null;
  readonly zoomFactor = 1;
  readonly mayShowCode = false;
  private _title = "";
  private loading = false;
  private _trouble: TabTrouble | null = null;
  private _loadError: TabLoadError | null = null;
  private history: { entries: { id: number; url: string }[]; index: number } = { entries: [], index: 0 };
  private world: Promise<number> | null = null;
  private readonly frames = new WeakMap<Frame, PageFrame>();
  private readonly navigationLimits = new Set<(url: string) => boolean>();
  private readonly refusalListeners = new Set<Set<string>>();
  private fetching: Promise<unknown> = Promise.resolve();
  private pressed = false;
  private lastInput = 0;
  private closed = false;
  private screencast: ((jpeg: string) => void) | null = null;

  private constructor(
    readonly id: string,
    readonly page: Page,
    private readonly session: CDPSession,
    private readonly mainFrameId: string,
    readonly targetId: string,
    private readonly events: CdpTabEvents
  ) {}

  // Takes charge of a page Playwright already has open.
  static async attach(id: string, page: Page, events: CdpTabEvents): Promise<CdpTab> {
    const session = await page.context().newCDPSession(page);
    await Promise.all([session.send("Page.enable"), session.send("Runtime.enable")]);
    const [{ frameTree }, { targetInfo }] = await Promise.all([session.send("Page.getFrameTree"), session.send("Target.getTargetInfo")]);
    const tab = new CdpTab(id, page, session, frameTree.frame.id, targetInfo.targetId, events);
    tab.listen();
    await tab.refreshHistory();
    tab.refreshTitle();
    return tab;
  }

  private listen(): void {
    const { session, page } = this;
    const isMain = (frameId: string) => frameId === this.mainFrameId;
    session.on("Page.frameStartedLoading", ({ frameId }) => {
      if (!isMain(frameId)) return;
      this.loading = true;
      this._loadError = null;
      this.events.onChange();
    });
    session.on("Page.frameStoppedLoading", ({ frameId }) => {
      if (!isMain(frameId)) return;
      this.loading = false;
      this.refreshTitle();
      this.events.onChange();
    });
    session.on("Page.frameNavigated", ({ frame }) => {
      if (frame.parentId || !isMain(frame.id)) return;
      // A new document has none of the old one's worlds.
      this.world = null;
      void this.refreshHistory();
      this.refreshTitle();
      this.events.onChange();
    });
    session.on("Page.navigatedWithinDocument", ({ frameId }) => {
      if (!isMain(frameId)) return;
      void this.refreshHistory();
      this.events.onChange();
    });
    session.on("Runtime.executionContextsCleared", () => {
      this.world = null;
    });
    session.on("Page.screencastFrame", ({ data, sessionId }) => {
      void session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      this.screencast?.(data);
    });
    session.on("Fetch.requestPaused", ({ requestId, request, frameId, resourceType }) => {
      const refused = resourceType === "Document" && isMain(frameId) && this.refusesNavigation(request.url);
      if (refused) this.refusalListeners.forEach((listener) => listener.add(request.url));
      // Aborted, so the page stays where it was, as a refused navigation does in the window's own tabs.
      const answer = refused ? session.send("Fetch.failRequest", { requestId, errorReason: "Aborted" }) : session.send("Fetch.continueRequest", { requestId });
      void answer.catch(() => {});
    });
    page.on("crash", () => {
      this._trouble = "crashed";
      this.events.onChange();
    });
    page.on("close", () => {
      this.closed = true;
      this.events.onChange();
    });
  }

  private refreshTitle(): void {
    void this.page
      .title()
      .then((title) => {
        if (title === this._title) return;
        this._title = title;
        this.events.onChange();
      })
      .catch(() => {});
  }

  private async refreshHistory(): Promise<void> {
    try {
      const { entries, currentIndex } = await this.session.send("Page.getNavigationHistory");
      this.history = { entries: entries.map(({ id, url }) => ({ id, url })), index: currentIndex };
    } catch {
      // The page has gone. Nothing to go back to.
    }
  }

  get url(): string {
    return this.page.url();
  }

  get title(): string {
    return this._title;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  get trouble(): TabTrouble | null {
    return this._trouble;
  }

  get loadError(): TabLoadError | null {
    return this._loadError;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get canGoBack(): boolean {
    return this.history.index > 0;
  }

  get backUrl(): string | null {
    return this.canGoBack ? (this.history.entries[this.history.index - 1]?.url ?? null) : null;
  }

  private fromPage<T>(ask: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("The page is closed"));
    if (this._trouble) return Promise.reject(new Error(`The page is ${this._trouble}`));
    return withTimeout(ask(), PAGE_ANSWER_MS, "The page stopped answering");
  }

  // One world per document, made when first needed, so refs a script keeps there last as long as the page does.
  private worldId(): Promise<number> {
    const made = (this.world ??= this.session
      .send("Page.createIsolatedWorld", { frameId: this.mainFrameId, worldName: WORLD_NAME, grantUniveralAccess: false })
      .then(({ executionContextId }) => executionContextId));
    made.catch(() => {
      if (this.world === made) this.world = null;
    });
    return made;
  }

  async runInPage<T = unknown>(code: string): Promise<T> {
    return this.fromPage(async () => {
      const evaluate = async () => {
        const contextId = await this.worldId();
        return this.session.send("Runtime.evaluate", { expression: code, contextId, returnByValue: true, awaitPromise: true, userGesture: true });
      };
      // A world made just before the page moved on is gone already, so it gets one more try in the new document.
      const answer = await evaluate().catch((error) => {
        this.world = null;
        if (/context/i.test(String(error))) return evaluate();
        throw error;
      });
      if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text);
      return answer.result.value as T;
    });
  }

  private frameOf(frame: Frame): PageFrame {
    let known = this.frames.get(frame);
    if (!known) {
      known = { frame, get origin() { return originOf(frame); }, isDestroyed: () => frame.isDetached() } as PageFrame & { frame: Frame };
      this.frames.set(frame, known);
    }
    return known;
  }

  get foreignFrames(): PageFrame[] {
    const top = this.page.mainFrame();
    const topOrigin = originOf(top);
    return this.page
      .frames()
      .filter((frame) => {
        for (let at: Frame | null = frame; at?.parentFrame(); at = at.parentFrame()) if (originOf(at) !== topOrigin) return true;
        return false;
      })
      .map((frame) => this.frameOf(frame));
  }

  // The frame's page can see and change this script and what it returns, so believe nothing it says about itself.
  async runInFrame<T = unknown>(frame: PageFrame, code: string): Promise<T> {
    const inner = (frame as PageFrame & { frame?: Frame }).frame;
    if (!inner || inner.isDetached()) throw new Error("That frame has gone");
    return this.fromPage(() => inner.evaluate(code) as Promise<T>);
  }

  async getTextWithFrames(allowsFrame: (origin: string) => boolean = () => true): Promise<string> {
    const text = await this.runInPage<string>("document.documentElement.innerText");
    const frames = this.page
      .frames()
      .filter((frame) => frame.parentFrame() && allowsFrame(originOf(frame)))
      .slice(0, MAX_FRAMES_READ);
    const parts = await Promise.all(
      frames.map(async (frame) => {
        const found = await withTimeout(frame.evaluate(FRAME_TEXT), FRAME_ANSWER_MS, "late").catch(() => null);
        return typeof found === "string" && found.trim() ? `\n\n[Frame from ${originOf(frame)}]\n${found}` : "";
      })
    );
    return (text ?? "") + parts.join("");
  }

  async screenshotJpeg(maxWidth: number, quality: number): Promise<Buffer | null> {
    return this.fromPage(async () => {
      const { cssVisualViewport: view } = await this.session.send("Page.getLayoutMetrics");
      if (view.clientWidth < 1 || view.clientHeight < 1) return null;
      const scale = view.clientWidth > maxWidth ? maxWidth / view.clientWidth : 1;
      const { data } = await this.session.send("Page.captureScreenshot", {
        format: "jpeg",
        quality,
        clip: { x: view.pageX, y: view.pageY, width: view.clientWidth, height: view.clientHeight, scale },
      });
      return data ? Buffer.from(data, "base64") : null;
    });
  }

  // When Berry last clicked or typed here, which says where a popup with no opener came from.
  get actedAt(): number {
    return this.lastInput;
  }

  async sendAgentInput(event: AgentInput): Promise<void> {
    if (this.closed) throw new Error("The page is closed");
    this.lastInput = Date.now();
    if (!("keyCode" in event)) {
      if (event.type === "mouseDown") this.pressed = true;
      const held = this.pressed;
      if (event.type === "mouseUp") this.pressed = false;
      await this.session.send("Input.dispatchMouseEvent", {
        type: event.type === "mouseMove" ? "mouseMoved" : event.type === "mouseDown" ? "mousePressed" : "mouseReleased",
        x: event.x,
        y: event.y,
        button: event.type === "mouseMove" && !held ? "none" : "left",
        buttons: event.type === "mouseUp" || !held ? 0 : 1,
        clickCount: event.type === "mouseMove" ? 0 : (event.clickCount ?? 1),
      });
      return;
    }
    const { key, code, keyCode, text } = keyOf(event.keyCode);
    const modifiers = event.modifiers?.includes("shift") ? SHIFT : 0;
    if (event.type === "char") {
      // Only a key that types something has a character. Enter's is what submits a form.
      if (!text) return;
      const typed = modifiers && text.length === 1 ? text.toUpperCase() : text;
      await this.session.send("Input.dispatchKeyEvent", { type: "char", text: typed, unmodifiedText: text, key, modifiers });
      return;
    }
    await this.session.send("Input.dispatchKeyEvent", {
      type: event.type === "keyDown" ? "rawKeyDown" : "keyUp",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers,
    });
  }

  // Resolves once the new page has started, like the window's tabs. `settled` waits for the rest.
  async loadURL(url: string): Promise<void> {
    this._loadError = null;
    try {
      await this.page.goto(url, { waitUntil: "commit", timeout: LOAD_END_MS });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = /net::(ERR_[A-Z_]+)/.exec(message);
      if (failed && failed[1] !== "ERR_ABORTED") {
        this._loadError = { url, description: failed[1] };
        this.events.onChange();
      }
      throw error;
    }
  }

  goBack(): void {
    const back = this.history.entries[this.history.index - 1];
    if (back) void this.session.send("Page.navigateToHistoryEntry", { entryId: back.id }).catch(() => {});
  }

  async settled(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, LOAD_START_MS));
    for (let waited = 0; this.loading && !this.closed && waited < LOAD_END_MS; waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  refusesNavigation(url: string): boolean {
    return [...this.navigationLimits].some((allows) => !allows(url));
  }

  // For a navigation this tab caused somewhere it can't intercept itself, such as a popup it opened. True if a limit on
  // now refuses it, which every call holding a limit hears about.
  refuse(url: string): boolean {
    if (!this.refusesNavigation(url)) return false;
    this.refusalListeners.forEach((listener) => listener.add(url));
    return true;
  }

  // Only while a limit is on does every new document wait to be checked, so a page with no limit loads as fast as any.
  async withNavigationLimit<T>(allows: (url: string) => boolean, act: () => Promise<T>): Promise<{ result: T; refused: string[] }> {
    const limit = (url: string) => allows(url);
    const refused = new Set<string>();
    this.navigationLimits.add(limit);
    this.refusalListeners.add(refused);
    await this.setFetching();
    try {
      const result = await act();
      return { result, refused: [...refused] };
    } finally {
      this.navigationLimits.delete(limit);
      this.refusalListeners.delete(refused);
      await this.setFetching();
    }
  }

  private setFetching(): Promise<unknown> {
    const on = this.navigationLimits.size > 0;
    this.fetching = this.fetching.then(() =>
      on
        ? this.session.send("Fetch.enable", { patterns: [{ urlPattern: "*", resourceType: "Document", requestStage: "Request" }] })
        : this.session.send("Fetch.disable")
    ).catch(() => {});
    return this.fetching;
  }

  // Pictures of the page as it changes, for the user's screen and nothing else. Null stops them.
  async watch(onFrame: ((jpeg: string) => void) | null): Promise<void> {
    const was = this.screencast;
    this.screencast = onFrame;
    if (this.closed || !!was === !!onFrame) return;
    await (onFrame
      ? this.session.send("Page.startScreencast", { format: "jpeg", quality: SCREENCAST_QUALITY, maxWidth: SCREENCAST_WIDTH, everyNthFrame: 1 })
      : this.session.send("Page.stopScreencast")
    ).catch(() => {});
  }

  async close(): Promise<void> {
    this.screencast = null;
    if (!this.closed) await this.page.close().catch(() => {});
    this.closed = true;
  }
}
