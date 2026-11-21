// A fake Browserbase, and the browsers and pages behind it, for the cloud's model checker. Every answer waits until the
// checker gives it, in any order, so it can try the orders a real network gives. An answer says how it went: 0 fails
// it, 1 is the odd answer where there is one (a session made with no address to connect to), and anything else works.

const API = "https://api.browserbase.com/v1";

export type Kind = "context" | "create" | "lookup" | "release" | "connect" | "newPage" | "attach" | "unwatch";

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

const FAILS = 0;
const ODD = 1;
export const WORKS = 2;

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

export class CloudWorld {
  readonly pending: Pending[] = [];
  readonly sessions = new Map<string, "RUNNING" | "COMPLETED">();
  readonly accepted = new Set<string>();
  // Sessions a release was refused for, because Browserbase no longer took the key it came with.
  readonly refused = new Set<string>();
  // Every release asked for, by session id, in order.
  readonly releases: string[] = [];
  private readonly connections: { id: string; drop: () => void; open: boolean }[] = [];
  private count = 0;

  constructor(key: string) {
    this.accepted.add(key);
  }

  // Sessions with a release asked for and not yet answered.
  get releasing(): string[] {
    return this.pending.flatMap(({ id }) => (id ? [id] : []));
  }

  get running(): string[] {
    return [...this.sessions].filter(([id, status]) => status === "RUNNING" && !this.refused.has(id)).map(([id]) => id);
  }

  // Answers the one at `index`, as `how` says.
  answer(index: number, how: number): string {
    const [next] = this.pending.splice(index % this.pending.length, 1);
    return next ? next.answer(how) : "nothing to answer";
  }

  // A connection to a running session drops, as when the network goes.
  drop(index: number): string {
    const open = this.connections.filter((one) => one.open);
    const one = open[index % Math.max(open.length, 1)];
    if (!one) return "no connection to drop";
    one.open = false;
    one.drop();
    return `the connection to ${one.id} dropped`;
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
    const reply = (status: number, body: unknown = {}): Answer => ({ status, ok: status < 300, json: async () => body });
    const said = `${method} ${path}`;
    const answered = (kind: Kind, answer: (how: number) => [Answer, string]) =>
      this.wait<Answer>(kind, (how, resolve) => {
        const [response, words] = this.accepted.has(key) ? answer(how) : [reply(401), "401, the key is refused"];
        resolve(response);
        return `${said} → ${words}`;
      });
    if (method === "POST" && path === "/contexts")
      return answered("context", (how) => (how === FAILS ? [reply(500), "500"] : [reply(201, { id: `ctx-${++this.count}` }), "made"]));
    if (method === "POST" && path === "/sessions") return answered("create", (how) => this.create(how, reply));
    const id = /^\/sessions\/([^/]+)$/.exec(path)?.[1];
    if (!id) return Promise.resolve(reply(404));
    if (method === "GET") return answered("lookup", (how) => this.lookUp(id, how, reply));
    this.releases.push(id);
    return this.wait<Answer>(
      "release",
      (how, resolve) => {
        if (!this.accepted.has(key)) {
          this.refused.add(id);
          resolve(reply(401));
          return `${said} release → 401, the key is refused`;
        }
        if (how === FAILS) {
          resolve(reply(500));
          return `${said} release → 500`;
        }
        if (!this.sessions.has(id)) {
          resolve(reply(404));
          return `${said} release → 404`;
        }
        this.sessions.set(id, "COMPLETED");
        resolve(reply(200, { id, status: "COMPLETED" }));
        return `${said} release → ended`;
      },
      id,
    );
  };

  private create(how: number, reply: (status: number, body?: unknown) => Answer): [Answer, string] {
    if (how === FAILS) return [reply(500), "500"];
    const id = `sess-${++this.count}`;
    this.sessions.set(id, "RUNNING");
    if (how === ODD) return [reply(201, { id, status: "RUNNING" }), `made ${id}, with no address to connect to`];
    return [reply(201, { id, status: "RUNNING", connectUrl: `wss://connect/${id}` }), `made ${id}`];
  }

  private lookUp(id: string, how: number, reply: (status: number, body?: unknown) => Answer): [Answer, string] {
    if (how === FAILS) return [reply(500), "500"];
    const status = this.sessions.get(id);
    if (!status) return [reply(404), "404"];
    return [reply(200, { id, status, ...(status === "RUNNING" ? { connectUrl: `wss://connect/${id}` } : {}) }), status];
  }

  // Playwright's `connectOverCDP`, to a session's address.
  readonly connect = (url: string): Promise<unknown> => {
    const id = url.split("/").pop() ?? "";
    return this.wait("connect", (how, resolve, reject) => {
      if (how === FAILS || this.sessions.get(id) !== "RUNNING") {
        reject(new Error("The connection failed."));
        return `connect to ${id} → failed`;
      }
      resolve(this.browser(id));
      return `connect to ${id} → connected`;
    });
  };

  private browser(id: string): unknown {
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
      addCookies: async () => {},
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
