import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { BookmarkStore } from "./BookmarkStore";

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

  it("toggling saves a site across restarts, and toggling again removes it", () => {
    const file = tempFile();
    const store = new BookmarkStore(file);
    store.toggle(site.url, site.title);
    expect(new BookmarkStore(file).get()).toMatchObject([{ title: site.title, url: site.url }]);

    store.toggle(site.url, "A new title");
    expect(store.get()).toEqual([]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("uses the address when a page has no title", () => {
    const store = new BookmarkStore(tempFile());
    store.toggle(site.url, "");
    expect(store.get()[0].title).toBe(site.url);
  });

  it("won't save anything but a web page", () => {
    const store = new BookmarkStore(tempFile());
    store.toggle("about:blank", "Blank");
    store.toggle("file:///etc/passwd", "Passwords");
    expect(store.get()).toEqual([]);
  });

  it("removes one site by id and ignores an unknown id", () => {
    const store = new BookmarkStore(tempFile());
    store.toggle("https://a.example/", "A");
    store.toggle("https://b.example/", "B");
    const [first, second] = store.get();
    store.remove("missing");
    expect(store.get()).toEqual([first, second]);
    store.remove(first.id);
    expect(store.get()).toEqual([second]);
  });
});
