import type { CdpTab } from "../tools/CdpTab";
import { fieldsOf } from "../../shared/fields";
import { connectOverCdp, KeyRefused, NOT_WANTED, stoppable, type CloudBrowser, type CreateHooks, type MadeSession } from "./cloudProvider";

// Browserbase, from its REST API (docs.browserbase.com/reference/api) and connected to over CDP. One persistent Context
// keeps the profile between sessions, and a session is kept alive between jobs, ended a few minutes after the last one, by the user, or after an hour.
// Written against the docs and tested with a stubbed fetch only: it hasn't run against the real service yet.

const API = "https://api.browserbase.com/v1";
// Closest to the user, in Sweden. One region, so the profile always lives in the same place.
export const BROWSERBASE_REGION = "eu-central-1";
// Seconds. A kept-alive session runs, and costs, until this or until it's released. Sent with every create, so each has a
// deadline the app knows.
const SESSION_TIMEOUT_S = 3600;
// The longest `timeout` Browserbase takes, six hours, which even a kept-alive session ends at. Nobody knows how late a
// create whose answer never came may land, so its deadline is this from when it was sent, the most any could have been
// given. One that answered says its own.
const LONGEST_MS = 21_600 * 1000;
// Added to Browserbase's deadline, in case this computer's clock is behind its own.
const CLOCK_MS = 5 * 60_000;
const deadlineOf = (expiresAt: unknown): number | undefined => {
  const expires = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(expires) ? expires + CLOCK_MS : undefined;
};
// What Browserbase says of a session that has stopped, and costs nothing more.
const ENDED = ["COMPLETED", "ERROR", "TIMED_OUT"];
const NOT_YET = "The last cloud session hasn't said whether it's still running, so no new one was started. Try again in a moment.";
// An answer that never comes would hold up everything behind it, so none is waited on longer than this.
const REQUEST_MS = 30_000;

export interface BrowserbaseOptions {
  apiKey: string;
  projectId: string;
  // Go out with every session made: the runner's mark, so all of them can be found again by it, and the job each is for,
  // so only those whose job is over are ended.
  mark?: string;
  job?: string;
  fetch?: typeof fetch;
  connect?: typeof connectOverCdp;
}

interface Session {
  id: string;
  status: string;
  connectUrl?: string;
}

export type Browserbase = CloudBrowser & {
  // Ends every session with this browser's mark whose job `live` doesn't name, and leaves one without a job alone, as it
  // ends on its own. Rejects unless every one it asked to end has.
  releaseMarked(live: (jobs: string[]) => Promise<Set<string>>): Promise<void>;
};

// Which sessions a key for that project can end.
export const browserbaseOrigin = (projectId: string): string => `browserbase:${projectId}`;

// Whether an address is Browserbase's own page, the only kind a live view may show in a frame.
export const isLiveView = (url: string): boolean => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "browserbase.com" || hostname.endsWith(".browserbase.com"));
  } catch {
    return false;
  }
};

class BrowserbaseError extends Error {
  constructor(readonly status: number) {
    super(`Browserbase answered ${status}.`);
  }
}

// The navbar is Browserbase's, and the tab in Blueberry already says where it is.
const withoutNavbar = (url: string) => `${url}${url.includes("?") ? "&" : "?"}navbar=false`;

// Sessions by their metadata, as docs.browserbase.com/features/sessions says under Metadata.
const byMetadata = (field: string, value: string) => `/sessions?q=${encodeURIComponent(`user_metadata['${field}']:'${value}'`)}`;

