import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LATE_AFTER_MS, MAX_ACTIVE_RUNS, Routines, type RoutineEvents } from "./Routines";
import { RoutineStore } from "./RoutineStore";
import type { TaskProgress, TaskResult } from "./Chats";
import type { MascotProfile } from "../shared/library";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const NOW = new Date(2026, 10, 2, 12, 0).getTime();

interface FakeRun {
  id: string;
  message: string;
  progress: (progress: TaskProgress) => void;
  end: (result?: Partial<TaskResult>) => void;
}

const setup = (store = new RoutineStore(":memory:"), cloud: Pick<RoutineEvents, "stillInCloud" | "cloudFailed"> = {}) => {
  const started: FakeRun[] = [];
  const stoppedIds: string[] = [];
  const runner = {
    runTask: (id: string, message: string, progress: (progress: TaskProgress) => void) =>
      new Promise<TaskResult>((resolve) => {
        started.push({
          id,
          message,
          progress,
          end: (result = {}) =>
            resolve({ text: "done", steps: [], error: null, stopped: false, tokens: 10, tabIds: [], ...result }),
        });
      }),
    stop: (id: string) => {
      stoppedIds.push(id);
    },
  };
  const events = {
    onChanged: vi.fn(),
    onAttention: vi.fn(),
    closeTab: vi.fn(),
    ...cloud,
  } satisfies RoutineEvents;
  const routines = new Routines(store, runner, events);
  return { store, routines, started, stoppedIds, events };
};

const daily = (time = "13:00", name = "Watch") => ({ name, instructions: "Look", schedule: { kind: "daily" as const, time } });

const save = (routines: Routines, draft: unknown, id: string | null = null): string => {
  const result = routines.save(id, draft);
  if (!result.ok) throw new Error(result.error);
  return result.id;
};

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

// As a computer waking from sleep sees it: the clock has moved, and the timers then run.
const jump = async (ms: number) => {
  vi.setSystemTime(Date.now() + ms);
  await vi.advanceTimersByTimeAsync(MINUTE);
};

let open: Routines[] = [];
const started = (routines: Routines) => {
  open.push(routines);
  routines.start();
  return routines;
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  open = [];
});

afterEach(() => {
  open.forEach((routines) => routines.shutdown());
  vi.useRealTimers();
});

