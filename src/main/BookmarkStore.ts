import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Bookmark } from "../shared/library";

const WEB = /^https?:\/\//i;
// A page names its own icon, so it could name one of any length. Longer than this, the site shows its letter.
export const MAX_ICON_LENGTH = 2048;
// Only an icon on the web, never a data address or anything else a page could name.
const webIcon = (favicon: unknown) =>
  typeof favicon === "string" && favicon.length <= MAX_ICON_LENGTH && WEB.test(favicon) ? { favicon } : {};

export class BookmarkStore {
  private bookmarks: Bookmark[] = [];

  constructor(private readonly file: string) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(raw)) {
        this.bookmarks = raw
          .filter(
            (item): item is Bookmark =>
              item && typeof item.id === "string" && typeof item.title === "string" && typeof item.url === "string" && WEB.test(item.url),
          )
          .map(({ id, title, url, favicon }) => ({ id, title, url, ...webIcon(favicon) }));
      }
    } catch {
      // A missing or unreadable file leaves the library empty, like settings.
    }
  }

  get(): Bookmark[] {
    return this.bookmarks;
  }

  has(url: string): boolean {
    return this.bookmarks.some((bookmark) => bookmark.url === url);
  }

  // Saves a page at the end. One already saved stays as it is.
  add(url: string, title: string, favicon: string | null = null): void {
    if (!WEB.test(url) || this.has(url)) return;
    this.save([...this.bookmarks, { id: randomUUID(), title: title || url, url, ...webIcon(favicon) }]);
  }

  // Puts a saved site at a place in this list, keeping its id, and moves it there if it's in the list already. The
  // place counts the others, so it's where it ends up.
  place(site: Bookmark, index: number): void {
    if (!WEB.test(site.url)) return;
    const others = this.bookmarks.filter((bookmark) => bookmark.url !== site.url);
    const at = Math.max(0, Math.min(Math.trunc(index) || 0, others.length));
    const placed = { id: site.id, title: site.title, url: site.url, ...webIcon(site.favicon) };
    this.save([...others.slice(0, at), placed, ...others.slice(at)]);
  }

  removeUrl(url: string): void {
    if (this.has(url)) this.save(this.bookmarks.filter((bookmark) => bookmark.url !== url));
  }

  private save(bookmarks: Bookmark[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(bookmarks, null, 2));
    renameSync(temp, this.file);
    this.bookmarks = bookmarks;
  }
}
