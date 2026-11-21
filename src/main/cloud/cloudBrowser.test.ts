import { describe, expect, it, vi } from "vitest";
import type { BrowserContext, Page } from "playwright-core";
import { CdpTab } from "../tools/CdpTab";
import { CloudSessions } from "./cloudBrowser";
import type { CloudBrowser } from "./cloudProvider";

// The session and its pages, whichever provider runs them.

const localLike = (context: object, released: () => void = () => {}): CloudBrowser => ({
  name: "local",
  release: async () => released(),
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
});
