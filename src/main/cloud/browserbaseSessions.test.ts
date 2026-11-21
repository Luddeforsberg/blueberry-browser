import { describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import { CloudSessions } from "./cloudBrowser";
import type { CloudIds } from "./cloudProvider";
import { defined } from "../../shared/testing";
import { at, fakeBrowser, listing, provider, releases, stub } from "./browserbaseTesting";

// A session's life at Browserbase, against a stubbed fetch.

describe("CloudSessions at Browserbase", () => {
  it("ends the session at Browserbase by its id, and lets go of the connection, so it stops costing", async () => {
    const { calls, send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x" } },
      "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
    });
    const fake = fakeBrowser();
    const kept: CloudIds[] = [];
    const sessions = new CloudSessions(
      provider(send, async () => fake.browser),
      at({ contextId: "ctx" }),
      { onIds: (ids) => kept.push(ids) },
    );
    await sessions.withContext(async () => {});
    expect(sessions.canEnd).toBe(true);
    expect(await sessions.end()).toBe("ended");
    expect(releases(calls, "sess-1")).toHaveLength(1);
    await expect.poll(() => fake.closed()).toBe(true);
    expect(kept.at(-1)).toEqual(at({ contextId: "ctx" }));
    expect(sessions.canEnd).toBe(false);
  });

  it("ends a session nobody has used for a while, and not one a job or the user picked up again", async () => {
    const { calls, send } = stub({ "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } } });
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx", sessionId: "sess-1" }), {}, 20);

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

  it("keeps a session it made even when Browserbase didn't say how to connect, and releases it", async () => {
    const { calls, send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING" } },
      "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
    });
    const kept: CloudIds[] = [];
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx" }), { onIds: (ids) => kept.push(ids) });
    sessions.claim("job");
    await expect(sessions.open("job", "cloud-1", "https://example.com/", { onChange: () => {} })).rejects.toThrow("how to connect");
    expect(kept.some(({ sessionId }) => sessionId === "sess-1")).toBe(true);
    await expect.poll(() => kept.at(-1)).toEqual(at({ contextId: "ctx" }));
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
      at({ contextId: "ctx" }),
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
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx", sessionId: "sess-1" }));
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
    const sessions = new CloudSessions(provider(send, connect), at({ contextId: "ctx" }), { onIds: (ids) => kept.push(ids) });
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

  it("keeps a tag before asking for a session, and ends one whose answer never came by that tag", async () => {
    const { calls, send } = stub({
      // Browserbase made it, and the answer was lost.
      "POST /sessions": { status: 500, body: {} },
      "GET /sessions?q=*": { body: [{ id: "sess-9", status: "RUNNING" }] },
      "POST /sessions/sess-9": { body: { id: "sess-9", status: "COMPLETED" } },
    });
    const kept: CloudIds[] = [];
    let onDisk: string[] = [];
    const watching = (async (url: string, init: RequestInit) => {
      if (url.endsWith("/sessions") && init.method === "POST") onDisk = [...(kept.at(-1)?.tags ?? [])];
      return send(url, init);
    }) as typeof fetch;
    const sessions = new CloudSessions(provider(watching), at({ contextId: "ctx" }), { onIds: (ids) => kept.push(ids) });
    sessions.claim("job");
    await expect(sessions.open("job", "cloud-1", "https://example.com/", { onChange: () => {} })).rejects.toThrow("500");
    const made = defined(calls.find(({ url }) => url.endsWith("/sessions")));
    const tag = (made.body?.userMetadata as { blueberry: string }).blueberry;
    expect(onDisk).toEqual([tag]);
    expect(kept.at(0)).toMatchObject({ tags: [tag], madeBy: "browserbase" });
    await expect.poll(() => releases(calls, "sess-9").length).toBe(1);
    expect(calls.some(({ method, url }) => `${method} ${url.replace("https://api.browserbase.com/v1", "")}` === listing(tag))).toBe(true);
    await expect.poll(() => kept.at(-1)).toEqual(at({ contextId: "ctx" }));
    expect(sessions.canEnd).toBe(false);
  });

  it("ends what a tag from last time made as soon as it starts, and keeps the tag until Browserbase confirms", async () => {
    const answers: Record<string, { status?: number; body: unknown }> = { [listing("old")]: { status: 500, body: {} } };
    const { calls, send } = stub(answers);
    const kept: CloudIds[] = [];
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx", tags: ["old"], madeBy: "browserbase" }), {
      onIds: (ids) => kept.push(ids),
    });
    await expect.poll(() => sessions.unreleased).toBe(true);
    expect(kept).toEqual([]);
    expect(sessions.canEnd).toBe(true);

    answers[listing("old")] = {
      body: [
        { id: "sess-1", status: "RUNNING" },
        { id: "sess-2", status: "COMPLETED" },
      ],
    };
    answers["POST /sessions/sess-1"] = { body: { id: "sess-1", status: "COMPLETED" } };
    expect(await sessions.end()).toBe("ended");
    expect(releases(calls, "sess-1")).toHaveLength(1);
    expect(releases(calls, "sess-2")).toHaveLength(0);
    expect(kept.at(-1)).toEqual(at({ contextId: "ctx" }));
    expect(sessions.problem).toBeNull();
  });
});
