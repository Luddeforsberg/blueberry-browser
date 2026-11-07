// Markdown tables in a Nest card's answer: which one is the card's result, its rows, and how rows go back to markdown
// when they're passed to another card. Shared by main, which decides what's sent, and the chrome, which draws it.

export interface Table {
  header: string[];
  rows: string[][];
  // The words before the table, for a closed card to show above it.
  before: string;
}

// The rows a user picked, kept on the line as they were, so what's sent is only ever what was selected.
export interface PickedRows {
  header: string[];
  rows: string[][];
}

// Why a card won't send rows it was given once they've gone from the card they came from.
export const STALE_ROWS = "The rows you picked aren’t in that card’s latest answer any more. Pull a new line out of it to pick again.";

// One past this many rows, For each row refuses to start.
export const MAX_RUNS = 25;
// How many runs of For each row go at once, everywhere, because the Mac and the sites can't take more.
export const RUNS_AT_ONCE = 3;

const FENCE = /^\s{0,3}(```|~~~)/;
const DELIMITER_CELL = /^:?-+:?$/;

// A row's cells, split on pipes that aren't escaped. A pipe at either end is only the edge.
export const splitRow = (line: string): string[] => {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\\" && text[index + 1] === "|") {
      cell += "|";
      index++;
    } else if (char === "|") {
      cells.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
};

const isDelimiter = (line: string, columns: number): boolean => {
  if (!line.includes("-")) return false;
  const cells = splitRow(line);
  return cells.length === columns && cells.every((cell) => DELIMITER_CELL.test(cell));
};

const looksLikeRow = (line: string): boolean => line.includes("|") && line.trim() !== "";

// Every table in the text, outside code. With `streaming`, a last line with no newline yet is still being written, so
// it doesn't count until it ends.
const tablesIn = (markdown: string, streaming: boolean): (Table & { start: number })[] => {
  const lines = markdown.split("\n");
  if (streaming && !markdown.endsWith("\n")) lines.pop();
  const tables: (Table & { start: number })[] = [];
  let inFence = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !looksLikeRow(line) || index + 1 >= lines.length) continue;
    const header = splitRow(line);
    if (!isDelimiter(lines[index + 1], header.length)) continue;
    const rows: string[][] = [];
    let next = index + 2;
    for (; next < lines.length && looksLikeRow(lines[next]) && !FENCE.test(lines[next]); next++) {
      const cells = splitRow(lines[next]);
      // As GitHub does: a short row gets empty cells, and a long one loses what's past the header.
      rows.push(header.map((_, column) => cells[column] ?? ""));
    }
    tables.push({ header, rows, before: "", start: index });
    index = next - 1;
  }
  return tables.map((table) => ({ ...table, before: lines.slice(0, table.start).join("\n").trim() }));
};

// The table that's the card's result: the one with the most rows, and the first of those. A short summary table beside
// a long list doesn't take its place. Null when there's no table with at least one row.
export const findTable = (markdown: string, { streaming = false } = {}): Table | null => {
  let best: Table | null = null;
  for (const { header, rows, before } of tablesIn(markdown, streaming)) {
    if (rows.length > 0 && (!best || rows.length > best.rows.length)) best = { header, rows, before };
  }
  return best;
};

// What a cell says, for drawing: links become their words, and emphasis and code marks go.
export const plainCell = (cell: string): string =>
  cell
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/(\*\*|__|\*|_|`)(?=\S)([^*_`]*?\S)\1/g, "$2")
    .trim();

// What a run is called on the card: its row's first cell with words in it.
export const rowName = (row: readonly string[]): string => plainCell(row.find((cell) => plainCell(cell) !== "") ?? "") || "A row";

const sameRow = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((cell, index) => cell === b[index]);

// The picked rows that aren't in the table any more, so a card never sends rows its source no longer gives.
export const missingRows = (picked: PickedRows, table: Table | null): string[][] =>
  picked.rows.filter((row) => !table || !sameRow(picked.header, table.header) || !table.rows.some((each) => sameRow(each, row)));

const cellText = (cell: string) => cell.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");

// Rows back as a markdown table, for the model.
export const tableMarkdown = (header: readonly string[], rows: readonly (readonly string[])[]): string =>
  [header, header.map(() => "---"), ...rows].map((cells) => `| ${cells.map(cellText).join(" | ")} |`).join("\n");

// Why For each row can't start with this many rows, or null when it can.
export const runCountProblem = (count: number): string | null => {
  if (count < 1) return "There are no rows to run on.";
  if (count > MAX_RUNS) return `For each row runs at most ${MAX_RUNS} times, and this has ${count} rows. Select ${MAX_RUNS} or fewer.`;
  return null;
};
