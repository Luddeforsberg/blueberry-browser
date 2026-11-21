import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BrowserContext } from "playwright-core";
import { CdpTab } from "../tools/CdpTab";
import { KeyRefused, type CloudBrowser } from "./cloudProvider";
import type { CloudTabsHooks } from "./CloudTabs";

const encryption = vi.hoisted(() => ({ available: false }));
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryption.available,
    encryptString: (text: string) => Buffer.from(text),
    decryptString: (sealed: Buffer) => sealed.toString(),
  },
  app: { isPackaged: true },
}));

const { CloudSessions } = await import("./cloudBrowser");
const { CloudTabs } = await import("./CloudTabs");

// Makes the cloud browser for a key, as makeCloud.ts does.
type Provider = ConstructorParameters<typeof CloudTabs>[1];

// How long a session nobody uses stays open.
const IDLE = 3 * 60_000;

const tempFile = () => join(mkdtempSync(join(tmpdir(), "cloud-tabs-")), "cloud.json");

// A browser whose pages open when `opened` says so, standing in for the local one.
const fakeLocal = () => {
  let opened: Promise<void> = Promise.resolve();
  const context = {
    route: async () => {},
    on: () => {},
    browser: () => null,
    newPage: async () => (await opened, { on: () => {}, close: async () => {} }),
  };
  const browser: CloudBrowser = {
    name: "local",
    release: async () => {},
    create: async () => ({
      id: null,
      connect: async () => ({ context: context as unknown as BrowserContext, liveView: async () => null, close: async () => {} }),
    }),
  };
  return { browser, holdPages: (until: Promise<void>) => void (opened = until) };
};

const attachTabs = () => {
  const tabs = new Map<string, { close: ReturnType<typeof vi.fn> }>();
  vi.spyOn(CdpTab, "attach").mockImplementation(async (id) => {
    const tab = {
      id,
      url: "https://example.com/",
      title: "",
      isClosed: false,
      loadURL: async () => {},
      settled: async () => {},
      close: vi.fn(async () => {}),
    };
    tabs.set(id, tab);
    return tab as unknown as CdpTab;
  });
  return tabs;
};

const hooks = (over: Partial<CloudTabsHooks> = {}): CloudTabsHooks => ({
  chrome: () => ({ isDestroyed: () => true }) as never,
  openTab: () => "tab-1",
  updateTab: () => {},
  closeTab: () => {},
  takenOver: () => {},
  showTab: () => {},
  confirmLogin: async () => true,
  ...over,
});

const makeTabs = (file = tempFile(), provider: Provider = () => fakeLocal().browser, over: Partial<CloudTabsHooks> = {}) => {
  const tabs = new CloudTabs(file, provider, async () => []);
  tabs.attach(hooks(over));
  return tabs;
};

// Sealed as the mocked safeStorage seals, which is no more than base64.
const sealed = (text: string) => Buffer.from(text).toString("base64");
const OLD = { apiKey: sealed("bb_old"), projectId: sealed("proj"), contextId: "ctx-1", sessionId: "sess-1" };

// Browserbase as far as releasing goes, answering as `answer.now` says, and noting the key each release used.
const releasing = () => {
  const answer: { now: "ok" | "fails" | "refused" } = { now: "fails" };
  const calls: string[] = [];
  const provider: Provider = ({ apiKey }) =>
    apiKey
      ? {
          name: "browserbase",
          create: async () => Promise.reject(new Error("Not in this test.")),
          release: async (id) => {
            calls.push(`${apiKey} ${id}`);
            if (answer.now === "fails") throw new Error("Browserbase answered 500.");
            if (answer.now === "refused") throw new KeyRefused("Browserbase refused the API key.");
          },
        }
      : null;
  return { answer, calls, provider };
};

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

  it("keeps the key, and the session's id, until the session it may still be running on has ended", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const saved = () => JSON.parse(readFileSync(file, "utf8")) as Record<string, string | null>;
    const { answer, calls, provider } = releasing();
    const tabs = makeTabs(file, provider);
    expect((await tabs.saveKey("bb_new", "proj")).problem).toMatch(/didn't confirm it ended/);
    expect((await tabs.forget()).problem).toMatch(/didn't confirm it ended/);
    expect(saved()).toEqual(OLD);

    answer.now = "ok";
    expect((await tabs.saveKey("bb_new", "proj")).problem).toBeNull();
    expect(saved()).toEqual({ apiKey: sealed("bb_new"), projectId: sealed("proj"), contextId: null, sessionId: null });
    expect(calls).toEqual(["bb_old sess-1", "bb_old sess-1", "bb_old sess-1"]);
    encryption.available = false;
  });

  it("takes a new key, or forgets one, when Browserbase no longer takes the old one, keeping its session for the new key", async () => {
    encryption.available = true;
    const file = tempFile();
    writeFileSync(file, JSON.stringify(OLD));
    const saved = () => JSON.parse(readFileSync(file, "utf8")) as Record<string, string | null>;
    const { answer, calls, provider } = releasing();
    answer.now = "refused";
    const tabs = makeTabs(file, provider);
    await tabs.saveKey("bb_new", "proj");
    expect(saved()).toEqual({ apiKey: sealed("bb_new"), projectId: sealed("proj"), contextId: null, sessionId: "sess-1" });
    // Ended once more, with the new key.
    expect(calls).toEqual(["bb_old sess-1", "bb_new sess-1"]);
    expect((await tabs.forget()).problem).toMatch(/ends on its own within an hour/);
    expect(saved()).toEqual({ apiKey: null, projectId: null, contextId: null, sessionId: null });
    encryption.available = false;
  });

  it("lets the session wind down only once the last tab the user has there closes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    attachTabs();
    let opened = 0;
    const tabs = makeTabs(tempFile(), undefined, { openTab: () => `tab-${++opened}` });
    expect(await tabs.checkLogin("example.com")).toBeNull();
    expect(await tabs.checkLogin("github.com")).toBeNull();

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
    const tabs = makeTabs(tempFile(), () => local.browser);
    // The window closes while it opens, and the next one attaches.
    const checking = tabs.checkLogin("example.com");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tabs.detach();
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
    const checking = tabs.checkLogin("example.com");
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
    const quitting = vi.spyOn(CloudSessions.prototype, "quit").mockImplementation(() => new Promise<void>((resolve) => (ended = resolve)));
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
