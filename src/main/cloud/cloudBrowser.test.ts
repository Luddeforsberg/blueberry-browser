import { describe, expect, it, vi } from "vitest";
import type { BrowserContext, Page } from "playwright-core";
import { CdpTab } from "../tools/CdpTab";
import { CloudSessions, type CloudBrowser } from "./cloudBrowser";

// The session and its pages, whichever provider runs them.

describe("CloudSessions", () => {
  it("starts a session for a change to its cookies, ends it after a while if nobody else is in it, and never under the user", async () => {
    let released = 0;
    const context = { route: async () => {}, on: () => {}, browser: () => null };
    const provider: CloudBrowser = {
      name: "local",
      hasSession: true,
      release: async () => void released++,
      start: async () => ({ context: context as unknown as BrowserContext, liveView: async () => null, close: async () => {} }),
    };
    const sessions = new CloudSessions(provider, () => {}, 20);

    expect(await sessions.withContext(async (got) => got === (context as unknown))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(released).toBe(1);

    // Running with no timer, as with the user in a tab they took over.
    await sessions.withContext(async () => {});
    sessions.keepOpen();
    await sessions.withContext(async () => {});
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(released).toBe(1);
  });

  it("closes the page it made when a limited mascot's limit couldn't be put on it", async () => {
    const page = { on: () => {} } as unknown as Page;
    const context = { route: async () => {}, on: () => {}, browser: () => null, newPage: async () => page };
    const provider: CloudBrowser = {
      name: "local",
      hasSession: true,
      release: async () => {},
      start: async () => ({ context: context as unknown as BrowserContext, liveView: async () => null, close: async () => {} }),
    };
    const tab = {
      id: "cloud-1",
      isClosed: false,
      withNavigationLimit: async () => Promise.reject(new Error("Fetch.enable failed")),
      close: vi.fn(async () => {}),
    };
    vi.spyOn(CdpTab, "attach").mockResolvedValue(tab as unknown as CdpTab);
    const sessions = new CloudSessions(provider);
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
