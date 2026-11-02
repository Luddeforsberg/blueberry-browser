import type { CdpTab } from "./CdpTab";
import { connectOverCdp, type CloudBrowser, type CloudSession } from "./cloudBrowser";

// Browserbase, from its REST API (docs.browserbase.com/reference/api) and connected to over CDP. One persistent Context
// keeps the profile between sessions, and a session is kept alive between jobs, ended by the user or after an hour.
// Written against the docs and tested with a stubbed fetch only: it hasn't run against the real service yet.

const API = "https://api.browserbase.com/v1";
// Closest to the user, in Sweden. One region, so the profile always lives in the same place.
export const BROWSERBASE_REGION = "eu-central-1";
// Seconds. A kept-alive session runs, and costs, until this or until it's released.
const SESSION_TIMEOUT_S = 3600;

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

// The navbar is Browserbase's, and the tab in Blueberry already says where it is.
const withoutNavbar = (url: string) => `${url}${url.includes("?") ? "&" : "?"}navbar=false`;

export const browserbase = ({ apiKey, projectId, saved, onSaved, fetch: send = fetch, connect = connectOverCdp }: BrowserbaseOptions): CloudBrowser => {
  const call = async <T>(method: "GET" | "POST", path: string, body?: object): Promise<T> => {
    const response = await send(`${API}${path}`, {
      method,
      headers: { "X-BB-API-Key": apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401 || response.status === 403) throw new Error("Browserbase refused the API key. Check it in Settings > Cloud.");
    if (!response.ok) throw new Error(`Browserbase answered ${response.status}.`);
    return (await response.json()) as T;
  };

  const context = async (): Promise<string> => {
    if (saved.contextId) return saved.contextId;
    const { id } = await call<{ id: string }>("POST", "/contexts", { projectId });
    saved = { ...saved, contextId: id };
    onSaved(saved);
    return id;
  };

  // The kept-alive session from last time if it's still running, or a new one.
  const session = async (): Promise<Session & { connectUrl: string }> => {
    if (saved.sessionId) {
      const known = await call<Session>("GET", `/sessions/${encodeURIComponent(saved.sessionId)}`).catch(() => null);
      if (known?.status === "RUNNING" && known.connectUrl) return { ...known, connectUrl: known.connectUrl };
    }
    const contextId = await context();
    const made = await call<Session>("POST", "/sessions", {
      projectId,
      keepAlive: true,
      region: BROWSERBASE_REGION,
      timeout: SESSION_TIMEOUT_S,
      browserSettings: { context: { id: contextId, persist: true } },
    });
    if (!made.connectUrl) throw new Error("Browserbase didn't say how to connect to the session.");
    saved = { ...saved, sessionId: made.id };
    onSaved(saved);
    return { ...made, connectUrl: made.connectUrl };
  };

  return {
    name: "browserbase",
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
        end: async () => {
          await browser.close().catch(() => {});
          await call("POST", `/sessions/${encodeURIComponent(id)}`, { status: "REQUEST_RELEASE" });
          saved = { ...saved, sessionId: null };
          onSaved(saved);
        },
      };
    },
  };
};
