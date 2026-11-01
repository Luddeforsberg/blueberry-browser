import { copyFile } from "fs/promises";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chromeHistoryFile, chromiumTime, writeChromiumHistory } from "../../tests/chromiumHistory";
import { browserDataFor, findBrowsers, readBrowserHistory, type BrowserData } from "./browserHistory";

// Records every file the reader copies, and still copies it.
vi.mock("fs/promises", async (original) => {
  const actual = await original<typeof import("fs/promises")>();
  return { ...actual, copyFile: vi.fn(actual.copyFile) };
});

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1, 12);
const page = (name: string, visitedAt: number) => ({ url: `https://${name}.example/`, title: name, visitedAt });

describe("reading another browser's history", () => {
  let base: string;
  let tempRoot: string;
  let data: BrowserData;
  const read = (id = "chrome", now = NOW) => readBrowserHistory(data, id, { now, tempRoot });
  const fixture = (visits: Parameters<typeof writeChromiumHistory>[1], profile = "Default") => writeChromiumHistory(chromeHistoryFile(base, profile), visits).close();

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "blueberry-browsers-"));
    tempRoot = mkdtempSync(join(tmpdir(), "blueberry-temp-"));
    data = { base, layout: "mac" };
    vi.mocked(copyFile).mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    expect(readdirSync(tempRoot)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("names only browsers with a History file in a profile, Default or Profile N", async () => {
    expect(await findBrowsers(data)).toEqual([]);
    mkdirSync(join(base, "Google", "Chrome", "Crashpad"), { recursive: true });
    mkdirSync(join(base, "Arc", "User Data", "Profile 2"), { recursive: true });
    mkdirSync(join(base, "Microsoft Edge", "System Profile"), { recursive: true });
    writeFileSync(join(base, "Microsoft Edge", "System Profile", "History"), "");
    expect(await findBrowsers(data)).toEqual([]);

    writeFileSync(join(base, "Arc", "User Data", "Profile 2", "History"), "");
    fixture([]);
    expect(await findBrowsers(data)).toEqual([{ id: "chrome", name: "Chrome" }, { id: "arc", name: "Arc" }]);
    expect(await findBrowsers(null)).toEqual([]);
  });

  it("converts Chromium's time, and keeps only visits from the last 90 days up to now", async () => {
    fixture([
      page("too-old", NOW - 90 * DAY - 1),
      page("oldest", NOW - 90 * DAY),
      page("recent", NOW - DAY),
      page("just-now", NOW),
      page("future", NOW + 1),
    ]);
    expect(await read()).toEqual([
      { url: "https://just-now.example/", title: "just-now", favicon: null, visitedAt: NOW },
      { url: "https://recent.example/", title: "recent", favicon: null, visitedAt: NOW - DAY },
      { url: "https://oldest.example/", title: "oldest", favicon: null, visitedAt: NOW - 90 * DAY },
    ]);
  });

  it("stops at the row limit, keeping the newest, across profiles", async () => {
    const many = Array.from({ length: 50_001 }, (_, index) => ({ ...page("busy", NOW - index * 1000) }));
    fixture(many);
    fixture([page("other", NOW - 500)], "Profile 1");
    const visits = await read();
    expect(visits).toHaveLength(50_000);
    expect(visits?.[0].visitedAt).toBe(NOW);
    expect(visits?.some(({ title }) => title === "other")).toBe(true);
  });

  it("reads visits still in the write-ahead log", async () => {
    const db = writeChromiumHistory(chromeHistoryFile(base), [page("old", NOW - DAY)]);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;");
    db.prepare("INSERT INTO visits (url, visit_time) VALUES (1, ?)").run(chromiumTime(NOW - 1000));
    // Left open, as a running browser would, so the log stays beside the file.
    expect((await read())?.map(({ visitedAt }) => visitedAt)).toEqual([NOW - 1000, NOW - DAY]);
    db.close();
  });

  it("gives a clean failure for a damaged, odd or missing file, and keeps the other profiles", async () => {
    mkdirSync(join(base, "Google", "Chrome", "Default"), { recursive: true });
    writeFileSync(chromeHistoryFile(base), "this is not a database, and it never was one");
    expect(await read()).toBeNull();

    fixture([page("fine", NOW - DAY)], "Profile 1");
    expect((await read())?.map(({ title }) => title)).toEqual(["fine"]);

    const odd = join(base, "Arc", "User Data", "Default");
    mkdirSync(odd, { recursive: true });
    new (await import("node:sqlite")).DatabaseSync(join(odd, "History")).close();
    expect(await read("arc")).toBeNull();

    expect(await read("../../secrets")).toBeNull();
    expect(await readBrowserHistory(null, "chrome", { tempRoot })).toBeNull();
  });

  it("copies only the history file, and takes nothing but address, title and time", async () => {
    const db = writeChromiumHistory(chromeHistoryFile(base), [page("site", NOW - DAY), { ...page("frame", NOW - DAY), hidden: true }]);
    db.exec(`
      CREATE TABLE logins (password_value TEXT); INSERT INTO logins VALUES ('hunter2');
      CREATE TABLE keyword_search_terms (term TEXT); INSERT INTO keyword_search_terms VALUES ('hunter3');
    `);
    db.close();
    const profile = join(base, "Google", "Chrome", "Default");
    writeFileSync(join(profile, "Login Data"), "hunter4");
    writeFileSync(join(profile, "Cookies"), "hunter5");

    const visits = await read();
    expect(visits).toEqual([{ url: "https://site.example/", title: "site", favicon: null, visitedAt: NOW - DAY }]);
    expect(JSON.stringify(visits)).not.toContain("hunter");
    expect(vi.mocked(copyFile).mock.calls.map(([from]) => from)).toEqual([chromeHistoryFile(base), `${chromeHistoryFile(base)}-wal`]);
  });
});

describe("where browsers keep their data", () => {
  const paths = { appData: "/app", localAppData: "/local", override: "/demo" };

  it("only lets an unpackaged app be pointed elsewhere", () => {
    expect(browserDataFor("darwin", { ...paths, packaged: false })).toEqual({ base: "/demo", layout: "mac" });
    expect(browserDataFor("darwin", { ...paths, packaged: true })).toEqual({ base: "/app", layout: "mac" });
    expect(browserDataFor("win32", { ...paths, packaged: true })).toEqual({ base: "/local", layout: "windows" });
    expect(browserDataFor("linux", { ...paths, packaged: true })).toBeNull();
  });
});
