import { describe, expect, it, vi } from "vitest";
import { LATE_AFTER_MS, MAX_ACTIVE_RUNS } from "./Routines";
import { RoutineStore } from "./RoutineStore";
import type { MascotProfile } from "../../shared/library";
import { DAY, daily, flush, jump, MINUTE, NOW, save, setup, started, runOnFakeClock } from "./routinesTesting";
import { defined } from "../../shared/testing";

runOnFakeClock();

describe("the scheduler", () => {
  it("runs a routine at its time, on time, and sets the next", async () => {
    const { routines, store, started: runs } = setup();
    const id = save(routines, daily("13:00"));
    started(routines);

    await vi.advanceTimersByTimeAsync(59 * MINUTE);
    expect(runs).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(runs).toHaveLength(1);
    expect(defined(runs[0]).message).toContain("Look");

    defined(runs[0]).end();
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

    // What goes to the cloud: its mascot narrowed to the routine's sites, and no next time once it's paused.
    const scout = (): MascotProfile => ({
      id: "m-1",
      name: "Scout",
      look: { palette: "lingon", accessory: "cap" },
      instructions: "Find.",
      sites: [],
      tools: ["visit"],
      deletedAt: null,
    });
    const options = { actionApproval: "risky", contextId: "ctx-1", timeZone: "Europe/Stockholm" } as const;
    const row = defined(routines.cloudRows(scout, options)![0]);
    expect(row).toMatchObject({
      key: id,
      mascot: { id: "m-1", sites: ["shop.example"] },
      schedule: { kind: "daily", time: "13:00" },
      timeZone: "Europe/Stockholm",
      paused: false,
      firstRunAt: new Date(NOW + 60 * MINUTE + DAY).toISOString(),
    });
    expect(row.prompt).toContain("Look");
    routines.setPaused(id, true);
    expect(routines.cloudRows(scout, options)![0]).toMatchObject({ paused: true, firstRunAt: null });
    save(routines, daily("13:00", "Here"));
    expect(routines.cloudRows(scout, options)).toHaveLength(1);
  });

  it("doesn't run a routine moved back from the cloud until it's gone from there, so the two never both run it", async () => {
    let there = true;
    const { routines, store, started: runs } = setup(undefined, { stillInCloud: () => there });
    const id = save(routines, { ...daily("13:00"), inCloud: true });
    save(routines, daily("13:00"), id);
    started(routines);
    expect(defined(routines.list()[0]).cloudNote).toBe("Moving back to this Mac…");

    // Its time comes while the cloud may still run it: skipped here, and on to the next.
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(runs).toHaveLength(0);
    expect(store.routine(id)?.nextRunAt).toBe(NOW + 60 * MINUTE + DAY);

    there = false;
    routines.cloudChanged();
    expect(defined(routines.list()[0]).cloudNote).toBeNull();
    await jump(DAY);
    expect(runs).toHaveLength(1);
  });

  it("keeps a routine that only runs when asked out of the cloud", () => {
    const { routines } = setup();
    save(routines, { name: "Ask me", instructions: "Look", schedule: { kind: "manual" }, inCloud: true });
    expect(defined(routines.list()[0]).inCloud).toBe(false);
    expect(
      routines.cloudRows(
        () => {
          throw new Error("not asked");
        },
        { actionApproval: "risky", contextId: null, timeZone: "UTC" },
      ),
    ).toEqual([]);
  });

  it("sends no rows to the cloud while the saved routines couldn't be read, so none there is taken for deleted", () => {
    const { routines } = setup(new RoutineStore(":memory:", true));
    save(routines, { ...daily("13:00"), inCloud: true });
    expect(
      routines.cloudRows(
        () => {
          throw new Error("not asked");
        },
        { actionApproval: "risky", contextId: null, timeZone: "UTC" },
      ),
    ).toBeNull();
  });

  it("says when a routine couldn't be sent to the cloud", () => {
    const { routines } = setup(undefined, { cloudFailed: () => true });
    save(routines, { ...daily("13:00"), inCloud: true });
    expect(defined(routines.list()[0]).cloudNote).toBe("Couldn’t reach the cloud, will retry");
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
    defined(second.started[0]).end();
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
    defined(second.started[0]).end();
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

    defined(runs[0]).end();
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

    defined(runs[0]).end();
    await flush();
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS + 1);
  });

  it("doesn't let a run waiting for an OK hold a place", async () => {
    const { routines, started: runs } = setup();
    for (let index = 0; index <= MAX_ACTIVE_RUNS; index++) save(routines, daily("13:00", `R${index}`));
    started(routines);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS);

    defined(runs[0]).progress({ steps: [], approval: { id: "a", text: "Delete it" }, tokens: 0 });
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS + 1);
  });

  it("queues Run now when every place is taken", async () => {
    const { routines, started: runs } = setup();
    const ids = [save(routines, daily("23:00", "A")), save(routines, daily("23:00", "B")), save(routines, daily("23:00", "C"))];
    started(routines);
    ids.forEach((id) => expect(routines.runNow(id)).toBe(true));
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS);
    expect(defined(routines.list()[2]).status).toBe("queued");

    defined(runs[1]).end();
    await flush();
    expect(runs).toHaveLength(MAX_ACTIVE_RUNS + 1);
  });

  it("drops a queued Run now that's cancelled, so it never starts", async () => {
    const { routines, started: runs } = setup();
    const ids = [save(routines, daily("23:00", "A")), save(routines, daily("23:00", "B")), save(routines, daily("23:00", "C"))];
    started(routines);
    ids.forEach((id) => routines.runNow(id));
    expect(routines.cancelRequest(defined(ids[2]))).toBe(true);
    expect(routines.cancelRequest(defined(ids[2]))).toBe(false);
    expect(defined(routines.list()[2]).status).not.toBe("queued");

    defined(runs[1]).end();
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
    expect(defined(routines.list()[0]).status).toBe("paused");

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

  it("names one saved with no name from what it does, and never replaces a name the user chose", async () => {
    const written: string[] = [];
    let answer: (name: string | null) => void = () => undefined;
    let hasModel = true;
    const { store, routines } = setup(undefined, {
      writeName: (instructions) => {
        written.push(instructions);
        return hasModel ? new Promise<string | null>((resolve) => (answer = resolve)) : Promise.resolve(null);
      },
    });

    // Its first words until the name is written.
    const id = save(routines, { ...daily(), name: "", instructions: "Read SVT.\nSum up the news" });
    expect(store.routine(id)).toMatchObject({ name: "Read SVT", nameSettled: false });
    answer("SVT news summary");
    await flush();
    expect(store.routine(id)).toMatchObject({ name: "SVT news summary", nameSettled: true });

    // Changing another part keeps it.
    save(routines, { ...daily("14:00"), name: "", instructions: "Read DN" }, id);
    expect(store.routine(id)?.name).toBe("SVT news summary");
    expect(written).toHaveLength(1);

    // The user's own name, typed while one is being written, wins.
    const other = save(routines, { ...daily(), name: "", instructions: "Check fares" });
    save(routines, { ...daily(), name: "Fares", instructions: "Check fares" }, other);
    answer("Flight fare check");
    await flush();
    expect(store.routine(other)).toMatchObject({ name: "Fares", nameSettled: true });

    // A name it's given, as from a suggestion, is kept, and with no model the first words stay.
    expect(store.routine(save(routines, { ...daily(), name: "Given" }))).toMatchObject({ name: "Given", nameSettled: true });
    hasModel = false;
    expect(store.routine(save(routines, { ...daily(), name: "", instructions: "Look around" }))?.name).toBe("Look around");
    await flush();
  });

  it("names an edited routine from what it does now, whichever answer comes first", async () => {
    const answers = new Map<string, (name: string | null) => void>();
    const { store, routines } = setup(undefined, {
      writeName: (instructions) => new Promise<string | null>((resolve) => answers.set(instructions, resolve)),
    });
    const id = save(routines, { ...daily(), name: "", instructions: "Read SVT" });
    save(routines, { ...daily(), name: "", instructions: "Check fares" }, id);
    defined(answers.get("Read SVT"))("SVT news summary");
    await flush();
    expect(store.routine(id)).toMatchObject({ name: "Check fares", nameSettled: false });
    defined(answers.get("Check fares"))("Flight fare check");
    await flush();
    expect(store.routine(id)).toMatchObject({ name: "Flight fare check", nameSettled: true });

    // Saved again with the name it showed, its first words, and new instructions: the answer for the old ones is dropped.
    const other = save(routines, { ...daily(), name: "", instructions: "Read DN" });
    save(routines, { ...daily(), name: "Read DN", instructions: "Read SvD" }, other);
    defined(answers.get("Read DN"))("DN digest");
    await flush();
    expect(store.routine(other)?.name).toBe("Read DN");
  });
});
