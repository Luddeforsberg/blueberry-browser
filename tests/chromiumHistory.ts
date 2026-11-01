import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";

const CHROMIUM_EPOCH_MS = 11_644_473_600_000n;

export const chromiumTime = (ms: number): bigint => (BigInt(ms) + CHROMIUM_EPOCH_MS) * 1000n;

// A History file in Chromium's format, with only the tables and columns that matter. Left open for the caller to close.
export const writeChromiumHistory = (file: string, visits: { url: string; title: string; visitedAt: number; hidden?: boolean }[]): DatabaseSync => {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE urls (id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR, visit_count INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0);
    CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER NOT NULL, visit_time INTEGER NOT NULL);
    CREATE INDEX visits_time_index ON visits (visit_time);
  `);
  const ids = new Map<string, number>();
  const addUrl = db.prepare("INSERT INTO urls (url, title, hidden) VALUES (?, ?, ?)");
  const addVisit = db.prepare("INSERT INTO visits (url, visit_time) VALUES (?, ?)");
  db.exec("BEGIN");
  for (const { url, title, visitedAt, hidden } of visits) {
    if (!ids.has(url)) ids.set(url, Number(addUrl.run(url, title, hidden ? 1 : 0).lastInsertRowid));
    addVisit.run(ids.get(url) as number, chromiumTime(visitedAt));
  }
  db.exec("COMMIT");
  return db;
};

// Where Chrome's file goes in a folder laid out like the Mac's Application Support.
export const chromeHistoryFile = (base: string, profile = "Default"): string => join(base, "Google", "Chrome", profile, "History");
