import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { NestStore } from "./NestStore";

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
        { id: scout.id, chatId: "chat-1", mascotId: "scout", x: 10, y: 20, each: null, plan: null, attachments: [] },
        {
          id: writer.id,
          chatId: null,
          mascotId: null,
          x: 420.5,
          y: 32,
          each: null,
          plan: null,
          attachments: [{ id: expect.any(String), kind: "file", name: "one-pager.pdf", type: "application/pdf", size: 6 }],
        },
      ],
      lines: [{ id: expect.any(String), from: scout.id, to: writer.id, picked: null }],
      talk: [],
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
    db.close();

    const again = new NestStore(file);
    const plan = (key: string, keeps: string | null) => ({ key, mascotId: null, prompt: `Do ${key}`, from: null, each: false, waits: false, table: null, x: 0, y: 0, attached: [], keeps });
    const [, kept] = again.setPlan(nest, [plan("p1", scout.id), plan("p2", writer.id)], "Find companies")!;
    expect(again.card(kept)!.attachments.map((each) => each.name)).toEqual(["one-pager.pdf"]);
    expect(again.board(nest)!.attached.map((each) => each.name)).toEqual(["one-pager.pdf"]);
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

    expect(store.sourceOf(next.id)?.id).toBe(source.id);
    expect(store.sourceOf(source.id)).toBeNull();
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

  it("keeps the rows picked for a line as they were", () => {
    const store = new NestStore(":memory:");
    const nest = store.createNest("Nest");
    const source = store.addCard(nest, { x: 0, y: 0 })!;
    const picked = { header: ["Company"], rows: [["Fjällbo"], ["Brygga"]] };
    const next = store.addCard(nest, { x: 0, y: 0, from: source.id, picked })!;

    expect(store.lineTo(next.id)).toEqual({ source: expect.objectContaining({ id: source.id }), picked });
    expect(store.board(nest)?.lines[0].picked).toEqual(picked);
  });

  it("makes a draft a For-each card once, with a waiting run for each row, and starts each run only once", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-nests-")), "nests.db");
    const store = new NestStore(file);
    const nest = store.createNest("Nest");
    const card = store.addCard(nest, { x: 0, y: 0 })!;

    expect(store.startForEach(card.id, "Write to each", ["Company"], [["Fjällbo"], ["Brygga"]])).toBe(true);
    expect(store.startForEach(card.id, "Again", ["Company"], [["Kvarnsten"]])).toBe(false);
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
      runs: [
        { id: first.id, row: ["Fjällbo"], chatId: "run-chat-1", state: "started" },
        { id: second.id, row: ["Brygga"], chatId: null, state: "stopped" },
      ],
    });
    expect(store.runOfChat("run-chat-1")?.cardId).toBe(card.id);
    expect(store.startedRunChats()).toEqual(["run-chat-1"]);
    expect(store.chatIds(nest)).toEqual(["run-chat-1"]);

    expect(store.deleteCard(card.id)).toBe(true);
    expect(store.run(first.id)).toBeNull();
    expect(store.chatIds()).toEqual([]);
  });
});
