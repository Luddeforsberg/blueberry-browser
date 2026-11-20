import type { CdpTab } from "../tools/CdpTab";
import { connectOverCdp, KeyRefused, type CloudBrowser, type CloudSession } from "./cloudBrowser";

// Browserbase, from its REST API (docs.browserbase.com/reference/api) and connected to over CDP. One persistent Context
// keeps the profile between sessions, and a session is kept alive between jobs, ended a few minutes after the last one, by the user, or after an hour.
// Written against the docs and tested with a stubbed fetch only: it hasn't run against the real service yet.

const API = "https://api.browserbase.com/v1";
// Closest to the user, in Sweden. One region, so the profile always lives in the same place.
export const BROWSERBASE_REGION = "eu-central-1";
// Seconds. A kept-alive session runs, and costs, until this or until it's released.
const SESSION_TIMEOUT_S = 3600;
// What Browserbase says of a session that has stopped, and costs nothing more.
const ENDED = ["COMPLETED", "ERROR", "TIMED_OUT"];
const NOT_YET = "The last cloud session hasn't said whether it's still running, so no new one was started. Try again in a moment.";

export interface BrowserbaseSaved {
  contextId: string | null;
  sessionId: string | null;
}

export interface BrowserbaseOptions {
  apiKey: string;
  projectId: string;
  saved: BrowserbaseSaved;
  // Told about a new context or session, to keep for next time.
  onSaved: (saved: BrowserbaseSaved) => void;
  fetch?: typeof fetch;
  connect?: typeof connectOverCdp;
}

interface Session {
  id: string;
  status: string;
  connectUrl?: string;
}

interface LiveUrls {
  debuggerFullscreenUrl?: string;
  pages?: { id: string; url: string; debuggerFullscreenUrl?: string }[];
}

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

export const browserbase = ({
  apiKey,
  projectId,
  saved,
  onSaved,
  fetch: send = fetch,
  connect = connectOverCdp,
}: BrowserbaseOptions): CloudBrowser => {
  const call = async <T>(method: "GET" | "POST", path: string, body?: object): Promise<T> => {
    const response = await send(`${API}${path}`, {
      method,
      headers: { "X-BB-API-Key": apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401 || response.status === 403)
      throw new KeyRefused("Browserbase refused the API key. Check it in Settings > Cloud.");
    if (!response.ok) throw new BrowserbaseError(response.status);
    return (await response.json()) as T;
  };

  // Null only when Browserbase says there's no such session. A lookup that fails, or answers with no status, says nothing
  // about it, so it throws.
  const lookUp = async (id: string): Promise<Session | null> => {
    let known: Partial<Session> | null;
    try {
      known = await call<Partial<Session> | null>("GET", `/sessions/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof BrowserbaseError && error.status === 404) return null;
      throw error;
    }
    if (typeof known?.status !== "string") throw new Error("Browserbase didn't say how the session is.");
    return { id, status: known.status, ...(typeof known.connectUrl === "string" ? { connectUrl: known.connectUrl } : {}) };
  };

  const context = async (): Promise<string> => {
    if (saved.contextId) return saved.contextId;
    const { id } = await call<{ id: string }>("POST", "/contexts", { projectId });
    saved = { ...saved, contextId: id };
    onSaved(saved);
    return id;
  };

  // The kept-alive session from last time if it's still running, or a new one. Its id is the only way to release it, so
  // it's replaced only once Browserbase says it has ended, never on a lookup that failed.
  const session = async (): Promise<Session & { connectUrl: string }> => {
    if (saved.sessionId) {
      const known = await lookUp(saved.sessionId);
      if (known?.status === "RUNNING" && known.connectUrl) return { ...known, connectUrl: known.connectUrl };
      if (known && !ENDED.includes(known.status)) throw new Error(NOT_YET);
    }
    const contextId = await context();
    const made = await call<Session>("POST", "/sessions", {
      projectId,
      keepAlive: true,
      region: BROWSERBASE_REGION,
      timeout: SESSION_TIMEOUT_S,
      browserSettings: { context: { id: contextId, persist: true } },
    });
    if (typeof made.id !== "string" || !made.id) throw new Error("Browserbase didn't say which session it made.");
    // Kept before anything else about it is checked, so it can be released whatever comes next.
    saved = { ...saved, sessionId: made.id };
    onSaved(saved);
    if (!made.connectUrl) throw new Error("Browserbase didn't say how to connect to the session.");
    return { ...made, connectUrl: made.connectUrl };
  };

  return {
    name: "browserbase",
    get hasSession() {
      return saved.sessionId !== null;
    },
    // Needs only the saved id, so a session whose connection was lost, or never made, still ends and stops costing.
    release: async () => {
      const id = saved.sessionId;
      if (!id) return;
      try {
        await call("POST", `/sessions/${encodeURIComponent(id)}`, { status: "REQUEST_RELEASE" });
      } catch (error) {
        // One that has already ended, or isn't there at all, can't be released, and doesn't need to be.
        const known = await lookUp(id).catch(() => undefined);
        if (known === undefined || (known && !ENDED.includes(known.status))) throw error;
      }
      saved = { ...saved, sessionId: null };
      onSaved(saved);
    },
    start: async (): Promise<CloudSession> => {
      const { id, connectUrl } = await session();
      const browser = await connect(connectUrl);
      const context = browser.contexts()[0] ?? (await browser.newContext());
      return {
        context,
        liveView: async (page: CdpTab) => {
          const live = await call<LiveUrls>("GET", `/sessions/${encodeURIComponent(id)}/debug`);
          // Each tab has its own live view. Matched by target, then by address, then the session's own.
          const match = live.pages?.find((one) => one.id === page.targetId) ?? live.pages?.find((one) => one.url === page.url);
          const url = match?.debuggerFullscreenUrl ?? live.debuggerFullscreenUrl;
          return url ? withoutNavbar(url) : null;
        },
        close: async () => {
          await browser.close().catch(() => {});
        },
      };
    },
  };
};
