import { describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright-core";
import { CloudSessions } from "./cloudBrowser";
import type { CloudIds } from "./cloudProvider";
import { defined } from "../../shared/testing";
import { at, fakeBrowser, handle, keeping, listing, provider, releases, stub } from "./browserbaseTesting";

// A session's life at Browserbase, against a stubbed fetch.

const HOUR = 60 * 60_000;

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
      { onIds: keeping(kept) },
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
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx", handles: [handle("sess-1")] }), {}, 20);

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
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx" }), { onIds: keeping(kept) });
    sessions.claim("job");
    await expect(sessions.open("job", "cloud-1", "https://example.com/", { onChange: () => {} })).rejects.toThrow("how to connect");
    expect(kept.some(({ handles }) => handles.some(({ id }) => id === "sess-1"))).toBe(true);
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
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx", handles: [handle("sess-1")] }));
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
    const sessions = new CloudSessions(provider(send, connect), at({ contextId: "ctx" }), { onIds: keeping(kept) });
    sessions.claim("job");
    const opening = sessions.open("job", "cloud-1", "https://example.com/", { onChange: () => {} }).catch(() => null);
    await expect.poll(() => kept.at(-1)?.handles[0]?.id).toBe("sess-1");
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
      if (url.endsWith("/sessions") && init.method === "POST") onDisk = (kept.at(-1)?.handles ?? []).map(({ tag }) => tag);
      return send(url, init);
    }) as typeof fetch;
    const sessions = new CloudSessions(provider(watching), at({ contextId: "ctx" }), { onIds: keeping(kept) });
    sessions.claim("job");
    await expect(sessions.open("job", "cloud-1", "https://example.com/", { onChange: () => {} })).rejects.toThrow("500");
    const made = defined(calls.find(({ url }) => url.endsWith("/sessions")));
    const tag = (made.body?.userMetadata as { blueberry: string }).blueberry;
    expect(onDisk).toEqual([tag]);
    expect(kept.at(0)).toMatchObject({ handles: [{ tag, id: null, by: "browserbase:p" }] });
    await expect.poll(() => releases(calls, "sess-9").length).toBe(1);
    expect(calls.some(({ method, url }) => `${method} ${url.replace("https://api.browserbase.com/v1", "")}` === listing(tag))).toBe(true);
    await expect.poll(() => kept.at(-1)).toEqual(at({ contextId: "ctx" }));
    expect(sessions.canEnd).toBe(false);
  });

  it("ends what a tag from last time made as soon as it starts, and keeps the tag until Browserbase confirms", async () => {
    const answers: Record<string, { status?: number; body: unknown }> = { [listing("old")]: { status: 500, body: {} } };
    const { calls, send } = stub(answers);
    const kept: CloudIds[] = [];
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx", handles: [handle(null, { tag: "old" })] }), {
      onIds: keeping(kept),
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

  it("keeps a tag Browserbase lists nothing for, since its create may land after the listing, until it's further past its deadline than any session lasts", async () => {
    const { calls, send } = stub({ [listing("late")]: { body: [] } });
    const kept: CloudIds[] = [];
    const late = handle(null, { tag: "late", until: Date.now() - 5 * HOUR });
    const sessions = new CloudSessions(provider(send), at({ handles: [late] }), { onIds: keeping(kept) });
    expect(await sessions.end()).toBe("running");
    expect(kept).toEqual([]);
    expect(sessions.canEnd).toBe(true);
    expect(sessions.problem).toBeNull();
    expect(calls.every(({ method }) => method === "GET")).toBe(true);
    // Six hours past it, Browserbase has ended anything made with it, even by a clock that far ahead.
    expect(new CloudSessions(provider(send), at({ handles: [{ ...late, until: Date.now() - 6 * HOUR - 1000 }] })).canEnd).toBe(false);
  });

  it("never forgets a session whose release failed, even past its deadline, so End can try it again", async () => {
    const { calls, send } = stub({ "POST /sessions/sess-1": { status: 500, body: {} }, "GET /sessions/sess-1": { status: 500, body: {} } });
    const kept: CloudIds[] = [];
    const late = handle("sess-1", { until: Date.now() - HOUR });
    const sessions = new CloudSessions(provider(send), at({ handles: [late] }), { onIds: keeping(kept) });
    expect(await sessions.end()).toBe("running");
    expect(await sessions.end()).toBe("running");
    expect(releases(calls, "sess-1")).toHaveLength(2);
    expect(kept).toEqual([]);
    expect(sessions.unreleased).toBe(true);
  });

  it("asks for a new session past a hundred kept once the oldest are further past their deadline than any session lasts", async () => {
    const { calls, send } = stub({ "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x" } } });
    const old = Array.from({ length: 100 }, (_, i) => handle(null, { tag: `t-${i}`, by: "browserbase:other", until: Date.now() + 1000 }));
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx", handles: old }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * HOUR + 2000);
    await sessions.withContext(async () => {}).catch(() => {});
    vi.useRealTimers();
    expect(calls.filter(({ method, url }) => method === "POST" && url.endsWith("/sessions"))).toHaveLength(1);
  });

  it("asks for no session whose tag couldn't be saved", async () => {
    const { calls, send } = stub({ "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x" } } });
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx" }), { onIds: () => false });
    await expect(sessions.withContext(async () => {})).rejects.toThrow("couldn't be saved");
    expect(calls).toEqual([]);
    expect(sessions.canEnd).toBe(false);
  });

  it("lists and releases only in its own project, and keeps another project's sessions for a key from there", async () => {
    const { calls, send } = stub({});
    const elsewhere = [handle("sess-1", { by: "browserbase:other" }), handle(null, { tag: "t", by: "browserbase:other" })];
    const saved: CloudIds[] = [];
    const sessions = new CloudSessions(provider(send), at({ handles: elsewhere }), { onIds: (ids) => saved.push(ids) > 0 });
    expect(sessions.canEnd).toBe(false);
    expect(await sessions.end()).toBe("ended");
    expect(calls).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("asks for no new session while a hundred may still be running, and says why", async () => {
    const { calls, send } = stub({ "GET /sessions?q=*": { body: [] } });
    const kept = Array.from({ length: 100 }, (_, i) => handle(null, { tag: `t-${i}` }));
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx", handles: kept }));
    await expect(sessions.withContext(async () => {})).rejects.toThrow(/Too many cloud sessions/);
    expect(calls.filter(({ method, url }) => method === "POST" && url.endsWith("/sessions"))).toEqual([]);
  });

  it("keeps a create whose answer never came until Browserbase's longest timeout has passed since it was sent", async () => {
    const { send } = stub({ "POST /sessions": { status: 500, body: {} } });
    const kept: CloudIds[] = [];
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx" }), { onIds: keeping(kept) });
    const sent = Date.now();
    await sessions.withContext(async () => {}).catch(() => {});
    const [tagged] = kept.find(({ handles }) => handles.length)?.handles ?? [];
    // Six hours, the most a session can be asked for, and five minutes for this computer's clock.
    expect(tagged?.until).toBeGreaterThanOrEqual(sent + 6 * HOUR + 5 * 60_000);
    expect(tagged?.until).toBeLessThan(sent + 6 * HOUR + 6 * 60_000);
  });

  it("keeps Browserbase's own deadline once it says it", async () => {
    const expiresAt = "2030-01-01T00:00:00.000Z";
    const { send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x", expiresAt } },
    });
    const kept: CloudIds[] = [];
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx" }), { onIds: keeping(kept) });
    await sessions.withContext(async () => {});
    // With five minutes more, in case this computer's clock is behind Browserbase's.
    expect(kept.at(-1)?.handles).toEqual([expect.objectContaining({ id: "sess-1", until: Date.parse(expiresAt) + 5 * 60_000 })]);
  });

  it("still ends a session past its deadline, since this computer's clock may be wrong, and forgets it only then", async () => {
    const { calls, send } = stub({ "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } } });
    const kept: CloudIds[] = [];
    const late = handle("sess-1", { until: Date.now() - 60_000 });
    const sessions = new CloudSessions(provider(send), at({ handles: [late] }), { onIds: keeping(kept) });
    await sessions.end();
    expect(releases(calls, "sess-1")).toHaveLength(1);
    expect(kept.at(-1)?.handles).toEqual([]);
  });

  it("on Quit, waits for the release and not for a connection that never answers", async () => {
    const { calls, send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x" } },
      "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
    });
    const sessions = new CloudSessions(
      provider(send, () => new Promise<Browser>(() => {})),
      at({ contextId: "ctx" }),
    );
    sessions.claim("job");
    void sessions.open("job", "cloud-1", "https://example.com/", { onChange: () => {} }).catch(() => {});
    await expect.poll(() => calls.some(({ method, url }) => method === "POST" && url.endsWith("/sessions"))).toBe(true);
    expect(await sessions.quit()).toBe("ended");
    expect(releases(calls, "sess-1")).toHaveLength(1);
  });

  it("on Quit, waits for the release and not for a connection that never closes", async () => {
    const { calls, send } = stub({
      "POST /sessions": { status: 201, body: { id: "sess-1", status: "RUNNING", connectUrl: "wss://x" } },
      "POST /sessions/sess-1": { body: { id: "sess-1", status: "COMPLETED" } },
    });
    const stalled = { ...fakeBrowser().browser, close: () => new Promise<void>(() => {}) } as unknown as Browser;
    const sessions = new CloudSessions(
      provider(send, async () => stalled),
      at({ contextId: "ctx" }),
    );
    await sessions.withContext(async () => {});
    expect(await sessions.quit()).toBe("ended");
    expect(releases(calls, "sess-1")).toHaveLength(1);
  });

  it("releases a session whose answer comes after it was ended, at once", async () => {
    let answer = () => {};
    const released: string[] = [];
    const send = ((url: string, init: RequestInit) => {
      if (url.endsWith("/v1/sessions"))
        return new Promise<Response>(
          (resolve) =>
            (answer = () =>
              resolve(new Response(JSON.stringify({ id: "sess-1", status: "RUNNING", connectUrl: "wss://x" }), { status: 201 }))),
        );
      if (init.method === "POST") released.push(url.replace(/^.*\/sessions\//, ""));
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;
    const sessions = new CloudSessions(provider(send), at({ contextId: "ctx" }));
    const starting = sessions.withContext(async () => {}).catch((error: Error) => error.message);
    await expect.poll(() => typeof answer).toBe("function");
    await new Promise((resolve) => setTimeout(resolve, 10));
    await sessions.end();
    expect(await starting).toMatch(/ended|ending/);
    answer();
    await expect.poll(() => released).toEqual(["sess-1"]);
  });

  it("keeps no Context that comes back after a new key was saved, since it's the old account's", async () => {
    let answer: (id: string) => void = () => {};
    const send = ((url: string) =>
      url.endsWith("/contexts")
        ? new Promise<Response>((resolve) => (answer = (id) => resolve(new Response(JSON.stringify({ id }), { status: 201 }))))
        : Promise.resolve(new Response("{}", { status: 404 }))) as typeof fetch;
    const kept: CloudIds[] = [];
    const sessions = new CloudSessions(provider(send), at({}), { onIds: keeping(kept) });
    const starting = sessions.withContext(async () => {}).catch((error: Error) => error.message);
    await expect.poll(() => typeof answer).toBe("function");
    await new Promise((resolve) => setTimeout(resolve, 10));
    await sessions.replace(() => ({ browser: provider(stub({}).send) }));
    answer("ctx-old");
    expect(await starting).toMatch(/ended|ending/);
    expect(sessions.contextId).toBeNull();
    expect(kept.every(({ contexts }) => Object.keys(contexts).length === 0)).toBe(true);
  });
});
