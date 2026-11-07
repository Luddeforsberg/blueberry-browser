import { cellParts, exportCellText, type PickedRows } from "../shared/nestTable";

// Tables in and out of a Nest: a CSV or TSV file the user adds becomes a table card's rows, and any card's table goes out
// as a CSV file or as cells on the clipboard. Pure, so main does all of it and a renderer never names a path.

// Enough for a lead list or an export from a CRM, and few enough to read through when the card is opened. A board carries
// only the first rows, and what crosses a line is cut to fit anyway.
export const MAX_TABLE_ROWS = 2000;
export const MAX_TABLE_COLUMNS = 30;
// 2,000 rows of 30 columns at about 30 characters a cell, and nothing that big is a list someone made by hand.
export const MAX_TABLE_BYTES = 2 * 1024 * 1024;
const MAX_TITLE_LENGTH = 80;
const MAX_HEADER_LENGTH = 100;

export type TableFile = { ok: true; table: { name: string } & PickedRows } | { ok: false; error: string };

const counted = (value: number) => value.toLocaleString("en-US");

// The cells of a CSV or TSV text, as RFC 4180 has them: a quoted cell may hold the delimiter, a line break or a doubled
// quote, and a line may end in CRLF or LF. A byte order mark at the start is ignored, and so is a line with nothing on
// it at all, though not one with a quoted empty cell.
export const parseDelimited = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  // Whether anything, even a quote or a delimiter, is on the line so far.
  let touched = false;
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (touched) rows.push(row);
    row = [];
    touched = false;
  };
  for (; index < text.length; index++) {
    const char = text[index];
    if (char !== "\n" && char !== "\r") touched = true;
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = false;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) endCell();
    else if (char === "\n") endRow();
    else if (char === "\r") {
      if (text[index + 1] === "\n") index++;
      endRow();
    } else cell += char;
  }
  // A last line with no line break still counts, and a file ending in one has no empty row after it.
  endRow();
  return rows;
};

// Which delimiter a CSV file uses: a comma, or the semicolon that Excel writes where a comma is the decimal mark, or a
// tab, whichever the first line has most of outside quotes.
export const sniffDelimiter = (text: string): string => {
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  const [most, times] = [...counts].reduce((best, each) => (each[1] > best[1] ? each : best));
  return times > 0 ? most : ",";
};

// UTF-8, or else the Windows code page Excel saves CSV in.
const decode = (bytes: Uint8Array): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
};

// A table card's title: the file's name without its extension.
export const tableTitle = (name: string): string => {
  const title = name.replace(/\.(csv|tsv|txt)$/i, "").replace(/\s+/g, " ").trim() || "Table";
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : title;
};

// A CSV or TSV file as a table: its first line the header, and every line after it a row with as many cells. A header
// cell with no words is named by its place, so every column can be told apart.
export const tableFromFile = (name: string, bytes: Uint8Array): TableFile => {
  const kind = /\.tsv$/i.test(name) ? "tsv" : /\.csv$/i.test(name) ? "csv" : null;
  if (!kind) return { ok: false, error: `${name} isn’t a CSV or TSV file. Save it as CSV and add that.` };
  if (bytes.length > MAX_TABLE_BYTES) return { ok: false, error: `${name} is more than the 2 MB a table can be.` };
  if (bytes.includes(0)) return { ok: false, error: `${name} doesn’t look like a ${kind.toUpperCase()} file.` };
  const text = decode(bytes);
  // The first line is the header, even with nothing in its cells, and every line after it with anything on it is a row.
  const lines = parseDelimited(text, kind === "tsv" ? "\t" : sniffDelimiter(text));
  if (lines.length < 2) return { ok: false, error: `${name} has no rows under its first line.` };
  // Counted without spreading, since a file far past the row limit can have more lines than a call takes arguments.
  const columns = lines.reduce((most, cells) => Math.max(most, cells.length), 0);
  if (columns > MAX_TABLE_COLUMNS) return { ok: false, error: `${name} has ${columns} columns, and a table can have ${MAX_TABLE_COLUMNS} at most.` };
  const rows = lines.length - 1;
  if (rows > MAX_TABLE_ROWS) {
    return { ok: false, error: `${name} has ${counted(rows)} rows, and a table can have ${counted(MAX_TABLE_ROWS)} at most. Split it and add each part.` };
  }
  // A column's name is a name, so one far longer is cut, and the header always fits in what crosses a line.
  const header = Array.from({ length: columns }, (_, column) => {
    const words = lines[0][column]?.trim() || `Column ${column + 1}`;
    return words.length > MAX_HEADER_LENGTH ? `${words.slice(0, MAX_HEADER_LENGTH - 1).trimEnd()}…` : words;
  });
  return {
    ok: true,
    table: { name: tableTitle(name), header, rows: lines.slice(1).map((cells) => header.map((_, column) => cells[column]?.trim() ?? "")) },
  };
};

// A cell as words for a spreadsheet: a link is its words and its address, and emphasis and code marks go.
export const exportCell = exportCellText;

// A spreadsheet runs a cell starting with these as a formula, and a table's words came from web pages, so such a cell
// starts with an apostrophe and stays text. A plain number keeps its sign.
const guard = (text: string): string => (/^[=+\-@\t\r]/.test(text) && !/^[-+]?\d[\d.,]*%?$/.test(text) ? `'${text}` : text);

const csvCell = (cell: string): string => {
  const text = guard(exportCell(cell));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// A CSV file Excel and Sheets both open as it is: a byte order mark so Excel reads it as UTF-8, and CRLF line ends.
export const toCsv = ({ header, rows }: PickedRows): string => `\uFEFF${[header, ...rows].map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;

// Cells as Sheets and Excel paste them: tab between cells and a line for each row, so neither can be inside a cell.
export const toTsv = ({ header, rows }: PickedRows): string =>
  [header, ...rows].map((cells) => cells.map((cell) => guard(exportCell(cell).replace(/[\t\r\n]+/g, " "))).join("\t")).join("\n");

const escapeHtml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The same as an HTML table, which a spreadsheet pastes as cells with their links, and a document as a table.
export const toHtmlTable = ({ header, rows }: PickedRows): string => {
  // Links stay links, and everything else is plain words, in the same words as the CSV.
  const cellHtml = (cell: string) => {
    const parts = cellParts(cell);
    let html = guard(exportCell(cell)) === exportCell(cell) ? "" : "'";
    for (let at = 0; at < parts.length; at++) {
      const { href } = parts[at];
      let words = parts[at].text;
      while (href && parts[at + 1]?.href === href) words += parts[++at].text;
      html += href ? `<a href="${escapeHtml(href)}">${escapeHtml(words)}</a>` : escapeHtml(words).replace(/\n/g, "<br>");
    }
    return html;
  };
  const line = (cells: readonly string[], tag: "th" | "td") => `<tr>${cells.map((cell) => `<${tag}>${cellHtml(cell)}</${tag}>`).join("")}</tr>`;
  return `<table><thead>${line(header, "th")}</thead><tbody>${rows.map((cells) => line(cells, "td")).join("")}</tbody></table>`;
};

// What a saved file is called, from the card's title.
export const csvFileName = (title: string): string => `${[...title].map((char) => (char < " " || '\\/:*?"<>|'.includes(char) ? " " : char)).join("").replace(/\s+/g, " ").trim().slice(0, 80) || "Table"}.csv`;
