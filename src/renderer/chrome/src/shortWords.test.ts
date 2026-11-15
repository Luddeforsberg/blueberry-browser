import { describe, expect, it } from "vitest";
import { finishedWhen, limitsInBrief, shortAge, shortWhen } from "./shortWords";

// A Sunday afternoon.
const NOW = new Date(2026, 10, 15, 14, 30).getTime();
const at = (day: number, hour = 8, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

describe("shortWhen", () => {
  it("gives the time for today, before or after now", () => {
    expect(shortWhen(at(15, 0, 0), NOW)).toBe("00:00");
    expect(shortWhen(at(15, 23, 59), NOW)).toBe("23:59");
  });

  it("says yesterday and tomorrow by the calendar, not by 24 hours", () => {
    expect(shortWhen(at(14, 23, 59), NOW)).toBe("yesterday");
    expect(shortWhen(at(16, 0, 1), NOW)).toBe("tomorrow");
  });

  it("names the weekday within six days, and the date from the seventh", () => {
    expect(shortWhen(at(9), NOW)).toBe("Mon");
    expect(shortWhen(at(21), NOW)).toBe("Sat");
    expect(shortWhen(at(8), NOW)).toBe("8 Nov");
    expect(shortWhen(at(22), NOW)).toBe("22 Nov");
  });
});

describe("finishedWhen", () => {
  it("reads on from finished it", () => {
    expect(finishedWhen(at(15, 8, 5), NOW)).toBe("at 08:05");
    expect(finishedWhen(at(14, 23, 59), NOW)).toBe("yesterday");
    expect(finishedWhen(at(9), NOW)).toBe("on Mon");
    expect(finishedWhen(at(8), NOW)).toBe("on 8 Nov");
  });
});

describe("shortAge", () => {
  it("counts up in the largest whole unit", () => {
    expect(shortAge(NOW, NOW)).toBe("now");
    expect(shortAge(NOW - 59_999, NOW)).toBe("now");
    expect(shortAge(NOW - 60_000, NOW)).toBe("1m");
    expect(shortAge(NOW - 59 * 60_000, NOW)).toBe("59m");
    expect(shortAge(NOW - 60 * 60_000, NOW)).toBe("1h");
    expect(shortAge(NOW - 1440 * 60_000, NOW)).toBe("1d");
  });
});

describe("limitsInBrief", () => {
  it("says where and what with its hands", () => {
    expect(limitsInBrief({ sites: [], tools: ["visit", "click", "type"] })).toBe("goes anywhere · clicks and types");
    expect(limitsInBrief({ sites: ["svt.se"], tools: ["visit"] })).toBe("only svt.se · reads");
    expect(limitsInBrief({ sites: ["svt.se", "sr.se"], tools: ["visit", "click"] })).toBe("2 sites · clicks");
    expect(limitsInBrief({ sites: [], tools: ["type"] })).toBe("the page you’re on · types");
    expect(limitsInBrief({ sites: [], tools: [] })).toBe("the page you’re on · reads");
  });
});
