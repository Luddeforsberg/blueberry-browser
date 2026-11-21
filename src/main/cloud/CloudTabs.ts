import { dirname, join } from "path";
import { safeStorage, type WebContents } from "electron";
import type { CloudState, CloudView } from "../../shared/ipc";
import { isLiveView } from "./browserbase";
import { EMPTY, MAX_FIELD_LENGTH, readCloudFile, writeCloudFile, type Saved } from "./cloudFile";
import type { CdpTab } from "../tools/CdpTab";
import type { ChatCloud } from "../chats/Chats";
import { CloudSessions } from "./cloudBrowser";
import type { CloudBrowser, Released } from "./cloudProvider";
import { CloudLogins, loginSite, type StoredCookie } from "./cloudLogins";
import { sendToRenderer } from "../window/ipc";
import { Latest } from "../../shared/lateWork";

// Settings > Cloud and the cloud tabs in the window. One for the app's whole life, whichever window is open, with one
// `CloudSessions` that's never replaced. The Browserbase key and project id are kept with `safeStorage` and never leave
// main once saved. The live view, or the pictures standing in for it, go to the chrome and nowhere else: not to a tool, a
// chat or the disk. A cloud tab is an internal page in the window, drawn by the chrome, with its page in the cloud
// browser behind it.

const NOT_SAFE = "This computer can't keep the key encrypted, so it wasn't saved.";
const NOT_SAVED = "The key couldn't be saved.";
// The session's id is the only way to end it, and it goes with the key, unless Browserbase no longer takes that key.
const STILL_RUNNING = "The cloud session didn't confirm it ended, so the key was kept to end it with. Press End again first.";
const LEFT_RUNNING = "Browserbase no longer takes that key, so its last session couldn't be ended. It ends on its own within an hour.";
// What a cloud tab may ask its page's viewport to be, in pixels.
const FIT = { min: { width: 320, height: 200 }, max: { width: 3840, height: 2160 } };

// The open window's part.
export interface CloudTabsHooks {
  chrome: () => WebContents;
  // A tab in the window for a cloud page, behind the user. Says its id.
  openTab: (title: string) => string;
  updateTab: (id: string, title: string) => void;
  closeTab: (id: string) => void;
  // The user has taken this tab from the job that opened it.
  takenOver: (id: string) => void;
  // Puts a tab in front, for a site the user opened to check.
  showTab: (id: string) => void;
  // Touch ID, or a plain confirm where there's none, before a site's cookies are read.
  confirmLogin: (site: string) => Promise<boolean>;
}

const NO_WINDOW = "Blueberry has no window open.";

export class CloudTabs implements ChatCloud {
  private saved: Saved;
  private readonly sessions: CloudSessions;
  private hooks: CloudTabsHooks | null = null;
  private problem: string | null = null;
  private watching: CdpTab | null = null;
  // Stopping the last tab's picture takes a moment, and the user may have moved on again by then.
  private readonly watches = new Latest();
  // The size the chrome last asked for, for a page a job is working in. A job's input aims at fixed points, so the page
  // only changes size once the job lets go of it.
  private readonly pendingFits = new Map<string, { width: number; height: number }>();
  // Tabs the user opened to see whether they're signed in, and the site each is for. No job can reach them.
  private readonly checking = new Map<string, string>();
  private readonly logins: CloudLogins;
  private quitting: Promise<void> | null = null;

  constructor(
    private readonly file: string,
    // The browser a saved key makes: Browserbase, a Chrome on this computer where an unpackaged app asked for one, or none.
    private readonly provider: (saved: Saved) => CloudBrowser | null,
    // That one site's cookies from this browser's own session. Nothing else.
    readCookies: (site: string) => Promise<StoredCookie[]>,
  ) {
    this.saved = readCloudFile(file);
    const { contextId, sessionId } = this.saved;
    this.sessions = new CloudSessions(
      provider(this.saved),
      { contextId, sessionId },
      {
        onChange: () => this.changed(),
        onIds: (ids) => {
          this.saved = { ...this.saved, ...ids };
          this.save();
        },
      },
    );
    this.logins = new CloudLogins(join(dirname(file), "cloud-logins.json"), {
      jar: () => (this.sessions.provider ? this.sessions : null),
      confirm: (site) => this.hooks?.confirmLogin(site) ?? Promise.resolve(false),
      readCookies,
      onChange: () => this.changed(),
    });
  }

  // A window opened. Its tabs show the cloud's pages, and its chrome hears about every change.
  attach(hooks: CloudTabsHooks): void {
    this.hooks = hooks;
    this.changed();
  }

  // The window closed, so the session ends, at the provider from its saved id if need be. Nothing waits on a page or a
  // tab first, as they're gone with the window.
  detach(): Promise<Released> {
    this.hooks = null;
    const ending = this.sessions.end();
    this.stopWork();
    return ending;
  }

  // The Browserbase Context the sites brought along are in, for the cloud runner. Only its id: the cookies stay there.
  get contextId(): string | null {
    return this.sessions.provider === "browserbase" ? this.sessions.contextId : null;
  }

