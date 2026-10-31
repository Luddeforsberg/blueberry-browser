import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Bookmark } from "../shared/library";

export class BookmarkStore {
  private bookmarks: Bookmark[] = [];

  constructor(private readonly file: string) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(raw)) {
        this.bookmarks = raw.filter((item): item is Bookmark =>
          item && typeof item.id === "string" && typeof item.title === "string" &&
          typeof item.url === "string" && /^https?:\/\//i.test(item.url)
        );
      }
    } catch {
      // A missing or unreadable file leaves the library empty, like settings.
    }
  }

  get(): Bookmark[] {
    return this.bookmarks;
  }

  toggle(url: string, title: string): void {
    if (!/^https?:\/\//i.test(url)) return;
    const existing = this.bookmarks.find((bookmark) => bookmark.url === url);
    this.save(existing
      ? this.bookmarks.filter((bookmark) => bookmark.id !== existing.id)
      : [...this.bookmarks, { id: randomUUID(), title: title || url, url }]);
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
