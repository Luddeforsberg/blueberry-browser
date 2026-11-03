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
          .filter((item): item is Bookmark =>
            item && typeof item.id === "string" && typeof item.title === "string" &&
            typeof item.url === "string" && WEB.test(item.url)
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

  toggle(url: string, title: string, favicon: string | null = null): void {
    if (!WEB.test(url)) return;
    const existing = this.bookmarks.find((bookmark) => bookmark.url === url);
    this.save(existing
      ? this.bookmarks.filter((bookmark) => bookmark.id !== existing.id)
      : [...this.bookmarks, { id: randomUUID(), title: title || url, url, ...webIcon(favicon) }]);
  }

  remove(id: string): void {
    this.save(this.bookmarks.filter((bookmark) => bookmark.id !== id));
  }

  private save(bookmarks: Bookmark[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(bookmarks, null, 2));
    renameSync(temp, this.file);
    this.bookmarks = bookmarks;
  }
}
