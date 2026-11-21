import { describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import { browserbase, BROWSERBASE_REGION } from "./browserbase";
import type { CdpTab } from "../tools/CdpTab";
import { CloudSessions } from "./cloudBrowser";
import { KeyRefused, type CloudBrowser, type CloudIds } from "./cloudProvider";
import { defined } from "../../shared/testing";

// Against a stubbed fetch, shaped from Browserbase's API reference. Nothing here has talked to the real service.

interface Call {
  method: string;
  url: string;
  key: string | null;
  body: Record<string, unknown> | null;
}

// Every request with a body sends it as JSON text, so anything else fails the test.
const jsonText = (body: BodyInit): string => {
  if (typeof body !== "string") throw new Error("Expected a JSON string body");
  return body;
};

const stub = (answers: Record<string, { status?: number; body: unknown }>) => {
  const calls: Call[] = [];
  const send = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url,
      key: new Headers(init.headers).get("X-BB-API-Key"),
      body: init.body ? JSON.parse(jsonText(init.body)) : null,
    });
    const answer = answers[`${method} ${url.replace("https://api.browserbase.com/v1", "")}`];
    if (!answer) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as typeof fetch;
  return { calls, send };
};

const fakeBrowser = () => {
  let closed = false;
  const context = { name: "context", route: async () => {}, on: () => {}, browser: () => null };
  const browser = { contexts: () => [context], close: async () => void (closed = true) } as unknown as Browser;
  return { browser, closed: () => closed };
};

const provider = (send: typeof fetch, connect: (url: string) => Promise<Browser> = async () => fakeBrowser().browser) =>
  browserbase({ apiKey: "k", projectId: "p", fetch: send, connect });

// Made and connected, keeping each change to the ids it's told about.
const start = async (browser: CloudBrowser, ids: CloudIds, kept: CloudIds[] = []) =>
  (
    await browser.create(
      ids,
      (next) => kept.push(next),
      () => true,
    )
  ).connect();

const releases = (calls: Call[], id: string) =>
  calls.filter(({ method, url, body }) => method === "POST" && url.endsWith(`/sessions/${id}`) && body?.status === "REQUEST_RELEASE");

