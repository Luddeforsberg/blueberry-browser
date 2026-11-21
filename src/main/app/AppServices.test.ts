import { describe, expect, it, vi } from "vitest";
import type { WindowParts } from "../window/WindowParts";
import type { AppStores } from "./appStores";

vi.mock("electron", () => ({ app: { isPackaged: true } }));

// Each service as a set of counters, so the test sees what was started and ended, and how often.
const made = vi.hoisted(() => {
  const counted = (...names: string[]) => {
    const calls: Record<string, number> = {};
    const service = Object.fromEntries(names.map((name) => [name, () => void (calls[name] = (calls[name] ?? 0) + 1)]));
    return { calls, service };
  };
  return {
    telegram: counted("start", "close", "listen"),
    mcp: counted("start", "close"),
    chats: counted("stopAll"),
    runnerJobs: counted("destroy"),
    cloud: { attached: 0, left: 0, quits: 0 },
  };
});

vi.mock("./makeAccount", () => ({
  createAccount: () => ({}),
  createGallery: () => ({}),
  createTelegram: () => made.telegram.service,
}));
vi.mock("./makeChats", () => ({ createChats: () => made.chats.service, createMemory: () => ({}) }));
vi.mock("./makeCloud", () => ({
  createCloud: () => ({
    attach: () => {
      made.cloud.attached++;
      return () => Promise.resolve(void made.cloud.left++);
    },
    quit: () => Promise.resolve(void made.cloud.quits++),
  }),
  createRunnerJobs: () => made.runnerJobs.service,
}));
vi.mock("../window/makeCloud", () => ({ cloudHooks: () => ({}) }));
vi.mock("./makeSuggestions", () => ({ createMcp: () => made.mcp.service, createSuggestions: () => ({}) }));

const { AppServices } = await import("./AppServices");

describe("AppServices", () => {
  it("ends every service once on Quit, whether the window closes after it or had closed before", async () => {
    const services = new AppServices({} as AppStores, "folder");
    const first = {} as WindowParts;
    services.windowOpened(first);
    // A Mac: the window closes, and Quit comes later with none open.
    services.windowClosed(first);
    await services.quit();
    expect(made.telegram.calls.close).toBe(1);
    expect(made.mcp.calls.close).toBe(1);
    expect(made.cloud).toEqual({ attached: 1, left: 1, quits: 1 });
    expect(made.runnerJobs.calls.destroy).toBe(1);

    const again = new AppServices({} as AppStores, "folder");
    const second = {} as WindowParts;
    again.windowOpened(second);
    // Quit with the window open, which then closes, and Quit asked again.
    const quitting = again.quit();
    // The window's own close stops its jobs, after its routines have noted what was cut short.
    expect(made.chats.calls.stopAll).toBe(1);
    again.windowClosed(second);
    expect(again.quit()).toBe(quitting);
    await quitting;
    expect(made.telegram.calls.close).toBe(2);
    expect(made.mcp.calls.close).toBe(2);
    expect(made.chats.calls.stopAll).toBe(2);
    expect(made.cloud).toEqual({ attached: 2, left: 2, quits: 2 });
    expect(made.runnerJobs.calls.destroy).toBe(2);
    expect(services.window).toBeNull();
  });
});
