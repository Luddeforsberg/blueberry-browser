import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import type { NestAttachment, NestBoard, NestCard, NestForEach, NestLine, NestPlanned, NestRequest, NestRun, NestRunState } from "../shared/library";
import type { SentAttachment } from "./nestFiles";
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
  // A card Berry planned: planned until the user runs the plan, then armed until it starts, or held, saying why it didn't.
  // It stops being a planned card once it starts. The Nest's conversation with Berry is its requests, each a few messages.
  `ALTER TABLE cards ADD COLUMN plan TEXT CHECK (plan IN ('planned', 'armed', 'held'));
   ALTER TABLE cards ADD COLUMN plan_prompt TEXT;
   ALTER TABLE cards ADD COLUMN plan_each INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE cards ADD COLUMN plan_waits INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE cards ADD COLUMN plan_table TEXT;
   ALTER TABLE cards ADD COLUMN plan_note TEXT;
   CREATE TABLE requests (
     id TEXT PRIMARY KEY,
     nest_id TEXT NOT NULL REFERENCES nests(id) ON DELETE CASCADE,
     open INTEGER NOT NULL
   );
   CREATE INDEX requests_by_nest ON requests(nest_id);
   CREATE TABLE talk (
     request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
     role TEXT NOT NULL CHECK (role IN ('user', 'berry')),
     text TEXT NOT NULL
   );
   CREATE INDEX talk_by_request ON talk(request_id);`,
  // What the user typed in the request a card was planned from. Berry wrote its prompt, so only these words are the user's.
  `ALTER TABLE cards ADD COLUMN said TEXT;`,
  // Files and notes on a card, or on the Nest's composer when there's no card. A file's bytes are copied in when it's
  // attached, so changing or moving it on disk changes nothing here.
  `CREATE TABLE attachments (
     id TEXT PRIMARY KEY,
     nest_id TEXT NOT NULL REFERENCES nests(id) ON DELETE CASCADE,
     card_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('file', 'note')),
     name TEXT NOT NULL,
     type TEXT NOT NULL,
     size INTEGER NOT NULL,
     pages INTEGER,
     data BLOB,
     note TEXT
   );
   CREATE INDEX attachments_by_card ON attachments(card_id);
   CREATE INDEX attachments_by_nest ON attachments(nest_id);`,
  `ALTER TABLE attachments ADD COLUMN source_id TEXT;`,
  // Every file or note has one owner, the composer or one card. A planned card only points at the composer's until Run,
  // which gives it a copy of each as they are then, so planning never copies, moves or deletes one. source_id, from the
  // step before, isn't needed for that. Anything already on a card is that card's own.
  `CREATE TABLE plan_attachments (
     card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
     PRIMARY KEY (card_id, attachment_id)
   );
   CREATE INDEX plan_attachments_by_attachment ON plan_attachments(attachment_id);
   ALTER TABLE attachments DROP COLUMN source_id;`,
  // A settled name is final: the user chose it, or the cheap model named the Nest from its first request. Until then it's
  // "New Nest", then that request's first words. Nests from before this keep theirs, except the old placeholder.
  `ALTER TABLE nests ADD COLUMN title_settled INTEGER NOT NULL DEFAULT 1;
   UPDATE nests SET title_settled = 0 WHERE title = 'Untitled nest';`,
];

export interface AttachmentRow {
  id: string;
  kind: "file" | "note";
  name: string;
  type: string;
  size: number;
  pages: number | null;
  note: string | null;
}

const ATTACHMENT_COLUMNS = "id, kind, name, type, size, pages, note";

const toAttachment = ({ id, kind, name, type, size, note }: AttachmentRow, shared = false): NestAttachment => ({
  id,
  kind,
  name,
  type,
  size,
  ...(kind === "note" ? { text: note ?? "" } : {}),
  ...(shared ? { shared } : {}),
});

// One file or note being added.
export type NewAttachment =
  | { kind: "file"; name: string; type: string; size: number; pages: number | null; data: Uint8Array }
  | { kind: "note"; text: string };

