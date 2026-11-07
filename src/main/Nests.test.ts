import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import { NestStore } from "./NestStore";
import { Nests } from "./Nests";
import type { ReplyMessage, StreamReply } from "./agent";
import type { MascotProfile } from "../shared/library";
import { BERRY } from "../shared/mascots";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

const SCOUT: MascotProfile = { ...BERRY, id: "scout", name: "Scout", deletedAt: null };
const GONE: MascotProfile = { ...BERRY, id: "gone", name: "Gone", deletedAt: 1 };

let sent: ReplyMessage[][];
let replies: string[];
// While set, each reply waits until it's let go, so a test can see how many are going at once.
let held: (() => void)[] | null;

// Each reply is the next of `replies`, and what the model got is kept in `sent`.
const model: StreamReply = async function* (messages, signal) {
  sent.push(messages);
  if (held) {
    const waiting = held;
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
      signal?.addEventListener("abort", () => resolve());
    });
  }
  yield replies.shift() ?? "ok";
};

const setup = () => {
  const chatStore = new ChatStore(":memory:");
  const store = new NestStore(":memory:");
  let ended = () => {};
  const flock = [BERRY, SCOUT, GONE];
  const chats = new Chats(chatStore, model, async () => null, {
    activeTab: () => null,
    allTabs: () => [],
    openBackgroundTab: () => {
      throw new Error("No tabs here");
    },
    closeTab: () => true,
    actionApproval: () => "risky",
  }, {
    onChunk: () => {},
    onThread: (thread) => {
      if (thread.partial === null) ended();
    },
    onListChanged: () => {},
    onWorkingTabs: () => {},
  }, (id) => flock.find((mascot) => mascot.id === (id ?? BERRY.id)) ?? { ...BERRY, id: id ?? "", name: "A lost mascot" });
  const deleted: string[] = [];
  const nests = new Nests(store, chats, { resolve: (id) => flock.find((mascot) => mascot.id === (id ?? BERRY.id))!, all: () => flock }, {
    onBoard: () => {},
    onListChanged: () => {},
    chatDeleted: (chatId) => deleted.push(chatId),
  });
  // Resolves once the reply that's running has been saved.
  const replyEnded = () => new Promise<void>((resolve) => (ended = resolve));
  const sendAndWait = async (cardId: string, text: string) => {
    const done = replyEnded();
    expect(nests.send(cardId, text)).not.toBeNull();
    await done;
  };
  return { nests, store, chats, chatStore, deleted, sendAndWait };
};

const newest = (messages: ReplyMessage[]) => messages.at(-1)?.content as string;

beforeEach(() => {
  sent = [];
  replies = [];
  held = null;
});

const TABLE = (rows: number) =>
  ["Found these.", "", "| Company | People |", "|---|---|", ...Array.from({ length: rows }, (_, index) => `| Company ${index + 1} | ${index + 10} |`)].join("\n");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// Lets every held reply go, and waits until each has been saved.
const release = async () => {
  const waiting = held!.splice(0);
  waiting.forEach((resolve) => resolve());
  for (let tries = 0; tries < 5; tries++) await settle();
};

