import type { Browser, BrowserContext, Page, Request, Route } from "playwright-core";
import { CdpTab, type CdpTabEvents } from "./CdpTab";

// A browser somewhere else, reached over CDP, for a bird to work in. Plain Node, like `CdpTab`, so a runner without a
// window can use the same code. One session at a time, and one job in it at a time.

// A running browser, from whichever provider.
export interface CloudSession {
  readonly context: BrowserContext;
  // An address for an iframe showing this page live, which the user can work in. Null where there's none, as for a
  // local browser, which shows pictures instead.
  liveView(page: CdpTab): Promise<string | null>;
  // Lets go of the connection, and ends a browser this computer started.
  close(): Promise<void>;
}

export interface CloudBrowser {
  readonly name: "browserbase" | "local";
  start(): Promise<CloudSession>;
  // Whether a session may still be running at the provider, connected or not.
  readonly hasSession: boolean;
  // Ends it there, with or without a connection, so nothing keeps running or costing. Rejects if that wasn't confirmed.
  release(): Promise<void>;
}

// Playwright loads only when a cloud browser is first used, so startup never waits for it.
export const connectOverCdp = async (endpoint: string): Promise<Browser> => {
  const { chromium } = await import("playwright-core");
  return chromium.connectOverCDP(endpoint);
};

// How long a popup gets to say where it's going before it's closed.
const POPUP_URL_MS = 2_000;

export type CloudStatus = "idle" | "starting" | "running" | "ended";

const IDLE_MS = 3 * 60_000;