describe("the scheduler", () => {
  it("runs a routine at its time, on time, and sets the next", async () => {
    const { routines, store, started: runs } = setup();
    const id = save(routines, daily("13:00"));
    started(routines);

    await vi.advanceTimersByTimeAsync(59 * MINUTE);
    expect(runs).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(runs).toHaveLength(1);
    expect(runs[0].message).toContain("Look");

    runs[0].end();
    await flush();
    expect(store.latestRun(id)).toMatchObject({ status: "finished", result: "done", lateFor: null, tokens: 10, seen: false });
    expect(store.routine(id)?.nextRunAt).toBe(NOW + 60 * MINUTE + DAY);
  });

  it("leaves a routine that runs in the cloud to the cloud, and only moves it on to its next time here", async () => {
    const { routines, store, started: runs } = setup();
    const id = save(routines, { ...daily("13:00"), inCloud: true, sites: ["shop.example"] });
    started(routines);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(runs).toHaveLength(0);
    // Never moved on here, since the cloud has its real time. The page works it out from the schedule.
    expect(store.routine(id)?.nextRunAt).toBe(NOW + 60 * MINUTE);
    expect(routines.list()[0]).toMatchObject({ nextRunAt: NOW + 60 * MINUTE + DAY, status: "idle" });

    // What goes to the cloud: its bird narrowed to the routine's sites, and no next time once it's paused.
    const scout = (): MascotProfile => ({ id: "m-1", name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Find.", sites: [], tools: ["visit"], deletedAt: null });
    const options = { actionApproval: "risky", contextId: "ctx-1", timeZone: "Europe/Stockholm" } as const;
    const [row] = routines.cloudRows(scout, options);
    expect(row).toMatchObject({ key: id, mascot: { id: "m-1", sites: ["shop.example"] }, schedule: { kind: "daily", time: "13:00" }, timeZone: "Europe/Stockholm", paused: false, firstRunAt: new Date(NOW + 60 * MINUTE + DAY).toISOString() });
    expect(row.prompt).toContain("Look");
    routines.setPaused(id, true);
    expect(routines.cloudRows(scout, options)[0]).toMatchObject({ paused: true, firstRunAt: null });
    save(routines, daily("13:00", "Here"));
    expect(routines.cloudRows(scout, options)).toHaveLength(1);
  });

  it("doesn't run a routine moved back from the cloud until it's gone from there, so the two never both run it", async () => {
    let there = true;
    const { routines, store, started: runs } = setup(undefined, { stillInCloud: () => there });
    const id = save(routines, { ...daily("13:00"), inCloud: true });
    save(routines, daily("13:00"), id);
    started(routines);
    expect(routines.list()[0].cloudNote).toBe("Moving back to this Mac…");

    // Its time comes while the cloud may still run it: skipped here, and on to the next.
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(runs).toHaveLength(0);
    expect(store.routine(id)?.nextRunAt).toBe(NOW + 60 * MINUTE + DAY);

    there = false;
    routines.cloudChanged();
    expect(routines.list()[0].cloudNote).toBeNull();
    await jump(DAY);
    expect(runs).toHaveLength(1);
  });

  it("keeps a routine that only runs when asked out of the cloud", () => {
    const { routines } = setup();
    save(routines, { name: "Ask me", instructions: "Look", schedule: { kind: "manual" }, inCloud: true });
    expect(routines.list()[0].inCloud).toBe(false);
    expect(routines.cloudRows(() => { throw new Error("not asked"); }, { actionApproval: "risky", contextId: null, timeZone: "UTC" })).toEqual([]);
  });

  it("says when a routine couldn't be sent to the cloud", () => {
    const { routines } = setup(undefined, { cloudFailed: () => true });
    save(routines, { ...daily("13:00"), inCloud: true });
    expect(routines.list()[0].cloudNote).toBe("Couldn’t reach the cloud, will retry");
  });

  it("runs a missed routine once when the app opens and says it was late, however many it missed", async () => {
    const store = new RoutineStore(":memory:");
    const first = setup(store);
    const id = save(first.routines, daily("13:00"));
    const dueAt = store.routine(id)!.nextRunAt!;
    first.routines.shutdown();

    vi.setSystemTime(dueAt + 3 * DAY);
    const second = setup(store);
    started(second.routines);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(second.started).toHaveLength(1);
    second.started[0].end();
    await vi.advanceTimersByTimeAsync(10 * MINUTE);

    expect(second.started).toHaveLength(1);
    expect(store.latestRun(id)?.lateFor).toBe(dueAt);
    expect(store.routine(id)?.nextRunAt).toBeGreaterThan(Date.now());
  });

  it("only calls a run late past the limit", async () => {
    const store = new RoutineStore(":memory:");
    const first = setup(store);
    const atLimit = save(first.routines, daily("13:00", "On the limit"));
    const pastLimit = save(first.routines, daily("12:59", "Past it"));
    const dueAt = store.routine(atLimit)!.nextRunAt!;
    first.routines.shutdown();

    // 5 seconds is how long the first look waits.
    vi.setSystemTime(dueAt + LATE_AFTER_MS - 5_000);
    const second = setup(store);
    started(second.routines);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(second.started).toHaveLength(2);
    expect(store.latestRun(atLimit)?.lateFor).toBeNull();
    expect(store.latestRun(pastLimit)?.lateFor).not.toBeNull();
  });

  it("runs a missed one-off once, then never again", async () => {
    const store = new RoutineStore(":memory:");
    const first = setup(store);
    const at = NOW + MINUTE;
    const id = save(first.routines, { name: "Once", instructions: "Look", schedule: { kind: "once", at } });
    first.routines.shutdown();

    vi.setSystemTime(at + DAY);
    const second = setup(store);
    started(second.routines);
    await vi.advanceTimersByTimeAsync(10_000);
    second.started[0].end();
    await jump(2 * DAY);

    expect(second.started).toHaveLength(1);
    expect(store.latestRun(id)?.lateFor).toBe(at);
    expect(store.routine(id)?.nextRunAt).toBeNull();
  });

  it("never runs a routine twice at once, and skips the times that pass while it's going", async () => {
    const { routines, store, started: runs } = setup();
    const id = save(routines, daily("13:00"));
    started(routines);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(runs).toHaveLength(1);

    expect(routines.runNow(id)).toBe(false);
    await jump(2 * DAY);
    expect(runs).toHaveLength(1);
    expect(store.routine(id)?.nextRunAt).toBeGreaterThan(Date.now());

    runs[0].end();
    await flush();
    expect(runs).toHaveLength(1);
    expect(store.runs(id)).toHaveLength(1);
  });

  it("tells the page the next time when one passes during a run", async () => {
    const { routines, started: runs, events } = setup();
    save(routines, daily("13:00"));
    started(routines);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(runs).toHaveLength(1);

    events.onChanged.mockClear();
    await jump(DAY);
    expect(runs).toHaveLength(1);
    expect(events.onChanged).toHaveBeenCalled();
  });

  it("limits how many work at once, and the rest wait their turn", async () => {
    const { routines, started: runs } = setup();
    const ids = Array.from({ length: MAX_ACTIVE_RUNS + 1 }, (_, index) => save(routines, daily("13:00", `R${index}`)));
    started(routines);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);

    expect(runs).toHaveLength(MAX_ACTIVE_RUNS);
    expect(routines.list().find((routine) => routine.id === ids[MAX_ACTIVE_RUNS])?.status).toBe("queued");

    runs[0].end();
    await flush();
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS + 1);
  });

  it("doesn't let a run waiting for an OK hold a place", async () => {
    const { routines, started: runs } = setup();
    for (let index = 0; index <= MAX_ACTIVE_RUNS; index++) save(routines, daily("13:00", `R${index}`));
    started(routines);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS);

    runs[0].progress({ steps: [], approval: { id: "a", text: "Delete it" }, tokens: 0 });
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS + 1);
  });

  it("queues Run now when every place is taken", async () => {
    const { routines, started: runs } = setup();
    const ids = [save(routines, daily("23:00", "A")), save(routines, daily("23:00", "B")), save(routines, daily("23:00", "C"))];
    started(routines);
    ids.forEach((id) => expect(routines.runNow(id)).toBe(true));
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS);
    expect(routines.list()[2].status).toBe("queued");

    runs[1].end();
    await flush();
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS + 1);
  });

  it("drops a queued Run now that's cancelled, so it never starts", async () => {
    const { routines, started: runs } = setup();
    const ids = [save(routines, daily("23:00", "A")), save(routines, daily("23:00", "B")), save(routines, daily("23:00", "C"))];
    started(routines);
    ids.forEach((id) => routines.runNow(id));
    expect(routines.cancelRequest(ids[2])).toBe(true);
    expect(routines.cancelRequest(ids[2])).toBe(false);
    expect(routines.list()[2].status).not.toBe("queued");

    runs[1].end();
    await flush();
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS);
  });

  it("leaves a paused routine alone, and resuming doesn't catch up", async () => {
    const { routines, store, started: runs } = setup();
    const id = save(routines, daily("13:00"));
    started(routines);
    routines.setPaused(id, true);
    await jump(2 * DAY);
    expect(runs).toHaveLength(0);
    expect(routines.list()[0].status).toBe("paused");

    routines.setPaused(id, false);
    await flush();
    expect(runs).toHaveLength(0);
    expect(store.routine(id)?.nextRunAt).toBeGreaterThan(Date.now());
    expect(routines.runNow(id)).toBe(true);
    expect(runs).toHaveLength(1);
  });

  it("keeps a set time on an edit that doesn't change it, and refuses a one-off in the past", () => {
    const { routines, store } = setup();
    const id = save(routines, daily("13:00"));
    const before = store.routine(id)?.nextRunAt;

    vi.setSystemTime(NOW + MINUTE);
    save(routines, { ...daily("13:00"), name: "Renamed" }, id);
    expect(store.routine(id)).toMatchObject({ name: "Renamed", nextRunAt: before });
    save(routines, daily("14:00"), id);
    expect(store.routine(id)?.nextRunAt).toBe(new Date(2026, 10, 2, 14, 0).getTime());

    const past = { name: "Once", instructions: "Look", schedule: { kind: "once", at: NOW - 1 } };
    expect(routines.save(null, past)).toEqual({ ok: false, error: expect.any(String) });
    expect(routines.save("missing", daily())).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe("a run", () => {
  it("shows what it's doing, and how it ended", async () => {
    const { routines, store, started: runs, events } = setup();
    const id = save(routines, daily());
    started(routines);
    routines.runNow(id);

    runs[0].progress({ steps: [{ text: "Read a page", done: false }], approval: null, tokens: 0 });
    expect(routines.list()[0]).toMatchObject({ status: "running", lastResult: "Working on it" });
    expect(store.latestRun(id)?.steps).toEqual([{ text: "Read a page", done: false }]);

    runs[0].progress({ steps: [{ text: "Read a page", done: true }], approval: { id: "a", text: "Delete it" }, tokens: 0 });
    expect(routines.list()[0]).toMatchObject({ status: "needs-approval", latestRun: { approval: { text: "Delete it" } } });
    expect(events.onAttention).toHaveBeenLastCalledWith(expect.anything(), "needs-approval");
    events.onAttention.mockClear();
    runs[0].progress({ steps: [], approval: { id: "a", text: "Delete it" }, tokens: 0 });
    expect(events.onAttention).not.toHaveBeenCalled();

    runs[0].progress({ steps: [{ text: "Read a page", done: true }], approval: null, tokens: 0 });
    expect(routines.list()[0].status).toBe("running");

    runs[0].end({ text: "Found **three** things\nand more", tabIds: ["tab-7"] });
    await flush();
    expect(events.closeTab).toHaveBeenCalledWith("tab-7");
    expect(routines.list()[0]).toMatchObject({ status: "finished", lastResult: "Today: Found three things" });
    expect(events.onAttention).toHaveBeenLastCalledWith(expect.anything(), "finished");
  });

  it("reports a failure, and stays quiet about one the user stopped", async () => {
    const { routines, started: runs, stoppedIds, events } = setup();
    const id = save(routines, daily());
    started(routines);

    routines.runNow(id);
    runs[0].end({ error: "No key", text: "" });
    await flush();
    expect(routines.list()[0]).toMatchObject({ status: "failed", latestRun: { error: "No key" } });
    expect(events.onAttention).toHaveBeenLastCalledWith(expect.anything(), "failed");
    events.onAttention.mockClear();

    routines.runNow(id);
    expect(routines.stop(runs[1].id)).toBe(true);
    expect(routines.stop("not-a-run")).toBe(false);
    expect(stoppedIds).toEqual([runs[1].id]);
    runs[1].end({ stopped: true, text: "" });
    await flush();
    expect(routines.list()[0]).toMatchObject({ status: "stopped", latestRun: { seen: true } });
    expect(events.onAttention).not.toHaveBeenCalled();
  });

  it("is interrupted when the app closes during an approval, and doesn't forget what it was asking", async () => {
    const store = new RoutineStore(":memory:");
    const first = setup(store);
    const id = save(first.routines, daily());
    first.routines.start();
    first.routines.runNow(id);
    first.started[0].progress({
      steps: [{ text: "Read a page", done: false }],
      approval: { id: "a", text: "Click the button “Pay”" },
      tokens: 300,
    });

    first.routines.shutdown();
    expect(first.stoppedIds).toEqual([first.started[0].id]);
    first.started[0].end({ stopped: true });
    await flush();

    const run = store.latestRun(id);
    expect(run).toMatchObject({
      status: "interrupted",
      approval: { text: "Click the button “Pay”" },
      tokens: 300,
      steps: [{ text: "Read a page", done: true }],
      seen: false,
    });
    expect(first.events.closeTab).not.toHaveBeenCalled();
  });

  it("is interrupted on the next launch if the app never got to say so", async () => {
    const store = new RoutineStore(":memory:");
    const crashed = setup(store);
    const id = save(crashed.routines, daily());
    crashed.routines.runNow(id);

    const next = setup(store);
    started(next.routines);
    expect(next.routines.list()[0].status).toBe("interrupted");
    expect(next.routines.runNow(id)).toBe(true);
  });

  it("stops if its routine is deleted, and that ends quietly", async () => {
    const { routines, started: runs, stoppedIds, events } = setup();
    const id = save(routines, daily());
    started(routines);
    routines.runNow(id);

    expect(routines.delete(id)).toBe(true);
    expect(stoppedIds).toEqual([runs[0].id]);
    runs[0].end({ stopped: true, tabIds: ["tab-1"] });
    await flush();

    expect(events.closeTab).toHaveBeenCalledWith("tab-1");
    expect(events.onAttention).not.toHaveBeenCalled();
    expect(routines.list()).toEqual([]);
    expect(routines.delete(id)).toBe(false);
  });

  it("keeps news of an unseen result when a newer run ends quietly", async () => {
    const { routines, started: runs } = setup();
    const id = save(routines, daily());
    started(routines);
    routines.runNow(id);
    runs[0].end();
    await flush();
    vi.setSystemTime(NOW + MINUTE);
    routines.runNow(id);
    runs[1].end({ stopped: true });
    await flush();

    expect(routines.list()[0]).toMatchObject({ status: "stopped", unseen: true, latestRun: { seen: true } });
    routines.markSeen();
    expect(routines.list()[0].unseen).toBe(false);
  });

  it("marks what ended as seen, and keeps only the newest history", async () => {
    const { routines, store, started: runs } = setup();
    const id = save(routines, daily());
    started(routines);

    for (let index = 0; index < 51; index++) {
      vi.setSystemTime(NOW + index * MINUTE);
      routines.runNow(id);
      runs[index].end();
      await flush();
    }
    expect(store.runs(id)).toHaveLength(50);
    expect(store.latestRun(id)?.seen).toBe(false);
    routines.markSeen();
    expect(store.latestRun(id)?.seen).toBe(true);
  });
});
