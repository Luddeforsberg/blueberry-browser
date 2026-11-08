import { existsSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { NestStore } from "./NestStore";
import { PREVIEW_CELL_LENGTH, TABLE_PREVIEW_ROWS } from "../shared/nestTable";

// What the migration for an earlier card changing added: what each line was sent with, and what a card's message knew.
const STALE_COLUMNS = "ALTER TABLE lines DROP COLUMN sent_with; ALTER TABLE runs DROP COLUMN sent_with; ALTER TABLE cards DROP COLUMN knows;";

// What the migration for coming back to a board added: card titles, unread dots, and when cards and Nests were last seen.
const RETURN_COLUMNS =
  STALE_COLUMNS +
  "ALTER TABLE cards DROP COLUMN title; ALTER TABLE cards DROP COLUMN title_settled; ALTER TABLE cards DROP COLUMN unread; ALTER TABLE cards DROP COLUMN changed_at; ALTER TABLE nests DROP COLUMN seen_at;";

// What the migrations for page cards and fresh lines added.
const PAGE_COLUMNS =
  "ALTER TABLE cards DROP COLUMN page_url; ALTER TABLE cards DROP COLUMN page_title; ALTER TABLE cards DROP COLUMN page_dropped; ALTER TABLE cards DROP COLUMN page_job; " +
  "ALTER TABLE lines DROP COLUMN fresh;";

// What the migration for the composer added: whether it's tucked, what kind each message is, and note cards.
const COMPOSER_COLUMNS =
  "ALTER TABLE nests DROP COLUMN composer_tucked; ALTER TABLE talk DROP COLUMN kind; ALTER TABLE talk DROP COLUMN planned; ALTER TABLE talk DROP COLUMN about; ALTER TABLE cards DROP COLUMN note_text; " +
  RETURN_COLUMNS;

// What migrations after 9 added, so a file can be taken back to how an older version left it.
const LATER_COLUMNS =
  "ALTER TABLE cards DROP COLUMN each_column; ALTER TABLE cards DROP COLUMN each_column_settled; ALTER TABLE runs DROP COLUMN cell; " +
  "ALTER TABLE cards DROP COLUMN table_name; ALTER TABLE cards DROP COLUMN table_header; ALTER TABLE cards DROP COLUMN table_count; " +
  "ALTER TABLE cards DROP COLUMN table_preview; ALTER TABLE cards DROP COLUMN table_rows; " +
  "ALTER TABLE cards DROP COLUMN each_line; ALTER TABLE runs DROP COLUMN spent; " +
  "ALTER TABLE cards DROP COLUMN width; ALTER TABLE cards DROP COLUMN height; " +
  "ALTER TABLE cards DROP COLUMN file_made; ALTER TABLE cards DROP COLUMN file_preview; ALTER TABLE attachments DROP COLUMN via_card; ALTER TABLE attachments DROP COLUMN made; " +
  PAGE_COLUMNS +
  COMPOSER_COLUMNS;

describe("NestStore", () => {
  it("keeps a nest's cards, their places and the lines between them across opening the file again", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nested", "nests.db");
    const store = new NestStore(file);
    const nest = store.createNest("Find customers");
    const scout = store.addCard(nest, { x: 10, y: 20, mascotId: "scout" })!;
    store.setChat(scout.id, "chat-1");
    const writer = store.addCard(nest, { x: 400, y: 20, from: scout.id })!;
    store.moveCard(writer.id, 420.5, 32);
    const bytes = new Uint8Array([37, 80, 68, 70, 0, 255]);
    store.addAttachment({ cardId: writer.id }, { kind: "file", name: "one-pager.pdf", type: "application/pdf", size: bytes.length, pages: 1, data: bytes });
    store.addAttachment({ nestId: nest }, { kind: "note", text: "Only B2B" });

    const again = new NestStore(file);
    expect(again.board(nest)).toEqual({
      id: nest,
      title: "Find customers",
      cards: [
        { id: scout.id, chatId: "chat-1", mascotId: "scout", x: 10, y: 20, autoPlaced: false, each: null, plan: null, table: null, file: null, attachments: [] },
        {
          id: writer.id,
          chatId: null,
          mascotId: null,
          x: 420.5,
          y: 32,
          autoPlaced: false,
          each: null,
          plan: null,
          table: null,
          file: null,
          attachments: [{ id: expect.any(String), kind: "file", name: "one-pager.pdf", type: "application/pdf", size: 6 }],
        },
      ],
      lines: [{ id: expect.any(String), from: scout.id, to: writer.id, picked: null }],
      talk: [],
      composerTucked: false,
      attached: [{ id: expect.any(String), kind: "note", name: "", type: "text/plain", size: 8, text: "Only B2B" }],
    });
    // The bytes as they were copied in, whatever happens to the file on disk.
    expect(again.sentAttachments(writer.id)).toEqual([{ kind: "file", name: "one-pager.pdf", type: "application/pdf", data: bytes }]);
    // A card's go with it.
    again.deleteCard(writer.id);
    expect(again.sentAttachments(writer.id)).toEqual([]);
  });

  it("counts a file added on a planned card before the pointers as the card's own, even when the composer has the same one", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nests.db");
    const store = new NestStore(file);
    const nest = store.createNest("Find customers");
    const scout = store.addCard(nest, { x: 0, y: 0, planned: true })!;
    const writer = store.addCard(nest, { x: 500, y: 0, planned: true })!;
    const pdf = { kind: "file" as const, name: "one-pager.pdf", type: "application/pdf", size: 4, pages: 1, data: new Uint8Array([37, 80, 68, 70]) };
    store.addAttachment({ nestId: nest }, pdf);
    store.addAttachment({ cardId: writer.id }, pdf);
    // As a file from before migration 6 has it.
    const db = new DatabaseSync(file);
    db.exec("PRAGMA user_version = 5;");
    for (const column of ["source_id"]) {
      try {
        db.exec(`ALTER TABLE attachments DROP COLUMN ${column}`);
      } catch {
        // Not there in this version.
      }
    }
    db.exec("DROP TABLE IF EXISTS plan_attachments;");
    db.exec(`ALTER TABLE nests DROP COLUMN title_settled; ALTER TABLE cards DROP COLUMN auto_placed; ${LATER_COLUMNS}`);
    db.close();

    const again = new NestStore(file);
    const plan = (key: string, keeps: string | null) => ({ key, mascotId: null, prompt: `Do ${key}`, from: [], each: false, waits: false, table: null, x: 0, y: 0, attached: [], keeps });
    const [, kept] = again.setPlan(nest, [plan("p1", scout.id), plan("p2", writer.id)], "Find companies")!;
    expect(again.card(kept)!.attachments.map((each) => each.name)).toEqual(["one-pager.pdf"]);
    expect(again.board(nest)!.attached.map((each) => each.name)).toEqual(["one-pager.pdf"]);
  });

  it("names a Nest only until its name is settled, and settles the old placeholder's name no more", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nests.db");
    const store = new NestStore(file);
    const fresh = store.createNest("New Nest");
    expect(store.nameNest(fresh, "Find customers", false)).toBe(true);
    expect(store.titleSettled(fresh)).toBe(false);
    expect(store.nameNest(fresh, "Customer outreach", true)).toBe(true);
    expect(store.nameNest(fresh, "Something else", true)).toBe(false);
    const mine = store.createNest("New Nest");
    store.renameNest(mine, "My own name");
    expect(store.nameNest(mine, "Generated", true)).toBe(false);
    expect(store.board(mine)!.title).toBe("My own name");
    const fromChat = store.createNest("Swedish SaaS", true);
    expect(store.titleSettled(fromChat)).toBe(true);

    // A Nest from before names were settled keeps its name, unless it's the old placeholder.
    const old = store.createNest("Untitled nest");
    const db = new DatabaseSync(file);
    db.exec(`PRAGMA user_version = 7; ALTER TABLE nests DROP COLUMN title_settled; ALTER TABLE cards DROP COLUMN auto_placed; ${LATER_COLUMNS}`);
    db.close();
    const again = new NestStore(file);
    expect(again.titleSettled(old)).toBe(false);
    expect(again.titleSettled(mine)).toBe(true);
  });

  it("keeps the size a card was made, and gives a card from before sizes none", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nests.db");
    const store = new NestStore(file);
    const nest = store.createNest("Leads");
    const card = store.addCard(nest, { x: 0, y: 0 })!;
    // As a file from before sizes has it.
    const db = new DatabaseSync(file);
    const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
    db.exec(
      `PRAGMA user_version = ${version - 7}; ALTER TABLE cards DROP COLUMN width; ALTER TABLE cards DROP COLUMN height; ` +
        "ALTER TABLE cards DROP COLUMN file_made; ALTER TABLE cards DROP COLUMN file_preview; ALTER TABLE attachments DROP COLUMN via_card; ALTER TABLE attachments DROP COLUMN made; " +
        PAGE_COLUMNS +
        COMPOSER_COLUMNS
    );
    db.close();

    const again = new NestStore(file);
    expect(again.card(card.id)).not.toHaveProperty("size");
    expect(again.resizeCard(card.id, 640, 520)).toBe(true);
    expect(again.resizeCard("missing", 640, 520)).toBe(false);
    expect(new NestStore(file).board(nest)!.cards[0].size).toEqual({ width: 640, height: 520 });
  });

  it("nudges only cards placed for the user, in their own nest, until the user moves one by hand", () => {
    const store = new NestStore(":memory:");
    const nest = store.createNest("Leads");
    const other = store.createNest("Other");
    const placed = store.addCard(nest, { x: 0, y: 300, auto: true })!;
    const pressed = store.addCard(nest, { x: 0, y: 600 })!;
    const elsewhere = store.addCard(other, { x: 0, y: 300, auto: true })!;
    expect([placed.autoPlaced, pressed.autoPlaced]).toEqual([true, false]);
    const moves = [placed, pressed, elsewhere].map(({ id }) => ({ id, x: 0, y: 900 }));
    expect(store.nudgeCards(nest, moves)).toBe(1);
    expect([store.card(placed.id)!.y, store.card(pressed.id)!.y, store.card(elsewhere.id)!.y]).toEqual([900, 600, 300]);
    // Dragged once, it stays where the user left it.
    store.moveCard(placed.id, 40, 120);
    expect(store.card(placed.id)!.autoPlaced).toBe(false);
    expect(store.nudgeCards(nest, [{ id: placed.id, x: 0, y: 900 }])).toBe(0);
    expect(store.card(placed.id)).toMatchObject({ x: 40, y: 120 });
  });

  it("only draws a line from a card in the same nest", () => {
    const store = new NestStore(":memory:");
    const one = store.createNest("One");
    const two = store.createNest("Two");
    const card = store.addCard(one, { x: 0, y: 0 })!;

    expect(store.addCard(two, { x: 0, y: 0, from: card.id })).toBeNull();
    expect(store.addCard(one, { x: 0, y: 0, from: "not-a-card" })).toBeNull();
    expect(store.addCard("not-a-nest", { x: 0, y: 0 })).toBeNull();
    expect(store.board(two)?.cards).toEqual([]);
    expect(store.board(one)?.cards).toHaveLength(1);
  });

  it("says which card a card continues from, and none for one with no line", () => {
    const store = new NestStore(":memory:");
    const nest = store.createNest("Nest");
    const source = store.addCard(nest, { x: 0, y: 0 })!;
    const next = store.addCard(nest, { x: 0, y: 0, from: source.id })!;

    expect(store.linesTo(next.id).map((line) => line.source.id)).toEqual([source.id]);
    expect(store.linesTo(source.id)).toEqual([]);
  });

  it("changes a card's bird only while it's a draft, and gives it a chat only once", () => {
    const store = new NestStore(":memory:");
    const card = store.addCard(store.createNest("Nest"), { x: 0, y: 0 })!;

    expect(store.setBird(card.id, "scout")).toBe(true);
    expect(store.setChat(card.id, "chat-1")).toBe(true);
    expect(store.setChat(card.id, "chat-2")).toBe(false);
    expect(store.setBird(card.id, "writer")).toBe(false);
    expect(store.card(card.id)).toMatchObject({ chatId: "chat-1", mascotId: "scout" });
    expect(store.cardOfChat("chat-1")?.id).toBe(card.id);
    expect(store.cardOfChat("chat-2")).toBeNull();
  });

  it("takes a card's lines with it, and a nest's cards and lines with it", () => {
    const store = new NestStore(":memory:");
    const nest = store.createNest("Nest");
    const a = store.addCard(nest, { x: 0, y: 0 })!;
    store.setChat(a.id, "chat-a");
    const b = store.addCard(nest, { x: 0, y: 0, from: a.id })!;
    store.setChat(b.id, "chat-b");
    const c = store.addCard(nest, { x: 0, y: 0, from: b.id })!;

    expect(store.deleteCard(b.id)).toBe(true);
    expect(store.board(nest)?.lines).toEqual([]);
    expect(store.board(nest)?.cards.map(({ id }) => id)).toEqual([a.id, c.id]);
    expect(store.chatIds(nest)).toEqual(["chat-a"]);

    expect(store.deleteNest(nest)).toBe(true);
    expect(store.board(nest)).toBeNull();
    expect(store.card(a.id)).toBeNull();
    expect(store.chatIds()).toEqual([]);
    expect(store.deleteNest(nest)).toBe(false);
  });

  it("lists nests newest first, and a rename moves one up", async () => {
    const store = new NestStore(":memory:");
    const older = store.createNest("Older");
    await new Promise((resolve) => setTimeout(resolve, 2));
    store.createNest("Newer");
    await new Promise((resolve) => setTimeout(resolve, 2));
    store.renameNest(older, "Renamed");

    expect(store.nests().map(({ title }) => title)).toEqual(["Renamed", "Newer"]);
  });

  it("keeps the rows picked for a line as they were, and sends only how many with the board", () => {
    const store = new NestStore(":memory:");
    const nest = store.createNest("Nest");
    const source = store.addCard(nest, { x: 0, y: 0 })!;
    const picked = { header: ["Company"], rows: [["Fjällbo"], ["Brygga"]] };
    const next = store.addCard(nest, { x: 0, y: 0, from: source.id, picked })!;

    expect(store.linesTo(next.id)).toEqual([{ lineId: expect.any(String), source: expect.objectContaining({ id: source.id }), picked, fresh: false, sentWith: null }]);
    // The board carries only how many, and a line with none picked says so.
    expect(store.board(nest)?.lines[0].picked).toBe(2);
    store.addCard(nest, { x: 0, y: 0, from: source.id });
    expect(store.board(nest)?.lines[1].picked).toBeNull();
  });

  it("makes a draft a For-each card once, with a waiting run for each row, and starts each run only once", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nests.db");
    const store = new NestStore(file);
    const nest = store.createNest("Nest");
    const card = store.addCard(nest, { x: 0, y: 0 })!;

    expect(store.startForEach(card.id, "Write to each", ["Company"], [["Fjällbo"], ["Brygga"]], "Result", "line-1")).toBe(true);
    expect(store.startForEach(card.id, "Again", ["Company"], [["Kvarnsten"]], "Result", "line-1")).toBe(false);
    expect(store.setChat(card.id, "chat-1")).toBe(false);
    expect(store.setBird(card.id, "scout")).toBe(false);
    const [first, second] = store.waitingRuns();
    expect(store.setRunChat(first.id, "run-chat-1")).toBe(true);
    expect(store.setRunChat(first.id, "run-chat-2")).toBe(false);
    expect(store.stopWaiting(card.id)).toBe(1);
    expect(store.setRunChat(second.id, "run-chat-3")).toBe(false);

    expect(new NestStore(file).card(card.id)?.each).toEqual({
      prompt: "Write to each",
      header: ["Company"],
      column: "Result",
      runs: [
        { id: first.id, row: ["Fjällbo"], chatId: "run-chat-1", state: "started", cell: null },
        { id: second.id, row: ["Brygga"], chatId: null, state: "stopped", cell: null },
      ],
    });
    expect(store.runOfChat("run-chat-1")?.cardId).toBe(card.id);
    expect(store.startedRunChats()).toEqual(["run-chat-1"]);
    expect(store.chatIds(nest)).toEqual(["run-chat-1"]);

    expect(store.deleteCard(card.id)).toBe(true);
    expect(store.run(first.id)).toBeNull();
    expect(store.chatIds()).toEqual([]);
  });

  it("names the column of a For-each card from before columns, so none is left blank", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nests.db");
    const store = new NestStore(file);
    const nest = store.createNest("Nest");
    const card = store.addCard(nest, { x: 0, y: 0 })!;
    store.startForEach(card.id, "Find posts", ["Company"], [["Fjällbo"]], "Latest post", "line-1");
    const db = new DatabaseSync(file);
    db.exec(`PRAGMA user_version = 9; ${LATER_COLUMNS}`);
    db.close();
    expect(new NestStore(file).card(card.id)!.each!.column).toBe("Result");
  });

  it("keeps a column's name the user gave over a generated one, a run's value, and a file's rows as a card nothing can send from", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nests.db");
    const store = new NestStore(file);
    const nest = store.createNest("Nest");
    const card = store.addCard(nest, { x: 0, y: 0 })!;
    store.startForEach(card.id, "Find posts", ["Company"], [["Fjällbo"]], "Result", "line-1");
    expect(store.nameColumn(card.id, "Latest post", false)).toBe(true);
    expect(store.nameColumn(card.id, "Mine", true)).toBe(true);
    expect(store.nameColumn(card.id, "Generated later", false)).toBe(false);
    const [run] = store.card(card.id)!.each!.runs;
    store.setRunChat(run.id, "run-chat");
    expect(store.endedRunsWithoutCell()).toEqual([run.id]);
    store.setRunCell(run.id, "Hiring two SDRs");
    expect(store.endedRunsWithoutCell()).toEqual([]);

    const table = store.addTableCard(nest, { x: 500, y: 0, table: { name: "leads", header: ["Company"], rows: [["Brygga"]] } })!;
    expect(store.setChat(table.id, "chat")).toBe(false);
    expect(store.startForEach(table.id, "Go", ["Company"], [["Brygga"]], "Result", "line-1")).toBe(false);
    expect(store.setBird(table.id, "scout")).toBe(false);
    const again = new NestStore(file);
    expect(again.card(card.id)!.each).toMatchObject({ column: "Mine", runs: [{ cell: "Hiring two SDRs" }] });
    expect(again.card(table.id)).toMatchObject({ chatId: null, mascotId: null, autoPlaced: true, table: { name: "leads", header: ["Company"], rows: [["Brygga"]], count: 1 } });
    expect(again.tableRows(table.id)).toEqual([["Brygga"]]);
    // Only the first rows go with the card, each cell cut, and the whole table is read on its own.
    const big = again.addTableCard(nest, { x: 0, y: 900, table: { name: "big", header: ["A"], rows: Array.from({ length: 9 }, (_, index) => [`${index}${"z".repeat(500)}`]) } })!;
    expect(big.table!.count).toBe(9);
    expect(big.table!.rows.map((row) => row[0].length)).toEqual(Array(TABLE_PREVIEW_ROWS).fill(PREVIEW_CELL_LENGTH));
    expect(again.tableRows(big.id)![8][0]).toBe(`8${"z".repeat(500)}`);
    expect(again.tableRows(card.id)).toBeNull();
    // A line can come out of it, as out of any card with something to give.
    const plan = { key: "p1", mascotId: null, prompt: "For each", from: [{ card: table.id }], each: true, waits: false, table: null, x: 0, y: 400, attached: [], keeps: null };
    expect(again.setPlan(nest, [plan], "Do it")).toHaveLength(1);
  });

  it("gives a file's card its file to own, lets a line only point at it, and keeps a copy on a card that sent with it", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nests.db");
    const store = new NestStore(file);
    const nest = store.createNest("Files");
    const bytes = new TextEncoder().encode("Lindqvist Data, Fjällbo, SECRET-PITCH-7731");
    const pitch = store.addFileCard(nest, { x: 0, y: 0, file: { name: "pitch.txt", type: "text/plain", size: bytes.length, pages: null, data: bytes }, preview: "SECRET-PITCH-7731" })!;
    expect(pitch).toMatchObject({ chatId: null, mascotId: null, autoPlaced: true, table: null, attachments: [], file: { name: "pitch.txt", type: "text/plain", size: bytes.length, made: false, preview: "SECRET-PITCH-7731" } });
    expect(store.fileOf(pitch.id)).toMatchObject({ name: "pitch.txt", data: bytes, made: false });
    // It never becomes a chat, a For-each card or anyone's bird's.
    expect(store.setChat(pitch.id, "chat")).toBe(false);
    expect(store.startForEach(pitch.id, "Go", ["A"], [["a"]], "Result", "line")).toBe(false);
    expect(store.setBird(pitch.id, "scout")).toBe(false);

    const writer = store.addCard(nest, { x: 600, y: 0, from: pitch.id })!;
    // The line only points: the card has nothing of its own until it sends.
    expect(store.sentAttachments(writer.id)).toEqual([]);
    expect(store.copyFile(writer.id, pitch.id)).toBe(true);
    expect(store.copyFile(writer.id, pitch.id)).toBe(false);
    expect(store.copiedFrom(writer.id)).toEqual(new Set([pitch.id]));
    expect(store.sentAttachments(writer.id)).toEqual([{ kind: "file", name: "pitch.txt", type: "text/plain", data: bytes, from: "board" }]);

    // Deleting the file's card deletes its file, and the line, and the card that sent keeps its own copy.
    expect(store.deleteCard(pitch.id)).toBe(true);
    expect(store.fileOf(pitch.id)).toBeNull();
    expect(store.linesTo(writer.id)).toEqual([]);
    expect(store.sentAttachments(writer.id)).toEqual([{ kind: "file", name: "pitch.txt", type: "text/plain", data: bytes, from: "board" }]);
    const rows = new DatabaseSync(file).prepare("SELECT card_id FROM attachments").all() as { card_id: string }[];
    expect(rows).toEqual([{ card_id: writer.id }]);
    // A card that hadn't sent yet has nothing to copy any more.
    const late = store.addCard(nest, { x: 0, y: 600 })!;
    expect(store.copyFile(late.id, pitch.id)).toBe(false);

    // Deleting the card that sent deletes its copy too, so nothing is left behind.
    store.deleteCard(writer.id);
    expect(new DatabaseSync(file).prepare("SELECT COUNT(*) AS count FROM attachments").get()).toEqual({ count: 0 });
    // Nor anywhere on disk: not in the file's free pages, and not in its write-ahead log.
    for (const part of [file, `${file}-wal`]) if (existsSync(part)) expect(readFileSync(part).includes("SECRET-PITCH-7731")).toBe(false);
  });

  it("joins a file a card's bird made to that card, and never copies a file's card from another Nest", () => {
    const store = new NestStore(":memory:");
    const nest = store.createNest("Made");
    const other = store.createNest("Other");
    const scout = store.addCard(nest, { x: 0, y: 0, mascotId: "scout" })!;
    store.setChat(scout.id, "chat-1");
    const data = new TextEncoder().encode("Company\nBrygga");
    const made = store.addFileCard(nest, { x: 600, y: 0, file: { name: "leads.csv", type: "text/csv", size: data.length, pages: null, data }, preview: "Company\nBrygga", madeBy: scout.id })!;
    expect(made.file).toMatchObject({ made: true });
    expect(store.linesTo(made.id).map((line) => line.source.id)).toEqual([scout.id]);
    expect(store.addFileCard(other, { x: 0, y: 0, file: { name: "x.md", type: "text/markdown", size: 1, pages: null, data }, preview: null, madeBy: scout.id })).toBeNull();
    const elsewhere = store.addCard(other, { x: 0, y: 0 })!;
    expect(store.copyFile(elsewhere.id, made.id)).toBe(false);
    const next = store.addCard(nest, { x: 1200, y: 0, from: made.id })!;
    store.copyFile(next.id, made.id);
    expect(store.sentAttachments(next.id)).toMatchObject([{ name: "leads.csv", from: "made" }]);
  });

  it("keeps the composer tucked per Nest, gives a Nest from before it an open one, and keeps what each message was", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nests.db");
    const store = new NestStore(file);
    const nest = store.createNest("Leads");
    const other = store.createNest("Other");
    store.say(nest, "user", "What did Scout find?");
    store.say(nest, "berry", "Five rivals.");
    // As a file from before the composer could tuck has it, with the talk as it was then.
    const db = new DatabaseSync(file);
    const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
    db.exec(`PRAGMA user_version = ${version - 3}; ${COMPOSER_COLUMNS}`);
    db.close();

    const again = new NestStore(file);
    expect(again.board(nest)!.composerTucked).toBe(false);
    expect(again.board(nest)!.talk[0].messages).toEqual([
      { id: expect.any(Number), role: "user", text: "What did Scout find?" },
      { id: expect.any(Number), role: "berry", text: "Five rivals." },
    ]);
    // An answer from before kinds can't go on the board, since nothing says it was an answer.
    expect(again.answer(nest, again.board(nest)!.talk[0].messages[1].id)).toBeNull();
    expect(again.setTucked(nest, true)).toBe(true);
    expect(again.setTucked("missing", true)).toBe(false);
    again.say(nest, "user", "Which matters most?", { about: ["card-1", "card-2"] });
    again.say(nest, "berry", "Comet.", { kind: "answer" });

    const reopened = new NestStore(file);
    expect([reopened.board(nest)!.composerTucked, reopened.board(other)!.composerTucked]).toEqual([true, false]);
    const [asked, answered] = reopened.board(nest)!.talk[0].messages.slice(2);
    expect(asked).toEqual({ id: expect.any(Number), role: "user", text: "Which matters most?", about: 2 });
    expect(reopened.answer(nest, answered.id)).toBe("Comet.");
    // Only an answer, and only in its own Nest.
    expect(reopened.answer(other, answered.id)).toBeNull();
    expect(reopened.answer(nest, asked.id)).toBeNull();
  });

  it("keeps what each line was sent with and what a card's message knew across opening the file again, and none from before", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nests.db");
    const store = new NestStore(file);
    const nest = store.createNest("Leads");
    const scout = store.addCard(nest, { x: 0, y: 0 })!;
    const writer = store.addCard(nest, { x: 500, y: 0, from: scout.id })!;
    const [line] = store.linesTo(writer.id);
    expect(line.sentWith).toBeNull();
    const knows = { sent: true, at: 5, cards: 1, pages: 0, files: 2, notes: 0, cut: 1, leftOutCards: 0, leftOutFiles: 0 };
    store.keepSentWith(writer.id, new Map([[line.lineId, "thread abc"]]));
    // Only into its own card.
    store.keepSentWith(scout.id, new Map([[line.lineId, "thread other"]]));
    expect(store.setKnows(writer.id, knows)).toBe(true);
    expect(store.setKnows("missing", knows)).toBe(false);

    // A For-each card's runs each keep their own, until the run goes again.
    const each = store.addCard(nest, { x: 0, y: 500, from: scout.id })!;
    store.startForEach(each.id, "Write", ["Company"], [["One"], ["Two"]], "Result", "line-1");
    const [one, two] = store.card(each.id)!.each!.runs;
    store.keepRunSentWith(one.id, new Map([["line-a", "thread abc"]]));
    store.keepRunSentWith(one.id, new Map([["line-b", "note xyz"]]));
    store.keepRunSentWith("missing", new Map([["line-a", "thread abc"]]));
    expect(store.runsSentWith(each.id)).toEqual([{ "line-a": "thread abc", "line-b": "note xyz" }]);

    const reopened = new NestStore(file);
    expect(reopened.linesTo(writer.id)[0].sentWith).toBe("thread abc");
    expect(reopened.card(writer.id)!.knows).toEqual(knows);
    expect(reopened.runsSentWith(each.id)).toEqual([{ "line-a": "thread abc", "line-b": "note xyz" }]);
    reopened.setRunState(two.id, "failed");
    reopened.setRunChat(one.id, "chat-1");
    reopened.restartRuns(each.id, [one.id, two.id], () => 0);
    expect(reopened.runsSentWith(each.id)).toEqual([]);

    // Damaged counts say nothing rather than something wrong.
    const db = new DatabaseSync(file);
    db.prepare("UPDATE cards SET knows = ? WHERE id = ?").run('{"sent":true,"at":5,"cards":-1}', writer.id);
    expect(new NestStore(file).card(writer.id)).not.toHaveProperty("knows");
    db.prepare("UPDATE cards SET knows = ? WHERE id = ?").run("not json", writer.id);
    expect(new NestStore(file).card(writer.id)).not.toHaveProperty("knows");
    // As a file from before has it: nothing was kept, so nothing has changed.
    const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
    db.exec(`PRAGMA user_version = ${version - 1}; ${STALE_COLUMNS}`);
    db.close();
    const older = new NestStore(file);
    expect(older.linesTo(writer.id)[0].sentWith).toBeNull();
    expect(older.card(writer.id)).not.toHaveProperty("knows");
  });
});