describe("Browserbase", () => {
  it("makes a context and a kept-alive session in one region, connects, and keeps both for next time", async () => {
    const { calls, send } = stub({
      "POST /contexts": { status: 201, body: { id: "ctx-1" } },
      "POST /sessions": {
        status: 201,
        body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://connect.browserbase.com?signingKey=x" },
      },
    });
    const kept: CloudIds[] = [];
    const connected: string[] = [];
    const { browser } = fakeBrowser();
    const bb = browserbase({
      apiKey: "bb_test",
      projectId: "proj",
      fetch: send,
      connect: async (url) => {
        connected.push(url);
        return browser;
      },
    });
    const session = await start(bb, { contextId: null, sessionId: null }, kept);
    expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
      "POST https://api.browserbase.com/v1/contexts",
      "POST https://api.browserbase.com/v1/sessions",
    ]);
    expect(calls.every(({ key }) => key === "bb_test")).toBe(true);
    expect(defined(calls[1]).body).toMatchObject({
      projectId: "proj",
      keepAlive: true,
      region: BROWSERBASE_REGION,
      browserSettings: { context: { id: "ctx-1", persist: true } },
    });
    expect(connected).toEqual(["wss://connect.browserbase.com?signingKey=x"]);
    expect(kept.at(-1)).toEqual({ contextId: "ctx-1", sessionId: "sess-1" });
    expect(session.context).toMatchObject({ name: "context" });
  });

  it("reuses a session that's still running, and makes a new one in the same context if not", async () => {
    const running = stub({ "GET /sessions/sess-1": { body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://one" } } });
    const connected: string[] = [];
    const connect = async (url: string) => {
      connected.push(url);
      return fakeBrowser().browser;
    };
    await start(provider(running.send, connect), { contextId: "ctx-1", sessionId: "sess-1" });
    expect(running.calls).toHaveLength(1);
    expect(connected).toEqual(["wss://one"]);

    const gone = stub({
      "GET /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
      "POST /sessions": { status: 201, body: { id: "sess-2", status: "RUNNING", connectUrl: "wss://two" } },
    });
    await start(provider(gone.send, connect), { contextId: "ctx-1", sessionId: "sess-1" });
    expect(gone.calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
      "GET https://api.browserbase.com/v1/sessions/sess-1",
      "POST https://api.browserbase.com/v1/sessions",
    ]);
    expect(defined(gone.calls[1]).body).toMatchObject({ browserSettings: { context: { id: "ctx-1" } } });
  });

  it("makes nothing new once it isn't wanted any more", async () => {
    const { calls, send } = stub({ "POST /contexts": { status: 201, body: { id: "ctx-1" } } });
    let wanted = true;
    const making = provider(send).create(
      { contextId: null, sessionId: null },
      () => (wanted = false),
      () => wanted,
    );
    await expect(making).rejects.toThrow("ending");
    expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual(["POST https://api.browserbase.com/v1/contexts"]);
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
    const session = await start(provider(send), { contextId: "ctx", sessionId: null });
    expect(await session.liveView({ targetId: "TARGET", url: "https://b.test/" } as CdpTab)).toBe("https://live/mine?wss=b&navbar=false");
    expect(await session.liveView({ targetId: "NEW", url: "https://c.test/" } as CdpTab)).toBe(
      "https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=all&navbar=false",
    );
  });

  it("ends the session at Browserbase by its id, and lets go of the connection, so it stops costing", async () => {
    const { calls, send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x" } },
      "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
    });
    const fake = fakeBrowser();
    const kept: CloudIds[] = [];
    const sessions = new CloudSessions(
      provider(send, async () => fake.browser),
      { contextId: "ctx", sessionId: null },
      { onIds: (ids) => kept.push(ids) },
    );
    await sessions.withContext(async () => {});
    expect(sessions.canEnd).toBe(true);
    expect(await sessions.end()).toBe("ended");
    expect(releases(calls, "sess-1")).toHaveLength(1);
    await expect.poll(() => fake.closed()).toBe(true);
    expect(kept.at(-1)).toEqual({ contextId: "ctx", sessionId: null });
    expect(sessions.canEnd).toBe(false);
  });

  it("ends a session nobody has used for a while, and not one a job or the user picked up again", async () => {
    const { calls, send } = stub({ "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } } });
    const sessions = new CloudSessions(provider(send), { contextId: "ctx", sessionId: "sess-1" }, {}, 20);

    sessions.claim("job-1");
    sessions.release("job-1");
    sessions.claim("job-2");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(releases(calls, "sess-1")).toHaveLength(0);

    sessions.release("job-2");
    sessions.holdForUser("tab-1");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(releases(calls, "sess-1")).toHaveLength(0);

    sessions.letGo("tab-1");
    sessions.claim("job-3");
    sessions.release("job-3");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(releases(calls, "sess-1")).toHaveLength(1);
    expect(sessions.canEnd).toBe(false);
  });

  it("never replaces a session it couldn't look up, or one that hasn't ended, so its id isn't lost", async () => {
    const made = { status: 201, body: { id: "sess-2", status: "RUNNING", connectUrl: "wss://two" } };
    // A lookup that failed, one that came back with nothing in it, and a session still starting.
    for (const answer of [
      { status: 500, body: {} },
      { body: null },
      { body: { id: "sess-1" } },
      { body: { id: "sess-1", status: "PENDING" } },
    ]) {
      const { calls, send } = stub({ "GET /sessions/sess-1": answer, "POST /sessions": made });
      const kept: CloudIds[] = [];
      await expect(start(provider(send), { contextId: "ctx", sessionId: "sess-1" }, kept)).rejects.toThrow();
      expect(calls.map(({ method }) => method)).toEqual(["GET"]);
      expect(kept).toEqual([]);
    }
    // One Browserbase has never heard of is gone.
    const { calls, send } = stub({ "POST /sessions": made });
    await start(provider(send), { contextId: "ctx", sessionId: "sess-1" });
    expect(calls.map(({ method }) => method)).toEqual(["GET", "POST"]);
  });

  it("keeps a session it made even when Browserbase didn't say how to connect, and releases it", async () => {
    const { calls, send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING" } },
      "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
    });
    const kept: CloudIds[] = [];
    const sessions = new CloudSessions(provider(send), { contextId: "ctx", sessionId: null }, { onIds: (ids) => kept.push(ids) });
    sessions.claim("job");
    await expect(sessions.open("job", "cloud-1", "https://example.com/", { onChange: () => {} })).rejects.toThrow("how to connect");
    expect(kept[0]).toEqual({ contextId: "ctx", sessionId: "sess-1" });
    expect(releases(calls, "sess-1")).toHaveLength(1);
    expect(sessions.canEnd).toBe(false);
  });

  it("releases a session it made even when connecting to it failed", async () => {
    const { calls, send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x" } },
      "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
    });
    const sessions = new CloudSessions(
      provider(send, async () => Promise.reject(new Error("no connection"))),
      {
        contextId: "ctx",
        sessionId: null,
      },
    );
    sessions.claim("job");
    await expect(sessions.open("job", "cloud-1", "https://example.com/", { onChange: () => {} })).rejects.toThrow("no connection");
    await expect.poll(() => releases(calls, "sess-1").length).toBe(1);
    await expect.poll(() => sessions.canEnd).toBe(false);
  });

  it("ends a session from last time with no connection to it, and says so until Browserbase confirms", async () => {
    const answers: Record<string, { status?: number; body: unknown }> = {
      "POST /sessions/sess-1": { status: 500, body: {} },
      "GET /sessions/sess-1": { body: { id: "sess-1", status: "RUNNING" } },
    };
    const { calls, send } = stub(answers);
    const sessions = new CloudSessions(provider(send), { contextId: "ctx", sessionId: "sess-1" });
    expect(sessions.canEnd).toBe(true);

    expect(await sessions.end()).toBe("running");
    expect(sessions.unreleased).toBe(true);
    expect(sessions.problem).toMatch(/may still be running, and costing/);
    expect(sessions.canEnd).toBe(true);

    answers["POST /sessions/sess-1"] = { body: { id: "sess-1", status: "COMPLETED" } };
    expect(await sessions.end()).toBe("ended");
    expect(releases(calls, "sess-1")).toHaveLength(2);
    expect(sessions.unreleased).toBe(false);
    expect(sessions.problem).toBeNull();
    expect(sessions.canEnd).toBe(false);
  });

  it("releases a session by its id at once, even while connecting to it never finishes", async () => {
    const { calls, send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x" } },
      "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
    });
    let connected = () => {};
    const fake = fakeBrowser();
    const connect = () => new Promise<Browser>((resolve) => (connected = () => resolve(fake.browser)));
    const kept: CloudIds[] = [];
    const sessions = new CloudSessions(provider(send, connect), { contextId: "ctx", sessionId: null }, { onIds: (ids) => kept.push(ids) });
    sessions.claim("job");
    const opening = sessions.open("job", "cloud-1", "https://example.com/", { onChange: () => {} }).catch(() => null);
    await expect.poll(() => kept.at(-1)?.sessionId).toBe("sess-1");
    expect(await sessions.end()).toBe("ended");
    expect(releases(calls, "sess-1")).toHaveLength(1);
    // The connection that arrives afterwards is closed.
    connected();
    expect(await opening).toBeNull();
    await expect.poll(() => fake.closed()).toBe(true);
    expect(sessions.canEnd).toBe(false);
  });

  it("keeps a session it couldn't release or look up, and counts one Browserbase has never heard of as released", async () => {
    const failing = provider(
      stub({ "POST /sessions/sess-1": { status: 500, body: {} }, "GET /sessions/sess-1": { status: 502, body: {} } }).send,
    );
    await expect(failing.release("sess-1")).rejects.toThrow();
    // A key Browserbase no longer takes says so, since it can't end anything.
    const refused = provider(
      stub({ "POST /sessions/sess-1": { status: 401, body: {} }, "GET /sessions/sess-1": { status: 401, body: {} } }).send,
    );
    await expect(refused.release("sess-1")).rejects.toBeInstanceOf(KeyRefused);

    const forgotten = provider(stub({ "POST /sessions/sess-1": { status: 404, body: {} } }).send);
    await expect(forgotten.release("sess-1")).resolves.toBeUndefined();
  });

  it("counts a session that has already ended as released", async () => {
    const { send } = stub({
      "POST /sessions/sess-1": { status: 400, body: {} },
      "GET /sessions/sess-1": { body: { id: "sess-1", status: "TIMED_OUT" } },
    });
    await expect(provider(send).release("sess-1")).resolves.toBeUndefined();
  });

  it("says plainly when the key is refused", async () => {
    const { send } = stub({ "POST /sessions": { status: 401, body: {} } });
    const bb = browserbase({ apiKey: "bad", projectId: "p", fetch: send, connect: async () => fakeBrowser().browser });
    await expect(start(bb, { contextId: "ctx", sessionId: null })).rejects.toThrow("Browserbase refused the API key");
  });
});
