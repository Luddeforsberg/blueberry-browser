import { describe, expect, it } from "vitest";
import { blankForm } from "./routinesView";
import { howOften, nextInWords, readBack, scheduleSentence, sentenceText, WEEKDAYS, withHowOften } from "./scheduleWords";

describe("when, in words", () => {
  const base = blankForm("", "Read SVT and sum up the news");
  it("reads the schedule back with what was chosen marked", () => {
    expect(scheduleSentence({ ...base, kind: "weekly", days: WEEKDAYS, time: "09:00" })).toEqual([
      { text: "Every " },
      { text: "weekday", chosen: true },
      { text: " at " },
      { text: "09:00", chosen: true },
    ]);
    expect(sentenceText(scheduleSentence({ ...base, kind: "weekly", days: [5, 1], time: "07:00" }))).toBe(
      "Every Monday and Friday at 07:00",
    );
    expect(sentenceText(scheduleSentence({ ...base, kind: "monthly", day: 22, time: "12:00" }))).toBe(
      "On the 22nd of every month at 12:00",
    );
    expect(sentenceText(scheduleSentence({ ...base, kind: "monthly", day: 11, time: "12:00" }))).toBe(
      "On the 11th of every month at 12:00",
    );
    expect(sentenceText(scheduleSentence({ ...base, kind: "manual" }))).toBe("Only when you ask");
  });

  it("tells Weekdays from Weekly, and Weekly from Weekdays starts on one day", () => {
    expect(howOften({ kind: "weekly", days: [5, 4, 3, 2, 1] })).toBe("weekdays");
    expect(howOften({ kind: "weekly", days: [1, 2] })).toBe("weekly");
    const weekdays = { ...base, ...withHowOften(base, "weekdays") };
    expect(weekdays.days).toEqual(WEEKDAYS);
    expect(withHowOften(weekdays, "weekly").days).toHaveLength(1);
    expect(withHowOften({ ...base, kind: "weekly", days: [1, 3] }, "weekly")).toEqual({ kind: "weekly" });
  });

  it("reads the whole routine back in the user’s words", () => {
    expect(readBack({ ...base, kind: "daily", time: "09:00" }, "Berry")).toBe(
      "Every day at 09:00, Berry will read SVT and sum up the news",
    );
    expect(readBack({ ...base, instructions: "SVT first, then DN", kind: "manual" }, "Pip")).toBe(
      "When you ask, Pip will SVT first, then DN",
    );
  });

  it("says when it’s next in a few words", () => {
    const now = new Date(2026, 10, 16, 12, 0).getTime();
    expect(nextInWords(new Date(2026, 10, 16, 17, 0).getTime(), now)).toBe("today 17:00");
    expect(nextInWords(new Date(2026, 10, 17, 9, 0).getTime(), now)).toBe("tomorrow 09:00");
    expect(nextInWords(new Date(2026, 10, 19, 9, 0).getTime(), now)).toBe("Thu 09:00");
    expect(nextInWords(new Date(2026, 10, 30, 9, 0).getTime(), now)).toBe("30 Nov 09:00");
  });
});
