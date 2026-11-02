import { describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import { browserbase, BROWSERBASE_REGION, type BrowserbaseSaved } from "./browserbase";
import type { CdpTab } from "./CdpTab";

// Against a stubbed fetch, shaped from Browserbase's API reference. Nothing here has talked to the real service.

interface Call {
  method: string;
  url: string;
  key: string | null;
  body: Record<string, unknown> | null;
}

const stub = (answers: Record<string, { status?: number; body: unknown }>) => {
  const calls: Call[] = [];
  const send = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    calls.push({ method, url, key: new Headers(init.headers).get("X-BB-API-Key"), body: init.body ? JSON.parse(String(init.body)) : null });
    const answer = answers[`${method} ${url.replace("https://api.browserbase.com/v1", "")}`];
    if (!answer) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as typeof fetch;
  return { calls, send };
};

const fakeBrowser = () => {
  let closed = false;
  const browser = { contexts: () => [{ name: "context" }], close: async () => void (closed = true) } as unknown as Browser;
  return { browser, closed: () => closed };
};

describe("Browserbase", () => {
  it("makes a context and a kept-alive session in one region, connects, and keeps both for next time", async () => {
    const { calls, send } = stub({
      "POST /contexts": { status: 201, body: { id: "ctx-1" } },
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://connect.browserbase.com?signingKey=x" } },
    });
    const kept: BrowserbaseSaved[] = [];
    const connected: string[] = [];
    const { browser } = fakeBrowser();
    const provider = browserbase({
      apiKey: "bb_test",
      projectId: "proj",
      saved: { contextId: null, sessionId: null },
      onSaved: (saved) => kept.push(saved),
      fetch: send,
      connect: async (url) => {
        connected.push(url);
        return browser;
      },
    });
    const session = await provider.start();
    expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual(["POST https://api.browserbase.com/v1/contexts", "POST https://api.browserbase.com/v1/sessions"]);
    expect(calls.every(({ key }) => key === "bb_test")).toBe(true);
    expect(calls[1].body).toMatchObject({ projectId: "proj", keepAlive: true, region: BROWSERBASE_REGION, browserSettings: { context: { id: "ctx-1", persist: true } } });
    expect(connected).toEqual(["wss://connect.browserbase.com?signingKey=x"]);
    expect(kept.at(-1)).toEqual({ contextId: "ctx-1", sessionId: "sess-1" });
    expect(session.context).toEqual({ name: "context" });
  });

  it("reuses a session that's still running, and makes a new one in the same context if not", async () => {
    const running = stub({ "GET /sessions/sess-1": { body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://one" } } });
    const connected: string[] = [];
    const connect = async (url: string) => {
      connected.push(url);
      return fakeBrowser().browser;
    };
    await browserbase({ apiKey: "k", projectId: "p", saved: { contextId: "ctx-1", sessionId: "sess-1" }, onSaved: () => {}, fetch: running.send, connect }).start();
    expect(running.calls).toHaveLength(1);
    expect(connected).toEqual(["wss://one"]);

    const gone = stub({
      "GET /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
      "POST /sessions": { status: 201, body: { id: "sess-2", status: "RUNNING", connectUrl: "wss://two" } },
    });
    await browserbase({ apiKey: "k", projectId: "p", saved: { contextId: "ctx-1", sessionId: "sess-1" }, onSaved: () => {}, fetch: gone.send, connect }).start();
    expect(gone.calls.map(({ method, url }) => `${method} ${url}`)).toEqual(["GET https://api.browserbase.com/v1/sessions/sess-1", "POST https://api.browserbase.com/v1/sessions"]);
    expect(gone.calls[1].body).toMatchObject({ browserSettings: { context: { id: "ctx-1" } } });
  });

  it("finds the live view for a page, without Browserbase's navbar", async () => {
    const { send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x" } },
      "GET /sessions/sess-1/debug": {
        body: {
          debuggerFullscreenUrl: "https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=all",
          pages: [
            { id: "OTHER", url: "https://a.test/", debuggerFullscreenUrl: "https://live/other?wss=a" },
            { id: "TARGET", url: "https://b.test/", debuggerFullscreenUrl: "https://live/mine?wss=b" },
          ],
        },
      },
    });
    const session = await browserbase({ apiKey: "k", projectId: "p", saved: { contextId: "ctx", sessionId: null }, onSaved: () => {}, fetch: send, connect: async () => fakeBrowser().browser }).start();
    expect(await session.liveView({ targetId: "TARGET", url: "https://b.test/" } as CdpTab)).toBe("https://live/mine?wss=b&navbar=false");
    expect(await session.liveView({ targetId: "NEW", url: "https://c.test/" } as CdpTab)).toBe("https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=all&navbar=false");
  });

  it("releases the session when it ends, so it stops costing", async () => {
    const { calls, send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x" } },
      "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
    });
    const fake = fakeBrowser();
    const kept: BrowserbaseSaved[] = [];
    const session = await browserbase({ apiKey: "k", projectId: "p", saved: { contextId: "ctx", sessionId: null }, onSaved: (saved) => kept.push(saved), fetch: send, connect: async () => fake.browser }).start();
    await session.end();
    expect(fake.closed()).toBe(true);
    expect(calls.at(-1)).toMatchObject({ method: "POST", url: "https://api.browserbase.com/v1/sessions/sess-1", body: { status: "REQUEST_RELEASE" } });
    expect(kept.at(-1)).toEqual({ contextId: "ctx", sessionId: null });
  });

  it("says plainly when the key is refused", async () => {
    const { send } = stub({ "POST /sessions": { status: 401, body: {} } });
    const start = browserbase({ apiKey: "bad", projectId: "p", saved: { contextId: "ctx", sessionId: null }, onSaved: () => {}, fetch: send, connect: async () => fakeBrowser().browser }).start();
    await expect(start).rejects.toThrow("Browserbase refused the API key");
  });
});
