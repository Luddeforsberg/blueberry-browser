import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import type { NestBoard, NestCard, NestLine } from "../shared/library";
import { migrate } from "./database";

const MIGRATIONS = [
  `CREATE TABLE nests (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE cards (
     id TEXT PRIMARY KEY,
     nest_id TEXT NOT NULL REFERENCES nests(id) ON DELETE CASCADE,
     chat_id TEXT UNIQUE,
     mascot_id TEXT,
     x REAL NOT NULL,
     y REAL NOT NULL
   );
   CREATE INDEX cards_by_nest ON cards(nest_id);
   -- A card continues from at most one other, so it always says which answer it gets.
   CREATE TABLE lines (
     id TEXT PRIMARY KEY,
     nest_id TEXT NOT NULL REFERENCES nests(id) ON DELETE CASCADE,
     from_card TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     to_card TEXT NOT NULL UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
     CHECK (from_card <> to_card)
   );`,
];

export interface StoredNest {
  id: string;
  title: string;
  updatedAt: number;
}

// Nests, their cards and the lines between them, in a SQLite file in the user data folder. A card's chat is kept by
// `ChatStore`, and only its id is here.
export class NestStore {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    migrate(this.db, MIGRATIONS);
  }

  // Newest first.
  nests(): StoredNest[] {
    return this.db
      .prepare("SELECT id, title, updated_at AS updatedAt FROM nests ORDER BY updated_at DESC, rowid DESC")
      .all() as unknown as StoredNest[];
  }

  board(id: string): NestBoard | null {
    const nest = this.db.prepare("SELECT id, title FROM nests WHERE id = ?").get(id) as unknown as Pick<NestBoard, "id" | "title"> | undefined;
    if (!nest) return null;
    const cards = this.db
      .prepare("SELECT id, chat_id AS chatId, mascot_id AS mascotId, x, y FROM cards WHERE nest_id = ? ORDER BY rowid")
      .all(id) as unknown as NestCard[];
    const lines = this.db
      .prepare("SELECT id, from_card AS \"from\", to_card AS \"to\" FROM lines WHERE nest_id = ? ORDER BY rowid")
      .all(id) as unknown as NestLine[];
    return { ...nest, cards, lines };
  }

  createNest(title: string): string {
    const id = randomUUID();
    this.db.prepare("INSERT INTO nests (id, title, updated_at) VALUES (?, ?, ?)").run(id, title, Date.now());
    return id;
  }

  renameNest(id: string, title: string): boolean {
    return this.db.prepare("UPDATE nests SET title = ?, updated_at = ? WHERE id = ?").run(title, Date.now(), id).changes > 0;
  }

  // Its cards and lines go with it. Their chats are the caller's to delete, so it gets their ids first.
  deleteNest(id: string): boolean {
    return this.db.prepare("DELETE FROM nests WHERE id = ?").run(id).changes > 0;
  }

  card(id: string): (NestCard & { nestId: string }) | null {
    return (
      (this.db
        .prepare("SELECT id, nest_id AS nestId, chat_id AS chatId, mascot_id AS mascotId, x, y FROM cards WHERE id = ?")
        .get(id) as unknown as (NestCard & { nestId: string }) | undefined) ?? null
    );
  }

  // The card a chat belongs to, or null for an ordinary chat.
  cardOfChat(chatId: string): (NestCard & { nestId: string }) | null {
    const row = this.db.prepare("SELECT id FROM cards WHERE chat_id = ?").get(chatId) as { id: string } | undefined;
    return row ? this.card(row.id) : null;
  }

  chatIds(nestId?: string): string[] {
    const rows = (
      nestId === undefined
        ? this.db.prepare("SELECT chat_id FROM cards WHERE chat_id IS NOT NULL").all()
        : this.db.prepare("SELECT chat_id FROM cards WHERE nest_id = ? AND chat_id IS NOT NULL ORDER BY rowid").all(nestId)
    ) as { chat_id: string }[];
    return rows.map((row) => row.chat_id);
  }

  // A draft, and the line from the card it was pulled out of if there is one, in one go. Null if the nest or that card
  // isn't there, or the card is in another nest.
  addCard(nestId: string, { x, y, mascotId = null, from = null }: { x: number; y: number; mascotId?: string | null; from?: string | null }): NestCard | null {
    const id = randomUUID();
    this.db.exec("BEGIN");
    try {
      if (!this.db.prepare("SELECT 1 FROM nests WHERE id = ?").get(nestId)) throw new NotHere();
      if (from !== null && this.card(from)?.nestId !== nestId) throw new NotHere();
      this.db.prepare("INSERT INTO cards (id, nest_id, chat_id, mascot_id, x, y) VALUES (?, ?, NULL, ?, ?, ?)").run(id, nestId, mascotId, x, y);
      if (from !== null) {
        this.db.prepare("INSERT INTO lines (id, nest_id, from_card, to_card) VALUES (?, ?, ?, ?)").run(randomUUID(), nestId, from, id);
      }
      this.touch(nestId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (error instanceof NotHere) return null;
      throw error;
    }
    return { id, chatId: null, mascotId, x, y };
  }

  moveCard(id: string, x: number, y: number): boolean {
    return this.db.prepare("UPDATE cards SET x = ?, y = ? WHERE id = ?").run(x, y, id).changes > 0;
  }

  // Only while it's a draft. A sent card belongs to its chat's bird.
  setBird(id: string, mascotId: string | null): boolean {
    return this.db.prepare("UPDATE cards SET mascot_id = ? WHERE id = ? AND chat_id IS NULL").run(mascotId, id).changes > 0;
  }

  // Once, when the draft is first sent.
  setChat(id: string, chatId: string): boolean {
    const card = this.card(id);
    const done = this.db.prepare("UPDATE cards SET chat_id = ? WHERE id = ? AND chat_id IS NULL").run(chatId, id).changes > 0;
    if (done && card) this.touch(card.nestId);
    return done;
  }

  // The card it continues from, if any.
  sourceOf(id: string): NestCard | null {
    const row = this.db.prepare("SELECT from_card FROM lines WHERE to_card = ?").get(id) as { from_card: string } | undefined;
    return row ? this.card(row.from_card) : null;
  }

  // Lines to and from it go too.
  deleteCard(id: string): boolean {
    const card = this.card(id);
    const done = this.db.prepare("DELETE FROM cards WHERE id = ?").run(id).changes > 0;
    if (done && card) this.touch(card.nestId);
    return done;
  }

  // Something happened in it, so it moves up the list.
  touch(nestId: string): void {
    this.db.prepare("UPDATE nests SET updated_at = ? WHERE id = ?").run(Date.now(), nestId);
  }
}

class NotHere extends Error {}
