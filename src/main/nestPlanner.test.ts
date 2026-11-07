import { describe, expect, it } from "vitest";
import { answerStart, MAX_PREVIEW_LENGTH, tableStart } from "./nestPlanner";

describe("what the planner sees of a table", () => {
  it("is its size, header and first three rows, each cell cut, and never more than the preview's length", () => {
    const huge = "x".repeat(2_000_000);
    const start = tableStart(["Company", "Notes"], [["Fjällbo", huge], ["Brygga", "ok"], ["Kvarnsten", "ok"], ["Vinga", "ok"]], 2000);

    expect(start.startsWith("A table with 2000 rows, starting:\n| Company | Notes |\n| --- | --- |\n| Fjällbo | xxx")).toBe(true);
    expect(start).toContain("| Kvarnsten | ok |");
    expect(start).not.toContain("Vinga");
    expect(start.length).toBeLessThanOrEqual(MAX_PREVIEW_LENGTH);
  });

  it("cuts the whole preview when many columns add up past it", () => {
    const wide = Array.from({ length: 30 }, (_, index) => `Column ${index} ${"h".repeat(90)}`);
    expect(tableStart(wide, [wide, wide, wide], 3).length).toBeLessThanOrEqual(MAX_PREVIEW_LENGTH);
  });

  it("reads a table in an answer the same way", () => {
    const answer = ["Found these.", "", "| Company |", "|---|", `| ${"y".repeat(50_000)} |`].join("\n");
    expect(answerStart(answer).length).toBeLessThanOrEqual(MAX_PREVIEW_LENGTH);
    expect(answerStart(answer)).toMatch(/^A table with 1 rows, starting:/);
  });
});
