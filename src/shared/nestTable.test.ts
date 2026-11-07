import { describe, expect, it } from "vitest";
import { cellParts, combinedTable, crossingWords, eachWords, filesWords, findTable, lineWords, MAX_CROSSING_LENGTH, MAX_RUNS, missingRows, plainCell, rowName, rowTooLong, runCountProblem, splitRow, tableMarkdown } from "./nestTable";

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
    expect(plainCell("**[Strawberry Browser](https://strawberrybrowser.com)**")).toBe("Strawberry Browser");
    expect(plainCell("Line one<br>line two")).toBe("Line one line two");
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

describe("combinedTable", () => {
  it("is the rows a For-each card ran on with their columns, and its own column last, empty until a row has a value", () => {
    expect(
      combinedTable({
        header: ["Company", "People"],
        column: "Latest post",
        runs: [
          { row: ["Fjällbo", "41"], cell: "Hiring two SDRs" },
          { row: ["Brygga"], cell: null },
        ],
      })
    ).toEqual({ header: ["Company", "People", "Latest post"], rows: [["Fjällbo", "41", "Hiring two SDRs"], ["Brygga", "", ""]] });
    expect(combinedTable({ header: ["A"], column: "B", runs: [] })).toEqual({ header: ["A", "B"], rows: [] });
  });
});

describe("cellParts", () => {
  it("keeps a cell's links, as words linking to a web address, and its bold, italic and code", () => {
    expect(cellParts("Read **this**: [Omar's post](https://linkedin.com/p/1) or https://brygga.se/jobs.")).toEqual([
      { text: "Read " },
      { text: "this", strong: true },
      { text: ": " },
      { text: "Omar's post", href: "https://linkedin.com/p/1" },
      { text: " or " },
      { text: "https://brygga.se/jobs", href: "https://brygga.se/jobs" },
      { text: "." },
    ]);
    expect(cellParts("_new_ and *fast*, `v2`")).toEqual([
      { text: "new", em: true },
      { text: " and " },
      { text: "fast", em: true },
      { text: ", " },
      { text: "v2", code: true },
    ]);
  });

  it("reads emphasis around a link, inside one, and inside other emphasis", () => {
    expect(cellParts("**[Strawberry Browser](https://strawberrybrowser.com)**")).toEqual([
      { text: "Strawberry Browser", strong: true, href: "https://strawberrybrowser.com/" },
    ]);
    expect(cellParts("**https://comet.ai/a_b**")).toEqual([{ text: "https://comet.ai/a_b", strong: true, href: "https://comet.ai/a_b" }]);
    expect(cellParts("[**Arc** Search](https://arc.net)")).toEqual([
      { text: "Arc", strong: true, href: "https://arc.net/" },
      { text: " Search", href: "https://arc.net/" },
    ]);
    expect(cellParts("*a **b** c*")).toEqual([
      { text: "a ", em: true },
      { text: "b", em: true, strong: true },
      { text: " c", em: true },
    ]);
  });

  it("leaves marks that aren't emphasis as they are", () => {
    // Inside a word, after a space, unclosed, escaped or in code.
    expect(cellParts("snake_case_name")).toEqual([{ text: "snake_case_name" }]);
    expect(cellParts("2 * 3 * 4")).toEqual([{ text: "2 * 3 * 4" }]);
    expect(cellParts("**unclosed")).toEqual([{ text: "**unclosed" }]);
    expect(cellParts("\\*not\\*")).toEqual([{ text: "*not*" }]);
    expect(cellParts("`a**b**`")).toEqual([{ text: "a**b**", code: true }]);
    expect(cellParts("**")).toEqual([{ text: "**" }]);
  });

  it("reads bold around italic, and italic ending inside bold", () => {
    expect(cellParts("***both***")).toEqual([{ text: "both", strong: true, em: true }]);
    expect(cellParts("**bold *italic***")).toEqual([
      { text: "bold ", strong: true },
      { text: "italic", strong: true, em: true },
    ]);
  });

  it("keeps a bare address whole, and never links one inside an image's words or a link that goes nowhere", () => {
    expect(cellParts("https://example.com/a_")).toEqual([{ text: "https://example.com/a_", href: "https://example.com/a_" }]);
    expect(cellParts("![https://evil.example](https://image.example) [https://evil.example](mailto:x@y)")).toEqual([
      { text: "https://evil.example https://evil.example" },
    ]);
  });

  it("reads a long cell of marks that never close in time that grows with its length, not its square", () => {
    for (const unit of ["*a ", "**a ", "_a ", "`a ", "``a `", "*`a ", "[a](", "[a ", "![a](", " https://", "a*", "**a*"]) {
      const started = performance.now();
      expect(plainCell(unit.repeat(20_000)).length).toBeGreaterThan(0);
      expect(performance.now() - started, unit).toBeLessThan(500);
    }
  });

  it("never links anything but a web address, and shows an image only as its words", () => {
    expect(cellParts("[Run me](javascript:alert) ![logo](https://x.se/a.png) [file](file:///etc/passwd)")).toEqual([{ text: "Run me logo file" }]);
    expect(cellParts("")).toEqual([]);
    expect(cellParts("  plain  ")).toEqual([{ text: "plain" }]);
  });
});

