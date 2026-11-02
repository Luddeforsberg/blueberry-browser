import type { Browser, BrowserContext } from "playwright-core";
import { CdpTab, type CdpTabEvents } from "./CdpTab";

// A browser somewhere else, reached over CDP, for a bird to work in. Plain Node, like `CdpTab`, so a runner without a
// window can use the same code. One session at a time, and one job in it at a time.

// A running browser, from whichever provider.
export interface CloudSession {
  readonly context: BrowserContext;
  // An address for an iframe showing this page live, which the user can work in. Null where there's none, as for a
  // local browser, which shows pictures instead.
  liveView(page: CdpTab): Promise<string | null>;
  // Ends it at the provider too, so nothing keeps running or costing.
  end(): Promise<void>;
}

export interface CloudBrowser {
  readonly name: "browserbase" | "local";
  start(): Promise<CloudSession>;
}

// Playwright loads only when a cloud browser is first used, so startup never waits for it.
export const connectOverCdp = async (endpoint: string): Promise<Browser> => {
  const { chromium } = await import("playwright-core");
  return chromium.connectOverCDP(endpoint);
};

export type CloudStatus = "idle" | "starting" | "running" | "ended";

// The session, the job using it and its pages. Whoever owns this decides who may claim it.
export class CloudSessions {
  private session: CloudSession | null = null;
  private starting: Promise<CloudSession> | null = null;
  private owner: string | null = null;
  private readonly pages = new Map<string, { tab: CdpTab; jobId: string }>();
  private _status: CloudStatus = "idle";
  private _problem: string | null = null;

  constructor(
    private readonly browser: CloudBrowser,
    private readonly onChange: () => void = () => {}
  ) {}

  get status(): CloudStatus {
    return this._status;
  }

  get problem(): string | null {
    return this._problem;
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
    this.onChange();
    return true;
  }

  release(jobId: string): void {
    if (this.owner !== jobId) return;
    this.owner = null;
    this.onChange();
  }

  private async ensure(): Promise<CloudSession> {
    if (this.session) return this.session;
    this.starting ??= (async () => {
      this._status = "starting";
      this._problem = null;
      this.onChange();
      try {
        const session = await this.browser.start();
        this.session = session;
        this._status = "running";
        session.context.browser()?.on("disconnected", () => this.lost());
        return session;
      } catch (error) {
        this._status = "idle";
        this._problem = error instanceof Error ? error.message : "The cloud browser couldn't start.";
        throw new Error(this._problem);
      } finally {
        this.starting = null;
        this.onChange();
      }
    })();
    return this.starting;
  }

  private lost(): void {
    if (!this.session) return;
    this.session = null;
    this._status = "ended";
    this.pages.clear();
    this.onChange();
  }

  // A new page for the job that has claimed the session. `id` is what the tools and the window call it.
  async open(jobId: string, id: string, url: string, events: CdpTabEvents): Promise<CdpTab> {
    if (this.owner !== jobId) throw new Error("The cloud browser is working on another job.");
    const session = await this.ensure();
    const page = await session.context.newPage();
    const tab = await CdpTab.attach(id, page, events);
    this.pages.set(id, { tab, jobId });
    page.on("close", () => {
      this.pages.delete(id);
      this.onChange();
    });
    await tab.loadURL(url).catch(() => {});
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

  // Everything goes: the pages, the job's claim and the session at the provider.
  async end(): Promise<void> {
    const session = this.session ?? (await this.starting?.catch(() => null)) ?? null;
    this.session = null;
    this.pages.clear();
    this.owner = null;
    this._status = "ended";
    this.onChange();
    await session?.end().catch((error) => console.error("Couldn't end the cloud session:", error));
  }
}
