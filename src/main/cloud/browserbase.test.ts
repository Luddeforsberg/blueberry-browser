import { describe, expect, it } from "vitest";
import { browserbase, BROWSERBASE_REGION } from "./browserbase";
import type { CdpTab } from "../tools/CdpTab";
import { KeyRefused, type CloudBrowser, type CloudIds, type CreateHooks } from "./cloudProvider";
import { defined } from "../../shared/testing";
import { fakeBrowser, listing, provider, releases, stub } from "./browserbaseTesting";

// Against a stubbed fetch, shaped from Browserbase's API reference. Nothing here has talked to the real service.

type Asked = Pick<CloudIds, "contextId" | "sessionId" | "tags">;

// The hooks a create is told through, keeping what it was told.
const told = (wanted = () => true) => {
  const seen: Asked = { contextId: null, sessionId: null, tags: [] };
  const hooks: CreateHooks = {
    wanted,
    tag: () => {
      const tag = `tag-${seen.tags.length + 1}`;
      seen.tags.push(tag);
      return tag;
    },
    unused: (tag) => void (seen.tags = seen.tags.filter((one) => one !== tag)),
    context: (id) => void (seen.contextId = id),
    made: (id) => void (seen.sessionId = id),
  };
  return { seen, hooks };
};

// Made and connected.
const start = async (browser: CloudBrowser, ids: Pick<CloudIds, "contextId" | "sessionId">, { hooks } = told()) =>
  (await browser.create(ids, hooks)).connect();

describe("Browserbase", () => {
  it("makes a context and a kept-alive session in one region, connects, and keeps both for next time", async () => {
    const { calls, send } = stub({
      "POST /contexts": { status: 201, body: { id: "ctx-1" } },
      "POST /sessions": {
        status: 201,
        body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://connect.browserbase.com?signingKey=x" },
      },
    });
    const asked = told();
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
    const session = await start(bb, { contextId: null, sessionId: null }, asked);
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
      userMetadata: { blueberry: "tag-1" },
    });
    expect(connected).toEqual(["wss://connect.browserbase.com?signingKey=x"]);
    expect(asked.seen).toEqual({ contextId: "ctx-1", sessionId: "sess-1", tags: ["tag-1"] });
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
    const { seen, hooks } = told(() => wanted);
    const making = provider(send).create({ contextId: null, sessionId: null }, { ...hooks, context: () => (wanted = false) });
    await expect(making).rejects.toThrow("ending");
    expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual(["POST https://api.browserbase.com/v1/contexts"]);
    expect(seen.tags).toEqual([]);
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
      const asked = told();
      await expect(start(provider(send), { contextId: "ctx", sessionId: "sess-1" }, asked)).rejects.toThrow();
      expect(calls.map(({ method }) => method)).toEqual(["GET"]);
      expect(asked.seen).toEqual({ contextId: null, sessionId: null, tags: [] });
    }
    // One Browserbase has never heard of is gone.
    const { calls, send } = stub({ "POST /sessions": made });
    await start(provider(send), { contextId: "ctx", sessionId: "sess-1" });
    expect(calls.map(({ method }) => method)).toEqual(["GET", "POST"]);
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

  it("releases by tag only once every session listed has ended, and by its mark only with one", async () => {
    const failing = stub({
      [listing("t")]: {
        body: [
          { id: "a", status: "RUNNING" },
          { id: "b", status: "RUNNING" },
        ],
      },
      "POST /sessions/a": { body: {} },
      "POST /sessions/b": { status: 500, body: {} },
      "GET /sessions/b": { body: { id: "b", status: "RUNNING" } },
    });
    await expect(provider(failing.send).releaseTagged("t")).rejects.toThrow("500");
    expect(releases(failing.calls, "a")).toHaveLength(1);
    await expect(provider(stub({ [listing("t")]: { body: {} } }).send).releaseTagged("t")).rejects.toThrow("didn't list");

    const marked = stub({
      [listing("runner-1", "blueberryMark")]: { body: [{ id: "c", status: "RUNNING" }] },
      "POST /sessions/c": { body: {} },
    });
    await provider(marked.send, undefined, "runner-1").releaseMarked();
    expect(releases(marked.calls, "c")).toHaveLength(1);
    const unmarked = stub({});
    await provider(unmarked.send).releaseMarked();
    expect(unmarked.calls).toEqual([]);

    const making = stub({ "POST /sessions": { status: 201, body: { id: "s", status: "RUNNING", connectUrl: "wss://x" } } });
    await start(provider(making.send, undefined, "runner-1"), { contextId: "ctx", sessionId: null });
    expect(defined(making.calls[0]).body).toMatchObject({ userMetadata: { blueberry: "tag-1", blueberryMark: "runner-1" } });
  });

  it("says plainly when the key is refused, and lets go of the tag of a session it refused to make", async () => {
    const { send } = stub({ "POST /sessions": { status: 401, body: {} } });
    const bb = browserbase({ apiKey: "bad", projectId: "p", fetch: send, connect: async () => fakeBrowser().browser });
    const refused = told();
    await expect(start(bb, { contextId: "ctx", sessionId: null }, refused)).rejects.toThrow("Browserbase refused the API key");
    expect(refused.seen.tags).toEqual([]);
    // A failure that may come after the session was made keeps it.
    const failed = told();
    await expect(
      start(provider(stub({ "POST /sessions": { status: 500, body: {} } }).send), { contextId: "ctx", sessionId: null }, failed),
    ).rejects.toThrow("500");
    expect(failed.seen.tags).toEqual(["tag-1"]);
  });
});
