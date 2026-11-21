// A fake Browserbase, and the browsers and pages behind it, for the cloud's model checker. A session is made, and costs,
// the moment its create lands, whether or not the answer ever comes back, as at Browserbase. Every answer waits until
// the checker gives it, in any order, so it can try the orders a real network gives. An answer says how it went: 0 fails
// it, 1 is the odd answer where there is one (a session made with no address to connect to), and anything else works.
// A Chrome on this computer stands in too: it runs from the moment it's started until it's killed.

const API = "https://api.browserbase.com/v1";

export type Kind = "context" | "create" | "list" | "lookup" | "release" | "connect" | "newPage" | "attach" | "unwatch" | "launch";

interface Pending {
  kind: Kind;
  // The session a release is for.
  id?: string;
  // Gives the answer, and says what it was, for the trace.
  answer: (how: number) => string;
}

// The parts of a fetch `Response` browserbase.ts reads.
interface Answer {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
}

interface Session {
  status: "RUNNING" | "COMPLETED";
  // What it was made with: its `userMetadata` and the key that asked for it.
  metadata: Record<string, string>;
  key: string;
}

// The parts of a cookie the checker reads.
interface Cookie {
  domain?: string;
}

const FAILS = 0;
const ODD = 1;
export const WORKS = 2;
// Who a local browser's session belongs to: nobody's account.
export const LOCAL = "local";

