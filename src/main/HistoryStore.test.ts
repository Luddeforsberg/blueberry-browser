import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { HistoryStore } from "./HistoryStore";

const tempFile = () => join(mkdtempSync(join(tmpdir(), "blueberry-history-")), "history.db");

describe("HistoryStore", () => {
  it("keeps visits after reopening the file", () => {
    const file = tempFile();
    new HistoryStore(file).record("https://a.example/", "A", null, 1);

    expect(new HistoryStore(file).recent()).toEqual([
      { url: "https://a.example/", title: "A", favicon: null, visitedAt: 1 },
    ]);
  });

  it("lists each page once in recent, newest first, up to the limit", () => {
    const history = new HistoryStore(":memory:");
    history.record("https://a.example/", "A", null, 1);
    history.record("https://b.example/", "B", null, 2);
    history.record("https://a.example/", "", null, 3);

    expect(history.recent().map((visit) => [visit.url, visit.title, visit.visitedAt])).toEqual([
      ["https://a.example/", "A", 3],
      ["https://b.example/", "B", 2],
    ]);
    expect(history.recent(1)).toHaveLength(1);
    expect(history.recent(0)).toEqual([]);
  });

  it("keeps each return to a page, but not a reload", () => {
    const history = new HistoryStore(":memory:");
    history.record("https://a.example/", "A", null, 1);
    history.record("https://a.example/", "A", null, 2);
    history.record("https://b.example/", "B", null, 3);
    history.record("https://a.example/", "A", null, 4);

    expect(history.search().entries.map((entry) => [entry.url, entry.visitedAt])).toEqual([
      ["https://a.example/", 4],
      ["https://b.example/", 3],
      ["https://a.example/", 2],
    ]);
  });

  it("keeps a return to the same page once the last visit is over half an hour old", () => {
    const history = new HistoryStore(":memory:");
    const halfHour = 30 * 60 * 1000;
    history.record("https://a.example/", "A", null, 1);
    history.record("https://a.example/", "A", null, halfHour);
    history.record("https://a.example/", "A", null, 2 * halfHour);

    expect(history.search().entries.map((entry) => entry.visitedAt)).toEqual([2 * halfHour, halfHour]);
  });

  it("ignores internal and local pages", () => {
    const history = new HistoryStore(":memory:");
    history.record("blueberry://new-tab", "New tab", null);
    history.record("file:///etc/hosts", "hosts", null);

    expect(history.recent()).toEqual([]);
  });

  it("fills in the title and favicon of the newest visit once the page reports them", () => {
    const history = new HistoryStore(":memory:");
    history.record("https://a.example/", "", null, 1);
    expect(history.recent()[0].title).toBe("https://a.example/");

    history.update("https://a.example/", { title: "A page", favicon: "https://a.example/icon.png" });
    expect(history.recent()[0]).toMatchObject({ title: "A page", favicon: "https://a.example/icon.png" });

    history.update("https://a.example/", { title: "", favicon: null });
    expect(history.recent()[0]).toMatchObject({ title: "A page", favicon: "https://a.example/icon.png" });
  });

  it("searches titles and addresses, treating wildcards as plain text", () => {
    const history = new HistoryStore(":memory:");
    history.record("https://a.example/", "Jackdaws", null, 1);
    history.record("https://b.example/100%25", "Half_off", null, 2);

    const titles = (query: string) => history.search({ query }).entries.map((entry) => entry.title);
    expect(titles("JACKDAW")).toEqual(["Jackdaws"]);
    expect(titles("b.example")).toEqual(["Half_off"]);
    expect(titles("  ")).toEqual(["Half_off", "Jackdaws"]);
    expect(titles("_")).toEqual(["Half_off"]);
    expect(titles("%")).toEqual(["Half_off"]);
    expect(titles("nothing")).toEqual([]);
  });

  it("pages through visits that share a time without losing or repeating any", () => {
    const history = new HistoryStore(":memory:");
    history.importVisits(
      [1, 2, 3, 4, 5].map((n) => ({ url: `https://${n}.example/`, title: `${n}`, favicon: null, visitedAt: 7 }))
    );

    const first = history.search({ limit: 2 });
    const second = history.search({ limit: 2, before: first.next! });
    const third = history.search({ limit: 2, before: second.next! });
    expect([...first.entries, ...second.entries, ...third.entries].map((entry) => entry.title)).toEqual([
      "5", "4", "3", "2", "1",
    ]);
    expect(third.next).toBeNull();

    // A full last page has nothing after it.
    expect(history.search({ limit: 5 }).next).toBeNull();
    expect(history.search({ limit: 4 }).next).not.toBeNull();
    expect(history.search({ limit: 0 }).entries).toHaveLength(1);
  });

  it("deletes one entry and says which address it was", () => {
    const history = new HistoryStore(":memory:");
    history.record("https://a.example/", "A", null, 1);
    history.record("https://b.example/", "B", null, 2);
    const { id } = history.search({ query: "a.example" }).entries[0];

    expect(history.delete(id)).toBe("https://a.example/");
    expect(history.delete(id)).toBeNull();
    expect(history.recent().map((visit) => visit.url)).toEqual(["https://b.example/"]);
  });

  it("clears everything from the file itself, so the addresses can't be read back", () => {
    const file = tempFile();
    const history = new HistoryStore(file);
    history.record("https://very-private.example/", "Secret", null, 1);
    history.clear();

    expect(history.recent()).toEqual([]);
    const bytes = readFileSync(file).toString("latin1") + readFileSync(`${file}-wal`).toString("latin1");
    expect(bytes).not.toContain("very-private");
  });

  it("imports only web visits, and importing again adds nothing", () => {
    const history = new HistoryStore(":memory:");
    const visits = [
      { url: "https://a.example/", title: "A", favicon: null, visitedAt: 5 },
      { url: "https://b.example/", title: "", favicon: null, visitedAt: 6 },
      { url: "file:///etc/hosts", title: "hosts", favicon: null, visitedAt: 7 },
      { url: "https://c.example/", title: "C", favicon: null, visitedAt: Number.NaN },
    ];

    expect(history.importVisits([])).toBe(0);
    expect(history.importVisits(visits)).toBe(2);
    expect(history.importVisits(visits)).toBe(0);
    expect(history.recent().map((visit) => visit.title)).toEqual(["https://b.example/", "A"]);
  });
});
