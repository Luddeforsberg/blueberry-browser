import { describe, expect, it, vi } from "vitest";
import { CdpTab } from "../tools/CdpTab";

vi.mock("electron", () => ({
  safeStorage: { isEncryptionAvailable: () => false, encryptString: Buffer.from, decryptString: String },
  app: { isPackaged: true },
}));

const { CloudSessions } = await import("./cloudBrowser");
const { attachTabs, fakeLocal, hooks, makeTabs, makeWindowTabs, tempFile } = await import("./cloudTabsTesting");

// How long a session nobody uses stays open.
const IDLE = 3 * 60_000;

describe("CloudTabs", () => {
  it("fits a cloud tab's page to the size the chrome shows it at, within limits, and ignores anything else", async () => {
    const fitTo = vi.fn(async () => {});
    vi.spyOn(CloudSessions.prototype, "page").mockImplementation((id) => (id === "tab-1" ? ({ id, fitTo } as unknown as CdpTab) : null));
    const tabs = makeTabs();

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

  it("never starts a tab's picture once the user has moved past it to another", async () => {
    const releases: (() => void)[] = [];
    const pages = new Map(
      ["tab-a", "tab-b", "tab-c"].map((id) => [
        id,
        { id, watch: vi.fn((onFrame: unknown) => (onFrame ? Promise.resolve() : new Promise<void>((resolve) => releases.push(resolve)))) },
      ]),
    );
    vi.spyOn(CloudSessions.prototype, "page").mockImplementation((id) => (pages.get(id) ?? null) as unknown as CdpTab);
    const tabs = makeTabs();
    await tabs.watch("tab-a");
    // A to B waits for A's picture to stop, and the user is on C before it has.
    const toB = tabs.watch("tab-b");
    const toC = tabs.watch("tab-c");
    releases.forEach((release) => release());
    await Promise.all([toB, toC]);
    expect(pages.get("tab-b")?.watch.mock.calls.filter(([onFrame]) => onFrame)).toEqual([]);
    expect(pages.get("tab-c")?.watch).toHaveBeenLastCalledWith(expect.any(Function));
    vi.restoreAllMocks();
  });

  it("asks the browser for a tab's pictures again after it wouldn't start them", async () => {
    const watch = vi.fn<(onFrame: unknown) => Promise<void>>().mockRejectedValueOnce(new Error("Page.startScreencast failed"));
    watch.mockResolvedValue();
    vi.spyOn(CloudSessions.prototype, "page").mockReturnValue({ id: "tab-a", watch } as unknown as CdpTab);
    const tabs = makeTabs();
    await tabs.watch("tab-a");
    await tabs.watch("tab-a");
    expect(watch.mock.calls.filter(([onFrame]) => onFrame)).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it("leaves the next window's tabs alone when a page for the last one finishes late, though their ids are the same", async () => {
    attachTabs();
    const local = fakeLocal();
    let opened = () => {};
    local.holdPages(new Promise((resolve) => (opened = resolve)));
    let count = 0;
    const { tabs, closeWindow } = makeWindowTabs(tempFile(), () => local.browser, { openTab: () => `tab-${++count}` });
    expect(tabs.claim("job-1")).toBe(true);
    const opening = tabs.open("job-1", "https://example.com/").catch(() => null);
    const checking = tabs.signedIn.check("github.com");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await closeWindow();
    // The next window's tab ids start again, so its own tab-1 and tab-2 are the user's.
    const next = { closeTab: vi.fn(), updateTab: vi.fn(), showTab: vi.fn() };
    tabs.attach(hooks(next));
    opened();
    expect(await opening).toBeNull();
    expect(await checking).toBe("The cloud browser couldn't open it.");
    expect(next.closeTab).not.toHaveBeenCalled();
    expect(next.updateTab).not.toHaveBeenCalled();
    expect(next.showTab).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("leaves a newer window's cloud running when an older window closes after it attached", async () => {
    attachTabs();
    const { tabs, closeWindow } = makeWindowTabs();
    expect(await tabs.signedIn.check("example.com")).toBeNull();
    const closeNext = tabs.attach(hooks());
    await closeWindow();
    expect(tabs.available()).toBe(true);
    expect(tabs.state.status).toBe("running");
    await closeNext();
    expect(tabs.available()).toBe(false);
    expect(tabs.state.status).toBe("ended");
    vi.restoreAllMocks();
  });

  it("lets the session wind down only once the last tab the user has there closes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    attachTabs();
    let opened = 0;
    const tabs = makeTabs(tempFile(), undefined, { openTab: () => `tab-${++opened}` });
    expect(await tabs.signedIn.check("example.com")).toBeNull();
    expect(await tabs.signedIn.check("github.com")).toBeNull();

    tabs.tabClosed("tab-1");
    await vi.advanceTimersByTimeAsync(IDLE);
    expect(tabs.state.status).toBe("running");
    tabs.tabClosed("tab-2");
    await vi.advanceTimersByTimeAsync(IDLE);
    expect(tabs.state.status).toBe("ended");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps a sign-in check only while its window and the session it opened in are still there", async () => {
    const pages = attachTabs();
    const local = fakeLocal();
    let opened = () => {};
    local.holdPages(new Promise((resolve) => (opened = resolve)));
    const { tabs, closeWindow } = makeWindowTabs(tempFile(), () => local.browser);
    // The window closes while it opens, and the next one attaches.
    const checking = tabs.signedIn.check("example.com");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await closeWindow();
    tabs.attach(hooks());
    opened();
    expect(await checking).toBe("The cloud browser couldn't open it.");
    // Nothing of it is in the next window's cloud.
    expect(await tabs.view("tab-1")).toEqual({ kind: "gone" });
    expect(tabs.takeOver("tab-1")).toBe(false);
    expect(pages.size).toBe(0);
    vi.restoreAllMocks();
  });

  it("closes a sign-in check's page when its tab is closed while it opens, and lets the session wind down", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pages = attachTabs();
    const local = fakeLocal();
    let opened = () => {};
    local.holdPages(new Promise((resolve) => (opened = resolve)));
    const tabs = makeTabs(tempFile(), () => local.browser);
    const checking = tabs.signedIn.check("example.com");
    await vi.advanceTimersByTimeAsync(0);
    const closedBefore = pages.get("tab-1")?.close.mock.calls.length ?? 0;
    tabs.tabClosed("tab-1");
    opened();
    expect(await checking).toBeNull();

    expect(pages.get("tab-1")?.close.mock.calls.length).toBe(closedBefore + 1);
    expect(tabs.takeOver("tab-1")).toBe(false);
    await vi.advanceTimersByTimeAsync(IDLE);
    expect(tabs.state.status).toBe("ended");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("gives Quit one promise to wait for, which ends once the session has, and never closes a tab on the way", async () => {
    let ended = () => {};
    const quitting = vi
      .spyOn(CloudSessions.prototype, "quit")
      .mockImplementation(() => new Promise<"ended">((resolve) => (ended = () => resolve("ended"))));
    const closeTab = vi.fn();
    const tabs = makeTabs(tempFile(), undefined, { closeTab });
    const closing = tabs.quit();
    expect(tabs.quit()).toBe(closing);
    let done = false;
    void closing.then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(quitting).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    ended();
    await closing;
    expect(closeTab).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
