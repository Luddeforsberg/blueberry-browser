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

// How much of a card's answer or table crosses a line: plenty for a list or a write-up, and short enough that one card
// can't crowd out the job it's passed to.
export const MAX_CROSSING_LENGTH = 12000;
// One room for everything that crosses into a card when it's sent: its inputs' threads and tables, and what those cards
// got from further up the chain. A run of For each row keeps the smaller room above, since a card can make 25 of them.
export const MAX_CONTEXT_LENGTH = 24000;

// A file's table goes with every board as its first rows only, each cell cut, enough for a closed card. The card asks
// main for the whole table when it's shown.
export const TABLE_PREVIEW_ROWS = 5;
export const PREVIEW_CELL_LENGTH = 200;

// One past this many rows, For each row refuses to start.
export const MAX_RUNS = 25;
// A card reads from this many cards at most, so their answers still fit in one room together.
export const MAX_INPUTS = 4;
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
  const found = findTableLines(markdown, { streaming });
  return found && { header: found.header, rows: found.rows, before: found.before };
};

// The same table, with the lines it takes in the text: `start` is its header's, and `end` is one past its last row's.
export const findTableLines = (markdown: string, { streaming = false } = {}): (Table & { start: number; end: number }) | null => {
  let best: (Table & { start: number }) | null = null;
  for (const table of tablesIn(markdown, streaming)) {
    if (table.rows.length > 0 && (!best || table.rows.length > best.rows.length)) best = table;
  }
  return best && { ...best, end: best.start + 2 + best.rows.length };
};

// What a cell says, for drawing: links become their words, and emphasis and code marks go.
export const plainCell = (cell: string): string => unmark(cell.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")).trim();

// Line breaks and emphasis and code marks, gone, with nothing trimmed.
const unmark = (text: string): string => text.replace(/<br\s*\/?>/gi, " ").replace(/(\*\*|__|\*|_|`)(?=\S)([^*_`]*?\S)\1/g, "$2");

// What a run is called on the card: its row's first cell with words in it.
export const rowName = (row: readonly string[]): string => plainCell(row.find((cell) => plainCell(cell) !== "") ?? "") || "A row";

const sameRow = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((cell, index) => cell === b[index]);

// The picked rows that aren't in the table any more, so a card never sends rows its source no longer gives.
export const missingRows = (picked: PickedRows, table: PickedRows | null): string[][] =>
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

// The table a For-each card makes: the rows it ran on, with their columns, and one column of its own, each row's short
// value in it, empty until that row's run has one. What crosses a line out of it, what it shows and what's exported.
export const combinedTable = (each: { header: readonly string[]; column: string; runs: readonly { row: readonly string[]; cell: string | null }[] }): PickedRows => ({
  header: [...each.header, each.column],
  rows: each.runs.map((run) => [...each.header.map((_, column) => run.row[column] ?? ""), run.cell ?? ""]),
});

// Only a web address can be a link in a cell, so a cell can't run script or open a file.
export const safeHref = (href: string): string | null => {
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};

export interface CellPart {
  text: string;
  href?: string;
}

const LINKS = /(!?)\[([^\]]*)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>|)\]]+)/g;

// What a cell says, with its links kept: a markdown link is its words linking to its address, and a bare web address
// links to itself. An image is only its words, and anything that isn't a web address is plain text.
export const cellParts = (cell: string): CellPart[] => {
  const parts: CellPart[] = [];
  const add = (text: string, href?: string) => {
    if (!text) return;
    const last = parts.at(-1);
    if (!href && last && !last.href) last.text += text;
    else parts.push(href ? { text, href } : { text });
  };
  let at = 0;
  for (const match of cell.matchAll(LINKS)) {
    add(cell.slice(at, match.index));
    const [whole, image, words, address, bare] = match;
    // A full stop or comma after a bare address ends the sentence, not the address.
    const target = bare ? bare.replace(/[.,;:!?]+$/, "") : address;
    const href = safeHref(target) ?? undefined;
    if (bare) add(target, href);
    if (bare) add(bare.slice(target.length));
    else if (image || !href) add(words);
    else add(words || address, href);
    at = match.index + whole.length;
  }
  add(cell.slice(at));
  // Emphasis and code marks go from the words, as in `plainCell`, and the cell's own ends are trimmed.
  const shown = parts.map((part) => ({ ...part, text: part.href ? part.text : unmark(part.text) }));
  if (shown[0] && !shown[0].href) shown[0].text = shown[0].text.trimStart();
  const last = shown.at(-1);
  if (last && !last.href) last.text = last.text.trimEnd();
  return shown.filter((part) => part.text !== "");
};