// Where a file or note goes: a card, or the Nest's composer.
export type AttachTo = { cardId: string } | { nestId: string };

interface CardRow {
  id: string;
  nestId: string;
  chatId: string | null;
  mascotId: string | null;
  x: number;
  y: number;
  eachPrompt: string | null;
  eachHeader: string | null;
  plan: NestPlanned["state"] | null;
  planPrompt: string | null;
  planEach: number;
  planWaits: number;
  planTable: string | null;
  planNote: string | null;
}

interface RunRow {
  id: string;
  cardId: string;
  row: string;
  chatId: string | null;
  state: NestRunState;
}

const CARD_COLUMNS =
  "id, nest_id AS nestId, chat_id AS chatId, mascot_id AS mascotId, x, y, each_prompt AS eachPrompt, each_header AS eachHeader, " +
  "plan, plan_prompt AS planPrompt, plan_each AS planEach, plan_waits AS planWaits, plan_table AS planTable, plan_note AS planNote";
const RUN_COLUMNS = "id, card_id AS cardId, row, chat_id AS chatId, state";

const toRun = ({ id, row, chatId, state }: RunRow): NestRun => ({ id, row: JSON.parse(row) as string[], chatId, state });

// One card of a plan, placed, with the line into it: from another card of the same plan by its key, or a card on the board.
export interface NewPlannedCard {
  key: string;
  mascotId: string | null;
  prompt: string;
  from: { plan: string } | { card: string } | null;
  each: boolean;
  waits: boolean;
  table: string | null;
  x: number;
  y: number;
  // The composer's files and notes this card points at until Run, by id.
  attached: string[];
  // The planned card it's a new version of, which gives it what the user added on that card.
  keeps: string | null;
}

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
    return { ...nest, cards, lines, talk: this.talk(id), attached: this.attachmentsOf({ nestId: id }) };
  }

  // `settled` for a name that's final already, such as a chat's when the chat becomes a Nest.
  createNest(title: string, settled = false): string {
    const id = randomUUID();
    this.db.prepare("INSERT INTO nests (id, title, updated_at, title_settled) VALUES (?, ?, ?, ?)").run(id, title, Date.now(), settled ? 1 : 0);
    return id;
  }

  // The user's choice, which a generated name never replaces.
  renameNest(id: string, title: string): boolean {
    return this.db.prepare("UPDATE nests SET title = ?, title_settled = 1, updated_at = ? WHERE id = ?").run(title, Date.now(), id).changes > 0;
  }

  titleSettled(id: string): boolean {
    return this.db.prepare("SELECT 1 FROM nests WHERE id = ? AND title_settled = 1").get(id) !== undefined;
  }

  // Only while the name isn't settled. `settle` for the cheap model's name, which is final, and not for the first words
  // of a request, which stand in until then. False if the user renamed it or deleted it meanwhile.
  nameNest(id: string, title: string, settle: boolean): boolean {
    return this.db.prepare("UPDATE nests SET title = ?, title_settled = ? WHERE id = ? AND title_settled = 0").run(title, settle ? 1 : 0, id).changes > 0;
  }

  // Its cards and lines go with it. Their chats are the caller's to delete, so it gets their ids first.
  deleteNest(id: string): boolean {
    return this.db.prepare("DELETE FROM nests WHERE id = ?").run(id).changes > 0;
  }

  card(id: string): (NestCard & { nestId: string }) | null {
    const row = this.db.prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE id = ?`).get(id) as unknown as CardRow | undefined;
    return row ? { ...this.toCard(row), nestId: row.nestId } : null;
  }

  private toCard({ id, chatId, mascotId, x, y, eachPrompt, eachHeader, plan, planPrompt, planEach, planWaits, planTable, planNote }: CardRow): NestCard {
    const each: NestForEach | null =
      eachPrompt === null
        ? null
        : {
            prompt: eachPrompt,
            header: JSON.parse(eachHeader ?? "[]") as string[],
            runs: (this.db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE card_id = ? ORDER BY position`).all(id) as unknown as RunRow[]).map(toRun),
          };
    const planned: NestPlanned | null =
      plan === null ? null : { state: plan, prompt: planPrompt ?? "", each: planEach === 1, waits: planWaits === 1, table: planTable, note: planNote };
    return { id, chatId, mascotId, x, y, each, plan: planned, attachments: [...this.attachmentsOf({ cardId: id }), ...this.pointedAt(id).map((row) => toAttachment(row, true))] };
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
  // With `planned`, it's a card of the plan instead, with no prompt yet.
  addCard(
    nestId: string,
    {
      x,
      y,
      mascotId = null,
      from = null,
      picked = null,
      planned = false,
    }: { x: number; y: number; mascotId?: string | null; from?: string | null; picked?: PickedRows | null; planned?: boolean }
  ): NestCard | null {
    const id = randomUUID();
    this.db.exec("BEGIN");
    try {
      if (!this.db.prepare("SELECT 1 FROM nests WHERE id = ?").get(nestId)) throw new NotHere();
      if (from !== null && this.card(from)?.nestId !== nestId) throw new NotHere();
      this.db
        .prepare("INSERT INTO cards (id, nest_id, chat_id, mascot_id, x, y, plan, plan_prompt) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)")
        .run(id, nestId, mascotId, x, y, planned ? "planned" : null, planned ? "" : null);
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
    return this.card(id);
  }

  moveCard(id: string, x: number, y: number): boolean {
    return this.db.prepare("UPDATE cards SET x = ?, y = ? WHERE id = ?").run(x, y, id).changes > 0;
  }

  // Only while it's a draft, or planned and not yet run. A sent card belongs to its chat's bird, and one of a plan the user
  // ran keeps the bird it was run with.
  setBird(id: string, mascotId: string | null): boolean {
    return (
      this.db
        .prepare("UPDATE cards SET mascot_id = ? WHERE id = ? AND chat_id IS NULL AND each_prompt IS NULL AND (plan IS NULL OR plan <> 'armed')")
        .run(mascotId, id).changes > 0
    );
  }

  // Once, when the draft is first sent.
  setChat(id: string, chatId: string): boolean {
    const card = this.card(id);
    // Once it starts, a planned card is an ordinary one.
    const done =
      this.db.prepare("UPDATE cards SET chat_id = ?, plan = NULL, plan_note = NULL WHERE id = ? AND chat_id IS NULL AND each_prompt IS NULL").run(chatId, id).changes > 0;
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
        .prepare("UPDATE cards SET each_prompt = ?, each_header = ?, plan = NULL, plan_note = NULL WHERE id = ? AND chat_id IS NULL AND each_prompt IS NULL")
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

  // Puts a plan on the board in place of the one there, if any, with the lines into its cards, in one go. A line from the
  // board only comes from a card in this Nest that has been sent. Null if anything doesn't fit, and then nothing changes.
  setPlan(nestId: string, cards: readonly NewPlannedCard[], said: string): string[] | null {
    const ids = new Map(cards.map((card) => [card.key, randomUUID()]));
    this.db.exec("BEGIN");
    try {
      if (!this.db.prepare("SELECT 1 FROM nests WHERE id = ?").get(nestId)) throw new NotHere();
      // The old plan goes last, so what the user added on its cards goes to the new versions of them first, or back to the
      // composer, never with them. Its pointers at the composer's go with it, and the composer's stay as they are.
      const replaced = (this.db.prepare("SELECT id FROM cards WHERE nest_id = ? AND plan = 'planned'").all(nestId) as { id: string }[]).map((row) => row.id);
      if (cards.some((card) => card.keeps !== null && !replaced.includes(card.keeps))) throw new NotHere();
      const insert = this.db.prepare(
        "INSERT INTO cards (id, nest_id, chat_id, mascot_id, x, y, plan, plan_prompt, plan_each, plan_waits, plan_table, said) VALUES (?, ?, NULL, ?, ?, ?, 'planned', ?, ?, ?, ?, ?)"
      );
      for (const card of cards) insert.run(ids.get(card.key)!, nestId, card.mascotId, card.x, card.y, card.prompt, card.each ? 1 : 0, card.waits ? 1 : 0, card.table, said);
      const point = this.db.prepare(
        "INSERT INTO plan_attachments (card_id, attachment_id) SELECT ?, id FROM attachments WHERE id = ? AND nest_id = ? AND card_id IS NULL"
      );
      for (const card of cards) {
        for (const attachmentId of card.attached) {
          if (point.run(ids.get(card.key)!, attachmentId, nestId).changes === 0) throw new NotHere();
        }
      }
      const move = this.db.prepare("UPDATE attachments SET card_id = ? WHERE card_id = ?");
      for (const oldId of replaced) {
        const kept = cards.find((card) => card.keeps === oldId);
        move.run(kept ? ids.get(kept.key)! : null, oldId);
      }
      const remove = this.db.prepare("DELETE FROM cards WHERE id = ?");
      for (const id of replaced) remove.run(id);
      const line = this.db.prepare("INSERT INTO lines (id, nest_id, from_card, to_card) VALUES (?, ?, ?, ?)");
      for (const card of cards) {
        if (!card.from) continue;
        const from = "plan" in card.from ? ids.get(card.from.plan) : card.from.card;
        const source = from === undefined ? null : this.card(from);
        if (!source || source.nestId !== nestId || (!("plan" in card.from) && !source.chatId && !source.each)) throw new NotHere();
        line.run(randomUUID(), nestId, from!, ids.get(card.key)!);
      }
      this.touch(nestId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (error instanceof NotHere) return null;
      throw error;
    }
    return cards.map((card) => ids.get(card.key)!);
  }

  // What the user typed in the request a planned card came from, or null for a card whose prompt they typed themselves.
  said(id: string): string | null {
    return (this.db.prepare("SELECT said FROM cards WHERE id = ?").get(id) as { said: string | null } | undefined)?.said ?? null;
  }

  // A planned card's prompt or For each row, only before the plan runs.
  editPlanned(id: string, { prompt, each }: { prompt?: string; each?: boolean }): boolean {
    if (prompt !== undefined && !this.db.prepare("UPDATE cards SET plan_prompt = ? WHERE id = ? AND plan = 'planned'").run(prompt, id).changes) return false;
    if (each !== undefined && !this.db.prepare("UPDATE cards SET plan_each = ? WHERE id = ? AND plan = 'planned'").run(each ? 1 : 0, id).changes) return false;
    return true;
  }

  // Run: every planned card in the Nest is armed, and gets its own copy of each of the composer's it points at, as they
  // are now. Those leave the composer, and the rest stay. In one go. How many.
  armPlan(nestId: string): number {
    this.db.exec("BEGIN");
    try {
      const pointers = this.db
        .prepare("SELECT p.card_id AS cardId, p.attachment_id AS attachmentId FROM plan_attachments p JOIN cards c ON c.id = p.card_id WHERE c.nest_id = ? AND c.plan = 'planned' ORDER BY p.rowid")
        .all(nestId) as { cardId: string; attachmentId: string }[];
      const copy = this.db.prepare(
        `INSERT INTO attachments (id, nest_id, card_id, kind, name, type, size, pages, data, note)
         SELECT ?, nest_id, ?, kind, name, type, size, pages, data, note FROM attachments WHERE id = ?`
      );
      for (const { cardId, attachmentId } of pointers) copy.run(randomUUID(), cardId, attachmentId);
      const handedOut = [...new Set(pointers.map((pointer) => pointer.attachmentId))];
      const remove = this.db.prepare("DELETE FROM attachments WHERE id = ? AND card_id IS NULL");
      for (const id of handedOut) remove.run(id);
      const armed = Number(this.db.prepare("UPDATE cards SET plan = 'armed' WHERE nest_id = ? AND plan = 'planned'").run(nestId).changes);
      if (armed > 0) this.touch(nestId);
      this.db.exec("COMMIT");
      return armed;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  // What the user added on the planned cards goes back to the composer rather than with them. Their pointers go with
  // them, and the composer's own stay as they are.
  discardPlan(nestId: string): number {
    this.db.prepare("UPDATE attachments SET card_id = NULL WHERE card_id IN (SELECT id FROM cards WHERE nest_id = ? AND plan = 'planned')").run(nestId);
    return Number(this.db.prepare("DELETE FROM cards WHERE nest_id = ? AND plan = 'planned'").run(nestId).changes);
  }

  // The armed cards of one Nest, oldest first.
  armedCards(nestId: string): NestCard[] {
    return (this.db.prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE nest_id = ? AND plan = 'armed' ORDER BY rowid`).all(nestId) as unknown as CardRow[]).map((row) =>
      this.toCard(row)
    );
  }

  // An armed card won't start, and says why. It's a draft from then on, which the user can still send.
  hold(id: string, note: string): boolean {
    return this.db.prepare("UPDATE cards SET plan = 'held', plan_note = ? WHERE id = ? AND plan = 'armed'").run(note, id).changes > 0;
  }

  // Every armed card that reads from this one, or every armed card anywhere.
  holdAfter(cardId: string | null, note: string): number {
    return cardId === null
      ? Number(this.db.prepare("UPDATE cards SET plan = 'held', plan_note = ? WHERE plan = 'armed'").run(note).changes)
      : Number(
          this.db
            .prepare("UPDATE cards SET plan = 'held', plan_note = ? WHERE plan = 'armed' AND id IN (SELECT to_card FROM lines WHERE from_card = ?)")
            .run(note, cardId).changes
        );
  }

  // The Nest's newest request, if it's still open, and the one before it, folded, as the composer shows them.
  talk(nestId: string): NestRequest[] {
    const requests = this.db.prepare("SELECT id, open FROM requests WHERE nest_id = ? ORDER BY rowid DESC LIMIT 2").all(nestId) as { id: string; open: number }[];
    const shown = requests[0]?.open === 1 ? requests : requests.slice(0, 1);
    return shown.reverse().map(({ id, open }) => ({
      id,
      open: open === 1,
      messages: this.db.prepare("SELECT role, text FROM talk WHERE request_id = ? ORDER BY rowid").all(id) as unknown as NestRequest["messages"],
    }));
  }

  // The open request's messages, which the planner reads, or none.
  openRequest(nestId: string): NestRequest | null {
    const open = this.talk(nestId).find((request) => request.open);
    return open ?? null;
  }

  // Adds to the open request, or starts one.
  say(nestId: string, role: "user" | "berry", text: string): void {
    let open = this.db.prepare("SELECT id FROM requests WHERE nest_id = ? AND open = 1").get(nestId) as { id: string } | undefined;
    if (!open) {
      open = { id: randomUUID() };
      this.db.prepare("INSERT INTO requests (id, nest_id, open) VALUES (?, ?, 1)").run(open.id, nestId);
    }
    this.db.prepare("INSERT INTO talk (request_id, role, text) VALUES (?, ?, ?)").run(open.id, role, text);
  }

  // Once the plan runs or goes, the request folds away, and the next message starts another.
  closeRequest(nestId: string): void {
    this.db.prepare("UPDATE requests SET open = 0 WHERE nest_id = ? AND open = 1").run(nestId);
  }

  // A card's files and notes, or the composer's, oldest first, without a file's contents.
  attachmentsOf(to: AttachTo): NestAttachment[] {
    return this.attachmentRows(to).map((row) => toAttachment(row));
  }

  // The same with their sizes and pages, for the limits.
  attachmentRows(to: AttachTo): AttachmentRow[] {
    return (
      "cardId" in to
        ? this.db.prepare(`SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE card_id = ? ORDER BY rowid`).all(to.cardId)
        : this.db.prepare(`SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE nest_id = ? AND card_id IS NULL ORDER BY rowid`).all(to.nestId)
    ) as unknown as AttachmentRow[];
  }

  // A card's files and notes as they go to its bird, with each file's bytes as they were copied in.
  sentAttachments(cardId: string): SentAttachment[] {
    const rows = this.db.prepare("SELECT kind, name, type, data, note FROM attachments WHERE card_id = ? ORDER BY rowid").all(cardId) as {
      kind: "file" | "note";
      name: string;
      type: string;
      data: Uint8Array | null;
      note: string | null;
    }[];
    return rows.map((row) => (row.kind === "note" ? { kind: "note", text: row.note ?? "" } : { kind: "file", name: row.name, type: row.type, data: row.data ?? new Uint8Array() }));
  }

  // Where a file or note is: its Nest, and its card or null for the composer.
  attachment(id: string): { nestId: string; cardId: string | null; kind: "file" | "note" } | null {
    return (this.db.prepare("SELECT nest_id AS nestId, card_id AS cardId, kind FROM attachments WHERE id = ?").get(id) as { nestId: string; cardId: string | null; kind: "file" | "note" } | undefined) ?? null;
  }

  // Null if the card or Nest isn't there.
  addAttachment(to: AttachTo, attachment: NewAttachment): string | null {
    const nestId = "cardId" in to ? this.card(to.cardId)?.nestId : this.db.prepare("SELECT id FROM nests WHERE id = ?").get(to.nestId) ? to.nestId : undefined;
    if (!nestId) return null;
    const id = randomUUID();
    const cardId = "cardId" in to ? to.cardId : null;
    if (attachment.kind === "note") {
      this.db
        .prepare("INSERT INTO attachments (id, nest_id, card_id, kind, name, type, size, pages, data, note) VALUES (?, ?, ?, 'note', '', 'text/plain', ?, NULL, NULL, ?)")
        .run(id, nestId, cardId, Buffer.byteLength(attachment.text), attachment.text);
    } else {
      this.db
        .prepare("INSERT INTO attachments (id, nest_id, card_id, kind, name, type, size, pages, data, note) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, NULL)")
        .run(id, nestId, cardId, attachment.name, attachment.type, attachment.size, attachment.pages, attachment.data);
    }
    return id;
  }

  // A composer note changed before Run reaches every card that points at it.
  editNote(id: string, text: string): boolean {
    return this.db.prepare("UPDATE attachments SET note = ?, size = ? WHERE id = ? AND kind = 'note'").run(text, Buffer.byteLength(text), id).changes > 0;
  }

  removeAttachment(id: string): boolean {
    return this.db.prepare("DELETE FROM attachments WHERE id = ?").run(id).changes > 0;
  }

  // The composer's files and notes a planned card points at, oldest pointer first.
  pointedAt(cardId: string): AttachmentRow[] {
    return this.db
      .prepare(
        `SELECT ${ATTACHMENT_COLUMNS.split(", ").map((column) => `a.${column}`).join(", ")} FROM plan_attachments p JOIN attachments a ON a.id = p.attachment_id
         WHERE p.card_id = ? ORDER BY p.rowid`
      )
      .all(cardId) as unknown as AttachmentRow[];
  }

  // A planned card stops pointing at one of the composer's, which stays where it is.
  unpoint(cardId: string, attachmentId: string): boolean {
    return this.db.prepare("DELETE FROM plan_attachments WHERE card_id = ? AND attachment_id = ?").run(cardId, attachmentId).changes > 0;
  }

  // The composer's files and notes all go onto one card.
  moveComposerTo(nestId: string, cardId: string): void {
    this.db.prepare("UPDATE attachments SET card_id = ? WHERE nest_id = ? AND card_id IS NULL").run(cardId, nestId);
  }

  // Something happened in it, so it moves up the list.
  touch(nestId: string): void {
    this.db.prepare("UPDATE nests SET updated_at = ? WHERE id = ?").run(Date.now(), nestId);
  }
}

class NotHere extends Error {}