// The session, the job using it and its pages. Whoever owns this decides who may claim it.
export class CloudSessions {
  private session: CloudSession | null = null;
  private starting: Promise<CloudSession> | null = null;
  private owner: string | null = null;
  private readonly pages = new Map<string, { tab: CdpTab; jobId: string }>();
  private _status: CloudStatus = "idle";
  private _problem: string | null = null;
  // The last release wasn't confirmed, so a paid session may still be running.
  private _unreleased = false;
  // Every page made here. Anything else in the context is a popup a page opened.
  private readonly ours = new WeakSet<Page>();
  private opening: Promise<unknown> = Promise.resolve();
  // A session nobody is using still costs, so it ends a while after the last job lets go.
  private idle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly browser: CloudBrowser,
    private readonly onChange: () => void = () => {},
    private readonly idleMs = IDLE_MS
  ) {}

  get status(): CloudStatus {
    return this._status;
  }

  get problem(): string | null {
    return this._problem;
  }

  get unreleased(): boolean {
    return this._unreleased;
  }

  // Whether End has anything to end, here or at the provider.
  get canEnd(): boolean {
    return this.session !== null || this.starting !== null || this.browser.hasSession || this._unreleased;
  }

  get provider(): CloudBrowser["name"] {
    return this.browser.name;
  }

  // The job using it now, if any.
  get busyWith(): string | null {
    return this.owner;
  }

  // Only one job works in it at a time. False if another has it.
  claim(jobId: string): boolean {
    if (this.owner && this.owner !== jobId) return false;
    this.owner = jobId;
    this.keepOpen();
    this.onChange();
    return true;
  }

  release(jobId: string): void {
    if (this.owner !== jobId) return;
    this.owner = null;
    this.keepOpen();
    if (this.canEnd) this.idle = setTimeout(() => void this.end(), this.idleMs);
    this.onChange();
  }

  // Someone is using it: a job, or the user after taking over, who ends it themselves or at the provider's timeout.
  keepOpen(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
  }

  private async ensure(): Promise<CloudSession> {
    if (this.session) return this.session;
    this.starting ??= (async () => {
      this._status = "starting";
      this._problem = null;
      this.onChange();
      try {
        const session = await this.browser.start();
        await this.stopPopups(session.context);
        this.session = session;
        this._status = "running";
        session.context.browser()?.on("disconnected", () => this.lost());
        return session;
      } catch (error) {
        this._status = "idle";
        const problem = error instanceof Error ? error.message : "The cloud browser couldn't start.";
        // A session may have been made before the connection failed, and nothing else would end it.
        await this.releaseAtProvider();
        this._problem ??= problem;
        throw new Error(problem);
      } finally {
        this.starting = null;
        this.onChange();
      }
    })();
    return this.starting;
  }

  // A popup is a new page nothing here watches. Playwright holds every new page until its routes are on, so its requests
  // all come through here. Its first navigation comes before Playwright knows its frame, so it's checked against the
  // job's limits like any navigation in its tabs, and refused where they say no. Everything else from a popup is
  // refused, the popup is closed, and an address it was going to loads in the tab it came from, under that tab's limits:
  // the same as following the link there.
  private async stopPopups(context: BrowserContext): Promise<void> {
    await context.route("**/*", (route, request) => this.route(route, request));
    context.on("page", (page) => void this.closePopup(page));
  }

  private jobTabs(): CdpTab[] {
    return [...this.pages.values()].filter(({ jobId }) => jobId === this.owner).map(({ tab }) => tab);
  }

  private route(route: Route, request: Request): Promise<void> {
    let page: Page | null = null;
    try {
      page = request.frame().page();
    } catch {
      // A service worker's, or a navigation in a frame that doesn't exist yet, such as a popup's first.
      const refused = request.isNavigationRequest() && this.jobTabs().filter((tab) => tab.refuse(request.url())).length > 0;
      return refused ? route.abort("blockedbyclient").catch(() => {}) : route.fallback();
    }
    if (this.ours.has(page)) return route.fallback();
    return route.abort("blockedbyclient").catch(() => {});
  }

  private async closePopup(page: Page): Promise<void> {
    // Our own page is in `ours` once `newPage` is done.
    await this.opening;
    if (this.ours.has(page)) return;
    const opener = await page.opener().catch(() => null);
    // Where it was going, if it got that far.
    await page.waitForURL(/^https?:/, { timeout: POPUP_URL_MS }).catch(() => {});
    const url = page.url();
    await page.close().catch(() => {});
    if (!/^https?:/.test(url)) return;
    // Only into the tab that opened it, whichever chat that is. A popup with no opener to find, as from a `noopener`
    // link, loads nowhere, so it can't land in another chat's page.
    const tab = [...this.pages.values()].find(({ tab: one }) => one.page === opener)?.tab;
    await tab?.loadURL(url).catch(() => {});
  }

  // The connection went. A kept-alive session can still be running at the provider, which End can release.
  private lost(): void {
    if (!this.session) return;
    this.session = null;
    this._status = "idle";
    this.pages.clear();
    this.onChange();
  }

  // A new page for the job that has claimed the session. `id` is what the tools and the window call it. `allows` is a
  // limited mascot's sites, which hold from the blank page's first load, so a redirect can't send anything elsewhere.
  async open(jobId: string, id: string, url: string, events: CdpTabEvents, allows?: (url: string) => boolean): Promise<CdpTab> {
    if (this.owner !== jobId) throw new Error("The cloud browser is working on another job.");
    const session = await this.ensure();
    const made = session.context.newPage();
    this.opening = made.catch(() => null);
    const page = await made;
    this.ours.add(page);
    const tab = await CdpTab.attach(id, page, events);
    this.pages.set(id, { tab, jobId });
    page.on("close", () => {
      this.pages.delete(id);
      this.onChange();
    });
    const load = () => tab.loadURL(url).then(() => tab.settled(), () => {});
    if (allows) await tab.withNavigationLimit(allows, load);
    else await load();
    this.onChange();
    return tab;
  }

  page(id: string): CdpTab | null {
    return this.pages.get(id)?.tab ?? null;
  }

  get pageIds(): string[] {
    return [...this.pages.keys()];
  }

  pagesOf(jobId: string): CdpTab[] {
    return [...this.pages.values()].filter((page) => page.jobId === jobId && !page.tab.isClosed).map(({ tab }) => tab);
  }

  async close(id: string): Promise<void> {
    const page = this.pages.get(id);
    this.pages.delete(id);
    await page?.tab.close();
    this.onChange();
  }

  async liveView(id: string): Promise<string | null> {
    const page = this.page(id);
    return page && this.session ? this.session.liveView(page).catch(() => null) : null;
  }

  // True once the provider has confirmed. Otherwise it says so, and End stays there to try again.
  private async releaseAtProvider(): Promise<boolean> {
    try {
      await this.browser.release();
      this._unreleased = false;
      this._problem = null;
      return true;
    } catch (error) {
      console.error("Couldn't release the cloud session:", error);
      this._unreleased = true;
      this._problem = "The cloud session may still be running, and costing, because the provider didn't confirm it ended. Try again.";
      return false;
    }
  }

  // Everything goes: the session at the provider first, then the connection, the pages and the job's claim.
  async end(): Promise<void> {
    this.keepOpen();
    const session = this.session ?? (await this.starting?.catch(() => null)) ?? null;
    await this.releaseAtProvider();
    await session?.close().catch(() => {});
    this.session = null;
    this.pages.clear();
    this.owner = null;
    this._status = "ended";
    this.onChange();
  }
}