// Keeps nothing itself: the ids are `CloudSessions`', told about each the moment Browserbase gives it.
export const browserbase = ({
  apiKey,
  projectId,
  mark,
  job,
  fetch: send = fetch,
  connect = connectOverCdp,
}: BrowserbaseOptions): Browserbase => {
  // What Browserbase answered, to be checked where it's used.
  const call = async (method: "GET" | "POST", path: string, body?: object): Promise<unknown> => {
    const response = await send(`${API}${path}`, {
      method,
      headers: { "X-BB-API-Key": apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_MS),
    });
    if (response.status === 401 || response.status === 403)
      throw new KeyRefused("Browserbase refused the API key. Check it in Settings > Cloud.");
    if (!response.ok) throw new BrowserbaseError(response.status);
    return response.json();
  };

  // Null only when Browserbase says there's no such session. A lookup that fails, or answers with no status, says nothing
  // about it, so it throws.
  const lookUp = async (id: string): Promise<Session | null> => {
    let known: Record<string, unknown>;
    try {
      known = fieldsOf(await call("GET", `/sessions/${encodeURIComponent(id)}`));
    } catch (error) {
      if (error instanceof BrowserbaseError && error.status === 404) return null;
      throw error;
    }
    if (typeof known.status !== "string") throw new Error("Browserbase didn't say how the session is.");
    return { id, status: known.status, ...(typeof known.connectUrl === "string" ? { connectUrl: known.connectUrl } : {}) };
  };

  // A Context for a key that has none yet, kept only for what still wants it. A key saved meanwhile may be another account's.
  const newContext = async (hooks: CreateHooks): Promise<string> => {
    if (!hooks.wanted()) throw new Error(NOT_WANTED);
    const { id } = fieldsOf(await call("POST", "/contexts", { projectId }));
    if (typeof id !== "string" || !id) throw new Error("Browserbase didn't say which Context it made.");
    if (!hooks.wanted()) throw new Error(NOT_WANTED);
    hooks.context(id);
    return id;
  };

  // The kept-alive session from last time if it's still running, or a new one. Its id is the only way to release it, so
  // it's replaced only once Browserbase says it has ended, never on a lookup that failed. A new one goes out with a tag
  // that's already kept, so it can be found and ended even if its answer never comes.
  const session = async (ids: Parameters<CloudBrowser["create"]>[0], hooks: CreateHooks): Promise<{ id: string; connectUrl: string }> => {
    if (ids.sessionId) {
      const known = await lookUp(ids.sessionId);
      if (known?.status === "RUNNING" && known.connectUrl) return { ...known, connectUrl: known.connectUrl };
      if (known && !ENDED.includes(known.status)) throw new Error(NOT_YET);
    }
    const contextId = ids.contextId || (await newContext(hooks));
    if (!hooks.wanted()) throw new Error(NOT_WANTED);
    const tag = hooks.tag(Date.now() + LONGEST_MS + CLOCK_MS);
    let made: Record<string, unknown>;
    try {
      made = fieldsOf(
        await call("POST", "/sessions", {
          projectId,
          keepAlive: true,
          region: BROWSERBASE_REGION,
          timeout: SESSION_TIMEOUT_S,
          browserSettings: { context: { id: contextId, persist: true } },
          userMetadata: { blueberry: tag, ...(mark ? { blueberryMark: mark } : {}), ...(job ? { blueberryJob: job } : {}) },
        }),
      );
    } catch (error) {
      // An answer that refuses the ask means nothing was made. Any other failure may come after the session was.
      if (error instanceof KeyRefused || (error instanceof BrowserbaseError && error.status < 500)) hooks.unused(tag);
      throw error;
    }
    const { id, connectUrl, expiresAt } = made;
    if (typeof id !== "string" || !id) throw new Error("Browserbase didn't say which session it made.");
    // Kept before anything else about it is checked, so it can be released whatever comes next.
    hooks.made(tag, id, deadlineOf(expiresAt));
    if (typeof connectUrl !== "string" || !connectUrl) throw new Error("Browserbase didn't say how to connect to the session.");
    return { id, connectUrl };
  };

  // Needs only the id, so a session whose connection was lost, or never made, still ends and stops costing.
  const release = async (id: string): Promise<void> => {
    try {
      await call("POST", `/sessions/${encodeURIComponent(id)}`, { status: "REQUEST_RELEASE" });
    } catch (error) {
      // One that has already ended, or isn't there at all, can't be released, and doesn't need to be.
      const known = await lookUp(id).catch(() => undefined);
      if (known === undefined || (known && !ENDED.includes(known.status))) throw error;
    }
  };

  // The sessions of this project Browserbase lists for that metadata.
  const listed = async (field: string, value: string): Promise<{ id: string; running: boolean; job: string | null }[]> => {
    const found = await call("GET", byMetadata(field, value));
    if (!Array.isArray(found)) throw new Error("Browserbase didn't list the sessions.");
    return found.flatMap((one) => {
      const { id, status, projectId: project, userMetadata } = fieldsOf(one);
      if (typeof id !== "string" || (project !== undefined && project !== projectId)) return [];
      const job = fieldsOf(userMetadata).blueberryJob;
      return [{ id, running: !ENDED.includes(String(status)), job: typeof job === "string" ? job : null }];
    });
  };

  // Rejects unless every one of them was confirmed.
  const releaseAll = async (ids: string[]): Promise<void> => {
    const failed = (await Promise.allSettled(ids.map(release))).find((one) => one.status === "rejected");
    if (failed) throw failed.reason;
  };

  return {
    name: "browserbase",
    origin: browserbaseOrigin(projectId),
    release,
    releaseTagged: async (tag) => {
      const sessions = await listed("blueberry", tag);
      await releaseAll(sessions.filter(({ running }) => running).map(({ id }) => id));
      return sessions.length ? "ended" : "none";
    },
    releaseMarked: async (live) => {
      if (!mark) return;
      const running = (await listed("blueberryMark", mark)).filter((one) => one.running && one.job !== null);
      if (!running.length) return;
      const going = await live([...new Set(running.map(({ job }) => job as string))]);
      await releaseAll(running.filter(({ job }) => !going.has(job as string)).map(({ id }) => id));
    },
    create: async (ids, hooks): Promise<MadeSession> => {
      const { id, connectUrl } = await session(ids, hooks);
      return {
        id,
        // A connection that comes back after its life ended is closed by `CloudLife`, and the session released by its id.
        connect: async (stop) => {
          const opening = connect(connectUrl).then(async (browser) => {
            try {
              return { browser, context: browser.contexts()[0] ?? (await browser.newContext()) };
            } catch (error) {
              void browser.close().catch(() => {});
              throw error;
            }
          });
          const { browser, context } = await stoppable(opening, stop, (late) => void late.browser.close().catch(() => {}));
          return {
            context,
            liveView: async (page: CdpTab) => {
              const live = fieldsOf(await call("GET", `/sessions/${encodeURIComponent(id)}/debug`));
              const pages = Array.isArray(live.pages) ? live.pages.map(fieldsOf) : [];
              // Each tab has its own live view. Matched by target, then by address, then the session's own.
              const match = pages.find((one) => one.id === page.targetId) ?? pages.find((one) => one.url === page.url);
              const url = typeof match?.debuggerFullscreenUrl === "string" ? match.debuggerFullscreenUrl : live.debuggerFullscreenUrl;
              return typeof url === "string" && url ? withoutNavbar(url) : null;
            },
            // Released by its id, so nothing waits for the connection to close.
            close: async () => {
              void browser.close().catch(() => {});
            },
          };
        },
      };
    },
  };
};
