import { describe, expect, it, vi } from "vitest";
import type { BrowserContext, Page } from "playwright-core";
import { CdpTab } from "../tools/CdpTab";
import { CloudSessions } from "./cloudBrowser";
import { NO_IDS, type CloudBrowser, type CloudIds } from "./cloudProvider";
import { handle, keeping } from "./browserbaseTesting";

// The session and its pages, whichever provider runs them.

const localLike = (context: object, released: () => void = () => {}): CloudBrowser => ({
  name: "local",
  origin: "local",
  release: async () => released(),
  releaseTagged: async () => (released(), "none"),
  create: async () => ({
    id: null,
    connect: async () => ({ context: context as unknown as BrowserContext, liveView: async () => null, close: async () => {} }),
  }),
});

describe("CloudSessions", () => {
  it("starts a session for a change to its cookies, ends it after a while if nobody else is in it, and never under the user", async () => {
    const context = { route: async () => {}, on: () => {}, browser: () => null };
    const sessions = new CloudSessions(localLike(context), undefined, {}, 20);

    expect(await sessions.withContext(async (got) => got === (context as unknown))).toBe(true);
    expect(sessions.winding).toBe(true);
    await expect.poll(() => sessions.status).toBe("ended");

    // Running with the user in a page they hold, which stays open.
    sessions.holdForUser("tab-1");
    await sessions.withContext(async () => {});
    expect(sessions.winding).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(sessions.status).toBe("running");
    sessions.letGo("tab-1");
    expect(sessions.winding).toBe(true);
  });

  it("closes the page it made when a limited mascot's limit couldn't be put on it", async () => {
    const page = { on: () => {} } as unknown as Page;
    const context = { route: async () => {}, on: () => {}, browser: () => null, newPage: async () => page };
    const tab = {
      id: "cloud-1",
      isClosed: false,
      withNavigationLimit: async () => Promise.reject(new Error("Fetch.enable failed")),
      close: vi.fn(async () => {}),
    };
    vi.spyOn(CdpTab, "attach").mockResolvedValue(tab as unknown as CdpTab);
    const sessions = new CloudSessions(localLike(context));
    sessions.claim("job");
    await expect(sessions.open("job", "cloud-1", "https://shop.example/", { onChange: () => {} }, () => true)).rejects.toThrow(
      "Fetch.enable failed",
    );
    expect(tab.close).toHaveBeenCalled();
    expect(sessions.page("cloud-1")).toBeNull();
    expect(sessions.pagesOf("job")).toEqual([]);
    vi.restoreAllMocks();
  });

  it("never lets go of a session another provider made, since only that one can say it ended", async () => {
    const context = { route: async () => {}, on: () => {}, browser: () => null };
    const released = vi.fn();
    const kept: CloudIds[] = [];
    const theirs = [handle("bb-1"), handle(null, { tag: "bb-tag" })];
    const sessions = new CloudSessions(localLike(context, released), { ...NO_IDS, handles: theirs }, { onIds: keeping(kept) });
    expect(sessions.canEnd).toBe(false);
    await sessions.withContext(async () => {});
    expect(await sessions.end()).toBe("ended");
    expect(released).not.toHaveBeenCalled();
    expect(kept.every(({ handles }) => handles.length === 2)).toBe(true);
  });

  it("keeps the tag of every session it asks for until it's known, and lets go of one the provider refused to make", async () => {
    const kept: CloudIds[] = [];
    let refuse = true;
    const browser: CloudBrowser = {
      ...localLike({}),
      name: "browserbase",
      origin: "browserbase:p",
      releaseTagged: () => Promise.reject(new Error("Not in this test.")),
      create: async (_ids, hooks) => {
        const tag = hooks.tag(Date.now() + 60_000);
        if (refuse) hooks.unused(tag);
        throw new Error("Browserbase answered 401.");
      },
    };
    const sessions = new CloudSessions(browser, NO_IDS, { onIds: keeping(kept) });
    await expect(sessions.withContext(async () => {})).rejects.toThrow("401");
    expect(kept.at(0)?.handles).toHaveLength(1);
    expect(kept.at(-1)).toEqual(NO_IDS);
    expect(sessions.canEnd).toBe(false);
    // One that may have been made is kept, and said to be unconfirmed once its release fails.
    refuse = false;
    await expect(sessions.withContext(async () => {})).rejects.toThrow("401");
    await expect.poll(() => sessions.unreleased).toBe(true);
    expect(kept.at(-1)?.handles).toHaveLength(1);
  });

  it("asks once for a release already on its way, and clears its problem once one is confirmed", async () => {
    const answers: { ok: () => void; fail: () => void }[] = [];
    const browser: CloudBrowser = {
      ...localLike({}),
      name: "browserbase",
      origin: "browserbase:p",
      release: () => new Promise<void>((ok, fail) => answers.push({ ok, fail: () => fail(new Error("500")) })),
    };
    const sessions = new CloudSessions(browser, { ...NO_IDS, handles: [handle("sess-1")] });
    const first = sessions.end();
    const second = sessions.end();
    await expect.poll(() => answers.length).toBe(1);
    answers[0]?.fail();
    expect(await first).toBe("running");
    expect(await second).toBe("running");
    expect(sessions.unreleased).toBe(true);

    const third = sessions.end();
    await expect.poll(() => answers.length).toBe(2);
    answers[1]?.ok();
    expect(await third).toBe("ended");
    expect(sessions.unreleased).toBe(false);
    expect(sessions.problem).toBeNull();
    expect(sessions.canEnd).toBe(false);
  });

  it("lets go of the user's hold when the connection goes, so a session nobody can use winds down", async () => {
    let lost = () => {};
    const browser = { on: (_event: string, then: () => void) => (lost = then) };
    const context = { route: async () => {}, on: () => {}, browser: () => browser } as unknown as BrowserContext;
    // Kept alive at the provider, so it still runs, and costs, once the connection has gone.
    const keptAlive: CloudBrowser = {
      ...localLike(context),
      origin: "browserbase:p",
      create: async (_ids, hooks) => {
        hooks.made(hooks.tag(Date.now() + 60_000), "sess-1");
        return { id: "sess-1", connect: async () => ({ context, liveView: async () => null, close: async () => {} }) };
      },
    };
    const sessions = new CloudSessions(keptAlive, undefined, {}, 20);
    sessions.holdForUser("tab-1");
    await sessions.withContext(async () => {});
    expect(sessions.winding).toBe(false);
    lost();
    expect(sessions.heldByUser("tab-1")).toBe(false);
    expect(sessions.winding).toBe(true);
  });

  it("lets go of the user's hold when their page closes on its own, so the session winds down", async () => {
    let closed = () => {};
    const page = { on: (event: string, then: () => void) => event === "close" && (closed = then) } as unknown as Page;
    const context = { route: async () => {}, on: () => {}, browser: () => null, newPage: async () => page } as unknown as BrowserContext;
    const keptAlive: CloudBrowser = {
      ...localLike(context),
      origin: "browserbase:p",
      create: async (_ids, hooks) => {
        hooks.made(hooks.tag(Date.now() + 60_000), "sess-1");
        return { id: "sess-1", connect: async () => ({ context, liveView: async () => null, close: async () => {} }) };
      },
    };
    const tab = { id: "tab-1", isClosed: false, loadURL: async () => {}, settled: async () => {}, close: async () => {} };
    vi.spyOn(CdpTab, "attach").mockResolvedValueOnce(tab as unknown as CdpTab);
    const sessions = new CloudSessions(keptAlive, undefined, {}, 20);
    expect(await sessions.openForUser("tab-1", "https://shop.example/", { onChange: () => {} })).toBe(tab);
    expect(sessions.winding).toBe(false);
    closed();
    expect(sessions.heldByUser("tab-1")).toBe(false);
    expect(sessions.winding).toBe(true);
    vi.restoreAllMocks();
  });

  it("closes only its own page when a limit fails late, not a newer one with the same id", async () => {
    const page = { on: () => {} } as unknown as Page;
    const context = { route: async () => {}, on: () => {}, browser: () => null, newPage: async () => page };
    let fail = () => {};
    const tab = (limit: () => Promise<void>) => ({
      id: "cloud-1",
      isClosed: false,
      withNavigationLimit: limit,
      loadURL: async () => {},
      settled: async () => {},
      close: vi.fn(async () => {}),
    });
    const first = tab(() => new Promise<void>((_ok, no) => (fail = () => no(new Error("Fetch.enable failed")))));
    const second = tab(async () => {});
    vi.spyOn(CdpTab, "attach")
      .mockResolvedValueOnce(first as unknown as CdpTab)
      .mockResolvedValueOnce(second as unknown as CdpTab);
    const sessions = new CloudSessions(localLike(context));
    sessions.claim("job-1");
    const late = sessions.open("job-1", "cloud-1", "https://shop.example/", { onChange: () => {} }, () => true).catch(() => null);
    await expect.poll(() => typeof fail === "function" && sessions.page("cloud-1") !== null).toBe(true);
    await sessions.end();
    sessions.claim("job-2");
    await sessions.open("job-2", "cloud-1", "https://shop.example/", { onChange: () => {} });
    fail();
    await late;
    expect(first.close).toHaveBeenCalled();
    expect(second.close).not.toHaveBeenCalled();
    expect(sessions.page("cloud-1")).toBe(second);
    vi.restoreAllMocks();
  });

  it("on Quit, closes a connection still being prepared and stops a local browser still starting", async () => {
    const closed = vi.fn(async () => {});
    const preparing: CloudBrowser = {
      ...localLike({}),
      create: async () => ({
        id: null,
        // Its routes never go on.
        connect: async () => ({
          context: { route: () => new Promise(() => {}), on: () => {} } as unknown as BrowserContext,
          liveView: async () => null,
          close: closed,
        }),
      }),
    };
    const one = new CloudSessions(preparing);
    void one.withContext(async () => {}).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await one.quit()).toBe("ended");
    expect(closed).toHaveBeenCalledOnce();

    const stopped = vi.fn();
    const starting: CloudBrowser = {
      ...localLike({}),
      create: async () => ({
        id: null,
        connect: (stop) => new Promise((_ok, no) => stop.addEventListener("abort", () => (stopped(), no(new Error("stopped"))))),
      }),
    };
    const two = new CloudSessions(starting);
    void two.withContext(async () => {}).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await two.quit()).toBe("ended");
    expect(stopped).toHaveBeenCalledOnce();
  });
});
