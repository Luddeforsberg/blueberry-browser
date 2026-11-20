import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { BookmarkStore, MAX_ICON_LENGTH } from "./BookmarkStore";
import { defined } from "../../shared/testing";

const tempFile = () => join(mkdtempSync(join(tmpdir(), "blueberry-bookmarks-")), "pinned.json");
const site = { id: "a", title: "Example", url: "https://example.com/" };

describe("BookmarkStore", () => {
  it("starts empty with no file, or one it can't read", () => {
    const file = tempFile();
    expect(new BookmarkStore(file).get()).toEqual([]);
    writeFileSync(file, "not json");
    expect(new BookmarkStore(file).get()).toEqual([]);
    writeFileSync(file, JSON.stringify({ not: "a list" }));
    expect(new BookmarkStore(file).get()).toEqual([]);
  });

  it("keeps only valid web sites from the file", () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify([site, { ...site, url: "file:///etc/passwd" }, { id: 1 }, null]));
    expect(new BookmarkStore(file).get()).toEqual([site]);
  });

  it("adding saves a site across restarts once, and removing its address takes it away", () => {
    const file = tempFile();
    const store = new BookmarkStore(file);
    store.add(site.url, site.title);
    store.add(site.url, "A new title");
    expect(new BookmarkStore(file).get()).toMatchObject([{ title: site.title, url: site.url }]);

    store.removeUrl("https://elsewhere.example/");
    expect(store.get()).toHaveLength(1);
    store.removeUrl(site.url);
    expect(store.get()).toEqual([]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("keeps the icon the page named, only if it's on the web", () => {
    const file = tempFile();
    const store = new BookmarkStore(file);
    store.add("https://a.example/", "A", "https://cdn.a.example/icon.png");
    store.add("https://b.example/", "B", "data:image/png;base64,AAAA");
    store.add("https://c.example/", "C");
    expect(new BookmarkStore(file).get().map(({ favicon }) => favicon)).toEqual(["https://cdn.a.example/icon.png", undefined, undefined]);

    writeFileSync(
      file,
      JSON.stringify([
        { ...site, favicon: "javascript:alert(1)" },
        { ...site, id: "b", favicon: 7 },
      ]),
    );
    expect(new BookmarkStore(file).get()).toEqual([site, { ...site, id: "b" }]);
  });

  it("keeps an icon address up to its limit, and drops a longer one, when saving and when reading the file", () => {
    const icon = (length: number) => `https://a.example/${"i".repeat(length - "https://a.example/".length)}`;
    const file = tempFile();
    const store = new BookmarkStore(file);
    store.add("https://a.example/", "A", icon(MAX_ICON_LENGTH));
    store.add("https://b.example/", "B", icon(MAX_ICON_LENGTH + 1));
    expect(store.get().map(({ favicon }) => favicon?.length)).toEqual([MAX_ICON_LENGTH, undefined]);

    writeFileSync(
      file,
      JSON.stringify([
        { ...site, favicon: icon(MAX_ICON_LENGTH) },
        { ...site, id: "b", favicon: icon(1024 * 1024) },
      ]),
    );
    expect(new BookmarkStore(file).get()).toEqual([
      { ...site, favicon: icon(MAX_ICON_LENGTH) },
      { ...site, id: "b" },
    ]);
  });

  it("uses the address when a page has no title", () => {
    const store = new BookmarkStore(tempFile());
    store.add(site.url, "");
    expect(defined(store.get()[0]).title).toBe(site.url);
  });

  it("won't save anything but a web page", () => {
    const store = new BookmarkStore(tempFile());
    store.add("about:blank", "Blank");
    store.add("file:///etc/passwd", "Passwords");
    expect(store.get()).toEqual([]);
  });

  it("places a site where it ends up, moving it if it's there already, and keeps its id", () => {
    const file = tempFile();
    const store = new BookmarkStore(file);
    for (const name of ["a", "b", "c"]) store.add(`https://${name}.example/`, name.toUpperCase());
    const titles = () => store.get().map(({ title }) => title);
    const moved = { id: "kept", title: "D", url: "https://d.example/" };

    store.place(moved, 1);
    expect(titles()).toEqual(["A", "D", "B", "C"]);
    expect(defined(new BookmarkStore(file).get()[1]).id).toBe("kept");
    // Later, to the end, and earlier, counting the others.
    store.place(moved, 3);
    expect(titles()).toEqual(["A", "B", "C", "D"]);
    store.place(moved, 0);
    expect(titles()).toEqual(["D", "A", "B", "C"]);
    // Past either end, or not a number, it stops at the end or the start.
    store.place(moved, 99);
    expect(titles()).toEqual(["A", "B", "C", "D"]);
    store.place(moved, -4);
    expect(titles()).toEqual(["D", "A", "B", "C"]);
    store.place(moved, Number.NaN);
    expect(titles()).toEqual(["D", "A", "B", "C"]);
    expect(store.get().filter(({ url }) => url === moved.url)).toHaveLength(1);
  });

  it("won't place anything but a web page, or an icon from anywhere else", () => {
    const store = new BookmarkStore(tempFile());
    store.place({ id: "x", title: "X", url: "file:///etc/passwd" }, 0);
    store.place({ id: "y", title: "Y", url: "https://y.example/", favicon: "data:image/png;base64,AAAA" }, 0);
    expect(store.get()).toEqual([{ id: "y", title: "Y", url: "https://y.example/" }]);
  });
});