// What crosses a line, counted from what's sent, so a card can say exactly that: a card's thread, in answers and words
// and what was left out, or a table, in rows and columns and how many rows were left out to fit. `before` is what came
// with it from further up the chain: the cards the source itself read from, and theirs.
export interface Before {
  cards: number;
  words: number;
  // Cards further up with no room left for any of them.
  leftOut: number;
  // Whether any of what did go was cut.
  cut: boolean;
}

export type Crossing =
  | { kind: "thread"; answers: number; earlier: number; words: number; cut: boolean; before?: Before }
  | { kind: "table"; rows: number; columns: number; leftOut: number; before?: Before };

// On every line: what crosses as it is, and what each run gets when For each row is on, or null where it can't be.
export interface LineCrossing {
  // The rows picked on it aren't all in its source's table any more, so it gives nothing.
  stale: boolean;
  whole: Crossing | null;
  // `cut` when a row is too long to go whole, so it's cut to the first characters that fit.
  each: { rows: number; columns: number; cut?: boolean; before?: Before } | null;
  // With several inputs and For each row on: this is the line the runs go row by row on.
  drives?: boolean;
  // With several inputs and For each row on, on every other line: what each run gets from it as shared context.
  shared?: Crossing | null;
}

const count = (value: number) => value.toLocaleString("en-US");
const counted = (value: number, one: string, many = `${one}s`) => `${count(value)} ${value === 1 ? one : many}`;

// About as many words as a reader would guess: exact when few, then to the nearest ten, then hundred.
const aboutWords = (words: number) => {
  if (words < 20) return counted(words, "word");
  const step = words < 1000 ? 10 : 100;
  return `about ${count(Math.round(words / step) * step)} words`;
};

// ", with 1 earlier answer and 2 cards further up left out and some of it cut to fit", or nothing when all of it went.
const lossWords = (leftOut: readonly string[], cut: boolean) => {
  const said = [leftOut.length > 0 ? `${leftOut.join(" and ")} left out` : "", cut ? "some of it cut" : ""].filter(Boolean);
  return said.length > 0 ? `, with ${said.join(" and ")} to fit` : "";
};

const beforeLost = (before: Before | undefined) => (before && before.leftOut > 0 ? [counted(before.leftOut, "card") + " further up"] : []);

// "Scout’s answer, about 900 words", "Scout’s thread (2 answers) and 1 card before it, about 1,800 words", "12 rows,
// 3 columns from Writer", with anything left out or cut said plainly.
export const crossingWords = (crossing: Crossing, who: string): string => {
  const { before } = crossing;
  const cardsBefore = before && before.cards > 0 ? counted(before.cards, "card") + " before it" : null;
  if (crossing.kind === "thread") {
    const own = crossing.answers === 1 ? `${who}’s answer` : `${who}’s thread (${counted(crossing.answers, "answer")})`;
    const lost = [...(crossing.earlier > 0 ? [counted(crossing.earlier, "earlier answer")] : []), ...beforeLost(before)];
    return `${own}${cardsBefore ? ` and ${cardsBefore}` : ""}, ${aboutWords(crossing.words + (before?.words ?? 0))}${lossWords(lost, crossing.cut || !!before?.cut)}`;
  }
  const shape = `${counted(crossing.rows, "row")}, ${counted(crossing.columns, "column")} from ${who}`;
  const lost = [...(crossing.leftOut > 0 ? [counted(crossing.leftOut, "more row")] : []), ...beforeLost(before)];
  return `${shape}${cardsBefore ? `, and ${cardsBefore}, ${aboutWords(before!.words)}` : ""}${lossWords(lost, !!before?.cut)}`;
};

// What each run of For each row gets.
export const eachWords = ({ columns, cut = false, before }: { columns: number; cut?: boolean; before?: Before }): string =>
  `One row each, ${counted(columns, "column")}${cut ? `, a row too long to go whole cut to its first ${count(MAX_CROSSING_LENGTH)} characters` : ""}` +
  (before && before.cards > 0 ? `, and ${counted(before.cards, "card")} before it, ${aboutWords(before.words)}` : "") +
  lossWords(beforeLost(before), !!before?.cut);

// Whether any of these rows is too long to go to a run whole.
export const rowTooLong = (header: readonly string[], rows: readonly (readonly string[])[]): boolean =>
  rows.some((row) => tableMarkdown(header, [row]).length > MAX_CROSSING_LENGTH);