describe("what crosses a line, in words", () => {
  it("names a page on its line: an open tab's page, or a link's address", () => {
    expect(crossingWords({ kind: "page", name: "strawberrybrowser.com/pricing", read: true }, "")).toBe("1 page: strawberrybrowser.com/pricing");
    expect(crossingWords({ kind: "page", name: "strawberrybrowser.com/pricing", read: false }, "")).toBe("1 link: strawberrybrowser.com/pricing");
    expect(lineWords({ whole: { kind: "page", name: "example.com", read: true } }, "")).toBe("1 page: example.com");
  });

  it("says a card's answer in words, rounded, and a thread by its answers, with what was left out or cut", () => {
    const thread = (words: number, extra: object = {}) => ({ kind: "thread" as const, answers: 1, earlier: 0, words, cut: false, ...extra });
    expect(crossingWords(thread(1), "Scout")).toBe("Scout’s answer, 1 word");
    expect(crossingWords(thread(19), "Scout")).toBe("Scout’s answer, 19 words");
    expect(crossingWords(thread(904), "Scout")).toBe("Scout’s answer, about 900 words");
    expect(crossingWords(thread(2437, { cut: true }), "Scout")).toBe("Scout’s answer, about 2,400 words, with some of it cut to fit");
    expect(crossingWords(thread(1200, { answers: 2, before: { cards: 1, words: 600, leftOut: 0, cut: false } }), "Berry")).toBe(
      "Berry’s thread (2 answers) and 1 card before it, about 1,800 words"
    );
    expect(crossingWords(thread(5000, { answers: 2, earlier: 1, cut: true, before: { cards: 1, words: 900, leftOut: 2, cut: false } }), "Berry")).toBe(
      "Berry’s thread (2 answers) and 1 card before it, about 5,900 words, with 1 earlier answer and 2 cards further up left out and some of it cut to fit"
    );
  });

  it("says a table in rows and columns, and how many rows were left out", () => {
    expect(crossingWords({ kind: "table", rows: 12, columns: 3, leftOut: 0 }, "Writer")).toBe("12 rows, 3 columns from Writer");
    expect(crossingWords({ kind: "table", rows: 1, columns: 1, leftOut: 0 }, "leads")).toBe("1 row, 1 column from leads");
    expect(crossingWords({ kind: "table", rows: 40, columns: 3, leftOut: 1 }, "Writer")).toBe("40 rows, 3 columns from Writer, with 1 more row left out to fit");
    expect(eachWords({ columns: 3 })).toBe("One row each, 3 columns");
    expect(eachWords({ columns: 3, cut: true })).toBe("One row each, 3 columns, a row too long to go whole cut to its first 12,000 characters");
    expect(crossingWords({ kind: "table", rows: 3, columns: 2, leftOut: 0, before: { cards: 2, words: 640, leftOut: 0, cut: true } }, "Scout")).toBe(
      "3 rows, 2 columns from Scout, and 2 cards before it, about 640 words, with some of it cut to fit"
    );
    expect(eachWords({ columns: 2, before: { cards: 1, words: 90, leftOut: 1, cut: false } })).toBe("One row each, 2 columns, and 1 card before it, about 90 words, with 1 card further up left out to fit");
    expect(rowTooLong(["A"], [["a".repeat(MAX_CROSSING_LENGTH - 18)]])).toBe(false);
    expect(rowTooLong(["A"], [["a".repeat(MAX_CROSSING_LENGTH - 17)]])).toBe(true);
    expect(rowTooLong(["A"], [])).toBe(false);
  });
});

describe("files on a line, in words", () => {
  it("names the files that cross, and any the card has no room for", () => {
    expect(filesWords({ names: ["pitch.pdf"], leftOut: [] })).toBe("1 file: pitch.pdf");
    expect(filesWords({ names: ["pitch.pdf", "chart.png"], leftOut: [] })).toBe("2 files: pitch.pdf and chart.png");
    expect(filesWords({ names: ["a.md", "b.md", "c.md", "d.md"], leftOut: [] })).toBe("4 files: a.md, b.md and 2 more");
    expect(filesWords({ names: ["Smith, Jones.pdf"], leftOut: [] })).toBe("1 file: Smith, Jones.pdf");
    expect(filesWords({ names: ["a.pdf"], leftOut: ["big.pdf"] })).toBe("1 file: a.pdf, with 1 file left out, since the card has no room for it: big.pdf");
    expect(filesWords({ names: [], leftOut: ["x.pdf", "y.pdf"] })).toBe("2 files left out, since the card has no room for them: x.pdf and y.pdf");
  });

  it("puts a card's part and its files together, or either alone", () => {
    const thread = { kind: "thread" as const, answers: 1, earlier: 0, words: 900, cut: false };
    expect(lineWords({ whole: thread, files: { names: ["pitch.pdf"], leftOut: [] } }, "Scout")).toBe("Scout’s answer, about 900 words, and 1 file: pitch.pdf");
    expect(lineWords({ whole: null, files: { names: ["pitch.pdf"], leftOut: [] } }, "pitch.pdf")).toBe("1 file: pitch.pdf");
    expect(lineWords({ whole: thread }, "Scout")).toBe("Scout’s answer, about 900 words");
    expect(lineWords({ whole: null, files: { names: [], leftOut: [] } }, "Scout")).toBeNull();
  });
});
