// The app around the cloud, for its model checker: one launch of it, with its cloud, its windows and who is using the
// cloud, as far as the checker knows. Each window numbers its tabs from 1, as TabStrip does, so a reopened window's tabs
// have the ids of the last one's.
import type { CloudTabs, CloudTabsHooks } from "./CloudTabs";
import { quietly } from "./cloudCheckPlan";
import { LOCAL, type CloudWorld, type LocalSession } from "./cloudWorldTesting";

type Saved = Parameters<ConstructorParameters<typeof CloudTabs>[1]>[0];

// What the checker drives. The test file says how this version of the cloud is made and attached.
export interface CloudUnderTest {
  tabs: Pick<
    CloudTabs,
    | "claim"
    | "release"
    | "open"
    | "tabClosed"
    | "takeOver"
    | "watch"
    | "end"
    | "forget"
    | "saveKey"
    | "checkLogin"
    | "bringLogin"
    | "revokeLogin"
    | "state"
  >;
  windowOpened(hooks: CloudTabsHooks): void;
  windowClosed(): Promise<unknown>;
  quit(): Promise<unknown>;
}

// How a launch's cloud is made: from the saved key, or with a Chrome on this computer standing in.
interface Making {
  local: boolean;
  launchLocal: () => Promise<LocalSession>;
  readCookies: ConstructorParameters<typeof CloudTabs>[2];
}

// What the test file mocks, so that each run can point it at its own world, and how it makes the cloud.
export interface Setup {
  net: { connect: (url: string) => Promise<unknown>; attach: (id: string) => Promise<unknown> };
  disk: { saved: Saved; onWrite: (next: Saved) => void };
  makeCloud: (making: Making) => CloudUnderTest;
  // Before each run: nothing left on disk from the last.
  reset: () => void;
}

export type Breaks = (rule: string, why: string) => void;

// One window and its tabs, the cloud's and the user's own.
export class Win {
  open = true;
  private count = 0;
  readonly tabs = new Map<string, { cloud: boolean; title: string }>();
  // Sign-in confirms waiting on the user, by site.
  readonly confirms = new Map<string, (yes: boolean) => void>();

  nextId(): string {
    return `tab-${++this.count}`;
  }

  get cloudTabs(): string[] {
    return [...this.tabs].filter(([, { cloud }]) => cloud).map(([id]) => id);
  }

  // A dialog goes with its window.
  close(): void {
    this.open = false;
    this.tabs.clear();
    this.confirms.forEach((answer) => answer(false));
    this.confirms.clear();
  }
}

export class Launch {
  readonly cloud: CloudUnderTest;
  win = new Win();
  // Endings asked for and not yet over.
  endings = 0;
  // Who is using the cloud: jobs, tabs the user holds in the window, checks still opening, and cookie work.
  readonly jobs = new Set<string>();
  readonly held = new Set<string>();
  readonly checking = new Set<string>();
  readonly cookieWork = new Set<number>();
  // Sign-ins being brought along, by site, with the account the user confirmed them for.
  readonly transfers = new Map<string, string>();

  private readonly disk: Setup["disk"];
  private readonly breaks: Breaks;

  constructor(
    readonly local: boolean,
    { world, disk, breaks, makeCloud }: { world: CloudWorld; disk: Setup["disk"]; breaks: Breaks; makeCloud: Setup["makeCloud"] },
  ) {
    this.disk = disk;
    this.breaks = breaks;
    this.cloud = makeCloud({
      local,
      launchLocal: world.launchLocal,
      // Each site's own sign-in, so the checker can tell where it went.
      readCookies: async (site) => [{ name: "sid", value: site, domain: `.${site}`, path: "/" }],
    });
    world.onCookies = (account, cookies) => {
      for (const { domain } of cookies) {
        const site = (domain ?? "").replace(/^\./, "");
        const confirmed = this.transfers.get(site);
        if (confirmed !== undefined && confirmed !== account)
          breaks("cookies-crossed-account", `the sign-in to ${site}, confirmed for ${confirmed}, went into ${account}'s browser`);
      }
    };
    this.cloud.windowOpened(this.hooks(this.win));
  }

  // Who the provider is for a sign-in confirmed now.
  get account(): string {
    return this.local ? LOCAL : (this.disk.saved.apiKey ?? "no key");
  }

  users(): number {
    const checks = [...this.checking].filter((id) => this.win.tabs.has(id)).length;
    return this.jobs.size + this.held.size + checks + this.cookieWork.size;
  }

  openWindow(): void {
    this.win = new Win();
    this.cloud.windowOpened(this.hooks(this.win));
  }

  closeWindow(): void {
    const working = [...this.jobs];
    this.win.close();
    this.ending(this.cloud.windowClosed());
    // The window's chats stop after its cloud, as in its close.
    working.forEach((job) => this.cloud.tabs.release(job));
  }

  // An ending drops every claim, every page and everything on its way, so the checker's users go with it.
  ending(work: Promise<unknown>): void {
    this.endings++;
    this.jobs.clear();
    this.held.clear();
    this.checking.clear();
    this.cookieWork.clear();
    quietly(work.finally(() => this.endings--));
  }

  // The user closes a tab the cloud has in the window, as TabStrip does.
  closeTab(id: string): void {
    this.win.tabs.delete(id);
    this.held.delete(id);
    this.checking.delete(id);
    this.cloud.tabs.tabClosed(id);
  }

  // The user opens a tab of their own.
  userTab(): string {
    const id = this.win.nextId();
    this.win.tabs.set(id, { cloud: false, title: "example.org" });
    return id;
  }

  // The newest tab the cloud opened with that title, if it's still in the window.
  tabTitled(title: string): string | undefined {
    return [...this.win.tabs].reverse().find(([, tab]) => tab.cloud && tab.title === title)?.[0];
  }

  // A window's part, as makeCloud.ts's `cloudHooks` is.
  private hooks(win: Win): CloudTabsHooks {
    return {
      chrome: () => ({ isDestroyed: () => true }) as never,
      openTab: (title) => {
        const id = win.nextId();
        if (win.open) win.tabs.set(id, { cloud: true, title });
        return id;
      },
      updateTab: (id) => void this.reach(win, id, "renamed"),
      closeTab: (id) => {
        if (this.reach(win, id, "closed")) this.closeTab(id);
      },
      takenOver: () => {},
      showTab: (id) => void this.reach(win, id, "switched to"),
      confirmLogin: (site) => (win.open ? new Promise<boolean>((resolve) => win.confirms.set(site, resolve)) : Promise.resolve(false)),
    };
  }

  // Whether the cloud may act on that tab: it's in this window, still open, and not one of the user's own.
  private reach(win: Win, id: string, what: string): boolean {
    if (!win.open || win !== this.win) {
      this.breaks("wrong-window", `the cloud ${what} ${id} in a window that had closed`);
      return false;
    }
    if (win.tabs.get(id)?.cloud === false) {
      this.breaks("wrong-window", `the cloud ${what} the user's own ${id}`);
      return false;
    }
    return true;
  }
}
