import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextRun, parseDraft, scheduleLabel } from "./routineSchedule";

const local = (...parts: [number, number, number, number, number]) => new Date(...parts).getTime();
// Months count from 0 here, as they do in Date.
const after = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  local(year, month, day, hour, minute);

const originalTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "Europe/Stockholm";
});

afterAll(() => {
  process.env.TZ = originalTz;
});

describe("nextRun", () => {
  it("runs a one-off once, only while it's still ahead", () => {
    const at = after(2026, 10, 1, 9);
    expect(nextRun({ kind: "once", at }, at - 1)).toBe(at);
    expect(nextRun({ kind: "once", at }, at)).toBeNull();
    expect(nextRun({ kind: "once", at }, at + 1)).toBeNull();
  });

  it("goes to tomorrow from the very minute it's due", () => {
    const schedule = { kind: "daily", time: "07:30" } as const;
    expect(nextRun(schedule, after(2026, 10, 1, 7, 29))).toBe(after(2026, 10, 1, 7, 30));
    expect(nextRun(schedule, after(2026, 10, 1, 7, 30))).toBe(after(2026, 10, 2, 7, 30));
  });

  it("finds the next chosen weekday, including a full week on", () => {
    // 2 Nov 2026 is a Monday.
    const monday = { kind: "weekly" as const, days: [1], time: "08:00" };
    expect(nextRun(monday, after(2026, 10, 2, 7))).toBe(after(2026, 10, 2, 8));
    expect(nextRun(monday, after(2026, 10, 2, 8))).toBe(after(2026, 10, 9, 8));
    expect(nextRun({ kind: "weekly", days: [5, 2], time: "08:00" }, after(2026, 10, 2))).toBe(after(2026, 10, 3, 8));
  });

  it("uses the last day of a month that's too short", () => {
    const end = { kind: "monthly", day: 31, time: "09:00" } as const;
    expect(nextRun(end, after(2026, 0, 31, 9))).toBe(after(2026, 1, 28, 9));
    expect(nextRun(end, after(2028, 0, 31, 9))).toBe(after(2028, 1, 29, 9));
    expect(nextRun(end, after(2026, 2, 31, 9))).toBe(after(2026, 3, 30, 9));
    expect(nextRun({ kind: "monthly", day: 1, time: "09:00" }, after(2026, 11, 1, 9))).toBe(after(2027, 0, 1, 9));
  });

  it("keeps its local time across a clock change, without skipping or repeating a day", () => {
    // Clocks went forward at 02:00 on 29 March 2026, and back at 03:00 on 25 October.
    const daily = { kind: "daily", time: "07:30" } as const;
    const beforeSpring = after(2026, 2, 28, 7, 30);
    expect(nextRun(daily, beforeSpring)).toBe(after(2026, 2, 29, 7, 30));
    expect((nextRun(daily, beforeSpring)! - beforeSpring) / 3_600_000).toBe(23);

    const inGap = { kind: "daily", time: "02:30" } as const;
    const skipped = nextRun(inGap, after(2026, 2, 28, 2, 30))!;
    expect(new Date(skipped).getDate()).toBe(29);
    expect(new Date(skipped).getHours()).toBe(3);
    expect(new Date(nextRun(inGap, skipped)!).getDate()).toBe(30);

    const repeated = { kind: "daily", time: "02:30" } as const;
    const first = nextRun(repeated, after(2026, 9, 24, 2, 30))!;
    expect(new Date(first).getDate()).toBe(25);
    expect(new Date(nextRun(repeated, first)!).getDate()).toBe(26);
  });
});

describe("scheduleLabel", () => {
  it("says the schedule in words", () => {
    expect(scheduleLabel({ kind: "daily", time: "07:30" })).toBe("Daily at 07:30");
    expect(scheduleLabel({ kind: "weekly", days: [1], time: "08:00" })).toBe("Mondays at 08:00");
    expect(scheduleLabel({ kind: "weekly", days: [3, 1], time: "08:00" })).toBe("Mon, Wed at 08:00");
    expect(scheduleLabel({ kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], time: "08:00" })).toBe("Daily at 08:00");
    expect(scheduleLabel({ kind: "monthly", day: 1, time: "09:00" })).toBe("1st of each month at 09:00");
    expect(scheduleLabel({ kind: "monthly", day: 11, time: "09:00" })).toBe("11th of each month at 09:00");
    expect(scheduleLabel({ kind: "monthly", day: 22, time: "09:00" })).toBe("22nd of each month at 09:00");
    expect(scheduleLabel({ kind: "once", at: after(2026, 10, 3, 14) })).toBe("Once on 3 Nov 2026 at 14:00");
  });
});

describe("parseDraft", () => {
  const valid = { name: " Watch ", instructions: " Look ", schedule: { kind: "daily", time: "07:30" } };
  const scheduled = (schedule: unknown) => parseDraft({ ...valid, schedule });

  it("trims a good draft", () => {
    expect(parseDraft(valid)).toEqual({
      draft: { name: "Watch", instructions: "Look", schedule: { kind: "daily", time: "07:30" }, sites: [] },
    });
  });

  it("holds the name and instructions to their limits", () => {
    expect(parseDraft({ ...valid, name: "   " })).toHaveProperty("error");
    expect(parseDraft({ ...valid, instructions: "" })).toHaveProperty("error");
    expect(parseDraft({ ...valid, name: "a".repeat(100) })).toHaveProperty("draft");
    expect(parseDraft({ ...valid, name: "a".repeat(101) })).toHaveProperty("error");
    expect(parseDraft({ ...valid, instructions: "a".repeat(5000) })).toHaveProperty("draft");
    expect(parseDraft({ ...valid, instructions: "a".repeat(5001) })).toHaveProperty("error");
    expect(parseDraft(null)).toHaveProperty("error");
  });

  it("holds schedules to what can really happen", () => {
    expect(scheduled({ kind: "daily", time: "23:59" })).toHaveProperty("draft");
    expect(scheduled({ kind: "daily", time: "24:00" })).toHaveProperty("error");
    expect(scheduled({ kind: "daily", time: "7:30" })).toHaveProperty("error");
    expect(scheduled({ kind: "weekly", days: [], time: "07:30" })).toHaveProperty("error");
    expect(scheduled({ kind: "weekly", days: [0, 6], time: "07:30" })).toHaveProperty("draft");
    expect(scheduled({ kind: "weekly", days: [7], time: "07:30" })).toHaveProperty("error");
    expect(scheduled({ kind: "monthly", day: 0, time: "07:30" })).toHaveProperty("error");
    expect(scheduled({ kind: "monthly", day: 1, time: "07:30" })).toHaveProperty("draft");
    expect(scheduled({ kind: "monthly", day: 31, time: "07:30" })).toHaveProperty("draft");
    expect(scheduled({ kind: "monthly", day: 32, time: "07:30" })).toHaveProperty("error");
    expect(scheduled({ kind: "once", at: NaN })).toHaveProperty("error");
    expect(scheduled({ kind: "hourly", time: "07:30" })).toHaveProperty("error");
    expect(scheduled(undefined)).toHaveProperty("error");
  });
});
