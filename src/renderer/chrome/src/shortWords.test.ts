import { describe, expect, it } from "vitest";
import { finishedWhen, firstSentence, limitsInBrief, narrowerLimits, shortAge, shortWhen } from "./shortWords";

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
    expect(limitsInBrief({ sites: [], tools: ["visit", "click", "type"] })).toBe("Goes anywhere · clicks and types");
    expect(limitsInBrief({ sites: ["svt.se"], tools: ["visit"] })).toBe("Only svt.se · reads");
    expect(limitsInBrief({ sites: ["svt.se", "sr.se"], tools: ["visit", "click"] })).toBe("2 sites · clicks");
    expect(limitsInBrief({ sites: [], tools: ["type"] })).toBe("This page · types");
    expect(limitsInBrief({ sites: [], tools: [] })).toBe("This page · reads");
  });
});

describe("narrowerLimits", () => {
  it("says nothing for a mascot as free as Berry", () => {
    expect(narrowerLimits({ sites: [], tools: ["visit", "click", "type"] })).toBeNull();
  });

  it("names only what is narrower", () => {
    expect(narrowerLimits({ sites: [], tools: ["visit"] })).toBe("Reads only");
    expect(narrowerLimits({ sites: [], tools: [] })).toBe("This page · reads only");
    expect(narrowerLimits({ sites: ["svt.se"], tools: ["visit", "click", "type"] })).toBe("Only svt.se");
    expect(narrowerLimits({ sites: ["svt.se", "sr.se"], tools: ["visit", "click"] })).toBe("2 sites · no typing");
    expect(narrowerLimits({ sites: [], tools: ["visit", "type"] })).toBe("No clicking");
  });
});

describe("firstSentence", () => {
  it("keeps a short first sentence whole", () => {
    expect(firstSentence("Explains pages.  Then more.")).toBe("Explains pages.");
    expect(firstSentence("No full stop here")).toBe("No full stop here");
    expect(firstSentence("")).toBe("");
  });

  it("cuts a long one at a word, never inside one", () => {
    const long = "Before a call, I’ll name the company and, if I know them, the people I’m meeting, so read up.";
    expect(firstSentence(long, 40)).toBe("Before a call, I’ll name the company…");
    expect(firstSentence("a".repeat(50), 10)).toBe("aaaaaaaaaa…");
  });

  it("cuts at exactly the limit, and not one before it", () => {
    expect(firstSentence("one two three", 13)).toBe("one two three");
    expect(firstSentence("one two three", 12)).toBe("one two…");
  });
});
