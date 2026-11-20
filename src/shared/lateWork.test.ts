import { describe, expect, it } from "vitest";
import { Latest, OneAtATime } from "./lateWork";

const later = <T = void>() => {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((yes, no) => ((resolve = yes), (reject = no)));
  return { promise, resolve, reject };
};

describe("Latest", () => {
  it("keeps only the newest turn current", () => {
    const latest = new Latest();
    const first = latest.next();
    expect(first.current).toBe(true);
    const second = latest.next();
    expect(first.current).toBe(false);
    expect(second.current).toBe(true);
    expect(second.id).not.toBe(first.id);
  });

  it("ends every turn without starting one, and starts again after", () => {
    const latest = new Latest();
    const turn = latest.next();
    latest.end();
    expect(turn.current).toBe(false);
    latest.end();
    expect(turn.current).toBe(false);
    expect(latest.next().current).toBe(true);
    expect(turn.current).toBe(false);
  });

  it("keeps each key's turns apart", () => {
    const latest = new Latest<string>();
    const a = latest.next("a");
    const b = latest.next("b");
    expect([a.current, b.current]).toEqual([true, true]);
    latest.next("a");
    expect([a.current, b.current]).toEqual([false, true]);
    latest.end("b");
    expect(b.current).toBe(false);
    // Ids never repeat across keys, so one sent out and back can't stand for another key's.
    expect(new Set([a.id, b.id, latest.next("b").id]).size).toBe(3);
  });
});

describe("OneAtATime", () => {
  it("starts at once with nothing out, and never runs two for one key", async () => {
    const queue = new OneAtATime<string>();
    let running = 0;
    let most = 0;
    const holds = [later(), later(), later()];
    const started: number[] = [];
    const work = (n: number) => async () => {
      started.push(n);
      most = Math.max(most, ++running);
      await holds[n]?.promise;
      running--;
      return n;
    };
    const first = queue.run(work(0), "a");
    expect(started).toEqual([0]);
    expect(queue.busy("a")).toBe(true);
    const second = queue.run(work(1), "a");
    // Asked from the first's own answer, as a caller resuming from it would.
    const third = first.then(() => queue.run(work(2), "a"));
    await Promise.resolve();
    expect(started).toEqual([0]);
    holds[0]?.resolve();
    await first;
    holds[1]?.resolve();
    await second;
    holds[2]?.resolve();
    expect(await third).toBe(2);
    expect(started).toEqual([0, 1, 2]);
    expect(most).toBe(1);
    expect(queue.busy("a")).toBe(false);
  });

  it("goes on after one that failed, and passes the failure to its own caller only", async () => {
    const queue = new OneAtATime();
    const failing = queue.run(() => Promise.reject(new Error("offline")));
    const next = queue.run(async () => "fine");
    await expect(failing).rejects.toThrow("offline");
    expect(await next).toBe("fine");
  });

  it("turns work that throws before it waits into a rejection", async () => {
    const queue = new OneAtATime();
    const throwing = (): Promise<void> => {
      throw new Error("at once");
    };
    await expect(queue.run(throwing)).rejects.toThrow("at once");
    expect(queue.busy()).toBe(false);
  });

  it("doesn't hold one key up behind another", () => {
    const queue = new OneAtATime<string>();
    const held = later();
    void queue.run(() => held.promise, "a");
    let ran = false;
    void queue.run(async () => void (ran = true), "b");
    expect(ran).toBe(true);
    held.resolve();
  });
});
