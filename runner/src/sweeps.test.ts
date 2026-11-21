import { describe, expect, it, vi } from "vitest";
import { Sweeps } from "./sweeps";

describe("Sweeps", () => {
  it("waits, when told to stop, for a look on its way, and starts no other", async () => {
    let finish = () => {};
    const sweep = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const stop = new AbortController();
    const sweeps = new Sweeps({ sweep, linked: () => true, stop: stop.signal, sleep: async () => {} });
    void sweeps.run();
    await expect.poll(() => sweep.mock.calls.length).toBe(1);
    stop.abort();
    let waited = false;
    const quitting = sweeps.inFlight.then(() => (waited = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(waited).toBe(false);
    finish();
    await quitting;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it("looks only once linked, one look at a time", async () => {
    let linked = false;
    let running = 0;
    let most = 0;
    const sweep = vi.fn(async () => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
    });
    const stop = new AbortController();
    void new Sweeps({
      sweep,
      linked: () => linked,
      stop: stop.signal,
      sleep: () => new Promise((resolve) => setTimeout(resolve, 1)),
    }).run();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sweep).not.toHaveBeenCalled();
    linked = true;
    await expect.poll(() => sweep.mock.calls.length).toBeGreaterThan(2);
    stop.abort();
    expect(most).toBe(1);
  });
});
