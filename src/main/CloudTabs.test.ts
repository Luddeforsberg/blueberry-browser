import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CdpTab } from "./CdpTab";

vi.mock("electron", () => ({ safeStorage: { isEncryptionAvailable: () => false }, app: { isPackaged: true } }));

const { CloudSessions } = await import("./cloudBrowser");
const { CloudTabs } = await import("./CloudTabs");

describe("CloudTabs", () => {
  it("lets the session wind down only once the last tab the user has there closes", async () => {
    let opened = 0;
    vi.spyOn(CloudSessions.prototype, "openForUser").mockImplementation(async (id) => ({ id, url: "https://example.com/" }) as CdpTab);
    vi.spyOn(CloudSessions.prototype, "close").mockResolvedValue();
    const winding = vi.spyOn(CloudSessions.prototype, "endWhenIdle").mockImplementation(() => {});
    const tabs = new CloudTabs(
      join(mkdtempSync(join(tmpdir(), "cloud-tabs-")), "cloud.json"),
      {
        chrome: () => ({ isDestroyed: () => true }) as never,
        openTab: () => `tab-${++opened}`,
        updateTab: () => {},
        closeTab: () => {},
        takenOver: () => {},
        showTab: () => {},
        confirmLogin: async () => true,
        readCookies: async () => [],
      },
      { endpoint: "http://127.0.0.1:1" }
    );
    tabs.start();
    expect(await tabs.checkLogin("example.com")).toBeNull();
    expect(await tabs.checkLogin("github.com")).toBeNull();

    tabs.tabClosed("tab-1");
    expect(winding).not.toHaveBeenCalled();
    tabs.tabClosed("tab-2");
    expect(winding).toHaveBeenCalledTimes(1);
  });

  it("gives Quit one promise to wait for, which ends once the session has, and never closes a tab on the way", async () => {
    let ended = () => {};
    const ending = vi.spyOn(CloudSessions.prototype, "end").mockImplementation(() => new Promise<void>((resolve) => (ended = resolve)));
    const closeTab = vi.fn();
    const tabs = new CloudTabs(
      join(mkdtempSync(join(tmpdir(), "cloud-tabs-")), "cloud.json"),
      {
        chrome: () => ({ isDestroyed: () => true }) as never,
        openTab: () => "tab-1",
        updateTab: () => {},
        closeTab,
        takenOver: () => {},
        showTab: () => {},
        confirmLogin: async () => true,
        readCookies: async () => [],
      },
      { endpoint: "http://127.0.0.1:1" }
    );
    tabs.start();
    // As when the window closes, and then Quit asks again.
    const closing = tabs.destroy();
    expect(tabs.destroy()).toBe(closing);
    let done = false;
    void closing.then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ending).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    ended();
    await closing;
    expect(closeTab).not.toHaveBeenCalled();
  });
});
