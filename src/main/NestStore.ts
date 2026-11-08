import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import type { NestAttachment, NestBoard, NestCard, NestFile, NestForEach, NestLine, NestPage, NestPlanned, NestRequest, NestRun, NestRunState, NestTableFile, NestTalkMessage } from "../shared/library";
import type { SentAttachment } from "./nestFiles";
import { PREVIEW_CELL_LENGTH, TABLE_PREVIEW_ROWS, type PickedRows } from "../shared/nestTable";
import { migrate } from "./database";
import type { CardKnows } from "../shared/nestKnows";

const KNOWS_COUNTS = ["cards", "pages", "files", "notes", "cut", "leftOutCards", "leftOutFiles"] as const;

// A card's saved counts, or null for anything that isn't them, so a damaged row says nothing rather than something wrong.
const knowsFrom = (text: string): CardKnows | null => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const saved = value as Record<string, unknown>;
  const count = (key: string) => Number.isSafeInteger(saved[key]) && (saved[key] as number) >= 0;
  if (typeof saved.at !== "number" || !Number.isFinite(saved.at) || !KNOWS_COUNTS.every(count)) return null;
  return { sent: true, at: saved.at, ...(Object.fromEntries(KNOWS_COUNTS.map((key) => [key, saved[key]])) as Record<(typeof KNOWS_COUNTS)[number], number>) };
};

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
  // Placed for the user, by a plan, the composer or a line's handle, and never moved by hand since, so the board may nudge
  // it out of the way of a card that grew. Cards from before this count as placed by hand, so they never move.
  `ALTER TABLE cards ADD COLUMN auto_placed INTEGER NOT NULL DEFAULT 0;`,
  // A For-each card adds a column to the table it ran on: its name, which the user may rename, and each run's short value
  // in it. A table card holds the rows of a file the user added, as they were then, with no chat and no bird.
  `ALTER TABLE cards ADD COLUMN each_column TEXT;
   ALTER TABLE cards ADD COLUMN each_column_settled INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE runs ADD COLUMN cell TEXT;
   ALTER TABLE cards ADD COLUMN table_name TEXT;
   ALTER TABLE cards ADD COLUMN table_header TEXT;
   ALTER TABLE cards ADD COLUMN table_count INTEGER;
   ALTER TABLE cards ADD COLUMN table_preview TEXT;
   ALTER TABLE cards ADD COLUMN table_rows TEXT;
   UPDATE cards SET each_column = 'Result' WHERE each_prompt IS NOT NULL;`,
  // A card can read from several cards now, each line once, in the order they were drawn, which is the order the card
  // lists them and the model gets them.
  `CREATE TABLE lines_many (
     id TEXT PRIMARY KEY,
     nest_id TEXT NOT NULL REFERENCES nests(id) ON DELETE CASCADE,
     from_card TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     to_card TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     picked TEXT,
     CHECK (from_card <> to_card),
     UNIQUE (from_card, to_card)
   );
   INSERT INTO lines_many (id, nest_id, from_card, to_card, picked) SELECT id, nest_id, from_card, to_card, picked FROM lines ORDER BY rowid;
   DROP TABLE lines;
   ALTER TABLE lines_many RENAME TO lines;
   CREATE INDEX lines_by_to ON lines(to_card);`,
  // The line a For-each card's runs took their rows from, and what a run's earlier tries cost before Retry replaced them.
  `ALTER TABLE cards ADD COLUMN each_line TEXT;
   ALTER TABLE runs ADD COLUMN spent REAL NOT NULL DEFAULT 0;`,
  // The size the user made a card from its corner. None means the usual size.
  `ALTER TABLE cards ADD COLUMN width REAL;
   ALTER TABLE cards ADD COLUMN height REAL;`,
  // A file's card: the file is its one attachment, which it owns, with its first lines kept for the card. file_made is null
  // on every other card, 0 for a file the user put on the board and 1 for one a card's bird made. A card that read a
  // file's card through a line keeps its own copy once it has sent, with the card it came from in via_card, which may be
  // gone since, and made when a bird made it.
  `ALTER TABLE cards ADD COLUMN file_made INTEGER;
   ALTER TABLE cards ADD COLUMN file_preview TEXT;
   ALTER TABLE attachments ADD COLUMN via_card TEXT;
   ALTER TABLE attachments ADD COLUMN made INTEGER NOT NULL DEFAULT 0;`,
  // A page's card: a link or tab the user put on the board, with its address and title as they were then. Which tab it
  // shows is never kept here, since tab ids start again each launch. page_dropped is 1 when the user dropped it, so its
  // exact address counts as one they named. page_job is the card whose running job's tab it shows, only while it does.
  `ALTER TABLE cards ADD COLUMN page_url TEXT;
   ALTER TABLE cards ADD COLUMN page_title TEXT;
   ALTER TABLE cards ADD COLUMN page_dropped INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE cards ADD COLUMN page_job TEXT;`,
  // A line drawn into a card that has been sent already, until the card sends again: only its next message gets it.
  `ALTER TABLE lines ADD COLUMN fresh INTEGER NOT NULL DEFAULT 0;`,
  // Whether the Nest's composer is tucked down to a tab at the board's bottom edge. What kind each of Berry's messages is:
  // an answer about the board, a plan with how many cards it laid out, or a question, and on the user's, the ids of the
  // cards they asked about when they asked about only those, as JSON. Older messages say none. A note's card holds one of Berry's
  // answers, as it was when it went on the board.
  `ALTER TABLE nests ADD COLUMN composer_tucked INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE talk ADD COLUMN kind TEXT CHECK (kind IN ('answer', 'plan', 'ask'));
   ALTER TABLE talk ADD COLUMN planned INTEGER;
   ALTER TABLE talk ADD COLUMN about TEXT;
   ALTER TABLE cards ADD COLUMN note_text TEXT;`,
  // Coming back to a board. A card's title names what it found: the cheap model's until the user types one, which is
  // settled and never replaced. `unread` is the dot on a card that finished, failed or started waiting while nobody was
  // looking at it, until it's opened, and `changed_at` is when it last did any of those. `seen_at` is when the Nest was
  // last open, null until it's been left once.
  `ALTER TABLE cards ADD COLUMN title TEXT;
   ALTER TABLE cards ADD COLUMN title_settled INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE cards ADD COLUMN unread INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE cards ADD COLUMN changed_at INTEGER;
   ALTER TABLE nests ADD COLUMN seen_at INTEGER;`,
  // When an earlier card changes. `sent_with` is a fingerprint of what crossed a line the last time the card it goes to
  // sent with it, never a copy (see `nestStale.ts`), null until then. `knows` is what that message went with, counted,
  // as `CardKnows` in JSON.
  `ALTER TABLE lines ADD COLUMN sent_with TEXT;
   ALTER TABLE cards ADD COLUMN knows TEXT;`,
];

