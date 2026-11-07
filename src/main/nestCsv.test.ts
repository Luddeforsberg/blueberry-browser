import { describe, expect, it } from "vitest";
import { csvFileName, exportCell, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, parseDelimited, sniffDelimiter, tableFromFile, tableTitle, toCsv, toHtmlTable, toTsv } from "./nestCsv";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("parseDelimited", () => {
  it("reads quoted cells with commas, doubled quotes and line breaks in them", () => {
    expect(parseDelimited('Company,Note\n"Fjällbo, AB","Said ""hej""\nthen left"\nBrygga,ok\n', ",")).toEqual([
      ["Company", "Note"],
      ["Fjällbo, AB", 'Said "hej"\nthen left'],
      ["Brygga", "ok"],
    ]);
  });

  it("takes CRLF and LF alike, ignores a byte order mark, and keeps a last line with no line break", () => {
    expect(parseDelimited("\uFEFFa,b\r\n1,2\r\n3,4", ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps empty cells, and reads tabs as the delimiter in a TSV", () => {
    expect(parseDelimited("a\t\tc\n\t2\t\n", "\t")).toEqual([
      ["a", "", "c"],
      ["", "2", ""],
    ]);
  });

  it("is nothing for an empty file", () => {
    expect(parseDelimited("", ",")).toEqual([]);
    expect(parseDelimited("\uFEFF", ",")).toEqual([]);
  });
});

describe("sniffDelimiter", () => {
  it("finds the semicolon Excel writes where a comma is the decimal mark, and ignores what's in quotes", () => {
    expect(sniffDelimiter("Company;Revenue\nFjällbo;1,5")).toBe(";");
    expect(sniffDelimiter('"a;b;c",d\n')).toBe(",");
    expect(sniffDelimiter("one")).toBe(",");
  });
});

describe("tableFromFile", () => {
  it("makes the first line the header and every line after it a row with as many cells", () => {
    const result = tableFromFile("Swedish leads.csv", bytes("Company,People,\nFjällbo,41\nBrygga,23,extra\n\n"));
    expect(result).toEqual({
      ok: true,
      table: { name: "Swedish leads", header: ["Company", "People", "Column 3"], rows: [["Fjällbo", "41", ""], ["Brygga", "23", "extra"]] },
    });
  });

  it("keeps a first line of empty cells as the header, naming each column by its place, and cuts a name far too long", () => {
    expect(tableFromFile("a.csv", bytes(",,\nAcme,42,CEO\n,,\nBrygga,23,CFO"))).toEqual({
      ok: true,
      table: { name: "a", header: ["Column 1", "Column 2", "Column 3"], rows: [["Acme", "42", "CEO"], ["", "", ""], ["Brygga", "23", "CFO"]] },
    });
    const long = tableFromFile("a.csv", bytes(`${"n".repeat(13000)}\n1`));
    expect(long.ok && long.table.header[0]).toBe(`${"n".repeat(99)}…`);
  });

  it("keeps a single empty quoted header as the header, and skips only lines with nothing on them", () => {
    expect(tableFromFile("a.csv", bytes('""\r\nAcme\r\n\r\nBrygga\r\n'))).toEqual({
      ok: true,
      table: { name: "a", header: ["Column 1"], rows: [["Acme"], ["Brygga"]] },
    });
    // A quoted empty cell is a row too: only a line with nothing on it at all is skipped.
    expect(tableFromFile("a.csv", bytes('Name\r\n""\r\nAcme\r\n'))).toMatchObject({ ok: true, table: { rows: [[""], ["Acme"]] } });
    expect(tableFromFile("a.csv", bytes('Name\r\n""\r\n'))).toMatchObject({ ok: true, table: { rows: [[""]] } });
  });

  it("reads a TSV by its tabs, and a file saved by Excel in its Windows code page", () => {
    expect(tableFromFile("a.tsv", bytes("x\ty\n1,5\t2"))).toMatchObject({ ok: true, table: { header: ["x", "y"], rows: [["1,5", "2"]] } });
    const latin = Uint8Array.from([...bytes("Stad\nG"), 0xf6, ...bytes("teborg\n")]);
    expect(tableFromFile("a.csv", latin)).toMatchObject({ ok: true, table: { rows: [["Göteborg"]] } });
  });

  it("refuses a file with no rows, one that isn't CSV or TSV, and one that's binary", () => {
    expect(tableFromFile("a.csv", bytes(""))).toEqual({ ok: false, error: "a.csv has no rows under its first line." });
    expect(tableFromFile("a.csv", bytes("Only,a,header\n"))).toEqual({ ok: false, error: "a.csv has no rows under its first line." });
    expect(tableFromFile("a.xlsx", bytes("a\n1"))).toEqual({ ok: false, error: "a.xlsx isn’t a CSV or TSV file. Save it as CSV and add that." });
    expect(tableFromFile("a.csv", Uint8Array.from([97, 0, 10, 49]))).toEqual({ ok: false, error: "a.csv doesn’t look like a CSV file." });
  });

  it("takes one row and the most rows, and refuses one past that", () => {
    const rows = (count: number) => bytes(`Name\n${Array.from({ length: count }, (_, index) => `Row ${index}`).join("\n")}`);
    expect(tableFromFile("a.csv", rows(1))).toMatchObject({ ok: true });
    const most = tableFromFile("a.csv", rows(MAX_TABLE_ROWS));
    expect(most.ok && most.table.rows).toHaveLength(MAX_TABLE_ROWS);
    expect(tableFromFile("a.csv", rows(MAX_TABLE_ROWS + 1))).toEqual({
      ok: false,
      error: "a.csv has 2,001 rows, and a table can have 2,000 at most. Split it and add each part.",
    });
  });

  it("refuses a file far past the row limit with why, rather than failing on its size", () => {
    expect(tableFromFile("a.csv", bytes(`Name\n${"x\n".repeat(150_000)}`))).toEqual({
      ok: false,
      error: "a.csv has 150,000 rows, and a table can have 2,000 at most. Split it and add each part.",
    });
  });

  it("takes the most columns, and refuses one past that", () => {
    const columns = (count: number) => bytes(`${Array.from({ length: count }, (_, index) => `C${index}`).join(",")}\n1`);
    expect(tableFromFile("a.csv", columns(MAX_TABLE_COLUMNS))).toMatchObject({ ok: true });
    expect(tableFromFile("a.csv", columns(MAX_TABLE_COLUMNS + 1))).toEqual({ ok: false, error: "a.csv has 31 columns, and a table can have 30 at most." });
  });
});

describe("tableTitle and csvFileName", () => {
  it("names a card after its file without the extension, and a saved file after the card, with nothing a file name can't hold", () => {
    expect(tableTitle("leads.CSV")).toBe("leads");
    expect(tableTitle(".csv")).toBe("Table");
    expect(csvFileName('Leads / Q3: "hot"')).toBe("Leads Q3 hot.csv");
    expect(csvFileName("")).toBe("Table.csv");
  });
});

const TABLE = {
  header: ["Company", "Note"],
  rows: [
    ["Fjällbo, AB", 'Said "hej"<br>twice'],
    ["[Brygga](https://brygga.se)", "**Hot** lead"],
    ["=HYPERLINK(\"https://evil.example\")", "-5"],
  ],
};

describe("exporting a table", () => {
  it("writes a cell's link as its words and address, and drops emphasis", () => {
    expect(exportCell("[Brygga](https://brygga.se)")).toBe("Brygga (https://brygga.se)");
    expect(exportCell("[https://brygga.se](https://brygga.se)")).toBe("https://brygga.se");
    expect(exportCell("**Hot** lead")).toBe("Hot lead");
  });

  it("writes CSV with a byte order mark and CRLF, quoting commas, quotes and line breaks, and keeps a formula as text", () => {
    expect(toCsv(TABLE)).toBe(
      '\uFEFFCompany,Note\r\n"Fjällbo, AB","Said ""hej""\ntwice"\r\nBrygga (https://brygga.se),Hot lead\r\n"\'=HYPERLINK(""https://evil.example"")",-5\r\n'
    );
  });

  it("keeps every cell a spreadsheet would run as a formula as text, in CSV, TSV and HTML, and a plain number as it is", () => {
    const risky = { header: ["Cell"], rows: [["=1+1"], ["+cmd"], ["-2+3"], ["@SUM(A1)"], ["\t=1"], ["\r=1"], ["-5"], ["+3.5%"]] };
    expect(toCsv(risky).split("\r\n").slice(1, -1)).toEqual(["'=1+1", "'+cmd", "'-2+3", "'@SUM(A1)", "'=1", "'=1", "-5", "+3.5%"]);
    expect(toTsv(risky).split("\n").slice(1)).toEqual(["'=1+1", "'+cmd", "'-2+3", "'@SUM(A1)", "'=1", "'=1", "-5", "+3.5%"]);
    expect(toHtmlTable(risky)).toContain("<td>&#39;=1+1</td>".replace("&#39;", "'"));
  });

  it("puts tab-separated cells on one line each, so a spreadsheet pastes them as cells", () => {
    expect(toTsv({ header: ["a", "b"], rows: [["one\ttwo", "x\ny"], ["@me", "+46 70"]] })).toBe("a\tb\none two\tx y\n'@me\t'+46 70");
  });

  it("writes an HTML table with links kept and nothing that can run", () => {
    const html = toHtmlTable({ header: ["Site"], rows: [["[Brygga](https://brygga.se)"], ["<script>x</script>"], ["[bad](javascript:alert)"]] });
    expect(html).toContain('<td><a href="https://brygga.se/">Brygga</a></td>');
    expect(html).toContain("<td>&lt;script&gt;x&lt;/script&gt;</td>");
    expect(html).toContain("<td>bad</td>");
    expect(html).not.toContain("javascript:");
  });
});
