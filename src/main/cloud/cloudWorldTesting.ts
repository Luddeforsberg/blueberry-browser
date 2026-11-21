// A fake Browserbase for the cloud's model checker, with the browsers and pages behind it in cloudWorldBrowsers.ts. A
// create lands on its own, apart from its answer: the session is made, and costs, when it lands, which can come after
// its answer timed out and even after the app that sent it has gone, but within `LANDING_MS` of being sent or never.
// Each key belongs to a project and sees only that project's sessions, and each session ends on its own at the timeout
// it was asked with, which its answer says as `expiresAt`.
import { FAILS, ODD, ownerOf, WorldBrowsers } from "./cloudWorldBrowsers";

export { FAILS, LOCAL, WORKS, type LocalSession } from "./cloudWorldBrowsers";

const API = "https://api.browserbase.com/v1";
// How late a create can land, as browserbase.ts assumes: the one thing here not from Browserbase's docs.
const LANDING_MS = 10 * 60_000;

// The parts of a fetch `Response` browserbase.ts reads.
interface Answer {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
}

interface Session {
  ended: boolean;
  // Browserbase's own deadline, counted from when the create landed.
  until: number;
  // What it was made with: its `userMetadata`, the key that asked for it and that key's project.
  metadata: Record<string, string>;
  key: string;
  project: string;
}

const reply = (status: number, body: unknown = {}): Answer => ({ status, ok: status < 300, json: async () => body });

