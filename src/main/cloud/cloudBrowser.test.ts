import { describe, expect, it, vi } from "vitest";
import type { BrowserContext, Page } from "playwright-core";
import { CdpTab } from "../tools/CdpTab";
import { CloudSessions } from "./cloudBrowser";
import { NO_IDS, type CloudBrowser, type CloudIds } from "./cloudProvider";

// The session and its pages, whichever provider runs them.

const localLike = (context: object, released: () => void = () => {}): CloudBrowser => ({
  name: "local",
  release: async () => released(),
  releaseTagged: async () => released(),
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
    const theirs = { sessionId: "bb-1", tags: ["bb-tag"], madeBy: "browserbase" as const };
    const sessions = new CloudSessions(localLike(context, released), { ...NO_IDS, ...theirs }, { onIds: (ids) => kept.push(ids) });
    expect(sessions.canEnd).toBe(false);
    await sessions.withContext(async () => {});
    expect(await sessions.end()).toBe("ended");
    expect(released).not.toHaveBeenCalled();
    expect(kept.every((ids) => ids.sessionId === "bb-1" && ids.madeBy === "browserbase")).toBe(true);
  });

  it("keeps the tag of every session it asks for until it's known, and lets go of one the provider refused to make", async () => {
    const kept: CloudIds[] = [];
    let refuse = true;
    const browser: CloudBrowser = {
      ...localLike({}),
      name: "browserbase",
      releaseTagged: () => Promise.reject(new Error("Not in this test.")),
      create: async (_ids, hooks) => {
        const tag = hooks.tag();
        if (refuse) hooks.unused(tag);
        throw new Error("Browserbase answered 401.");
      },
    };
    const sessions = new CloudSessions(browser, NO_IDS, { onIds: (ids) => kept.push(ids) });
    await expect(sessions.withContext(async () => {})).rejects.toThrow("401");
    expect(kept.at(0)?.tags).toHaveLength(1);
    expect(kept.at(-1)).toEqual(NO_IDS);
    expect(sessions.canEnd).toBe(false);
    // One that may have been made is kept, and said to be unconfirmed once its release fails.
    refuse = false;
    await expect(sessions.withContext(async () => {})).rejects.toThrow("401");
    await expect.poll(() => sessions.unreleased).toBe(true);
    expect(kept.at(-1)?.tags).toHaveLength(1);
  });

  it("asks once for a release already on its way, and clears its problem once one is confirmed", async () => {
    const answers: { ok: () => void; fail: () => void }[] = [];
    const browser: CloudBrowser = {
      ...localLike({}),
      name: "browserbase",
      release: () => new Promise<void>((ok, fail) => answers.push({ ok, fail: () => fail(new Error("500")) })),
    };
    const sessions = new CloudSessions(browser, { ...NO_IDS, sessionId: "sess-1", madeBy: "browserbase" });
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
});
