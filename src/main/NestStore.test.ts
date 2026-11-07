import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
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

    expect(new NestStore(file).board(nest)).toEqual({
      id: nest,
      title: "Find customers",
      cards: [
        { id: scout.id, chatId: "chat-1", mascotId: "scout", x: 10, y: 20, each: null },
        { id: writer.id, chatId: null, mascotId: null, x: 420.5, y: 32, each: null },
      ],
      lines: [{ id: expect.any(String), from: scout.id, to: writer.id, picked: null }],
    });
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