  get state(): CloudState {
    const { sessions } = this;
    return {
      provider: sessions.provider,
      configured: !!this.saved.apiKey && !!this.saved.projectId,
      status: sessions.provider ? sessions.status : "off",
      busy: !!sessions.busyWith,
      canEnd: sessions.canEnd,
      unreleased: sessions.unreleased,
      problem: this.problem ?? sessions.problem,
      logins: this.logins.logins,
    };
  }

  private changed(): void {
    const chrome = this.hooks?.chrome();
    if (chrome && !chrome.isDestroyed()) sendToRenderer(chrome, "cloud:updated", this.state);
  }

  async saveKey(apiKey: unknown, projectId: unknown): Promise<CloudState> {
    const key = typeof apiKey === "string" ? apiKey.trim() : "";
    const project = typeof projectId === "string" ? projectId.trim() : "";
    this.problem = null;
    if (!key || !project || key.length > MAX_FIELD_LENGTH || project.length > MAX_FIELD_LENGTH) {
      this.problem = "Both the API key and the project id are needed.";
    } else if (!safeStorage.isEncryptionAvailable()) {
      this.problem = NOT_SAFE;
    } else {
      this.letGoOfTabs();
      await this.sessions.replace((released) => {
        if (released === "running") {
          this.problem = STILL_RUNNING;
          return null;
        }
        // A new key may be a new account, without the old context. A session the old key couldn't end is kept for this one.
        const kept = released === "refused" ? this.saved.sessionId : null;
        this.saved = { apiKey: key, projectId: project, contextId: null, sessionId: kept };
        return { browser: this.provider(this.saved), ids: { contextId: null, sessionId: kept } };
      });
    }
    this.changed();
    return this.state;
  }

  async forget(): Promise<CloudState> {
    this.letGoOfTabs();
    await this.sessions.replace((released) => {
      this.problem = released === "running" ? STILL_RUNNING : released === "refused" ? LEFT_RUNNING : null;
      if (released === "running") return null;
      this.saved = EMPTY;
      return { browser: this.provider(EMPTY), ids: { contextId: null, sessionId: null } };
    });
    this.changed();
    return this.state;
  }

  // Ends the session at the provider and closes every cloud tab, whatever was working there.
  async end(): Promise<CloudState> {
    this.letGoOfTabs();
    await this.sessions.end();
    return this.state;
  }

  // Before an ending, the tabs close, so nothing is left showing a page that's on its way out.
  private letGoOfTabs(): void {
    this.sessions.pageIds.forEach((id) => this.hooks?.closeTab(id));
    this.stopWork();
  }

  // Everything here that isn't the session: a copy waiting on the user copies nothing, and the pictures stop.
  private stopWork(): void {
    this.logins.cancelPending();
    const was = this.watching;
    this.watching = null;
    this.watches.end();
    void was?.watch(null).catch(() => {});
    this.checking.clear();
    this.pendingFits.clear();
  }

  // ChatCloud

  available(): boolean {
    return this.hooks !== null && this.sessions.provider !== null;
  }

  claim(jobId: string): boolean {
    return this.sessions.claim(jobId);
  }

  release(jobId: string): void {
    const pages = this.sessions.pagesOf(jobId).map(({ id }) => id);
    this.sessions.release(jobId);
    pages.forEach((id) => void this.applyFit(id));
  }

  async open(jobId: string, url: string, allows?: (url: string) => boolean): Promise<CdpTab> {
    if (!this.hooks) throw new Error(NO_WINDOW);
    const id = this.hooks.openTab(hostOf(url));
    try {
      return await this.sessions.open(jobId, id, url, { onChange: () => this.retitle(id) }, allows);
    } catch (error) {
      // Only a tab that's still in the window: one that closed with it is gone.
      this.hooks?.closeTab(id);
      throw error;
    }
  }

  // The tab in the window says where its page is.
  private retitle(id: string): void {
    const page = this.sessions.page(id);
    if (page) this.hooks?.updateTab(id, page.title || hostOf(page.url));
  }

  // After a handoff the user said they were done with, the job may use the page again.
  giveBack(id: string): void {
    if (!this.sessions.heldByUser(id)) return;
    this.sessions.letGo(id);
    this.changed();
  }

  pagesOf(jobId: string): CdpTab[] {
    return this.sessions.pagesOf(jobId).filter((tab) => !this.sessions.heldByUser(tab.id));
  }

  page(id: string): CdpTab | null {
    return this.sessions.page(id);
  }

  // From a tool, for a page the job opened. The tab in the window goes with it.
  close(id: string): boolean {
    if (!this.page(id) || !this.hooks) return false;
    this.hooks.closeTab(id);
    return true;
  }

  // The window closed the tab, so the page goes too, and the user has let go of it.
  tabClosed(id: string): void {
    this.checking.delete(id);
    this.pendingFits.delete(id);
    this.sessions.letGo(id);
    if (this.watching?.id === id) void this.watch(null);
    void this.sessions.close(id);
  }

  // For the chrome

