// The browsers and pages behind the cloud model checker's fake Browserbase, and the answers everything waits on. Every
// answer waits until the checker gives it, in any order, so it can try the orders a real network gives. An answer says
// how it went: 0 fails it, 1 is the odd answer where there is one, and anything else works. A Chrome on this computer
// stands in too: it runs from the moment it's started until it's killed, which a stop asked for while it starts does.

export type Kind =
  | "context"
  | "land"
  | "create"
  | "list"
  | "lookup"
  | "release"
  | "connect"
  | "route"
  | "newPage"
  | "attach"
  | "limit"
  | "unwatch"
  | "launch";

// Whose an answer is: the app's go when it does, a runner's and the network's don't.
type Owner = "app" | "runner";

interface Pending {
  kind: Kind;
  owner: Owner;
  // The session a release is for.
  id?: string;
  // When it was sent, for a create's landing.
  sent?: number;
  // Gives the answer, and says what it was, for the trace.
  answer: (how: number) => string;
}

export const FAILS = 0;
export const ODD = 1;
export const WORKS = 2;
// Who a local browser's session belongs to: nobody's account.
export const LOCAL = "local";

// What a runner's requests carry, so they outlive the app's.
export const ownerOf = (account: string): Owner => (account.startsWith("runner") ? "runner" : "app");

export interface FakeTab {
  id: string;
  // Unique across the run, for the trace, since a reopened window's tab ids repeat.
  name: string;
  url: string;
  title: string;
  isClosed: boolean;
  loadURL: () => Promise<void>;
  settled: () => Promise<void>;
  close: () => Promise<void>;
  watch: (onFrame: unknown) => Promise<void>;
  withNavigationLimit: (allows: unknown, load: () => Promise<void>) => Promise<void>;
  fitTo: () => Promise<void>;
}

// What a local browser's provider hands back, as `CloudSession` is.
export interface LocalSession {
  context: unknown;
  liveView: () => Promise<null>;
  close: () => Promise<void>;
}

export abstract class WorldBrowsers {
  pending: Pending[] = [];
  // Local browsers by name, and whether each still runs.
  readonly local = new Map<string, boolean>();
  // Every page attached, and the last whose limit failed.
  readonly tabs: FakeTab[] = [];
  failedLimit: FakeTab | null = null;
  // The account of the connection that last dropped.
  lastDropped: string | null = null;
  protected count = 0;
  private readonly connections: { id: string; account: string; drop: () => void; open: boolean }[] = [];

  // Told of every cookie that goes into a browser, with the account of the connection it went in through.
  onCookies: (account: string, cookies: { domain?: string }[]) => void = () => {};

  protected abstract isRunning(id: string): boolean;

  get localRunning(): string[] {
    return [...this.local].filter(([, alive]) => alive).map(([name]) => name);
  }

  // Answers the one at `index`, as `how` says.
  answer(index: number, how: number): string {
    const [next] = this.pending.splice(index % this.pending.length, 1);
    return next ? next.answer(how) : "nothing to answer";
  }

  // The one at `index` among those of these kinds, if any.
  answerOf(kinds: Kind[], index: number, how: number): string | null {
    const of = this.pending.filter(({ kind }) => kinds.includes(kind));
    const next = of[index % Math.max(of.length, 1)];
    return next ? this.answer(this.pending.indexOf(next), how) : null;
  }

  // The app is gone: nothing it asked for is ever answered, and its connections go with it, telling it nothing. What
  // already landed stays done, a create on its way may still land, and a runner goes on.
  lose(): void {
    this.pending = this.pending.filter(({ kind, owner }) => kind === "land" || owner === "runner");
    for (const one of this.connections) if (ownerOf(one.account) === "app") one.open = false;
  }

  // A connection to a running session drops, as when the network goes.
  drop(index: number): string {
    const open = this.connections.filter((one) => one.open);
    const one = open[index % Math.max(open.length, 1)];
    this.lastDropped = one?.account ?? null;
    if (!one) return "no connection to drop";
    one.open = false;
    one.drop();
    // A local browser's connection only drops when the browser itself has gone.
    if (!this.local.has(one.id)) return `the connection to ${one.id} dropped`;
    this.local.set(one.id, false);
    return `${one.id} crashed`;
  }

  protected push(kind: Kind, owner: Owner, answer: (how: number) => string, more: Pick<Pending, "id" | "sent"> = {}): Pending {
    const item: Pending = { kind, owner, answer, ...more };
    this.pending.push(item);
    return item;
  }