// How many of a Nest's newest requests its board carries, so a Nest used for months doesn't send a longer board.
const TALK_SHOWN = 50;

interface TalkRow {
  id: number;
  role: "user" | "berry";
  text: string;
  kind: NestTalkMessage["kind"] | null;
  planned: number | null;
  about: string | null;
}

const toTalkMessage = ({ id, role, text, kind, planned, about }: TalkRow): NestTalkMessage => ({
  id,
  role,
  text,
  ...(kind ? { kind } : {}),
  ...(planned !== null ? { planned } : {}),
  ...(about !== null ? { about: (JSON.parse(about) as string[]).length } : {}),
});

// One card's input: the line into it, the card it comes from, and the rows picked from that card if any. `fresh` while the
// card it goes to was sent before it was drawn and hasn't sent since.
export interface CardLine {
  lineId: string;
  source: NestCard;
  picked: PickedRows | null;
  fresh: boolean;
  // What crossed it the last time its card sent, as a fingerprint, or null if the card hasn't sent with it.
  sentWith: string | null;
}

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
  autoPlaced: number;
  eachColumn: string | null;
  tableName: string | null;
  tableHeader: string | null;
  tableCount: number | null;
  tablePreview: string | null;
  width: number | null;
  height: number | null;
  fileMade: number | null;
  filePreview: string | null;
  pageUrl: string | null;
  pageTitle: string | null;
  pageDropped: number;
  pageJob: string | null;
  noteText: string | null;
  title: string | null;
  titleSettled: number;
  unread: number;
  knows: string | null;
}

interface RunRow {
  id: string;
  cardId: string;
  row: string;
  chatId: string | null;
  state: NestRunState;
  cell: string | null;
}

const CARD_COLUMNS =
  "id, nest_id AS nestId, chat_id AS chatId, mascot_id AS mascotId, x, y, each_prompt AS eachPrompt, each_header AS eachHeader, " +
  "plan, plan_prompt AS planPrompt, plan_each AS planEach, plan_waits AS planWaits, plan_table AS planTable, plan_note AS planNote, auto_placed AS autoPlaced, " +
  // Not a file's whole table, which is read only when it's needed.
  "each_column AS eachColumn, table_name AS tableName, table_header AS tableHeader, table_count AS tableCount, table_preview AS tablePreview, width, height, " +
  "file_made AS fileMade, file_preview AS filePreview, page_url AS pageUrl, page_title AS pageTitle, page_dropped AS pageDropped, page_job AS pageJob, note_text AS noteText, " +
  "title, title_settled AS titleSettled, unread, knows";
const RUN_COLUMNS = "id, card_id AS cardId, row, chat_id AS chatId, state, cell";

const toRun = ({ id, row, chatId, state, cell }: RunRow): NestRun => ({ id, row: JSON.parse(row) as string[], chatId, state, cell });