  async view(id: unknown): Promise<CloudView> {
    const page = typeof id === "string" ? this.page(id) : null;
    if (!page) return { kind: "gone" };
    const takenOver = this.sessions.heldByUser(page.id);
    const live = await this.sessions.liveView(page.id);
    const checking = this.checking.get(page.id) ?? null;
    if (live === null) return { kind: "frames", takenOver, checking };
    // The chrome puts this in a frame, so it's only ever Browserbase's own page.
    return isLiveView(live) ? { kind: "live", url: live, takenOver, checking } : { kind: "gone" };
  }

  async watch(id: unknown): Promise<void> {
    const page = typeof id === "string" ? this.page(id) : null;
    if (page === this.watching) return;
    const was = this.watching;
    this.watching = page;
    const turn = this.watches.next();
    await was?.watch(null);
    if (!turn.current) return;
    try {
      await page?.watch((data) => {
        const chrome = this.hooks?.chrome();
        if (this.watching === page && chrome && !chrome.isDestroyed()) sendToRenderer(chrome, "cloud:frame", { tabId: page.id, data });
      });
    } catch {
      // The browser wouldn't start the pictures, so it isn't watching, and the next ask for this tab tries again.
      if (turn.current && this.watching === page) this.watching = null;
    }
  }

  // The chrome says how big the tab shows the page, and the page's viewport follows, as a window's own tab does on a resize.
  async fit(id: unknown, width: unknown, height: unknown): Promise<void> {
    const page = typeof id === "string" ? this.page(id) : null;
    if (!page || typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height)) return;
    const within = (value: number, axis: "width" | "height") => Math.round(Math.min(Math.max(value, FIT.min[axis]), FIT.max[axis]));
    this.pendingFits.set(page.id, { width: within(width, "width"), height: within(height, "height") });
    await this.applyFit(page.id);
  }

  private async applyFit(id: string): Promise<void> {
    const size = this.pendingFits.get(id);
    const page = this.page(id);
    if (!size || !page || (this.sessions.usedBy(id) && !this.sessions.heldByUser(id))) return;
    this.pendingFits.delete(id);
    await page.fitTo(size.width, size.height);
  }

  takeOver(id: unknown): boolean {
    if (typeof id !== "string" || !this.page(id) || !this.hooks) return false;
    this.sessions.holdForUser(id);
    this.hooks.takenOver(id);
    this.changed();
    void this.applyFit(id);
    return true;
  }

  // Signed in to: only from Settings, so only the user starts any of it. `input` is what they picked or typed, which
  // may be a whole address to open for the check.

  async bringLogin(input: unknown): Promise<string | null> {
    const site = loginSite(input);
    if (!site) return "That isn't a site's address.";
    const problem = await this.logins.bring(site);
    return problem ?? (await this.checkLogin(input));
  }

  // Opens the site in a cloud tab in front, for the user to see whether they're signed in there.
  async checkLogin(input: unknown): Promise<string | null> {
    const site = loginSite(input);
    if (!site) return "That isn't a site's address.";
    if (!this.sessions.provider) return "The cloud browser is off.";
    if (!this.hooks) return NO_WINDOW;
    const url = typeof input === "string" && /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${site}/`;
    const id = this.hooks.openTab(site);
    // Noted before it opens, so the tab is the check's while it does.
    this.checking.set(id, site);
    try {
      // The user's from the start. Null if they closed the tab while it opened.
      if (!(await this.sessions.openForUser(id, url, { onChange: () => this.retitle(id) }))) return null;
    } catch {
      this.checking.delete(id);
      this.hooks?.closeTab(id);
      return "The cloud browser couldn't open it.";
    }
    this.hooks?.showTab(id);
    this.changed();
    return null;
  }

  markLogin(input: unknown, signedIn: unknown): void {
    const site = loginSite(input);
    if (site) this.logins.mark(site, signedIn === true);
  }

  // A tab open to check that site loads again, so the user sees it signed out.
  async revokeLogin(input: unknown): Promise<string | null> {
    const site = loginSite(input);
    if (!site) return "That isn't a site's address.";
    const problem = await this.logins.revoke(site);
    if (!problem) this.reloadChecks((checked) => checked === site);
    return problem;
  }

  async forgetLogins(): Promise<string | null> {
    const problem = await this.logins.forgetAll();
    if (!problem) this.reloadChecks(() => true);
    return problem;
  }

  private reloadChecks(which: (site: string) => boolean): void {
    this.checking.forEach((site, id) => {
      const page = this.page(id);
      if (page && which(site)) void page.loadURL(page.url).catch(() => {});
    });
  }

  private save(): void {
    if (!writeCloudFile(this.file, this.saved)) this.problem = NOT_SAVED;
  }

  // The app is quitting. The session ends at the provider, from its saved id, without waiting for a connection, and a
  // local browser closes. The same promise however often it's asked.
  quit(): Promise<void> {
    this.quitting ??= (async () => {
      this.stopWork();
      await this.sessions.quit();
    })().catch(() => {});
    return this.quitting;
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host || "Cloud tab";
  } catch {
    return "Cloud tab";
  }
};