  protected wait<T>(
    kind: Kind,
    owner: Owner,
    answer: (how: number, resolve: (value: T) => void, reject: (error: Error) => void) => string,
    id?: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => this.push(kind, owner, (how) => answer(how, resolve, reject), id ? { id } : {}));
  }

  // Playwright's `connectOverCDP`, to a session's address. The connection is the key's that gave the address.
  readonly connect = (url: string): Promise<unknown> => {
    const { pathname, searchParams } = new URL(url.replace(/^wss:/, "https:"));
    const id = pathname.slice(1);
    const account = searchParams.get("key") ?? "";
    return this.wait("connect", ownerOf(account), (how, resolve, reject) => {
      if (how === FAILS || !this.isRunning(id)) {
        reject(new Error("The connection failed."));
        return `connect to ${id} → failed`;
      }
      resolve(this.browser(id, account));
      return `connect to ${id} → connected`;
    });
  };

  // A Chrome on this computer, started now and running until it's killed, until starting it fails, or until `stop`.
  readonly launchLocal = (stop?: AbortSignal): Promise<LocalSession> => {
    const name = `local-${++this.count}`;
    this.local.set(name, true);
    return new Promise((resolve, reject) => {
      const item = this.push("launch", "app", (how) => {
        if (how === FAILS) {
          this.local.set(name, false);
          reject(new Error("The local browser couldn't be started."));
          return `${name} → didn't start`;
        }
        const browser = this.browser(name, LOCAL) as { close: () => Promise<void>; contexts: () => unknown[] };
        resolve({
          context: browser.contexts()[0],
          liveView: async () => null,
          close: async () => {
            await browser.close();
            this.local.set(name, false);
          },
        });
        return `${name} → started`;
      });
      stop?.addEventListener(
        "abort",
        () => {
          if (!this.pending.includes(item)) return;
          this.pending.splice(this.pending.indexOf(item), 1);
          this.local.set(name, false);
          reject(new Error("The local browser was stopped while it started."));
        },
        { once: true },
      );
    });
  };

  private browser(id: string, account: string): unknown {
    const dropped: (() => void)[] = [];
    const connection = { id, account, open: true, drop: () => dropped.forEach((then) => then()) };
    this.connections.push(connection);
    const owner = ownerOf(account);
    const context = {
      // Putting the routes on takes an answer, so an ending can come while a connection is prepared.
      route: () =>
        this.wait<void>("route", owner, (how, resolve, reject) => {
          if (how === FAILS || !connection.open) {
            reject(new Error("The routes couldn't be put on."));
            return `routes in ${id} → failed`;
          }
          resolve();
          return `routes in ${id} → on`;
        }),
      on: () => {},
      browser: () => browser,
      newPage: () =>
        this.wait("newPage", owner, (how, resolve, reject) => {
          if (how === FAILS || !connection.open) {
            reject(new Error("The page didn't open."));
            return `new page in ${id} → failed`;
          }
          resolve({ on: () => {}, close: async () => {}, opener: async () => null });
          return `new page in ${id} → opened`;
        }),
      addCookies: async (cookies: { domain?: string }[]) => {
        if (!connection.open) throw new Error("The connection has gone.");
        this.onCookies(account, cookies);
      },
      clearCookies: async () => {},
    };
    const browser = {
      contexts: () => [context],
      newContext: async () => context,
      on: (event: string, then: () => void) => {
        if (event === "disconnected") dropped.push(then);
      },
      close: async () => {
        connection.open = false;
      },
    };
    return browser;
  }

  // `CdpTab.attach`, which can fail too. A runner's tabs have ids of their own.
  readonly attach = (id: string): Promise<FakeTab> =>
    this.wait("attach", ownerOf(id), (how, resolve, reject) => {
      if (how === FAILS) {
        reject(new Error("The page couldn't be attached."));
        return `attach ${id} → failed`;
      }
      const tab: FakeTab = {
        id,
        name: `page-${++this.count}`,
        url: "https://example.com/",
        title: "",
        isClosed: false,
        loadURL: async () => {},
        settled: async () => {},
        close: async () => {
          tab.isClosed = true;
        },
        // Stopping the pictures takes an answer, as stopping a screencast does.
        watch: (onFrame) =>
          onFrame ? Promise.resolve() : this.wait("unwatch", ownerOf(id), (_how, resolve) => (resolve(), `${id}'s pictures stop`)),
        // Putting a limited mascot's limit on takes an answer, which can fail long after the page opened.
        withNavigationLimit: (_allows, load) =>
          this.wait<void>("limit", ownerOf(id), (how, resolve, reject) => {
            if (how === FAILS) {
              this.failedLimit = tab;
              reject(new Error("Fetch.enable failed"));
              return `the limit on ${tab.name} → failed`;
            }
            resolve();
            return `the limit on ${tab.name} → on`;
          }).then(load),
        fitTo: async () => {},
      };
      this.tabs.push(tab);
      resolve(tab);
      return `attach ${id} → attached as ${tab.name}`;
    });
}
