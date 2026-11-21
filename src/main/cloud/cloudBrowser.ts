import type { BrowserContext, Page } from "playwright-core";
import { CdpTab, type CdpTabEvents } from "../tools/CdpTab";
import { CloudLife, ENDED_MEANWHILE, type CloudLifeHooks } from "./cloudLife";
import { NO_IDS, type CloudBrowser, type CloudIds } from "./cloudProvider";
import { closePopups } from "./cloudPopups";

// A browser somewhere else, reached over CDP, for a mascot to work in, and who is using it: one job at a time, and the
// user in pages they hold. Plain Node, like `CdpTab`, so a runner without a window can use the same code. Its life,
// from start to release, is `CloudLife`'s.

export class CloudSessions extends CloudLife {
  private owner: string | null = null;
  // Main changing its cookies, so it doesn't wind down meanwhile.
  private readonly users = new Set<symbol>();
  // Pages the user holds, by tab, each with the hold that took it, so a late call can only let go of its own.
  private readonly held = new Map<string, object>();
  private readonly pages = new Map<string, { tab: CdpTab; jobId: string }>();
  // Every page made here. Anything else in the context is a popup a page opened.
  private readonly ours = new WeakSet<Page>();
  private opening: Promise<unknown> = Promise.resolve();

  constructor(browser: CloudBrowser | null, ids: CloudIds = NO_IDS, hooks: CloudLifeHooks = {}, idleMs?: number) {
    super(browser, ids, hooks, idleMs);
    // A session left running last time ends too, unless something wants it first. Here, once who uses it is known.
    this.settle();
    this.recover();
  }

  protected inUse(): boolean {
    return this.owner !== null || this.users.size > 0 || this.held.size > 0;
  }

  protected dropAll(): void {
    this.pages.clear();
    this.owner = null;
    this.users.clear();
    this.held.clear();
  }

  // A hold is on a page, so it goes with it.
  protected dropPages(): void {
    this.pages.clear();
    this.held.clear();
  }

  protected prepare(context: BrowserContext): Promise<void> {
    return closePopups(context, {
      ours: (page) => this.ours.has(page),
      opening: () => this.opening,
      jobTabs: () => [...this.pages.values()].filter(({ jobId }) => jobId === this.owner).map(({ tab }) => tab),
      tabOf: (opener) => [...this.pages.values()].find(({ tab }) => tab.page === opener)?.tab ?? null,
    });
  }

  // The job using it now, if any.
  get busyWith(): string | null {
    return this.owner;
  }

  // Only one job works in it at a time. False if another has it, or it's ending.
  claim(jobId: string): boolean {
    if (this.refusal || (this.owner && this.owner !== jobId)) return false;
    this.owner = jobId;
    this.settled();
    return true;
  }

  release(jobId: string): void {
    if (this.owner !== jobId) return;
    this.owner = null;
    this.settled();
  }

  // The user has a page here, such as one they took over or opened to check a sign-in. It stays open while they do.
  holdForUser(id: string): object {
    const hold = {};
    this.held.set(id, hold);
    this.settle();
    return hold;
  }

  // Lets go of the page, or only of `hold` if that's still what holds it.
  letGo(id: string, hold?: object): void {
    if (!this.held.has(id) || (hold && this.held.get(id) !== hold)) return;
    this.held.delete(id);
    this.settle();
  }

  heldByUser(id: string): boolean {
    return this.held.has(id);
  }

  // A new page for the job that has claimed the session. `id` is what the tools and the window call it. `allows` is a
  // limited mascot's sites, which hold from the blank page's first load, so a redirect can't send anything elsewhere.
  async open(jobId: string, id: string, url: string, events: CdpTabEvents, allows?: (url: string) => boolean): Promise<CdpTab> {
    if (this.owner !== jobId) throw new Error("The cloud browser is working on another job.");
    const tab = await this.newTab(id, jobId, events);
    const load = () =>
      tab.loadURL(url).then(
        () => tab.settled(),
        () => {},
      );
    try {
      if (allows) await tab.withNavigationLimit(allows, load);
      else await load();
    } catch (error) {
      // A limit that couldn't be put on leaves no blank page behind it. Only this one: by now the id may be another's.
      await this.closeOwn(id, tab);
      throw error;
    }
    this.changed();
    return tab;
  }

  // For main only, never a tool: whatever is done to the browser's cookies, such as bringing a login along. Starts the
  // session if it isn't running, and lets it wind down as usual afterwards if nobody else is using it.
  async withContext<T>(act: (context: BrowserContext) => Promise<T>): Promise<T> {
    const user = Symbol("cookies");
    this.users.add(user);
    this.settle();
    try {
      return await act((await this.ensure()).context);
    } finally {
      this.users.delete(user);
      this.settle();
    }
  }

  // A page the user opened themselves, such as a site to see whether they're signed in. It belongs to no job, and it's
  // the user's from the start. Null if they let go of it before it opened, which closes it.
  async openForUser(id: string, url: string, events: CdpTabEvents): Promise<CdpTab | null> {
    const hold = this.holdForUser(id);
    try {
      const tab = await this.newTab(id, "", events);
      if (this.held.get(id) !== hold) {
        await this.closeOwn(id, tab);
        return null;
      }
      await tab.loadURL(url).then(
        () => tab.settled(),
        () => {},
      );
      this.changed();
      return tab;
    } catch (error) {
      this.letGo(id, hold);
      throw error;
    }
  }

  private async newTab(id: string, jobId: string, events: CdpTabEvents): Promise<CdpTab> {
    const life = this.life;
    const session = await this.ensure();
    if (!life.current) throw new Error(ENDED_MEANWHILE);
    const made = session.context.newPage();
    this.opening = made.catch(() => null);
    const page = await made;
    this.ours.add(page);
    if (!life.current) {
      void page.close().catch(() => {});
      throw new Error(ENDED_MEANWHILE);
    }
    const tab = await CdpTab.attach(id, page, events).catch((error: unknown) => {
      void page.close().catch(() => {});
      throw error;
    });
    if (!life.current) {
      void tab.close().catch(() => {});
      throw new Error(ENDED_MEANWHILE);
    }
    this.pages.set(id, { tab, jobId });
    page.on("close", () => {
      if (this.pages.get(id)?.tab !== tab) return;
      this.pages.delete(id);
      this.held.delete(id);
      this.settled();
    });
    return tab;
  }

  page(id: string): CdpTab | null {
    return this.pages.get(id)?.tab ?? null;
  }

  get pageIds(): string[] {
    return [...this.pages.keys()];
  }

  // The job working in a page now: the one that opened it, while it still has the session.
  usedBy(id: string): string | null {
    const jobId = this.pages.get(id)?.jobId;
    return jobId && jobId === this.owner ? jobId : null;
  }

  pagesOf(jobId: string): CdpTab[] {
    return [...this.pages.values()].filter((page) => page.jobId === jobId && !page.tab.isClosed).map(({ tab }) => tab);
  }

  // The page called that now, from the window or the job using it.
  async close(id: string): Promise<void> {
    const page = this.pages.get(id);
    if (page) await this.closeOwn(id, page.tab);
  }

  // That tab, and its place under `id` only while it's still there.
  private async closeOwn(id: string, tab: CdpTab): Promise<void> {
    if (this.pages.get(id)?.tab === tab) this.pages.delete(id);
    await tab.close();
    this.changed();
  }

  async liveView(id: string): Promise<string | null> {
    const page = this.page(id);
    return page && this.session ? this.session.liveView(page).catch(() => null) : null;
  }
}
