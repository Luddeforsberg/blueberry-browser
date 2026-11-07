import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import type { NestBoard, NestCard, NestForEach, NestLine, NestRun, NestRunState } from "../shared/library";
import type { PickedRows } from "../shared/nestTable";
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
  // The rows the user picked when pulling a line out, kept as they were. A card sent with For each row keeps its prompt
  // and its table's header, and each row is a run with a chat of its own.
  `ALTER TABLE lines ADD COLUMN picked TEXT;
   ALTER TABLE cards ADD COLUMN each_prompt TEXT;
   ALTER TABLE cards ADD COLUMN each_header TEXT;
   CREATE TABLE runs (
     id TEXT PRIMARY KEY,
     card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     row TEXT NOT NULL,
     chat_id TEXT UNIQUE,
     state TEXT NOT NULL CHECK (state IN ('waiting', 'started', 'stopped', 'failed'))
   );
   CREATE INDEX runs_by_card ON runs(card_id, position);`,
];

interface CardRow {
  id: string;
  nestId: string;
  chatId: string | null;
  mascotId: string | null;
  x: number;
  y: number;
  eachPrompt: string | null;
  eachHeader: string | null;
}

interface RunRow {
  id: string;
  cardId: string;
  row: string;
  chatId: string | null;
  state: NestRunState;
}

const CARD_COLUMNS = "id, nest_id AS nestId, chat_id AS chatId, mascot_id AS mascotId, x, y, each_prompt AS eachPrompt, each_header AS eachHeader";
const RUN_COLUMNS = "id, card_id AS cardId, row, chat_id AS chatId, state";

