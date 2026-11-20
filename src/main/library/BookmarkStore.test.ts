import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { BookmarkStore, MAX_ICON_LENGTH } from "./BookmarkStore";
import { defined } from "../../shared/testing";

const tempFolder = () => mkdtempSync(join(tmpdir(), "blueberry-bookmarks-"));
const site = { id: "a", title: "Example", url: "https://example.com/" };
const savedFile = (folder: string, lists: unknown) => writeFileSync(join(folder, "saved-sites.json"), JSON.stringify(lists));
const onDisk = (folder: string): unknown => JSON.parse(readFileSync(join(folder, "saved-sites.json"), "utf8"));
const lists = (store: BookmarkStore) => ({ pinned: store.pinned, bookmarks: store.bookmarks });

describe("BookmarkStore", () => {
  it("starts empty with no file, or one it can't read", () => {
    const folder = tempFolder();
    expect(lists(new BookmarkStore(folder))).toEqual({ pinned: [], bookmarks: [] });
    writeFileSync(join(folder, "saved-sites.json"), "not json");
    expect(lists(new BookmarkStore(folder))).toEqual({ pinned: [], bookmarks: [] });
    savedFile(folder, ["not", "two lists"]);
    expect(lists(new BookmarkStore(folder))).toEqual({ pinned: [], bookmarks: [] });
  });

  it("keeps only valid web sites from the file", () => {
    const folder = tempFolder();
    savedFile(folder, { pinned: [null, { id: 1 }], bookmarks: [site, { ...site, id: "b", url: "file:///etc/passwd" }] });
    expect(lists(new BookmarkStore(folder))).toEqual({ pinned: [], bookmarks: [site] });
  });

  it("adding saves a site across restarts once, and removing its address takes it from both lists", () => {
    const folder = tempFolder();
    const store = new BookmarkStore(folder);
    expect(store.add("bookmarks", site.url, site.title)).toBe(true);
    expect(store.add("favourites", site.url, "A new title")).toBe(true);
    expect(new BookmarkStore(folder).bookmarks).toMatchObject([{ title: site.title, url: site.url }]);
    expect(store.pinned).toEqual([]);

    store.add("favourites", "https://pinned.example/", "Pinned");
    expect(store.removeUrl("https://elsewhere.example/")).toBe(true);
    store.removeUrl(site.url);
    store.removeUrl("https://pinned.example/");
    expect(onDisk(folder)).toEqual({ pinned: [], bookmarks: [] });
  });

  it("keeps the icon the page named, only if it's on the web and up to its limit", () => {
    const icon = (length: number) => `https://a.example/${"i".repeat(length - "https://a.example/".length)}`;
    const folder = tempFolder();
    const store = new BookmarkStore(folder);
    store.add("bookmarks", "https://a.example/", "A", icon(MAX_ICON_LENGTH));
    store.add("bookmarks", "https://b.example/", "B", icon(MAX_ICON_LENGTH + 1));
    store.add("bookmarks", "https://c.example/", "C", "data:image/png;base64,AAAA");
    expect(new BookmarkStore(folder).bookmarks.map(({ favicon }) => favicon?.length)).toEqual([MAX_ICON_LENGTH, undefined, undefined]);

    savedFile(folder, {
      pinned: [],
      bookmarks: [
        { ...site, favicon: "javascript:alert(1)" },
        { ...site, id: "b", url: "https://b.example/", favicon: 7 },
      ],
    });
    expect(new BookmarkStore(folder).bookmarks).toEqual([site, { ...site, id: "b", url: "https://b.example/" }]);
  });

  it("uses the address when a page has no title, and saves nothing but a web page", () => {
    const store = new BookmarkStore(tempFolder());
    store.add("bookmarks", site.url, "");
    store.add("bookmarks", "about:blank", "Blank");
    store.add("favourites", "file:///etc/passwd", "Passwords");
    expect(lists(store)).toEqual({ pinned: [], bookmarks: [{ id: expect.any(String), title: site.url, url: site.url }] });
  });

  it("places a site where it ends up, in either list, keeping its id and leaving the other list", () => {
    const folder = tempFolder();
    const store = new BookmarkStore(folder);
    for (const name of ["a", "b", "c"]) store.add("bookmarks", `https://${name}.example/`, name.toUpperCase());
    const titles = () => store.bookmarks.map(({ title }) => title);
    const { id } = defined(store.bookmarks[0]);

    // Within its list, counting the others, and past either end or not a number it stops at the end or the start.
    store.place(id, "bookmarks", 1);
    expect(titles()).toEqual(["B", "A", "C"]);
    store.place(id, "bookmarks", 99);
    expect(titles()).toEqual(["B", "C", "A"]);
    store.place(id, "bookmarks", -4);
    expect(titles()).toEqual(["A", "B", "C"]);
    store.place(id, "bookmarks", Number.NaN);
    expect(titles()).toEqual(["A", "B", "C"]);

    // To the other list, in one write: it's never in both, and never in neither.
    expect(store.place(id, "favourites", 0)).toBe(true);
    expect(onDisk(folder)).toEqual({ pinned: [{ id, title: "A", url: "https://a.example/" }], bookmarks: store.bookmarks });
    expect(titles()).toEqual(["B", "C"]);
    expect(store.place("not-saved", "favourites", 0)).toBe(true);
    expect(store.pinned).toHaveLength(1);
  });

  it("changes nothing, and says so, when the lists can't be saved", () => {
    const folder = tempFolder();
    const store = new BookmarkStore(folder);
    store.add("bookmarks", site.url, site.title);
    const before = lists(store);
    // The write goes beside the file first, so a folder in that place makes it fail.
    mkdirSync(join(folder, "saved-sites.json.tmp"));

    expect(store.place(defined(store.bookmarks[0]).id, "favourites", 0)).toBe(false);
    expect(store.add("bookmarks", "https://b.example/", "B")).toBe(false);
    expect(store.removeUrl(site.url)).toBe(false);
    expect(lists(store)).toEqual(before);
    expect(lists(new BookmarkStore(folder))).toEqual(before);
  });

  it("brings in the two old files once, a site saved both ways staying on top, and leaves them as they were", () => {
    const folder = tempFolder();
    const pin = { id: "p", title: "Pin", url: "https://pin.example/" };
    const both = { id: "b", title: "Both", url: "https://both.example/" };
    const old = {
      pinned: JSON.stringify([pin, both, { ...pin, id: "p2" }]),
      // The same site by address, and another site with an id already taken.
      bookmarks: JSON.stringify([site, { ...both, id: "b2" }, { ...site, id: "p", url: "https://taken.example/" }]),
    };
    writeFileSync(join(folder, "pinned.json"), old.pinned);
    writeFileSync(join(folder, "bookmarks.json"), old.bookmarks);

    const expected = { pinned: [pin, both], bookmarks: [site] };
    expect(lists(new BookmarkStore(folder))).toEqual(expected);
    expect(onDisk(folder)).toEqual(expected);
    expect(readFileSync(join(folder, "pinned.json"), "utf8")).toBe(old.pinned);
    expect(readFileSync(join(folder, "bookmarks.json"), "utf8")).toBe(old.bookmarks);

    // From then on the one file is what counts.
    writeFileSync(join(folder, "pinned.json"), JSON.stringify([{ id: "x", title: "X", url: "https://x.example/" }]));
    expect(lists(new BookmarkStore(folder))).toEqual(expected);
  });

  it("saves nothing while an old file can't be read, so none of it is lost", () => {
    const folder = tempFolder();
    // A folder in its place can't be read as a file, as a locked one couldn't.
    mkdirSync(join(folder, "pinned.json"));
    writeFileSync(join(folder, "bookmarks.json"), JSON.stringify([site]));

    const store = new BookmarkStore(folder);
    expect(lists(store)).toEqual({ pinned: [], bookmarks: [site] });
    expect(store.add("bookmarks", "https://b.example/", "B")).toBe(false);
    expect(store.bookmarks).toEqual([site]);
    expect(existsSync(join(folder, "saved-sites.json"))).toBe(false);
  });
});