export interface FakeTab {
  id: string;
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

const reply = (status: number, body: unknown = {}): Answer => ({ status, ok: status < 300, json: async () => body });

// What a listing by metadata asks for, as `byMetadata` in browserbase.ts writes it.
const asked = (path: string): [string, string] | null => {
  const query = /^\/sessions\?q=(.*)$/.exec(path)?.[1];
  const match = query ? /^user_metadata\['([^']+)'\]:'([^']*)'$/.exec(decodeURIComponent(query)) : null;
  return match ? [match[1] ?? "", match[2] ?? ""] : null;
};

export class CloudWorld {
  pending: Pending[] = [];
  readonly sessions = new Map<string, Session>();
  readonly accepted = new Set<string>();
  // Sessions a release was refused for, because Browserbase no longer took the key it came with, and keys it refused.
  readonly refused = new Set<string>();
  private readonly refusedKeys = new Set<string>();
  // Every release asked for, by session id, in order.
  readonly releases: string[] = [];
  // Local browsers by name, and whether each still runs.
  readonly local = new Map<string, boolean>();
  // Told of every cookie that goes into a browser, with the account of the connection it went in through.
  onCookies: (account: string, cookies: Cookie[]) => void = () => {};
  private readonly connections: { id: string; drop: () => void; open: boolean }[] = [];
  private count = 0;

  constructor(key: string) {
    this.accepted.add(key);
  }

  // Sessions with a release asked for and not yet answered.
  get releasing(): string[] {
    return this.pending.flatMap(({ id }) => (id ? [id] : []));
  }

  // What still runs and costs, and that the app could still end. A session it was refused a release for, or one made
  // with a key it has since been refused for, may be another account's, and ends on its own.
  get running(): string[] {
    const endable = ([id, { status, key }]: [string, Session]) =>
      status === "RUNNING" && !this.refused.has(id) && !this.refusedKeys.has(key);
    return [...[...this.sessions].filter(endable).map(([id]) => id), ...this.localRunning];
  }

  get localRunning(): string[] {
    return [...this.local].filter(([, alive]) => alive).map(([name]) => name);
  }

  // Whether anything at all is still running, even one the app can't end.
  get anyRunning(): boolean {
    return [...this.sessions.values()].some(({ status }) => status === "RUNNING") || this.localRunning.length > 0;
  }

  // The tag a session was made with, if any.
  tagOf(id: string): string | undefined {
    return this.sessions.get(id)?.metadata.blueberry;
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

  // The app is gone: nothing it asked for is ever answered. What already landed stays done.
  lose(): void {
    this.pending = [];
  }

  // A connection to a running session drops, as when the network goes.
  drop(index: number): string {
    const open = this.connections.filter((one) => one.open);
    const one = open[index % Math.max(open.length, 1)];
    if (!one) return "no connection to drop";
    one.open = false;
    one.drop();
    // A local browser's connection only drops when the browser itself has gone.
    if (!this.local.has(one.id)) return `the connection to ${one.id} dropped`;
    this.local.set(one.id, false);
    return `${one.id} crashed`;
  }

  private wait<T>(
    kind: Kind,
    answer: (how: number, resolve: (value: T) => void, reject: (error: Error) => void) => string,
    id?: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => this.pending.push({ kind, id, answer: (how) => answer(how, resolve, reject) }));
  }

  readonly fetch = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Answer> => {
    const method = init.method ?? "GET";
    const path = url.replace(API, "");
    const key = init.headers?.["X-BB-API-Key"] ?? "";
    const said = `${method} ${path.replace(/\?q=.*$/, "?q=…")}`;
    const answered = (kind: Kind, answer: (how: number) => [Answer, string]) =>
      this.wait<Answer>(kind, (how, resolve) => {
        const [response, words] = this.accepted.has(key) ? answer(how) : [this.refuse(key), "401, the key is refused"];
        resolve(response);
        return `${said} → ${words}`;
      });
    if (method === "POST" && path === "/contexts")
      return answered("context", (how) => (how === FAILS ? [reply(500), "500"] : [reply(201, { id: `ctx-${++this.count}` }), "made"]));
    if (method === "POST" && path === "/sessions") return this.create(key, init.body, said);
    const listing = method === "GET" ? asked(path) : null;
    if (listing) return this.list(key, listing, said);
    const id = /^\/sessions\/([^/?]+)$/.exec(path)?.[1];
    if (!id) return Promise.resolve(reply(404));
    if (method === "GET") return answered("lookup", (how) => this.lookUp(id, key, how));
    return this.release(id, key, said);
  };

  private refuse(key: string): Answer {
    this.refusedKeys.add(key);
    return reply(401);
  }

  // Made as the request lands. The answer comes later, or never.
  private create(key: string, body: string | undefined, said: string): Promise<Answer> {
    const sent = JSON.parse(body ?? "{}") as { userMetadata?: Record<string, string> };
    if (!this.accepted.has(key))
      return this.wait("create", (_how, resolve) => (resolve(this.refuse(key)), `${said} → 401, the key is refused`));
    const id = `sess-${++this.count}`;
    this.sessions.set(id, { status: "RUNNING", metadata: { ...sent.userMetadata }, key });
    return this.wait("create", (how, resolve) => {
      if (how === FAILS) return (resolve(reply(500)), `${said} → made ${id}, and the answer was lost`);
      if (how === ODD) return (resolve(reply(201, { id, status: "RUNNING" })), `${said} → made ${id}, with no address to connect to`);
      resolve(reply(201, { id, status: "RUNNING", connectUrl: this.address(id, key) }));
      return `${said} → made ${id}`;
    });
  }

  private address(id: string, key: string): string {
    return `wss://connect/${id}?key=${encodeURIComponent(key)}`;
  }

  private list(key: string, [field, value]: [string, string], said: string): Promise<Answer> {
    return this.wait("list", (how, resolve) => {
      const found = [...this.sessions].filter(([, { metadata }]) => metadata[field] === value);
      if (!this.accepted.has(key)) {
        found.forEach(([id]) => this.refused.add(id));
        return (resolve(this.refuse(key)), `${said} → 401, the key is refused`);
      }
      if (how === FAILS) return (resolve(reply(500)), `${said} → 500`);
      resolve(
        reply(
          200,
          found.map(([id, { status }]) => ({ id, status })),
        ),
      );
      return `${said} → ${found.map(([id, { status }]) => `${id} ${status}`).join(", ") || "none"}`;
    });
  }

  private lookUp(id: string, key: string, how: number): [Answer, string] {
    if (how === FAILS) return [reply(500), "500"];
    const status = this.sessions.get(id)?.status;
    if (!status) return [reply(404), "404"];
    return [reply(200, { id, status, ...(status === "RUNNING" ? { connectUrl: this.address(id, key) } : {}) }), status];
  }

  private release(id: string, key: string, said: string): Promise<Answer> {
    this.releases.push(id);
    return this.wait<Answer>(
      "release",
      (how, resolve) => {
        if (!this.accepted.has(key)) {
          this.refused.add(id);
          return (resolve(this.refuse(key)), `${said} release → 401, the key is refused`);
        }
        if (how === FAILS) return (resolve(reply(500)), `${said} release → 500`);
        const session = this.sessions.get(id);
        if (!session) return (resolve(reply(404)), `${said} release → 404`);
        session.status = "COMPLETED";
        resolve(reply(200, { id, status: "COMPLETED" }));
        return `${said} release → ended`;
      },
      id,
    );
  }

  // Playwright's `connectOverCDP`, to a session's address. The connection is the key's that gave the address.
  readonly connect = (url: string): Promise<unknown> => {
    const { pathname, searchParams } = new URL(url.replace(/^wss:/, "https:"));
    const id = pathname.slice(1);
    return this.wait("connect", (how, resolve, reject) => {
      if (how === FAILS || this.sessions.get(id)?.status !== "RUNNING") {
        reject(new Error("The connection failed."));
        return `connect to ${id} → failed`;
      }
      resolve(this.browser(id, searchParams.get("key") ?? ""));
      return `connect to ${id} → connected`;
    });
  };

  // A Chrome on this computer, started now and running until it's killed, or until starting it fails.
  readonly launchLocal = (): Promise<LocalSession> => {
    const name = `local-${++this.count}`;
    this.local.set(name, true);
    return this.wait("launch", (how, resolve, reject) => {
      if (how === FAILS) {
        this.local.set(name, false);
        reject(new Error("The local browser couldn't be started."));
        return `${name} → didn't start`;
      }
      const browser = this.browser(name, LOCAL) as { close: () => Promise<void> };
      const context = (browser as unknown as { contexts: () => unknown[] }).contexts()[0];
      resolve({
        context,
        liveView: async () => null,
        close: async () => {
          await browser.close();
          this.local.set(name, false);
        },
      });
      return `${name} → started`;
    });
  };

  private browser(id: string, account: string): unknown {
    const dropped: (() => void)[] = [];
    const connection = { id, open: true, drop: () => dropped.forEach((then) => then()) };
    this.connections.push(connection);
    const context = {
      route: async () => {},
      on: () => {},
      browser: () => browser,
      newPage: () =>
        this.wait("newPage", (how, resolve, reject) => {
          if (how === FAILS || !connection.open) {
            reject(new Error("The page didn't open."));
            return `new page in ${id} → failed`;
          }
          resolve({ on: () => {}, close: async () => {}, opener: async () => null });
          return `new page in ${id} → opened`;
        }),
      addCookies: async (cookies: Cookie[]) => {
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

  // `CdpTab.attach`, which can fail too.
  readonly attach = (id: string): Promise<FakeTab> =>
    this.wait("attach", (how, resolve, reject) => {
      if (how === FAILS) {
        reject(new Error("The page couldn't be attached."));
        return `attach ${id} → failed`;
      }
      const tab: FakeTab = {
        id,
        url: "https://example.com/",
        title: "",
        isClosed: false,
        loadURL: async () => {},
        settled: async () => {},
        close: async () => {
          tab.isClosed = true;
        },
        // Stopping the pictures takes an answer, as stopping a screencast does.
        watch: (onFrame) => (onFrame ? Promise.resolve() : this.wait("unwatch", (_how, resolve) => (resolve(), `${id}'s pictures stop`))),
        withNavigationLimit: (_allows, load) => load(),
        fitTo: async () => {},
      };
      resolve(tab);
      return `attach ${id} → attached`;
    });
}