// One card of a plan, placed, with the line into it: from another card of the same plan by its key, or a card on the board.
export interface NewPlannedCard {
  key: string;
  mascotId: string | null;
  prompt: string;
  // What it reads from, in order: other cards of the same plan by their key, or cards on the board.
  from: ({ plan: string } | { card: string })[];
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
    // Files are kept in here, so what's deleted is overwritten rather than left in the file's free pages. See `forgetting`.
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;");
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
      // Only how many rows were picked, which could be a whole file's.
      this.db
        .prepare("SELECT id, from_card AS \"from\", to_card AS \"to\", json_array_length(picked, '$.rows') AS picked, fresh FROM lines WHERE nest_id = ? ORDER BY rowid")
        .all(id) as unknown as (Omit<NestLine, "fresh"> & { fresh: number })[]
    ).map(({ fresh, ...line }) => ({ ...line, picked: line.picked ?? null, ...(fresh ? { fresh: true as const } : {}) }));
    const tucked = this.db.prepare("SELECT composer_tucked AS tucked FROM nests WHERE id = ?").get(id) as { tucked: number };
    return { ...nest, cards, lines, talk: this.talk(id), composerTucked: tucked.tucked === 1, attached: this.attachmentsOf({ nestId: id }) };
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
    return this.forgetting(this.db.prepare("DELETE FROM nests WHERE id = ?").run(id).changes > 0);
  }

  // After anything with files in it is deleted: the pages it was on are overwritten already, and this empties the
  // write-ahead log too, which still holds the file as it was written, so nothing of it stays on disk.
  private forgetting(deleted: boolean): boolean {
    if (deleted) this.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    return deleted;
  }

  card(id: string): (NestCard & { nestId: string }) | null {
    const row = this.db.prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE id = ?`).get(id) as unknown as CardRow | undefined;
    return row ? { ...this.toCard(row), nestId: row.nestId } : null;
  }

  private toCard({ id, chatId, mascotId, x, y, eachPrompt, eachHeader, plan, planPrompt, planEach, planWaits, planTable, planNote, autoPlaced, eachColumn, tableName, tableHeader, tableCount, tablePreview, width, height, fileMade, filePreview, pageUrl, pageTitle, pageDropped, pageJob, noteText, title, titleSettled, unread, knows }: CardRow): NestCard {
    const each: NestForEach | null =
      eachPrompt === null
        ? null
        : {
            prompt: eachPrompt,
            header: JSON.parse(eachHeader ?? "[]") as string[],
            column: eachColumn ?? "",
            runs: (this.db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE card_id = ? ORDER BY position`).all(id) as unknown as RunRow[]).map(toRun),
          };
    const planned: NestPlanned | null =
      plan === null ? null : { state: plan, prompt: planPrompt ?? "", each: planEach === 1, waits: planWaits === 1, table: planTable, note: planNote };
    const table: NestTableFile | null =
      tableName === null
        ? null
        : { name: tableName, header: JSON.parse(tableHeader ?? "[]") as string[], rows: JSON.parse(tablePreview ?? "[]") as string[][], count: tableCount ?? 0 };
    const size = width !== null && height !== null ? { size: { width, height } } : {};
    if (pageUrl !== null) {
      // Which tab it shows, and how a job sees it, are only known in memory, and `Nests` fills them in.
      const page: NestPage = { url: pageUrl, title: pageTitle ?? "", dropped: pageDropped === 1, tab: null, job: pageJob === null ? null : { cardId: pageJob, state: "none", current: false } };
      return { id, chatId: null, mascotId: null, x, y, autoPlaced: autoPlaced === 1, ...size, each: null, plan: null, table: null, file: null, page, attachments: [] };
    }
    if (noteText !== null) return { id, chatId: null, mascotId: null, x, y, autoPlaced: autoPlaced === 1, ...size, each: null, plan: null, table: null, file: null, note: { text: noteText }, attachments: [] };
    if (fileMade !== null) {
      const own = this.attachmentRows({ cardId: id })[0];
      const file: NestFile = { name: own?.name ?? "", type: own?.type ?? "", size: own?.size ?? 0, pages: own?.pages ?? null, preview: filePreview, made: fileMade === 1 };
      return { id, chatId: null, mascotId: null, x, y, autoPlaced: autoPlaced === 1, ...size, each: null, plan: null, table: null, file, attachments: [] };
    }
    const known = knows === null ? null : knowsFrom(knows);
    const recap = { ...(title !== null ? { title, titleSettled: titleSettled === 1 } : {}), ...(unread === 1 ? { unread: true } : {}), ...(known ? { knows: known } : {}) };
    return { id, chatId, mascotId, x, y, autoPlaced: autoPlaced === 1, ...size, each, plan: planned, table, file: null, ...recap, attachments: [...this.attachmentsOf({ cardId: id }), ...this.pointedAt(id).map((row) => toAttachment(row, true))] };
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
  // With `planned`, it's a card of the plan instead, with no prompt yet. `auto` when it was placed for the user, not where
  // they pressed.
  addCard(
    nestId: string,
    {
      x,
      y,
      mascotId = null,
      from = null,
      picked = null,
      planned = false,
      auto = false,
    }: { x: number; y: number; mascotId?: string | null; from?: string | null; picked?: PickedRows | null; planned?: boolean; auto?: boolean }
  ): NestCard | null {
    const id = randomUUID();
    this.db.exec("BEGIN");
    try {
      if (!this.db.prepare("SELECT 1 FROM nests WHERE id = ?").get(nestId)) throw new NotHere();
      if (from !== null && this.card(from)?.nestId !== nestId) throw new NotHere();
      this.db
        .prepare("INSERT INTO cards (id, nest_id, chat_id, mascot_id, x, y, plan, plan_prompt, auto_placed) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)")
        .run(id, nestId, mascotId, x, y, planned ? "planned" : null, planned ? "" : null, auto ? 1 : 0);
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

  // `settle` for a title the user typed, which the cheap model never replaces. One from the model lands only while the
  // card has none of the user's. An empty one from the user takes theirs away, so the model may name it again.
  titleCard(id: string, title: string, settle: boolean): boolean {
    if (!settle) return this.db.prepare("UPDATE cards SET title = ? WHERE id = ? AND title_settled = 0").run(title, id).changes > 0;
    return this.db.prepare("UPDATE cards SET title = ?, title_settled = ? WHERE id = ?").run(title || null, title ? 1 : 0, id).changes > 0;
  }

  // A card finished, failed or started waiting `at`, with a dot until it's opened if nobody was looking.
  cardChanged(id: string, at: number, unread: boolean): boolean {
    return this.db.prepare("UPDATE cards SET changed_at = ?, unread = MAX(unread, ?) WHERE id = ?").run(at, unread ? 1 : 0, id).changes > 0;
  }

  // The user opened it. False when it had no dot.
  readCard(id: string): boolean {
    return this.db.prepare("UPDATE cards SET unread = 0 WHERE id = ? AND unread = 1").run(id).changes > 0;
  }

  // When each of a Nest's cards last changed, null for one that never has.
  changeTimes(nestId: string): { id: string; changedAt: number | null }[] {
    return this.db.prepare("SELECT id, changed_at AS changedAt FROM cards WHERE nest_id = ? ORDER BY rowid").all(nestId) as unknown as { id: string; changedAt: number | null }[];
  }

  // When the Nest was last open, null until it has been left once.
  seenAt(nestId: string): number | null {
    return (this.db.prepare("SELECT seen_at AS seenAt FROM nests WHERE id = ?").get(nestId) as { seenAt: number | null } | undefined)?.seenAt ?? null;
  }

  seeNest(nestId: string, at: number): void {
    this.db.prepare("UPDATE nests SET seen_at = ? WHERE id = ?").run(at, nestId);
  }

  // The user moved it, so from now on it stays where they leave it.
  moveCard(id: string, x: number, y: number): boolean {
    return this.db.prepare("UPDATE cards SET x = ?, y = ?, auto_placed = 0 WHERE id = ?").run(x, y, id).changes > 0;
  }

  resizeCard(id: string, width: number, height: number): boolean {
    return this.db.prepare("UPDATE cards SET width = ?, height = ? WHERE id = ?").run(width, height, id).changes > 0;
  }

  // Cards of this Nest moved out of the way of one that grew, in one go. Only cards placed for the user and never moved by
  // hand: any other is left where it is. How many moved.
  nudgeCards(nestId: string, moves: readonly { id: string; x: number; y: number }[]): number {
    const nudge = this.db.prepare("UPDATE cards SET x = ?, y = ? WHERE id = ? AND nest_id = ? AND auto_placed = 1");
    this.db.exec("BEGIN");
    try {
      const moved = moves.reduce((count, move) => count + Number(nudge.run(move.x, move.y, move.id, nestId).changes), 0);
      this.db.exec("COMMIT");
      return moved;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  // Only while it's a draft, or planned and not yet run. A sent card belongs to its chat's bird, and one of a plan the user
  // ran keeps the bird it was run with.
  setBird(id: string, mascotId: string | null): boolean {
    return (
      this.db
        .prepare("UPDATE cards SET mascot_id = ? WHERE id = ? AND chat_id IS NULL AND each_prompt IS NULL AND table_name IS NULL AND file_made IS NULL AND page_url IS NULL AND (plan IS NULL OR plan <> 'armed')")
        .run(mascotId, id).changes > 0
    );
  }

  // Once, when the draft is first sent.
  setChat(id: string, chatId: string): boolean {
    const card = this.card(id);
    // Once it starts, a planned card is an ordinary one.
    const done =
      this.db.prepare("UPDATE cards SET chat_id = ?, plan = NULL, plan_note = NULL WHERE id = ? AND chat_id IS NULL AND each_prompt IS NULL AND table_name IS NULL AND file_made IS NULL AND page_url IS NULL").run(chatId, id).changes > 0;
    if (done && card) this.touch(card.nestId);
    return done;
  }

  // Every line into a card, in the order they were drawn.
  linesTo(id: string): CardLine[] {
    const rows = this.db.prepare("SELECT id, from_card, picked, fresh, sent_with FROM lines WHERE to_card = ? ORDER BY rowid").all(id) as {
      id: string;
      from_card: string;
      picked: string | null;
      fresh: number;
      sent_with: string | null;
    }[];
    return rows.flatMap((row) => {
      const source = this.card(row.from_card);
      return source ? [{ lineId: row.id, source, picked: row.picked ? (JSON.parse(row.picked) as PickedRows) : null, fresh: row.fresh === 1, sentWith: row.sent_with }] : [];
    });
  }

  // What crossed each of these lines into the card as it sent, by line, replacing what they kept before.
  keepSentWith(to: string, fingerprints: ReadonlyMap<string, string>): void {
    const keep = this.db.prepare("UPDATE lines SET sent_with = ? WHERE id = ? AND to_card = ?");
    for (const [lineId, fingerprint] of fingerprints) keep.run(fingerprint, lineId, to);
  }

  // The card is about to send again with every line, as For-each runs all over again, so none has been sent with yet.
  forgetSentWith(to: string): void {
    this.db.prepare("UPDATE lines SET sent_with = NULL WHERE to_card = ?").run(to);
  }

  // What the card's last message went with, counted.
  setKnows(id: string, knows: CardKnows): boolean {
    return this.db.prepare("UPDATE cards SET knows = ? WHERE id = ?").run(JSON.stringify(knows), id).changes > 0;
  }

  // The cards that read from this one.
  cardsAfter(id: string): string[] {
    return (this.db.prepare("SELECT to_card FROM lines WHERE from_card = ? ORDER BY rowid").all(id) as { to_card: string }[]).map((row) => row.to_card);
  }

  // Another input on a card, after the ones it has. The caller checks it's allowed. False if it's there already, the
  // cards aren't both in this Nest, or it would be a line from a card to itself. `fresh` for a card sent already.
  addLine(nestId: string, from: string, to: string, picked: PickedRows | null, fresh = false): boolean {
    if (from === to || this.card(from)?.nestId !== nestId || this.card(to)?.nestId !== nestId) return false;
    const done =
      this.db
        .prepare("INSERT OR IGNORE INTO lines (id, nest_id, from_card, to_card, picked, fresh) VALUES (?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), nestId, from, to, picked ? JSON.stringify(picked) : null, fresh ? 1 : 0).changes > 0;
    if (done) this.touch(nestId);
    return done;
  }

  // The card has sent with every line into it, so none is new any more.
  settleLines(to: string): void {
    this.db.prepare("UPDATE lines SET fresh = 0 WHERE to_card = ? AND fresh = 1").run(to);
  }

  // Which card a line goes to, or null if it's gone.
  lineTo(lineId: string): string | null {
    return (this.db.prepare("SELECT to_card FROM lines WHERE id = ?").get(lineId) as { to_card: string } | undefined)?.to_card ?? null;
  }

  deleteLine(lineId: string): boolean {
    const nestId = (this.db.prepare("SELECT nest_id FROM lines WHERE id = ?").get(lineId) as { nest_id: string } | undefined)?.nest_id;
    const done = !!nestId && this.db.prepare("DELETE FROM lines WHERE id = ?").run(lineId).changes > 0;
    if (done) this.touch(nestId!);
    return done;
  }

  // A draft becomes a For-each card, with one waiting run for each row, in one go. False if it isn't a draft.
  startForEach(id: string, prompt: string, header: string[], rows: string[][], column: string, lineId: string): boolean {
    const card = this.card(id);
    if (!card) return false;
    this.db.exec("BEGIN");
    try {
      const changed = this.db
        .prepare(
          "UPDATE cards SET each_prompt = ?, each_header = ?, each_column = ?, each_line = ?, each_column_settled = 0, plan = NULL, plan_note = NULL WHERE id = ? AND chat_id IS NULL AND each_prompt IS NULL AND table_name IS NULL AND file_made IS NULL AND page_url IS NULL"
        )
        .run(prompt, JSON.stringify(header), column, lineId, id).changes;
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

  // The column's name. `settle` for the user's own, which a generated one never replaces.
  nameColumn(id: string, name: string, settle: boolean): boolean {
    return (
      this.db
        .prepare(`UPDATE cards SET each_column = ?, each_column_settled = ? WHERE id = ? AND each_prompt IS NOT NULL${settle ? "" : " AND each_column_settled = 0"}`)
        .run(name, settle ? 1 : 0, id).changes > 0
    );
  }

  // A run's short value in its card's column, or null when its answer has none.
  setRunCell(id: string, cell: string | null): boolean {
    return this.db.prepare("UPDATE runs SET cell = ? WHERE id = ?").run(cell, id).changes > 0;
  }

  // A file's rows as a card of their own, with no chat and no bird. Null if the Nest isn't there.
  addTableCard(nestId: string, { x, y, table }: { x: number; y: number; table: { name: string } & PickedRows }): NestCard | null {
    if (!this.db.prepare("SELECT 1 FROM nests WHERE id = ?").get(nestId)) return null;
    const id = randomUUID();
    const preview = table.rows.slice(0, TABLE_PREVIEW_ROWS).map((row) => row.map((cell) => cell.slice(0, PREVIEW_CELL_LENGTH)));
    this.db
      .prepare(
        "INSERT INTO cards (id, nest_id, chat_id, mascot_id, x, y, auto_placed, table_name, table_header, table_count, table_preview, table_rows) VALUES (?, ?, NULL, NULL, ?, ?, 1, ?, ?, ?, ?, ?)"
      )
      .run(id, nestId, x, y, table.name, JSON.stringify(table.header), table.rows.length, JSON.stringify(preview), JSON.stringify(table.rows));
    this.touch(nestId);
    return this.card(id);
  }

  // A file's whole table, its rows as they were added. Null for any other card.
  tableRows(id: string): string[][] | null {
    const row = this.db.prepare("SELECT table_rows FROM cards WHERE id = ? AND table_name IS NOT NULL").get(id) as { table_rows: string } | undefined;
    return row ? (JSON.parse(row.table_rows) as string[][]) : null;
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

  // Runs that started and have no value in their card's column yet, on any card.
  endedRunsWithoutCell(): string[] {
    return (this.db.prepare("SELECT id FROM runs WHERE state = 'started' AND chat_id IS NOT NULL AND cell IS NULL").all() as { id: string }[]).map((row) => row.id);
  }

  // The chats of every run that has started, on any card.
  startedRunChats(): string[] {
    return (this.db.prepare("SELECT chat_id FROM runs WHERE state = 'started' AND chat_id IS NOT NULL").all() as { chat_id: string }[]).map((row) => row.chat_id);
  }

  // Only a waiting run moves on, so a run never starts twice.
  setRunChat(id: string, chatId: string): boolean {
    return this.db.prepare("UPDATE runs SET chat_id = ?, state = 'started' WHERE id = ? AND state = 'waiting'").run(chatId, id).changes > 0;
  }

  // Runs of one card go back to waiting their turn, each with no chat and no value, for Retry and Start remaining. Only
  // runs that had stopped or failed, or started, so one waiting or about to start is left alone. The chats they had, for
  // the caller to delete.
  // `costOf` is what a run's chat cost, which the run keeps, since the chat goes.
  restartRuns(cardId: string, ids: readonly string[], costOf: (chatId: string) => number): string[] {
    const chats: string[] = [];
    this.db.exec("BEGIN");
    try {
      const old = this.db.prepare("SELECT chat_id FROM runs WHERE id = ? AND card_id = ? AND state <> 'waiting'");
      const restart = this.db.prepare("UPDATE runs SET state = 'waiting', chat_id = NULL, cell = NULL, spent = spent + ? WHERE id = ? AND card_id = ? AND state <> 'waiting'");
      for (const id of ids) {
        const row = old.get(id, cardId) as { chat_id: string | null } | undefined;
        if (row && restart.run(row.chat_id ? costOf(row.chat_id) : 0, id, cardId).changes > 0 && row.chat_id) chats.push(row.chat_id);
      }
      const card = this.card(cardId);
      if (card) this.touch(card.nestId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return chats;
  }
  // What a For-each card's runs cost on tries Retry replaced.
  spentOn(cardId: string): number {
    return (this.db.prepare("SELECT COALESCE(SUM(spent), 0) AS spent FROM runs WHERE card_id = ?").get(cardId) as { spent: number }).spent;
  }

  // The line a For-each card's runs took their rows from, null for one sent before that was kept.
  eachLine(cardId: string): string | null {
    return (this.db.prepare("SELECT each_line FROM cards WHERE id = ?").get(cardId) as { each_line: string | null } | undefined)?.each_line ?? null;
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
    this.db.prepare("DELETE FROM cards WHERE page_job = ?").run(id);
    const done = this.db.prepare("DELETE FROM cards WHERE id = ?").run(id).changes > 0;
    if (done && card) this.touch(card.nestId);
    return this.forgetting(done);
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
        "INSERT INTO cards (id, nest_id, chat_id, mascot_id, x, y, plan, plan_prompt, plan_each, plan_waits, plan_table, said, auto_placed) VALUES (?, ?, NULL, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, 1)"
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
        for (const each of card.from) {
          const from = "plan" in each ? ids.get(each.plan) : each.card;
          const source = from === undefined ? null : this.card(from);
          if (!source || source.nestId !== nestId || (!("plan" in each) && !source.chatId && !source.each && !source.table && !source.file)) throw new NotHere();
          line.run(randomUUID(), nestId, from!, ids.get(card.key)!);
        }
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

  // The Nest's conversation in its composer, oldest first: its newest requests, the open one last if there is one.
  talk(nestId: string, limit = TALK_SHOWN): NestRequest[] {
    const requests = this.db.prepare("SELECT id, open FROM requests WHERE nest_id = ? ORDER BY rowid DESC LIMIT ?").all(nestId, limit) as { id: string; open: number }[];
    return requests.reverse().map(({ id, open }) => ({
      id,
      open: open === 1,
      messages: (this.db.prepare("SELECT rowid AS id, role, text, kind, planned, about FROM talk WHERE request_id = ? ORDER BY rowid").all(id) as unknown as TalkRow[]).map(toTalkMessage),
    }));
  }

  // The open request's messages, which the planner reads, or none.
  openRequest(nestId: string): NestRequest | null {
    return this.talk(nestId, 1).find((request) => request.open) ?? null;
  }

  // Adds to the open request, or starts one. Berry's say what kind they are, and the user's which cards they asked about,
  // when it was only the ones they'd selected.
  say(nestId: string, role: "user" | "berry", text: string, what: { kind?: NestTalkMessage["kind"]; planned?: number; about?: readonly string[] } = {}): void {
    let open = this.db.prepare("SELECT id FROM requests WHERE nest_id = ? AND open = 1").get(nestId) as { id: string } | undefined;
    if (!open) {
      open = { id: randomUUID() };
      this.db.prepare("INSERT INTO requests (id, nest_id, open) VALUES (?, ?, 1)").run(open.id, nestId);
    }
    this.db.prepare("INSERT INTO talk (request_id, role, text, kind, planned, about) VALUES (?, ?, ?, ?, ?, ?)").run(open.id, role, text, what.kind ?? null, what.planned ?? null, what.about ? JSON.stringify(what.about) : null);
  }

  // The cards each of the user's messages in the open request asked about, null for one that read the whole board.
  openScopes(nestId: string): (string[] | null)[] {
    const rows = this.db
      .prepare("SELECT talk.about AS about FROM talk JOIN requests ON requests.id = talk.request_id WHERE requests.nest_id = ? AND requests.open = 1 AND talk.role = 'user' ORDER BY talk.rowid")
      .all(nestId) as { about: string | null }[];
    return rows.map(({ about }) => (about === null ? null : (JSON.parse(about) as string[])));
  }

  // One of Berry's answers about the board in this Nest, by its message's id. Null for anything else.
  answer(nestId: string, messageId: number): string | null {
    const row = this.db
      .prepare("SELECT talk.text AS text FROM talk JOIN requests ON requests.id = talk.request_id WHERE talk.rowid = ? AND requests.nest_id = ? AND talk.role = 'berry' AND talk.kind = 'answer'")
      .get(messageId, nestId) as { text: string } | undefined;
    return row?.text ?? null;
  }

  setTucked(nestId: string, tucked: boolean): boolean {
    return this.db.prepare("UPDATE nests SET composer_tucked = ? WHERE id = ?").run(tucked ? 1 : 0, nestId).changes > 0;
  }

  // A note's card, with no chat and no bird, holding one of Berry's answers as it is now. Null if the Nest isn't there.
  addNoteCard(nestId: string, { x, y, text }: { x: number; y: number; text: string }): NestCard | null {
    if (!this.db.prepare("SELECT 1 FROM nests WHERE id = ?").get(nestId)) return null;
    const id = randomUUID();
    this.db.prepare("INSERT INTO cards (id, nest_id, chat_id, mascot_id, x, y, auto_placed, note_text) VALUES (?, ?, NULL, NULL, ?, ?, 1, ?)").run(id, nestId, x, y, text);
    this.touch(nestId);
    return this.card(id);
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
    const rows = this.db.prepare("SELECT kind, name, type, data, note, via_card AS via, made FROM attachments WHERE card_id = ? ORDER BY rowid").all(cardId) as {
      kind: "file" | "note";
      name: string;
      type: string;
      data: Uint8Array | null;
      note: string | null;
      via: string | null;
      made: number;
    }[];
    return rows.map((row) => {
      if (row.kind === "note") return { kind: "note", text: row.note ?? "" };
      const from = row.via === null ? {} : { from: row.made === 1 ? ("made" as const) : ("board" as const) };
      return { kind: "file", name: row.name, type: row.type, data: row.data ?? new Uint8Array(), ...from };
    });
  }

  // A file's card, with no chat and no bird, owning its one file, and the line from the card that made it if a bird did.
  // In one go. Null if the Nest or that card isn't there.
  addFileCard(
    nestId: string,
    { x, y, file, preview, madeBy = null }: { x: number; y: number; file: { name: string; type: string; size: number; pages: number | null; data: Uint8Array }; preview: string | null; madeBy?: string | null }
  ): NestCard | null {
    const id = randomUUID();
    this.db.exec("BEGIN");
    try {
      if (!this.db.prepare("SELECT 1 FROM nests WHERE id = ?").get(nestId)) throw new NotHere();
      if (madeBy !== null && this.card(madeBy)?.nestId !== nestId) throw new NotHere();
      this.db
        .prepare("INSERT INTO cards (id, nest_id, chat_id, mascot_id, x, y, auto_placed, file_made, file_preview) VALUES (?, ?, NULL, NULL, ?, ?, 1, ?, ?)")
        .run(id, nestId, x, y, madeBy === null ? 0 : 1, preview);
      this.db
        .prepare("INSERT INTO attachments (id, nest_id, card_id, kind, name, type, size, pages, data, note, made) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, NULL, ?)")
        .run(randomUUID(), nestId, id, file.name, file.type, file.size, file.pages, file.data, madeBy === null ? 0 : 1);
      if (madeBy !== null) this.db.prepare("INSERT INTO lines (id, nest_id, from_card, to_card, picked) VALUES (?, ?, ?, ?, NULL)").run(randomUUID(), nestId, madeBy, id);
      this.touch(nestId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (error instanceof NotHere) return null;
      throw error;
    }
    return this.card(id);
  }

  // A page's card, with no chat and no bird, where it was put. `job` while it's one of that card's running job's tabs,
  // joined to it by a line, and `from` for a page that card's job kept, joined to it the same way. In one go. Null if
  // the Nest or that card isn't there.
  addPageCard(
    nestId: string,
    { x, y, url, title, dropped = false, job = null, from = null }: { x: number; y: number; url: string; title: string; dropped?: boolean; job?: string | null; from?: string | null }
  ): NestCard | null {
    const id = randomUUID();
    const joinedTo = job ?? from;
    this.db.exec("BEGIN");
    try {
      if (!this.db.prepare("SELECT 1 FROM nests WHERE id = ?").get(nestId)) throw new NotHere();
      if (joinedTo !== null && this.card(joinedTo)?.nestId !== nestId) throw new NotHere();
      this.db
        .prepare("INSERT INTO cards (id, nest_id, chat_id, mascot_id, x, y, auto_placed, page_url, page_title, page_dropped, page_job) VALUES (?, ?, NULL, NULL, ?, ?, 1, ?, ?, ?, ?)")
        .run(id, nestId, x, y, url, title, dropped ? 1 : 0, job);
      if (joinedTo !== null) this.db.prepare("INSERT INTO lines (id, nest_id, from_card, to_card, picked) VALUES (?, ?, ?, ?, NULL)").run(randomUUID(), nestId, joinedTo, id);
      this.touch(nestId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (error instanceof NotHere) return null;
      throw error;
    }
    return this.card(id);
  }

  // The page cards showing a card's running job's tabs.
  jobPages(cardId: string): { id: string; url: string }[] {
    return this.db.prepare("SELECT id, page_url AS url FROM cards WHERE page_job = ? ORDER BY rowid").all(cardId) as { id: string; url: string }[];
  }

  // Its job has ended and its tab is still open, so it stays as an ordinary tab card, still joined to that card, under
  // the address and title a reply would keep of it.
  keepPage(id: string, { url, title }: { url: string; title: string }): boolean {
    return this.db.prepare("UPDATE cards SET page_job = NULL, page_url = ?, page_title = ? WHERE id = ? AND page_job IS NOT NULL").run(url, title, id).changes > 0;
  }

  deletePage(id: string): boolean {
    const card = this.card(id);
    const done = this.db.prepare("DELETE FROM cards WHERE id = ? AND page_url IS NOT NULL").run(id).changes > 0;
    if (done && card) this.touch(card.nestId);
    return done;
  }

  // A card's job's tabs shown around it, or every card's when no card is named, as at launch, when no job runs. Their ids.
  deleteJobPages(cardId?: string): string[] {
    const rows = (
      cardId === undefined
        ? this.db.prepare("DELETE FROM cards WHERE page_job IS NOT NULL RETURNING id").all()
        : this.db.prepare("DELETE FROM cards WHERE page_job = ? RETURNING id").all(cardId)
    ) as { id: string }[];
    return rows.map((row) => row.id);
  }

  // A file's card's file with its bytes, or null for any other card.
  fileOf(cardId: string): { name: string; type: string; size: number; pages: number | null; data: Uint8Array; made: boolean } | null {
    const row = this.db
      .prepare("SELECT a.name, a.type, a.size, a.pages, a.data, c.file_made AS made FROM attachments a JOIN cards c ON c.id = a.card_id WHERE c.id = ? AND c.file_made IS NOT NULL")
      .get(cardId) as { name: string; type: string; size: number; pages: number | null; data: Uint8Array | null; made: number } | undefined;
    return row ? { ...row, data: row.data ?? new Uint8Array(), made: row.made === 1 } : null;
  }

  // The file's cards a card has its own copies from, by id, whether they're still there or not.
  copiedFrom(cardId: string): Set<string> {
    return new Set((this.db.prepare("SELECT via_card FROM attachments WHERE card_id = ? AND via_card IS NOT NULL").all(cardId) as { via_card: string }[]).map((row) => row.via_card));
  }

  // A card keeps its own copy of a file's card's file once it sends with it, so deleting that card later changes nothing
  // here. Only once for each file's card. False if either isn't there.
  copyFile(cardId: string, fileCardId: string): boolean {
    if (this.copiedFrom(cardId).has(fileCardId) || !this.card(cardId)) return false;
    return (
      this.db
        .prepare(
          `INSERT INTO attachments (id, nest_id, card_id, kind, name, type, size, pages, data, note, via_card, made)
           SELECT ?, a.nest_id, ?, 'file', a.name, a.type, a.size, a.pages, a.data, NULL, ?, a.made FROM attachments a JOIN cards c ON c.id = a.card_id
           WHERE c.id = ? AND c.file_made IS NOT NULL AND c.nest_id = (SELECT nest_id FROM cards WHERE id = ?)`
        )
        .run(randomUUID(), cardId, fileCardId, fileCardId, cardId).changes > 0
    );
  }

  // A card's own copies of these file's cards' files go, as a line it took them through goes.
  dropCopies(cardId: string, fileCardIds: readonly string[]): void {
    const drop = this.db.prepare("DELETE FROM attachments WHERE card_id = ? AND via_card = ?");
    for (const fileCardId of fileCardIds) drop.run(cardId, fileCardId);
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
    return this.forgetting(this.db.prepare("DELETE FROM attachments WHERE id = ?").run(id).changes > 0);
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