// What a listing by metadata asks for, as `byMetadata` in browserbase.ts writes it.
const asked = (path: string): [string, string] | null => {
  const query = /^\/sessions\?q=(.*)$/.exec(path)?.[1];
  const match = query ? /^user_metadata\['([^']+)'\]:'([^']*)'$/.exec(decodeURIComponent(query)) : null;
  return match ? [match[1] ?? "", match[2] ?? ""] : null;
};

const isApp = ({ key }: Session) => ownerOf(key) === "app";

export class CloudWorld extends WorldBrowsers {
  readonly sessions = new Map<string, Session>();
  // Keys Browserbase takes now, and the project of every key it ever took.
  readonly accepted = new Set<string>();
  private readonly projects = new Map<string, string>();
  // Each Context made, and its project.
  readonly contexts = new Map<string, string>();
  // Sessions a release was refused for, because Browserbase no longer took the key it came with, and keys it refused.
  readonly refused = new Set<string>();
  private readonly refusedKeys = new Set<string>();
  // Every release asked for, by session id, in order.
  readonly releases: string[] = [];
  // Told of every release that lands, with the key that asked, before it ends the session.
  onRelease: (session: Session, key: string) => void = () => {};

  constructor(key: string, project = "proj") {
    super();
    this.accept(key, project);
  }

  accept(key: string, project: string): void {
    this.accepted.add(key);
    this.projects.set(key, project);
  }

  projectOfKey(key: string): string | undefined {
    return this.projects.get(key);
  }

  status(id: string): "RUNNING" | "COMPLETED" | "TIMED_OUT" | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (session.ended) return "COMPLETED";
    return Date.now() >= session.until ? "TIMED_OUT" : "RUNNING";
  }

  protected isRunning(id: string): boolean {
    return this.status(id) === "RUNNING";
  }

  // The app's sessions that still run and cost, that it could still end. One it was refused a release for, or one made
  // with a key it has since been refused for, may be another account's, and ends on its own.
  get running(): string[] {
    const endable = ([id, session]: [string, Session]) =>
      this.isRunning(id) && isApp(session) && !this.refused.has(id) && !this.refusedKeys.has(session.key);
    return [...[...this.sessions].filter(endable).map(([id]) => id), ...this.localRunning];
  }

  // The app's sessions that still run at all, even those it can't end now.
  get appRunning(): string[] {
    return [...this.sessions].filter(([id, session]) => this.isRunning(id) && isApp(session)).map(([id]) => id);
  }

  get anyRunning(): boolean {
    return this.appRunning.length > 0 || this.localRunning.length > 0;
  }

  // The runners' sessions that still run, with the key that made each.
  get runnerRunning(): [string, string][] {
    return [...this.sessions].filter(([id, session]) => this.isRunning(id) && !isApp(session)).map(([id, { key }]) => [id, key]);
  }

  // The tag a session was made with, if any, and its project.
  tagOf(id: string): string | undefined {
    return this.sessions.get(id)?.metadata.blueberry;
  }

  projectOf(id: string): string | undefined {
    return this.sessions.get(id)?.project;
  }

  // Before the clock moves on by `ms`: every create on its way that would by then be more than `LANDING_MS` old lands,
  // or never does, as `how` says. Any other stays on its way.
  landBefore(ms: number, how: number): string[] {
    const due = this.pending.filter(({ kind, sent }) => kind === "land" && sent !== undefined && sent + LANDING_MS <= Date.now() + ms);
    return due.map((one) => this.answer(this.pending.indexOf(one), how));
  }

  isApp(id: string): boolean {
    const session = this.sessions.get(id);
    return !!session && isApp(session);
  }

  readonly fetch = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Answer> => {
    const method = init.method ?? "GET";
    const path = url.replace(API, "");
    const key = init.headers?.["X-BB-API-Key"] ?? "";
    const said = `${method} ${path.replace(/\?q=.*$/, "?q=…")}`;
    const answered = (kind: "context" | "lookup", answer: (how: number) => [Answer, string]) =>
      this.wait<Answer>(kind, ownerOf(key), (how, resolve) => {
        const [response, words] = this.accepted.has(key) ? answer(how) : [this.refuse(key), "401, the key is refused"];
        resolve(response);
        return `${said} → ${words}`;
      });
    if (method === "POST" && path === "/contexts")
      return answered("context", (how) => {
        if (how === FAILS) return [reply(500), "500"];
        const id = `ctx-${++this.count}`;
        this.contexts.set(id, this.projects.get(key) ?? "");
        return [reply(201, { id }), `made ${id}`];
      });
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

  // Whether the session is one a key from this project can see.
  private sees(key: string, id: string): boolean {
    const project = this.projects.get(key);
    return project !== undefined && this.sessions.get(id)?.project === project;
  }

  // Made when the request lands, which may be never. The answer comes on its own: one before the landing timed out.
  private create(key: string, body: string | undefined, said: string): Promise<Answer> {
    const sent = JSON.parse(body ?? "{}") as { userMetadata?: Record<string, string>; timeout?: number };
    const owner = ownerOf(key);
    const project = this.projects.get(key);
    if (!this.accepted.has(key) || project === undefined)
      return this.wait("create", owner, (_how, resolve) => (resolve(this.refuse(key)), `${said} → 401, the key is refused`));
    let id: string | null = null;
    this.push(
      "land",
      owner,
      (how) => {
        if (how === FAILS) return `${said} never reaches Browserbase`;
        id = `sess-${++this.count}`;
        const until = Date.now() + (sent.timeout ?? 300) * 1000;
        this.sessions.set(id, { ended: false, until, metadata: { ...sent.userMetadata }, key, project });
        return `${said} lands, making ${id}`;
      },
      { sent: Date.now() },
    );
    return this.wait("create", owner, (how, resolve, reject) => {
      if (id === null) {
        reject(new Error("The operation timed out."));
        return `${said} → timed out, with nothing made yet`;
      }
      if (how === FAILS) return (resolve(reply(500)), `${said} → the answer for ${id} was lost`);
      const expiresAt = new Date(this.sessions.get(id)?.until ?? 0).toISOString();
      if (how === ODD) return (resolve(reply(201, { id, status: "RUNNING", expiresAt })), `${said} → ${id}, with no address to connect to`);
      resolve(reply(201, { id, status: "RUNNING", expiresAt, connectUrl: this.address(id, key) }));
      return `${said} → ${id}`;
    });
  }

  private address(id: string, key: string): string {
    return `wss://connect/${id}?key=${encodeURIComponent(key)}`;
  }

  private list(key: string, [field, value]: [string, string], said: string): Promise<Answer> {
    return this.wait("list", ownerOf(key), (how, resolve) => {
      const found = [...this.sessions].filter(([id, { metadata }]) => metadata[field] === value && this.sees(key, id));
      if (!this.accepted.has(key)) {
        found.forEach(([id]) => this.refused.add(id));
        return (resolve(this.refuse(key)), `${said} → 401, the key is refused`);
      }
      if (how === FAILS) return (resolve(reply(500)), `${said} → 500`);
      const listed = found.map(([id, { project, metadata }]) => ({
        id,
        status: this.status(id),
        projectId: project,
        userMetadata: metadata,
      }));
      resolve(reply(200, listed));
      return `${said} → ${listed.map(({ id, status }) => `${id} ${status}`).join(", ") || "none"}`;
    });
  }

  private lookUp(id: string, key: string, how: number): [Answer, string] {
    if (how === FAILS) return [reply(500), "500"];
    const status = this.sees(key, id) ? this.status(id) : undefined;
    if (!status) return [reply(404), "404"];
    return [reply(200, { id, status, ...(status === "RUNNING" ? { connectUrl: this.address(id, key) } : {}) }), status];
  }

  private release(id: string, key: string, said: string): Promise<Answer> {
    this.releases.push(id);
    return this.wait<Answer>(
      "release",
      ownerOf(key),
      (how, resolve) => {
        if (!this.accepted.has(key)) {
          this.refused.add(id);
          return (resolve(this.refuse(key)), `${said} release → 401, the key is refused`);
        }
        if (how === FAILS) return (resolve(reply(500)), `${said} release → 500`);
        const session = this.sessions.get(id);
        if (!session || !this.sees(key, id)) return (resolve(reply(404)), `${said} release → 404`);
        this.onRelease(session, key);
        session.ended = true;
        resolve(reply(200, { id, status: "COMPLETED" }));
        return `${said} release → ended`;
      },
      id,
    );
  }
}
