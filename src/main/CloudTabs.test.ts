import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CdpTab } from "./CdpTab";

vi.mock("electron", () => ({ safeStorage: { isEncryptionAvailable: () => false }, app: { isPackaged: true } }));

const { CloudSessions } = await import("./cloudBrowser");
const { CloudTabs } = await import("./CloudTabs");

const makeTabs = () =>
  new CloudTabs(
    join(mkdtempSync(join(tmpdir(), "cloud-tabs-")), "cloud.json"),
    {
      chrome: () => ({ isDestroyed: () => true }) as never,
      openTab: () => "tab-1",
      updateTab: () => {},
      closeTab: () => {},
      takenOver: () => {},
      showTab: () => {},
      confirmLogin: async () => true,
      readCookies: async () => [],
    },
    { endpoint: "http://127.0.0.1:1" }
  );

describe("CloudTabs", () => {
  it("fits a cloud tab's page to the size the chrome shows it at, within limits, and ignores anything else", async () => {
    const fitTo = vi.fn(async () => {});
    vi.spyOn(CloudSessions.prototype, "page").mockImplementation((id) => (id === "tab-1" ? ({ id, fitTo } as unknown as CdpTab) : null));
    const tabs = makeTabs();
    tabs.start();

    await tabs.fit("tab-1", 1227.6, 902.2);
    expect(fitTo).toHaveBeenLastCalledWith(1228, 902);
    await tabs.fit("tab-1", 0, 0);
    expect(fitTo).toHaveBeenLastCalledWith(320, 200);
    await tabs.fit("tab-1", 99_999, 99_999);
    expect(fitTo).toHaveBeenLastCalledWith(3840, 2160);
    fitTo.mockClear();
    await tabs.fit("tab-2", 800, 600);
    await tabs.fit("tab-1", "800", 600);
    await tabs.fit("tab-1", Number.NaN, 600);
    await tabs.fit("tab-1", 800, Number.POSITIVE_INFINITY);
    expect(fitTo).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("keeps a page's size while a job works in it, and fits it to the latest size once the job lets go or the user takes over", async () => {
    const fitTo = vi.fn(async () => {});
    let working: string | null = "job-1";
    vi.spyOn(CloudSessions.prototype, "page").mockImplementation((id) => ({ id, fitTo }) as unknown as CdpTab);
    vi.spyOn(CloudSessions.prototype, "usedBy").mockImplementation(() => working);
    vi.spyOn(CloudSessions.prototype, "pagesOf").mockImplementation((jobId) => (jobId === "job-1" ? [{ id: "tab-1" } as CdpTab] : []));
    vi.spyOn(CloudSessions.prototype, "release").mockImplementation(() => {
      working = null;
    });
    const tabs = makeTabs();
    tabs.start();

    await tabs.fit("tab-1", 800, 600);
    await tabs.fit("tab-1", 1000, 700);
    expect(fitTo).not.toHaveBeenCalled();
    tabs.release("job-1");
    await vi.waitFor(() => expect(fitTo).toHaveBeenCalledTimes(1));
    expect(fitTo).toHaveBeenCalledWith(1000, 700);

    // A job working there again, and the user taking the page from it.
    working = "job-2";
    await tabs.fit("tab-2", 900, 500);
    expect(fitTo).toHaveBeenCalledTimes(1);
    tabs.takeOver("tab-2");
    await vi.waitFor(() => expect(fitTo).toHaveBeenCalledTimes(2));
    expect(fitTo).toHaveBeenLastCalledWith(900, 500);
    // Once it's the user's, it follows at once.
    await tabs.fit("tab-2", 950, 550);
    expect(fitTo).toHaveBeenLastCalledWith(950, 550);
    vi.restoreAllMocks();
  });

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
