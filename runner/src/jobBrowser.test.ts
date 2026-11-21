import { describe, expect, it } from "vitest";
import type { BrowserContext } from "playwright-core";
import { CloudSessions } from "../../src/main/cloud/cloudBrowser";
import { followLiveView, sessionBrowser } from "./job";

describe("the live view a job shows", () => {
  it("keeps the page asked for last when an earlier page's lookup answers after it", async () => {
    const answers = new Map<string, (url: string) => void>();
    const shown: string[] = [];
    const follow = followLiveView(
      (pageId) => new Promise((resolve) => answers.set(pageId, resolve)),
      (url) => shown.push(url),
    );
    const earlier = follow("page-a");
    const handoff = follow("page-b");
    answers.get("page-b")?.("https://www.browserbase.com/devtools/b");
    await handoff;
    answers.get("page-a")?.("https://www.browserbase.com/devtools/a");
    await earlier;
    expect(shown).toEqual(["https://www.browserbase.com/devtools/b"]);

    // No page, or an address that isn't Browserbase's, shows nothing, once.
    await follow(null);
    const elsewhere = follow("page-c");
    answers.get("page-c")?.("https://evil.example/");
    await elsewhere;
    expect(shown).toEqual(["https://www.browserbase.com/devtools/b", ""]);
  });
});

describe("a job's browser", () => {
  it("says it has ended only once its local browser has gone, and nothing can start in it again", async () => {
    let gone = () => {};
    const context = { route: async () => {}, on: () => {}, browser: () => null };
    const sessions = new CloudSessions({
      name: "local",
      origin: "local",
      release: async () => {},
      releaseTagged: async () => "none",
      create: async () => ({
        id: null,
        connect: async () => ({
          context: context as unknown as BrowserContext,
          liveView: async () => null,
          close: () => new Promise<void>((resolve) => (gone = resolve)),
        }),
      }),
    });
    await sessions.withContext(async () => {});
    let ended: boolean | null = null;
    void sessionBrowser(sessions)
      .end()
      .then((result) => (ended = result));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ended).toBeNull();
    gone();
    await expect.poll(() => ended).toBe(true);
    expect(sessions.claim("job-2")).toBe(false);
  });
});