describe("Nests", () => {
  it("gives a card the latest answer of the card it was pulled out of, read fresh each time, and never saves it", async () => {
    const { nests, chatStore, sendAndWait } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0, mascotId: "scout" })!;
    replies.push("Lindqvist Data and Fjällbo");
    await sendAndWait(scout.id, "Find two companies");

    const writer = nests.addCard(nest, { x: 500, y: 0, from: scout.id })!;
    replies.push("Two drafts");
    await sendAndWait(writer.id, "Write to each");

    expect(newest(sent[1])).toMatch(/^<card_answer from="Scout">\nLindqvist Data and Fjällbo\n<\/card_answer>\n/);
    expect(newest(sent[1])).toContain("untrusted");
    expect(newest(sent[1]).endsWith("Write to each")).toBe(true);
    const writerChat = nests.board(nest)!.cards.find(({ id }) => id === writer.id)!.chatId!;
    expect(chatStore.chat(writerChat)?.messages[0]).toEqual({ role: "user", content: "Write to each" });

    // Scout's answer changes, and the next message on the writer's card gets the new one, on that message only.
    replies.push("Brygga");
    await sendAndWait(scout.id, "One more");
    await sendAndWait(writer.id, "And this one");
    expect(newest(sent[3])).toContain("<card_answer from=\"Scout\">\nBrygga\n</card_answer>");
    expect(sent[3].map(({ content }) => content).filter((content) => String(content).includes("<card_answer"))).toHaveLength(1);
  });

  it("gives a card with no line, or whose source hasn't answered, nothing but what was typed", async () => {
    const { nests, sendAndWait } = setup();
    const nest = nests.create();
    const alone = nests.addCard(nest, { x: 0, y: 0 })!;
    await sendAndWait(alone.id, "Just this");

    expect(newest(sent[0])).toBe("Just this");
    expect(nests.inputFor(alone.id)).toEqual({ answer: null });
  });

  it("only pulls a line out of a card that has been sent", () => {
    const { nests } = setup();
    const nest = nests.create();
    const draft = nests.addCard(nest, { x: 0, y: 0 })!;

    expect(nests.addCard(nest, { x: 0, y: 0, from: draft.id })).toBeNull();
  });

  it("starts a card as a bird in the flock, and refuses a deleted or unknown one rather than making it Berry", () => {
    const { nests } = setup();
    const nest = nests.create();
    const card = nests.addCard(nest, { x: 0, y: 0, mascotId: "scout" })!;

    expect(card.mascotId).toBe("scout");
    expect(nests.addCard(nest, { x: 0, y: 0 })?.mascotId).toBeNull();
    expect(nests.addCard(nest, { x: 0, y: 0, mascotId: "gone" })).toBeNull();
    expect(nests.addCard(nest, { x: 0, y: 0, mascotId: "not-in-the-flock" })).toBeNull();
    expect(nests.setBird(card.id, "gone")).toBe(false);
    expect(nests.card(card.id)?.mascotId).toBe("scout");
    expect(nests.addCard(nest, { x: Number.NaN, y: 0 })).toBeNull();
  });

  it("deletes a card's chat with the card, and every card's chat with the nest", async () => {
    const { nests, chatStore, deleted, sendAndWait } = setup();
    const nest = nests.create();
    const one = nests.addCard(nest, { x: 0, y: 0 })!;
    const two = nests.addCard(nest, { x: 0, y: 0 })!;
    await sendAndWait(one.id, "First");
    await sendAndWait(two.id, "Second");
    const [chatOne, chatTwo] = nests.list()[0].chatIds;

    expect(nests.cardChats()).toEqual(new Set([chatOne, chatTwo]));
    expect(nests.deleteCard(one.id)).toBe(true);
    expect(chatStore.chat(chatOne)).toBeNull();
    expect(nests.delete(nest)).toBe(true);
    expect(chatStore.chat(chatTwo)).toBeNull();
    expect(deleted).toEqual([chatOne, chatTwo]);
    expect(nests.list()).toEqual([]);
  });

  it("sends only the rows the user picked, and refuses them once they're gone from the source's answer", async () => {
    const { nests, sendAndWait } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0, mascotId: "scout" })!;
    replies.push(TABLE(3));
    await sendAndWait(scout.id, "Find companies");

    // Rows that aren't in the answer can't be picked at all.
    expect(nests.addCard(nest, { x: 0, y: 0, from: scout.id, picked: { header: ["Company", "People"], rows: [["Made up", "1"]] } })).toBeNull();
    const picked = { header: ["Company", "People"], rows: [["Company 1", "10"], ["Company 3", "12"]] };
    const writer = nests.addCard(nest, { x: 500, y: 0, from: scout.id, picked })!;
    await sendAndWait(writer.id, "Write to these");

    const message = newest(sent[1]);
    expect(message).toContain("| Company 1 | 10 |\n| Company 3 | 12 |\n</card_answer>");
    expect(message).not.toContain("Company 2");
    expect(message).not.toContain("Found these.");
    expect(message).toContain("the rows the user picked");

    // Scout answers again without Company 3, so the writer's card won't send rows that aren't there any more.
    replies.push(TABLE(2));
    await sendAndWait(scout.id, "Again");
    expect(nests.inputFor(writer.id)).toEqual({ problem: expect.stringContaining("aren’t in that card’s latest answer") });
    expect(nests.send(writer.id, "Once more")).toBeNull();
    expect(sent).toHaveLength(3);
  });

  it("runs For each row once per row, three at a time, each with only its own row, and the rest wait their turn", async () => {
    const { nests, chats, store } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0, mascotId: "scout" })!;
    replies.push(TABLE(5));
    const first = nests.send(scout.id, "Find companies")!;
    await settle();
    const writer = nests.addCard(nest, { x: 500, y: 0, from: scout.id })!;

    held = [];
    replies.length = 0;
    expect(nests.sendEach(writer.id, "Write to the company")).toEqual({ ok: true });
    await settle();

    const runs = () => nests.card(writer.id)!.each!.runs;
    expect(runs().map(({ state }) => state)).toEqual(["started", "started", "started", "waiting", "waiting"]);
    expect(sent).toHaveLength(4);
    sent.slice(1).forEach((messages, index) => {
      expect(newest(messages)).toContain(`| Company ${index + 1} | ${index + 10} |\n</card_answer>`);
      expect(newest(messages).match(/\| Company \d+ \|/g)).toHaveLength(1);
      expect(newest(messages)).toContain("work on this row only");
      expect(newest(messages).endsWith("Write to the company")).toBe(true);
    });
    // Each run is its own chat, as the card's bird, and its saved message is only the prompt.
    const chatIds = runs().flatMap(({ chatId }) => (chatId ? [chatId] : []));
    expect(new Set(chatIds).size).toBe(3);
    chatIds.forEach((chatId) => expect(chats.thread(chatId)).toMatchObject({ mascotId: null, messages: [{ role: "user", content: "Write to the company" }] }));
    expect(chats.thread(first.id)?.messages).toHaveLength(2);

    await release();
    expect(runs().map(({ state }) => state)).toEqual(["started", "started", "started", "started", "started"]);
    expect(sent).toHaveLength(6);
    expect(store.startedRunChats().filter((chatId) => chats.isRunning(chatId))).toHaveLength(2);
    await release();
    expect(nests.list()[0].working).toEqual([]);
  });

  it("refuses For each row past the cap of 25, and with no table to run on", async () => {
    const { nests, sendAndWait } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0 })!;
    replies.push(TABLE(26));
    await sendAndWait(scout.id, "Find companies");
    const tooMany = nests.addCard(nest, { x: 500, y: 0, from: scout.id })!;

    expect(nests.sendEach(tooMany.id, "Write")).toEqual({ ok: false, error: expect.stringContaining("at most 25") });
    expect(nests.card(tooMany.id)?.each).toBeNull();
    expect(sent).toHaveLength(1);

    const alone = nests.addCard(nest, { x: 0, y: 500 })!;
    expect(nests.sendEach(alone.id, "Write")).toEqual({ ok: false, error: expect.stringContaining("needs a line") });

    // At the cap exactly, it starts.
    replies.push(TABLE(25));
    await sendAndWait(scout.id, "Fewer");
    expect(nests.sendEach(tooMany.id, "Write")).toEqual({ ok: true });
    expect(nests.card(tooMany.id)?.each?.runs).toHaveLength(25);
    nests.stopCard(tooMany.id);
    for (let tries = 0; tries < 10; tries++) await settle();
  });

  it("stops every run on a card with Stop, so none of the waiting ones start, and deleting it deletes every run's chat", async () => {
    const { nests, chats, chatStore, sendAndWait } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0 })!;
    replies.push(TABLE(5));
    await sendAndWait(scout.id, "Find companies");
    const writer = nests.addCard(nest, { x: 500, y: 0, from: scout.id })!;
    held = [];
    nests.sendEach(writer.id, "Write");
    await settle();

    expect(nests.stopCard(writer.id)).toBe(true);
    for (let tries = 0; tries < 5; tries++) await settle();
    const runs = nests.card(writer.id)!.each!.runs;
    expect(runs.map(({ state }) => state)).toEqual(["started", "started", "started", "stopped", "stopped"]);
    expect(runs.filter(({ chatId }) => chatId && chats.isRunning(chatId))).toHaveLength(0);
    expect(sent).toHaveLength(4);

    const chatIds = runs.flatMap(({ chatId }) => (chatId ? [chatId] : []));
    expect(nests.deleteCard(writer.id)).toBe(true);
    chatIds.forEach((chatId) => expect(chatStore.chat(chatId)).toBeNull());
  });

  it("gives a card pulled out of a For-each card every run's answer, each labelled with its row", async () => {
    const { nests, sendAndWait } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0 })!;
    replies.push(TABLE(2));
    await sendAndWait(scout.id, "Find companies");
    const writer = nests.addCard(nest, { x: 500, y: 0, from: scout.id })!;
    replies.push("Hej one", "Hej two");
    nests.sendEach(writer.id, "Write");
    for (let tries = 0; tries < 10; tries++) await settle();

    const reader = nests.addCard(nest, { x: 1000, y: 0, from: writer.id })!;
    await sendAndWait(reader.id, "Which is best?");
    const message = newest(sent.at(-1)!);
    expect(message).toContain('<row_answer row="Company 1">\nHej one\n</row_answer>');
    expect(message).toContain('<row_answer row="Company 2">\nHej two\n</row_answer>');
    expect(message).toContain("each labelled with its row");
  });

  it("doesn't start runs left waiting when the app last closed", () => {
    const store = new NestStore(":memory:");
    const nest = store.createNest("Nest");
    const card = store.addCard(nest, { x: 0, y: 0 })!;
    store.startForEach(card.id, "Write", ["Company"], [["One"]]);

    new Nests(store, { send: vi.fn(), delete: vi.fn(), thread: vi.fn(), isRunning: vi.fn(), stop: vi.fn() } as never, { resolve: () => BERRY, all: () => [BERRY] }, {
      onBoard: () => {},
      onListChanged: () => {},
      chatDeleted: () => {},
    }).pump();

    expect(store.card(card.id)?.each?.runs[0].state).toBe("stopped");
  });
});
