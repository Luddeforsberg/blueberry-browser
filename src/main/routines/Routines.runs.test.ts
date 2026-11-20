import { mkdtempSync } from "fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { RoutineStore } from "./RoutineStore";
import { daily, DAY, flush, MINUTE, NOW, save, setup, started, runOnFakeClock } from "./routinesTesting";
import { defined } from "../../shared/testing";

runOnFakeClock();

describe("a run", () => {
  it("keeps its occurrence due when the run can't be saved, so it runs once it can", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-routines-")), "routines.db");
    const { routines, store, started: runs } = setup(new RoutineStore(file));
    const id = save(routines, daily("13:00"));
    // A second connection, as a full disk would, refuses every new run.
    const db = new DatabaseSync(file);
    db.exec("CREATE TRIGGER no_room BEFORE INSERT ON runs BEGIN SELECT RAISE(ABORT, 'database or disk is full'); END;");
    started(routines);

    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(runs).toHaveLength(0);
    expect(store.latestRun(id)).toBeNull();
    expect(store.routine(id)?.nextRunAt).toBe(NOW + 60 * MINUTE);

    db.exec("DROP TRIGGER no_room;");
    db.close();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(runs).toHaveLength(1);
    expect(store.latestRun(id)).toMatchObject({ status: "running", lateFor: null });
    expect(store.routine(id)?.nextRunAt).toBe(NOW + 60 * MINUTE + DAY);
  });

  it("stays asked for when a run asked for now can't be saved, and starts once it can", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-routines-")), "routines.db");
    const { routines, store } = setup(new RoutineStore(file));
    const id = save(routines, daily("11:00"));
    const db = new DatabaseSync(file);
    db.exec("CREATE TRIGGER no_room BEFORE INSERT ON runs BEGIN SELECT RAISE(ABORT, 'database or disk is full'); END;");
    started(routines);
    const onStart = vi.fn();

    expect(routines.runNow(id, onStart)).toBe(true);
    expect(onStart).not.toHaveBeenCalled();
    db.exec("DROP TRIGGER no_room;");
    db.close();
    await vi.advanceTimersByTimeAsync(DAY);
    expect(onStart).toHaveBeenCalledWith(store.latestRun(id)?.id);
    expect(store.latestRun(id)).not.toBeNull();
  });

  it("shows what it's doing, and how it ended", async () => {
    const { routines, store, started: runs, events } = setup();
    const id = save(routines, daily());
    started(routines);
    routines.runNow(id);

    defined(runs[0]).progress({ steps: [{ text: "Read a page", done: false }], approval: null, tokens: 0 });
    expect(routines.list()[0]).toMatchObject({ status: "running", lastResult: "Working on it" });
    expect(store.latestRun(id)?.steps).toEqual([{ text: "Read a page", done: false }]);

    defined(runs[0]).progress({ steps: [{ text: "Read a page", done: true }], approval: { id: "a", text: "Delete it" }, tokens: 0 });
    expect(routines.list()[0]).toMatchObject({ status: "needs-approval", latestRun: { approval: { text: "Delete it" } } });
    expect(events.onAttention).toHaveBeenLastCalledWith(expect.anything(), "needs-approval");
    events.onAttention.mockClear();
    defined(runs[0]).progress({ steps: [], approval: { id: "a", text: "Delete it" }, tokens: 0 });
    expect(events.onAttention).not.toHaveBeenCalled();

    defined(runs[0]).progress({ steps: [{ text: "Read a page", done: true }], approval: null, tokens: 0 });
    expect(defined(routines.list()[0]).status).toBe("running");

    defined(runs[0]).end({ text: "Found **three** things\nand more", tabIds: ["tab-7"] });
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
    defined(runs[0]).end({ error: "No key", text: "" });
    await flush();
    expect(routines.list()[0]).toMatchObject({ status: "failed", latestRun: { error: "No key" } });
    expect(events.onAttention).toHaveBeenLastCalledWith(expect.anything(), "failed");
    events.onAttention.mockClear();

    routines.runNow(id);
    expect(routines.stop(defined(runs[1]).id)).toBe(true);
    expect(routines.stop("not-a-run")).toBe(false);
    expect(stoppedIds).toEqual([defined(runs[1]).id]);
    defined(runs[1]).end({ stopped: true, text: "" });
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
    defined(first.started[0]).progress({
      steps: [{ text: "Read a page", done: false }],
      approval: { id: "a", text: "Click the button “Pay”" },
      tokens: 300,
    });

    first.routines.shutdown();
    expect(first.stoppedIds).toEqual([defined(first.started[0]).id]);
    defined(first.started[0]).end({ stopped: true });
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
    expect(defined(next.routines.list()[0]).status).toBe("interrupted");
    expect(next.routines.runNow(id)).toBe(true);
  });

  it("stops if its routine is deleted, and that ends quietly", async () => {
    const { routines, started: runs, stoppedIds, events } = setup();
    const id = save(routines, daily());
    started(routines);
    routines.runNow(id);

    expect(routines.delete(id)).toBe(true);
    expect(stoppedIds).toEqual([defined(runs[0]).id]);
    defined(runs[0]).end({ stopped: true, tabIds: ["tab-1"] });
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
    defined(runs[0]).end();
    await flush();
    vi.setSystemTime(NOW + MINUTE);
    routines.runNow(id);
    defined(runs[1]).end({ stopped: true });
    await flush();

    expect(routines.list()[0]).toMatchObject({ status: "stopped", unseen: true, latestRun: { seen: true } });
    routines.markSeen();
    expect(defined(routines.list()[0]).unseen).toBe(false);
  });

  it("marks what ended as seen, and keeps only the newest history", async () => {
    const { routines, store, started: runs } = setup();
    const id = save(routines, daily());
    started(routines);

    for (let index = 0; index < 51; index++) {
      vi.setSystemTime(NOW + index * MINUTE);
      routines.runNow(id);
      defined(runs[index]).end();
      await flush();
    }
    expect(store.runs(id)).toHaveLength(50);
    expect(store.latestRun(id)?.seen).toBe(false);
    routines.markSeen();
    expect(store.latestRun(id)?.seen).toBe(true);
  });
});
