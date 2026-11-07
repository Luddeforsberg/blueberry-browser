import { describe, expect, it } from "vitest";
import { findTable, MAX_RUNS, missingRows, plainCell, rowName, runCountProblem, splitRow, tableMarkdown } from "./nestTable";

const COMPANIES = [
  "Here are the companies I found.",
  "",
  "| Company | People | Leads sales |",
  "|---|--:|:--|",
  "| Lindqvist Data | 84 | Sara Holm |",
  "| Fjällbo | 41 | Omar Nilsson |",
  "| Kvarnsten | 130 | Lina Berg |",
  "",
  "Want me to write to them?",
].join("\n");

describe("findTable", () => {
  it("reads the header, the rows and the words before the table", () => {
    expect(findTable(COMPANIES)).toEqual({
      header: ["Company", "People", "Leads sales"],
      rows: [
        ["Lindqvist Data", "84", "Sara Holm"],
        ["Fjällbo", "41", "Omar Nilsson"],
        ["Kvarnsten", "130", "Lina Berg"],
      ],
      before: "Here are the companies I found.",
    });
  });

  it("takes the table with the most rows when there are several, and the first of those on a tie", () => {
    const text = "| A |\n|---|\n| 1 |\n\n| B |\n|---|\n| 1 |\n| 2 |\n\n| C |\n|---|\n| 1 |\n| 2 |";
    expect(findTable(text)?.header).toEqual(["B"]);
  });

  it("finds nothing in prose, in code, or in a table with no rows", () => {
    expect(findTable("No table here, only a | pipe.")).toBeNull();
    expect(findTable("```\n| A | B |\n|---|---|\n| 1 | 2 |\n```")).toBeNull();
    expect(findTable("| A | B |\n|---|---|\n")).toBeNull();
    expect(findTable("")).toBeNull();
  });

  it("needs a delimiter row as wide as the header", () => {
    expect(findTable("| A | B |\n|---|\n| 1 | 2 |")).toBeNull();
    expect(findTable("A | B\n--- | ---\n1 | 2")?.rows).toEqual([["1", "2"]]);
  });

  it("keeps escaped pipes in a cell and empty cells as empty", () => {
    expect(findTable("| A | B | C |\n|---|---|---|\n| x \\| y |  | z |")?.rows).toEqual([["x | y", "", "z"]]);
    expect(splitRow("| a | |")).toEqual(["a", ""]);
    expect(splitRow("| ends with \\|")).toEqual(["ends with |"]);
  });

  it("pads a short row and drops what's past the header", () => {
    expect(findTable("| A | B |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |")?.rows).toEqual([["1", ""], ["1", "2"]]);
  });

  it("leaves out the line still being written while a reply streams", () => {
    const streaming = "| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | fo";
    expect(findTable(streaming, { streaming: true })?.rows).toEqual([["1", "2"]]);
    expect(findTable(streaming)?.rows).toEqual([["1", "2"], ["3", "fo"]]);
    // A delimiter row that isn't finished yet isn't a table yet.
    expect(findTable("| A | B |\n|---|--", { streaming: true })).toBeNull();
    expect(findTable("| A | B |\n|---|---|\n| 1 | 2 |\n", { streaming: true })?.rows).toEqual([["1", "2"]]);
  });
});

describe("cells and rows", () => {
  it("draws a cell without its markdown", () => {
    expect(plainCell("[Lindqvist Data](https://lindqvist.se)")).toBe("Lindqvist Data");
    expect(plainCell("**84** and `x`")).toBe("84 and x");
  });

  it("names a row by its first cell with words in it", () => {
    expect(rowName(["", "**Fjällbo**", "41"])).toBe("Fjällbo");
    expect(rowName(["", ""])).toBe("A row");
  });

  it("writes rows back as a table that reads the same", () => {
    const markdown = tableMarkdown(["Name", "Note"], [["a | b", "two\nlines"]]);
    expect(markdown).toBe("| Name | Note |\n| --- | --- |\n| a \\| b | two lines |");
    expect(findTable(markdown)?.rows).toEqual([["a | b", "two lines"]]);
  });

  it("says which picked rows the table doesn't have any more", () => {
    const table = findTable(COMPANIES);
    const header = ["Company", "People", "Leads sales"];
    expect(missingRows({ header, rows: [["Fjällbo", "41", "Omar Nilsson"]] }, table)).toEqual([]);
    expect(missingRows({ header, rows: [["Brygga", "23", "Maja Lund"]] }, table)).toEqual([["Brygga", "23", "Maja Lund"]]);
    // A changed header means the rows mean something else now.
    expect(missingRows({ header: ["Company", "Size", "Leads sales"], rows: [["Fjällbo", "41", "Omar Nilsson"]] }, table)).toHaveLength(1);
    expect(missingRows({ header, rows: [["Fjällbo", "41", "Omar Nilsson"]] }, null)).toHaveLength(1);
  });
});

describe("runCountProblem", () => {
  it("allows 1 to the cap, and refuses none or one past it", () => {
    expect(runCountProblem(0)).toMatch(/no rows/);
    expect(runCountProblem(1)).toBeNull();
    expect(runCountProblem(MAX_RUNS)).toBeNull();
    expect(runCountProblem(MAX_RUNS + 1)).toMatch(/at most 25/);
  });
});
