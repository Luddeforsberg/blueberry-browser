import { describe, expect, it, vi } from "vitest";
import type { App } from "electron";
import { holdQuit } from "./holdQuit";

// Electron's app, as far as Quit goes: each quit fires `before-quit`, and quits unless a listener prevents it.
const fakeApp = () => {
  const listeners: ((event: { preventDefault: () => void }) => void)[] = [];
  const quits = { asked: 0, done: 0 };
  const app = {
    on: (_name: string, listener: (event: { preventDefault: () => void }) => void) => listeners.push(listener),
    quit: () => {
      quits.asked++;
      let prevented = false;
      listeners.forEach((listener) => listener({ preventDefault: () => (prevented = true) }));
      if (!prevented) quits.done++;
    },
  };
  return { app: app as unknown as Pick<App, "on" | "quit">, quits };
};

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};

describe("holdQuit", () => {
  it("waits for the work once, then quits", async () => {
    const { app, quits } = fakeApp();
    const ending = deferred();
    const work = vi.fn(() => ending.promise);
    holdQuit(app, work, 60_000);
    app.quit();
    expect(quits).toEqual({ asked: 1, done: 0 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(quits.done).toBe(0);
    ending.resolve();
    await vi.waitFor(() => expect(quits.done).toBe(1));
    expect(work).toHaveBeenCalledTimes(1);
    // A quit after that isn't held again.
    app.quit();
    expect(quits.done).toBe(2);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("quits anyway when the work never ends, or fails", async () => {
    const hanging = fakeApp();
    holdQuit(hanging.app, () => new Promise(() => {}), 20);
    hanging.app.quit();
    expect(hanging.quits.done).toBe(0);
    await vi.waitFor(() => expect(hanging.quits.done).toBe(1));

    const failing = fakeApp();
    holdQuit(failing.app, () => Promise.reject(new Error("no")), 60_000);
    failing.app.quit();
    await vi.waitFor(() => expect(failing.quits.done).toBe(1));

    const throwing = fakeApp();
    holdQuit(throwing.app, () => {
      throw new Error("no");
    }, 60_000);
    throwing.app.quit();
    await vi.waitFor(() => expect(throwing.quits.done).toBe(1));
  });
});