const toRun = ({ id, row, chatId, state }: RunRow): NestRun => ({ id, row: JSON.parse(row) as string[], chatId, state });

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
    const cards = (this.db.prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE nest_id = ? ORDER BY rowid`).all(id) as unknown as CardRow[]).map(
      (row) => this.toCard(row)
    );
    const lines = (
      this.db.prepare("SELECT id, from_card AS \"from\", to_card AS \"to\", picked FROM lines WHERE nest_id = ? ORDER BY rowid").all(id) as unknown as (Omit<NestLine, "picked"> & { picked: string | null })[]
    ).map((line) => ({ ...line, picked: line.picked ? (JSON.parse(line.picked) as PickedRows) : null }));
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
    const row = this.db.prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE id = ?`).get(id) as unknown as CardRow | undefined;
    return row ? { ...this.toCard(row), nestId: row.nestId } : null;
  }

  private toCard({ id, chatId, mascotId, x, y, eachPrompt, eachHeader }: CardRow): NestCard {
    const each: NestForEach | null =
      eachPrompt === null
        ? null
        : {
            prompt: eachPrompt,
            header: JSON.parse(eachHeader ?? "[]") as string[],
            runs: (this.db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE card_id = ? ORDER BY position`).all(id) as unknown as RunRow[]).map(toRun),
          };
    return { id, chatId, mascotId, x, y, each };
  }

  // The card a chat belongs to, or null for an ordinary chat.
  cardOfChat(chatId: string): (NestCard & { nestId: string }) | null {
    const row = this.db.prepare("SELECT id FROM cards WHERE chat_id = ?").get(chatId) as { id: string } | undefined;
    return row ? this.card(row.id) : null;
  }

  // Its cards' chats, and their runs'.
  chatIds(nestId?: string): string[] {
    const rows = (
      nestId === undefined
        ? this.db.prepare("SELECT chat_id FROM cards WHERE chat_id IS NOT NULL UNION ALL SELECT chat_id FROM runs WHERE chat_id IS NOT NULL").all()
        : this.db
            .prepare(
              `SELECT chat_id FROM (
                 SELECT cards.rowid AS card, 0 AS position, chat_id FROM cards WHERE nest_id = ? AND chat_id IS NOT NULL
                 UNION ALL
                 SELECT cards.rowid, runs.position + 1, runs.chat_id FROM runs JOIN cards ON cards.id = runs.card_id
                 WHERE cards.nest_id = ? AND runs.chat_id IS NOT NULL
               ) ORDER BY card, position`
            )
            .all(nestId, nestId)
    ) as { chat_id: string }[];
    return rows.map((row) => row.chat_id);
  }

  // A draft, and the line from the card it was pulled out of if there is one, in one go. Null if the nest or that card
  // isn't there, or the card is in another nest.
  addCard(
    nestId: string,
    { x, y, mascotId = null, from = null, picked = null }: { x: number; y: number; mascotId?: string | null; from?: string | null; picked?: PickedRows | null }
  ): NestCard | null {
    const id = randomUUID();
    this.db.exec("BEGIN");
    try {
      if (!this.db.prepare("SELECT 1 FROM nests WHERE id = ?").get(nestId)) throw new NotHere();
      if (from !== null && this.card(from)?.nestId !== nestId) throw new NotHere();
      this.db.prepare("INSERT INTO cards (id, nest_id, chat_id, mascot_id, x, y) VALUES (?, ?, NULL, ?, ?, ?)").run(id, nestId, mascotId, x, y);
      if (from !== null) {
        this.db
          .prepare("INSERT INTO lines (id, nest_id, from_card, to_card, picked) VALUES (?, ?, ?, ?, ?)")
          .run(randomUUID(), nestId, from, id, picked ? JSON.stringify(picked) : null);
      }
      this.touch(nestId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (error instanceof NotHere) return null;
      throw error;
    }
    return { id, chatId: null, mascotId, x, y, each: null };
  }

  moveCard(id: string, x: number, y: number): boolean {
    return this.db.prepare("UPDATE cards SET x = ?, y = ? WHERE id = ?").run(x, y, id).changes > 0;
  }

  // Only while it's a draft. A sent card belongs to its chat's bird.
  setBird(id: string, mascotId: string | null): boolean {
    return this.db.prepare("UPDATE cards SET mascot_id = ? WHERE id = ? AND chat_id IS NULL AND each_prompt IS NULL").run(mascotId, id).changes > 0;
  }

  // Once, when the draft is first sent.
  setChat(id: string, chatId: string): boolean {
    const card = this.card(id);
    const done = this.db.prepare("UPDATE cards SET chat_id = ? WHERE id = ? AND chat_id IS NULL AND each_prompt IS NULL").run(chatId, id).changes > 0;
    if (done && card) this.touch(card.nestId);
    return done;
  }

  // The card it continues from, if any.
  sourceOf(id: string): NestCard | null {
    return this.lineTo(id)?.source ?? null;
  }

  // The line into a card: where it comes from, and the rows picked from it if any.
  lineTo(id: string): { source: NestCard; picked: PickedRows | null } | null {
    const row = this.db.prepare("SELECT from_card, picked FROM lines WHERE to_card = ?").get(id) as { from_card: string; picked: string | null } | undefined;
    const source = row && this.card(row.from_card);
    return source ? { source, picked: row.picked ? (JSON.parse(row.picked) as PickedRows) : null } : null;
  }

  // A draft becomes a For-each card, with one waiting run for each row, in one go. False if it isn't a draft.
  startForEach(id: string, prompt: string, header: string[], rows: string[][]): boolean {
    const card = this.card(id);
    if (!card) return false;
    this.db.exec("BEGIN");
    try {
      const changed = this.db
        .prepare("UPDATE cards SET each_prompt = ?, each_header = ? WHERE id = ? AND chat_id IS NULL AND each_prompt IS NULL")
        .run(prompt, JSON.stringify(header), id).changes;
      if (changed === 0) throw new NotHere();
      const insert = this.db.prepare("INSERT INTO runs (id, card_id, position, row, chat_id, state) VALUES (?, ?, ?, ?, NULL, 'waiting')");
      rows.forEach((row, position) => insert.run(randomUUID(), id, position, JSON.stringify(row)));
      this.touch(card.nestId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (error instanceof NotHere) return false;
      throw error;
    }
    return true;
  }

  run(id: string): (NestRun & { cardId: string }) | null {
    const row = this.db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`).get(id) as unknown as RunRow | undefined;
    return row ? { ...toRun(row), cardId: row.cardId } : null;
  }

  runOfChat(chatId: string): (NestRun & { cardId: string }) | null {
    const row = this.db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE chat_id = ?`).get(chatId) as unknown as RunRow | undefined;
    return row ? { ...toRun(row), cardId: row.cardId } : null;
  }

  // Every run waiting for its turn, on any card, oldest first.
  waitingRuns(): (NestRun & { cardId: string })[] {
    return (this.db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE state = 'waiting' ORDER BY rowid`).all() as unknown as RunRow[]).map((row) => ({
      ...toRun(row),
      cardId: row.cardId,
    }));
  }

  // The chats of every run that has started, on any card.
  startedRunChats(): string[] {
    return (this.db.prepare("SELECT chat_id FROM runs WHERE state = 'started' AND chat_id IS NOT NULL").all() as { chat_id: string }[]).map((row) => row.chat_id);
  }

  // Only a waiting run moves on, so a run never starts twice.
  setRunChat(id: string, chatId: string): boolean {
    return this.db.prepare("UPDATE runs SET chat_id = ?, state = 'started' WHERE id = ? AND state = 'waiting'").run(chatId, id).changes > 0;
  }

  setRunState(id: string, state: "stopped" | "failed"): boolean {
    return this.db.prepare("UPDATE runs SET state = ? WHERE id = ? AND state = 'waiting'").run(state, id).changes > 0;
  }

  // The runs still waiting on one card, or on every card, never start. How many there were.
  stopWaiting(cardId?: string): number {
    return cardId === undefined
      ? Number(this.db.prepare("UPDATE runs SET state = 'stopped' WHERE state = 'waiting'").run().changes)
      : Number(this.db.prepare("UPDATE runs SET state = 'stopped' WHERE state = 'waiting' AND card_id = ?").run(cardId).changes);
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
