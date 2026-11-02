import { describe, expect, it } from "vitest";
import { nextRunAfter, startDueRoutines, type DueRoutine, type RoutineDb } from "./routines";

const DAILY = { kind: "daily", time: "08:00" };

const fakeDb = (due: DueRoutine[], answer: (id: string) => string | null = (id) => `job-for-${id}`) => {
  const starts: [string, string, string | null][] = [];
  const db: RoutineDb = {
    dueRoutines: async () => due,
    startRoutine: async (...args) => {
      starts.push(args);
      return answer(args[0]);
    },
  };
  return { db, starts };
};

describe("startDueRoutines", () => {
  it("starts a job for a due routine, at the time it was due, and moves it on to the next one in its own zone", async () => {
    // 09:00 in Stockholm on 2 November, an hour after it was due.
    const now = Date.parse("2026-11-02T08:00:00Z");
    const { db, starts } = fakeDb([{ id: "r1", schedule: DAILY, timeZone: "Europe/Stockholm", dueAt: "2026-11-02T07:00:00+00:00" }]);
    expect(await startDueRoutines(db, now)).toEqual(["job-for-r1"]);
    // 08:00 the next morning there, which is 07:00 UTC in winter.
    expect(starts).toEqual([["r1", "2026-11-02T07:00:00+00:00", "2026-11-03T07:00:00.000Z"]]);
  });

  it("says nothing for a run the database skipped, and goes on with the rest", async () => {
    const due = [
      { id: "busy", schedule: DAILY, timeZone: "UTC", dueAt: "a" },
      { id: "free", schedule: DAILY, timeZone: "UTC", dueAt: "b" },
    ];
    const { db, starts } = fakeDb(due, (id) => (id === "busy" ? null : "job-2"));
    expect(await startDueRoutines(db, Date.parse("2026-11-02T09:00:00Z"))).toEqual(["job-2"]);
    expect(starts.map(([id]) => id)).toEqual(["busy", "free"]);
  });
});

describe("nextRunAfter", () => {
  it("is null for a one-off that's been used, or a schedule or zone it can't read", () => {
    const now = Date.parse("2026-11-02T09:00:00Z");
    expect(nextRunAfter({ schedule: { kind: "once", at: now - 1000 }, timeZone: "UTC" }, now)).toBeNull();
    expect(nextRunAfter({ schedule: { kind: "hourly" }, timeZone: "UTC" }, now)).toBeNull();
    expect(nextRunAfter({ schedule: DAILY, timeZone: "Mars/Olympus" }, now)).toBeNull();
  });

  it("leaves the runner's own zone as it was", () => {
    const before = process.env.TZ;
    nextRunAfter({ schedule: DAILY, timeZone: "America/New_York" }, Date.now());
    expect(process.env.TZ).toBe(before);
  });
});
