import { mkdirSync } from "fs";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import type { HistoryCursor, HistoryEntry, HistoryPage, Visit } from "../shared/ipc";
import { migrate } from "./database";

const MIGRATIONS = [
  `CREATE TABLE visits (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     url TEXT NOT NULL,
     title TEXT NOT NULL,
     favicon TEXT,
     visited_at INTEGER NOT NULL
   );
   CREATE UNIQUE INDEX visits_by_url ON visits(url, visited_at);
   CREATE INDEX visits_by_time ON visits(visited_at, id);`,
];

const RELOAD_WINDOW_MS = 30 * 60 * 1000;
const RECENT_LIMIT = 20;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

const isWeb = (url: string): boolean => /^https?:/i.test(url);

const ENTRY_COLUMNS = "id, url, title, favicon, visited_at AS visitedAt";

// Every page visited, newest first, in a SQLite file in the user data folder.
export class HistoryStore {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    // Deleting zeroes the data, so what the user removes doesn't stay readable in the file.
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;");
    migrate(this.db, MIGRATIONS);
  }

  private newestFor(url: string): HistoryEntry | undefined {
    return this.db
      .prepare(`SELECT ${ENTRY_COLUMNS} FROM visits WHERE url = ? ORDER BY visited_at DESC, id DESC LIMIT 1`)
      .get(url) as unknown as HistoryEntry | undefined;
  }

  record(url: string, title: string, favicon: string | null, now = Date.now()): void {
    if (!isWeb(url)) return;
    const previous = this.newestFor(url);
    const newest = this.db.prepare("SELECT id FROM visits ORDER BY visited_at DESC, id DESC LIMIT 1").get() as
      | { id: number }
      | undefined;
    const name = title || previous?.title || url;
    const icon = favicon ?? previous?.favicon ?? null;
    // Reloading a page isn't a new visit, so it only moves the last one on. Coming back to it later is one.
    if (previous && previous.id === newest?.id && now - previous.visitedAt < RELOAD_WINDOW_MS) {
      this.db
        .prepare("UPDATE OR IGNORE visits SET title = ?, favicon = ?, visited_at = ? WHERE id = ?")
        .run(name, icon, now, previous.id);
      return;
    }
    this.db
      .prepare("INSERT OR IGNORE INTO visits (url, title, favicon, visited_at) VALUES (?, ?, ?, ?)")
      .run(url, name, icon, now);
  }

  // Titles and favicons arrive after the navigation that recorded the visit.
  update(url: string, details: { title?: string; favicon?: string | null }): void {
    const newest = this.newestFor(url);
    if (!newest) return;
    this.db
      .prepare("UPDATE visits SET title = ?, favicon = ? WHERE id = ?")
      .run(details.title || newest.title, details.favicon ?? newest.favicon, newest.id);
  }

  // The newest visit to each page.
  recent(limit = RECENT_LIMIT): Visit[] {
    return this.db
      .prepare(
        `SELECT url, title, favicon, MAX(visited_at) AS visitedAt FROM visits
         GROUP BY url ORDER BY visitedAt DESC LIMIT ?`
      )
      .all(limit) as unknown as Visit[];
  }

  // Every visit since then, newest first, up to a limit.
  since(time: number, limit: number): Visit[] {
    return this.db
      .prepare("SELECT url, title, favicon, visited_at AS visitedAt FROM visits WHERE visited_at >= ? ORDER BY visited_at DESC, id DESC LIMIT ?")
      .all(time, limit) as unknown as Visit[];
  }

  // Newest first. Pass the last page's `next` as `before` to go on from it.
  search({
    query = "",
    before,
    limit = DEFAULT_PAGE_SIZE,
  }: { query?: string; before?: HistoryCursor; limit?: number } = {}): HistoryPage {
    const size = Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
    const pattern = `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`;
    const rows = this.db
      .prepare(
        `SELECT ${ENTRY_COLUMNS} FROM visits
         WHERE (title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')
           AND (? IS NULL OR visited_at < ? OR (visited_at = ? AND id < ?))
         ORDER BY visited_at DESC, id DESC LIMIT ?`
      )
      .all(
        pattern,
        pattern,
        before?.visitedAt ?? null,
        before?.visitedAt ?? null,
        before?.visitedAt ?? null,
        before?.id ?? null,
        size + 1
      ) as unknown as HistoryEntry[];
    const entries = rows.slice(0, size);
    const last = entries.at(-1);
    return {
      entries,
      next: rows.length > size && last ? { visitedAt: last.visitedAt, id: last.id } : null,
    };
  }

  // The address that was removed, so anything else holding it can forget it too.
  delete(id: number): string | null {
    const row = this.db.prepare("SELECT url FROM visits WHERE id = ?").get(id) as { url: string } | undefined;
    if (!row) return null;
    this.db.prepare("DELETE FROM visits WHERE id = ?").run(id);
    return row.url;
  }

  clear(): void {
    this.db.exec("DELETE FROM visits; PRAGMA wal_checkpoint(TRUNCATE);");
  }

  // For bringing history in from another browser. Importing the same visits twice adds nothing the second
  // time. Returns how many were added.
  importVisits(visits: Visit[]): number {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO visits (url, title, favicon, visited_at) VALUES (?, ?, ?, ?)"
    );
    let added = 0;
    this.db.exec("BEGIN");
    try {
      for (const { url, title, favicon, visitedAt } of visits) {
        if (!isWeb(url) || !Number.isFinite(visitedAt)) continue;
        added += Number(insert.run(url, title || url, favicon, Math.trunc(visitedAt)).changes);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return added;
  }
}
