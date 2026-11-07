import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import { NestStore } from "./NestStore";
import { NEW_NEST_TITLE, Nests, type NestNamer, type NestPlanner } from "./Nests";
import type { ReplyMessage, StreamReply } from "./agent";
import type { PageTool } from "./browserTools";
import type { MascotProfile, NestBoard } from "../shared/library";
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

// The tools the newest reply was given, which decide what asks first.
let tools: PageTool[];

// Each reply is the next of `replies`, and what the model got is kept in `sent`.
const model: StreamReply = async function* (messages, signal, options) {
  sent.push(messages);
  tools = options.tools;
  if (held) {
    const waiting = held;
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
      signal?.addEventListener("abort", () => resolve());
    });
  }
  yield replies.shift() ?? "ok";
};

// What the planner answers next, and what it was asked.
let plans: unknown[];
let planned: { system: string; messages: { role: string; content: string }[] }[];
const planner: NestPlanner = {
  available: () => true,
  plan: async (system, messages) => {
    planned.push({ system, messages });
    return plans.shift();
  },
};

const setup = (namer?: NestNamer) => {
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
  // Each hand-off along a line, as "from>to".
  const handOffs: string[] = [];
  // Each board sent to the page.
  const boards: NestBoard[] = [];
  const nests = new Nests(store, chats, { resolve: (id) => flock.find((mascot) => mascot.id === (id ?? BERRY.id))!, all: () => flock }, {
    onBoard: (board) => boards.push(board),
    onListChanged: () => {},
    chatDeleted: (chatId) => deleted.push(chatId),
    handOff: (_, from, to) => handOffs.push(`${from}>${to}`),
  }, planner, namer);
  // Resolves once the reply that's running has been saved.
  const replyEnded = () => new Promise<void>((resolve) => (ended = resolve));
  const sendAndWait = async (cardId: string, text: string) => {
    const done = replyEnded();
    expect(nests.send(cardId, text)).not.toBeNull();
    await done;
  };
  return { nests, store, chats, chatStore, deleted, sendAndWait, handOffs, replyEnded, boards };
};

const newest = (messages: ReplyMessage[]) => messages.at(-1)?.content as string;

beforeEach(() => {
  plans = [];
  planned = [];
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

  it("gives a reply's place back when it ends, so a run waiting for it starts", async () => {
    const { nests, sendAndWait } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0 })!;
    replies.push(TABLE(3));
    await sendAndWait(scout.id, "Find companies");
    const one = nests.addCard(nest, { x: 500, y: 0, from: scout.id })!;
    nests.sendEach(one.id, "Write");
    for (let tries = 0; tries < 10; tries++) await settle();

    // A reply in a finished run holds a place, so the next card's third run waits for it.
    held = [];
    const [firstRun] = nests.card(one.id)!.each!.runs;
    expect(nests.sendRun(firstRun.id, "Shorter")).not.toBeNull();
    const two = nests.addCard(nest, { x: 1000, y: 0, from: scout.id })!;
    nests.sendEach(two.id, "Call");
    await settle();
    expect(nests.card(two.id)!.each!.runs.map(({ state }) => state)).toEqual(["started", "started", "waiting"]);

    held.shift()!();
    for (let tries = 0; tries < 5; tries++) await settle();
    expect(nests.card(two.id)!.each!.runs.map(({ state }) => state)).toEqual(["started", "started", "started"]);
    await release();
    await release();
  });

  it("starts nothing waiting once the window is closing and every chat stops", async () => {
    const { nests, chats, sendAndWait } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0 })!;
    replies.push(TABLE(5));
    await sendAndWait(scout.id, "Find companies");
    const writer = nests.addCard(nest, { x: 500, y: 0, from: scout.id })!;
    held = [];
    nests.sendEach(writer.id, "Write");
    await settle();

    nests.close();
    chats.stopAll();
    for (let tries = 0; tries < 5; tries++) await settle();
    expect(nests.card(writer.id)!.each!.runs.map(({ state }) => state)).toEqual(["started", "started", "started", "waiting", "waiting"]);
    expect(sent).toHaveLength(4);
  });
});

const PLACE = { at: { x: 0, y: 0 }, taken: [] };
const planCard = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  bird: BERRY.id,
  prompt: `Do ${key}`,
  from: null,
  for_each_row: false,
  waits_for_user: false,
  table_of: null,
  ...extra,
});
const TWO_JOBS = {
  reply: "That's two jobs, so I've laid them out above.",
  ask: false,
  cards: [planCard("c1", { bird: "scout", prompt: "Find companies", table_of: "companies" }), planCard("c2", { prompt: "Write to each", from: "c1", for_each_row: true })],
};

describe("Berry planning in a Nest", () => {
  const plannedCards = (nests: Nests, nest: string) => nests.board(nest)!.cards.filter((card) => card.plan);

  it("starts one job at once as one card with the user's own words, and plans nothing", async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push({ reply: "On it.", ask: false, cards: [planCard("c1", { prompt: "Find Swedish SaaS companies, rewritten" })] });
    expect(await nests.ask(nest, "Find Swedish SaaS companies", PLACE)).toEqual({ ok: true });
    await settle();
    const [card] = nests.board(nest)!.cards;
    expect(card.chatId).not.toBeNull();
    expect(card.plan).toBeNull();
    expect(newest(sent[0])).toBe("Find Swedish SaaS companies");
    expect(nests.board(nest)!.talk).toEqual([]);
  });

  it("lays out several jobs as planned cards that run nothing, with the request and Berry's answer kept", async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push(TWO_JOBS);
    await nests.ask(nest, "Find companies and write to each", PLACE);
    const [scout, writer] = plannedCards(nests, nest);
    expect(scout.plan).toMatchObject({ state: "planned", prompt: "Find companies", table: "companies", each: false });
    expect(scout.mascotId).toBe("scout");
    expect(writer.plan).toMatchObject({ state: "planned", prompt: "Write to each", each: true });
    expect(nests.board(nest)!.lines).toMatchObject([{ from: scout.id, to: writer.id }]);
    expect(writer.x).toBeGreaterThan(scout.x);
    expect(nests.board(nest)!.talk).toEqual([
      {
        id: expect.any(String),
        open: true,
        messages: [
          { role: "user", text: "Find companies and write to each" },
          { role: "berry", text: "That's two jobs, so I've laid them out above." },
        ],
      },
    ]);
    expect(nests.list()[0].planned).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("still says Berry is planning on the board it sends after a card was nudged out of the way", async () => {
    const { nests, store, boards } = setup();
    const nest = nests.create();
    const card = store.addCard(nest, { x: 0, y: 300, auto: true })!;
    let release = () => {};
    plans.push(new Promise((resolve) => (release = () => resolve(TWO_JOBS))));
    const asking = nests.ask(nest, "Find companies and write to each", PLACE);
    await vi.waitFor(() => expect(nests.board(nest)!.planning).toBeTruthy());
    expect(nests.nudgeCards(nest, [{ id: card.id, x: 0, y: 600 }])).toBe(true);
    expect(boards.at(-1)).toMatchObject({ planning: "Find companies and write to each", cards: [expect.objectContaining({ id: card.id, y: 600 })] });
    release();
    await asking;
  });

  it("refuses an invalid plan and runs nothing, never putting Berry in for a bird that isn't there", async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push({ ...TWO_JOBS, cards: [planCard("c1", { bird: "gone" })] });
    await nests.ask(nest, "Find companies", PLACE);
    expect(nests.board(nest)!.cards).toEqual([]);
    expect(nests.board(nest)!.talk[0].messages[1].text).toBe(
      "I couldn’t lay that out as cards, because it named a bird that isn’t in your flock. Try asking another way."
    );
    expect(sent).toHaveLength(0);
  });

  it("asks first, then plans with the answer, and a message while a plan waits changes it", async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push({ reply: "Which market?", ask: true, cards: [] });
    await nests.ask(nest, "Find leads", PLACE);
    expect(nests.board(nest)!.cards).toEqual([]);

    // After a question, even one job is a plan, since its words are Berry's.
    plans.push({ reply: "One job.", ask: false, cards: [planCard("c1", { prompt: "Find leads in Sweden" })] });
    await nests.ask(nest, "Sweden", PLACE);
    expect(planned[1].messages.map(({ role }) => role)).toEqual(["user", "assistant", "user"]);
    expect(planned[1].messages[0].content).toContain("<request>\nFind leads\n</request>");
    expect(plannedCards(nests, nest).map((card) => card.plan!.prompt)).toEqual(["Find leads in Sweden"]);

    plans.push(TWO_JOBS);
    await nests.ask(nest, "And write to each", PLACE);
    expect(planned[2].messages[0].content).toContain('<planned key="p1"');
    expect(plannedCards(nests, nest).map((card) => card.plan!.prompt)).toEqual(["Find companies", "Write to each"]);
    expect(sent).toHaveLength(0);
  });

  it("won't change a planned card's prompt, bird or For each row, or pull another out, while Berry changes the plan, so nothing done then is lost", async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push(TWO_JOBS);
    await nests.ask(nest, "Find companies and write to each", PLACE);
    const [scout, writer] = plannedCards(nests, nest);
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], key: "p1" }, { ...TWO_JOBS.cards[1], key: "p2", from: "p1", prompt: "Write a shorter email to each" }] });
    const changing = nests.ask(nest, "Make the emails shorter", PLACE);
    expect(nests.editPlanned(scout.id, { prompt: "Find companies in Oslo" })).toBe(false);
    expect(nests.editPlanned(writer.id, { each: false })).toBe(false);
    expect(nests.setBird(scout.id, BERRY.id)).toBe(false);
    expect(nests.addCard(nest, { x: 0, y: 600, from: writer.id })).toBeNull();
    await changing;
    const [first, second] = plannedCards(nests, nest);
    expect(first.plan!.prompt).toBe("Find companies");
    expect(first.mascotId).toBe("scout");
    expect(second.plan!.each).toBe(true);
    expect(nests.editPlanned(first.id, { prompt: "Find companies in Oslo" })).toBe(true);
  });

  it("gives the planner the cards on the board with only the start of their answers, labelled untrusted", async () => {
    const { nests, sendAndWait } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0, mascotId: "scout" })!;
    replies.push(TABLE(8));
    await sendAndWait(scout.id, "Find companies");
    plans.push({ reply: "One more card.", ask: false, cards: [planCard("c1", { from: "e1", for_each_row: true })] });
    await nests.ask(nest, "Now find each lead's latest post", PLACE);

    const request = planned[0].messages[0].content;
    expect(request).toContain('<card key="e1" bird="Scout" status="Done">');
    expect(request).toContain("Company 3");
    expect(request).not.toContain("Company 4");
    expect(request).toContain("untrusted");
    // Reading from a card on the board, it waits for Run rather than starting.
    const [card] = plannedCards(nests, nest);
    expect(nests.board(nest)!.lines).toMatchObject([{ from: scout.id, to: card.id }]);
    expect(sent).toHaveLength(1);
  });

  it("starts each card once Run is pressed and the card it reads from has answered, with that fresh answer, once per row", async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push(TWO_JOBS);
    await nests.ask(nest, "Find companies and write to each", PLACE);
    const [scout, writer] = plannedCards(nests, nest);

    replies.push(TABLE(3));
    expect(nests.runPlan(nest)).toEqual({ ok: true });
    expect(nests.board(nest)!.talk[0].open).toBe(false);
    for (let tries = 0; tries < 10; tries++) await settle();

    expect(nests.card(scout.id)!.chatId).not.toBeNull();
    const runs = nests.card(writer.id)!.each!.runs;
    expect(runs).toHaveLength(3);
    expect(sent).toHaveLength(4);
    expect(newest(sent[1])).toContain("| Company 1 | 10 |");
    expect(newest(sent[1]).endsWith("Write to each")).toBe(true);
  });

  it("waits for the user when a card waits for them, and starts it only on Looks right, continue", async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push({ ...TWO_JOBS, cards: [planCard("c1", { prompt: "Find companies" }), planCard("c2", { prompt: "Draft emails", from: "c1", waits_for_user: true })] });
    await nests.ask(nest, "Find companies and draft emails", PLACE);
    const [scout, writer] = plannedCards(nests, nest);
    replies.push("Found three.");
    nests.runPlan(nest);
    for (let tries = 0; tries < 5; tries++) await settle();
    expect(nests.card(writer.id)!.plan!.state).toBe("armed");
    expect(sent).toHaveLength(1);

    expect(nests.continueFrom(scout.id)).toBe(true);
    await settle();
    expect(nests.card(writer.id)!.plan).toBeNull();
    expect(newest(sent[1])).toContain("Found three.");
  });

  it("doesn't start the cards after one that was stopped, and says why", async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push({ ...TWO_JOBS, cards: [planCard("c1"), planCard("c2", { from: "c1" }), planCard("c3", { from: "c2" })] });
    await nests.ask(nest, "Three steps", PLACE);
    const [first, second, third] = plannedCards(nests, nest);
    held = [];
    nests.runPlan(nest);
    await settle();
    nests.stopCard(first.id);
    for (let tries = 0; tries < 5; tries++) await settle();
    expect(nests.card(second.id)!.plan).toMatchObject({ state: "held", note: "Didn’t start, because Berry was stopped" });
    expect(nests.card(third.id)!.plan).toMatchObject({ state: "held", note: "Didn’t start, because Berry’s card didn’t start" });
    expect(sent).toHaveLength(1);
  });

  it("doesn't start a card whose source was deleted while it waited", async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push({ ...TWO_JOBS, cards: [planCard("c1"), planCard("c2", { from: "c1" }), planCard("c3", { from: "c2" })] });
    await nests.ask(nest, "Three steps", PLACE);
    const [first, second, third] = plannedCards(nests, nest);
    held = [];
    nests.runPlan(nest);
    await settle();
    nests.deleteCard(first.id);
    for (let tries = 0; tries < 5; tries++) await settle();
    expect(nests.card(second.id)!.plan).toMatchObject({ state: "held", note: "Didn’t start, because the card it reads from was deleted" });
    expect(nests.card(third.id)!.plan).toMatchObject({ state: "held", note: "Didn’t start, because Berry’s card didn’t start" });
    expect(sent).toHaveLength(1);
  });

  it("counts a site as the user's only when they typed it, not when only Berry's plan named it", async () => {
    const { nests } = setup();
    // Whether opening this address would ask first in the default mode, for the newest reply.
    const asks = (url: string) => tools.find((tool) => tool.name === "open_tab")!.isRisky!({ url });
    const plan = { ...TWO_JOBS, cards: [planCard("c1", { prompt: "Find companies on allabolag.se" }), planCard("c2", { from: "c1", waits_for_user: true })] };

    const theirs = nests.create();
    plans.push(plan);
    await nests.ask(theirs, "Find Swedish companies on allabolag.se and write to each", PLACE);
    nests.runPlan(theirs);
    for (let tries = 0; tries < 5; tries++) await settle();
    expect(await asks("https://allabolag.se/")).toBe(false);

    const berrys = nests.create();
    plans.push(plan);
    await nests.ask(berrys, "Find Swedish companies and write to each", PLACE);
    nests.runPlan(berrys);
    for (let tries = 0; tries < 5; tries++) await settle();
    expect(await asks("https://allabolag.se/")).toBe(true);

    // What they type on the card afterwards is theirs, and Berry's prompt still isn't.
    const [card] = nests.board(berrys)!.cards;
    const ended = new Promise((resolve) => setTimeout(resolve, 20));
    nests.send(card.id, "Also look at ratsit.se");
    await ended;
    expect(await asks("https://ratsit.se/")).toBe(false);
    expect(await asks("https://allabolag.se/")).toBe(true);
  });

  it("won't run a planned card with nothing to do, and doesn't start a run plan's cards after a restart", async () => {
    const { nests, store } = setup();
    const nest = nests.create();
    const lone = store.addCard(nest, { x: 0, y: 0, planned: true })!;
    expect(nests.runPlan(nest)).toEqual({ ok: false, error: "Write what Berry should do first, or delete that card." });
    expect(nests.editPlanned(lone.id, { prompt: "Find companies" })).toBe(true);
    const after = store.addCard(nest, { x: 500, y: 0, from: lone.id, planned: true })!;
    store.editPlanned(after.id, { prompt: "Write" });
    store.armPlan(nest);

    new Nests(store, { send: vi.fn(), delete: vi.fn(), thread: vi.fn(), isRunning: vi.fn(), stop: vi.fn() } as never, { resolve: () => BERRY, all: () => [BERRY] }, {
      onBoard: () => {},
      onListChanged: () => {},
      chatDeleted: () => {},
    });
    expect(store.card(lone.id)!.plan).toMatchObject({ state: "held", note: "Didn’t start, because Blueberry closed before it could" });
    expect(store.card(after.id)!.plan!.state).toBe("held");
  });

  it("discards a plan that hasn't run, and folds the request away", async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push(TWO_JOBS);
    await nests.ask(nest, "Find companies and write to each", PLACE);
    expect(nests.discardPlan(nest)).toBe(true);
    expect(nests.board(nest)!.cards).toEqual([]);
    expect(nests.board(nest)!.talk[0].open).toBe(false);
  });
});

describe("Files and notes on a card", () => {
  const READS_ALL = { model: "gpt-test", pdf: true, image: true };
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF\n", "latin1");
  // The newest message's blocks, as the model got them.
  const blocksOf = (messages: ReplyMessage[]) => messages.at(-1)!.content as Exclude<ReplyMessage["content"], string>;
  const textOf = (messages: ReplyMessage[]) =>
    blocksOf(messages)
      .map((block) => (block.type === "text" ? block.text : `[${block.type}]`))
      .join("\n");

  it("sends a card's files and notes with every message, before what was typed, and never saves them in its chat", async () => {
    const { nests, chats, sendAndWait } = setup();
    const nest = nests.create();
    const card = nests.addCard(nest, { x: 0, y: 0 })!;
    expect(nests.attachFile({ cardId: card.id }, "one-pager.pdf", PDF, READS_ALL)).toEqual({ ok: true });
    expect(nests.addNote({ cardId: card.id }, "  Keep it short  ")).toEqual({ ok: true });
    expect(nests.card(card.id)!.attachments).toMatchObject([
      { kind: "file", name: "one-pager.pdf", type: "application/pdf", size: PDF.length },
      { kind: "note", text: "Keep it short" },
    ]);
    // The renderer never gets a file's contents.
    expect(JSON.stringify(nests.board(nest))).not.toContain(PDF.toString("base64"));

    await sendAndWait(card.id, "Draft an email from this");
    const blocks = blocksOf(sent[0]);
    expect(blocks.map((block) => block.type)).toEqual(["text", "file", "text", "text"]);
    expect(blocks[1]).toMatchObject({ source_type: "base64", mime_type: "application/pdf", data: PDF.toString("base64"), metadata: { filename: "one-pager.pdf" } });
    expect(textOf(sent[0])).toContain('The user attached the PDF "one-pager.pdf" to this card.');
    expect(textOf(sent[0])).toContain("<user_note>\nKeep it short\n</user_note>");
    expect(textOf(sent[0]).endsWith("Draft an email from this")).toBe(true);

    // A reply on the card sends them again. The chat keeps only the words.
    await sendAndWait(card.id, "Shorter");
    expect(blocksOf(sent[1])[1]).toMatchObject({ type: "file" });
    expect(chats.thread(nests.card(card.id)!.chatId!)!.messages.filter((message) => message.role === "user").map((message) => message.content)).toEqual([
      "Draft an email from this",
      "Shorter",
    ]);
  });

  it("counts a site named in a note as the user's, and never one named in a file", async () => {
    const { nests, sendAndWait } = setup();
    const asks = (url: string) => tools.find((tool) => tool.name === "open_tab")!.isRisky!({ url });
    const nest = nests.create();

    const withFile = nests.addCard(nest, { x: 0, y: 0 })!;
    nests.attachFile({ cardId: withFile.id }, "leads.txt", Buffer.from("Our leads are all on ratsit.se"), READS_ALL);
    await sendAndWait(withFile.id, "Find the leads");
    expect(textOf(sent[0])).toContain("Our leads are all on ratsit.se");
    expect(await asks("https://ratsit.se/")).toBe(true);

    const withNote = nests.addCard(nest, { x: 500, y: 0 })!;
    nests.addNote({ cardId: withNote.id }, "Our leads are all on ratsit.se");
    await sendAndWait(withNote.id, "Find the leads");
    expect(await asks("https://ratsit.se/")).toBe(false);
  });

  it("only changes them before the card is sent, and keeps to five on a card", async () => {
    const { nests, sendAndWait } = setup();
    const nest = nests.create();
    const card = nests.addCard(nest, { x: 0, y: 0 })!;
    for (let count = 1; count <= 5; count++) expect(nests.addNote({ cardId: card.id }, `Note ${count}`)).toEqual({ ok: true });
    expect(nests.addNote({ cardId: card.id }, "Note 6")).toEqual({ ok: false, error: "A card can have 5 files and notes at most." });
    expect(nests.attachFile({ cardId: card.id }, "one-pager.pdf", PDF, READS_ALL)).toEqual({ ok: false, error: "A card can have 5 files and notes at most." });
    expect(nests.attachFile({ cardId: card.id }, "brief.docx", Buffer.from("PK"), READS_ALL)).toEqual({
      ok: false,
      error: "brief.docx is a Word file, which can’t be added yet. Save it as a PDF and add that.",
    });
    expect(nests.addNote({ cardId: card.id }, "   ")).toEqual({ ok: false, error: "Write the note first." });

    const [first, second] = nests.card(card.id)!.attachments;
    expect(nests.editNote(first.id, "Changed")).toBe(true);
    expect(nests.removeAttachment(second.id)).toBe(true);
    expect(nests.card(card.id)!.attachments.map((each) => each.text)).toEqual(["Changed", "Note 3", "Note 4", "Note 5"]);

    await sendAndWait(card.id, "Go");
    expect(nests.addNote({ cardId: card.id }, "Late")).toEqual({ ok: false, error: "Notes can only be added before a card is sent." });
    expect(nests.attachFile({ cardId: card.id }, "one-pager.pdf", PDF, READS_ALL)).toMatchObject({ ok: false });
    expect(nests.editNote(first.id, "Again")).toBe(false);
    expect(nests.removeAttachment(first.id)).toBe(false);
    expect(nests.card(card.id)!.attachments).toHaveLength(4);
  });

  it("doesn't pass files along a line, and gives every run of For each row the card's own", async () => {
    const { nests, sendAndWait } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0 })!;
    nests.attachFile({ cardId: scout.id }, "scouts-only.pdf", PDF, READS_ALL);
    replies.push(TABLE(2));
    await sendAndWait(scout.id, "Find companies");
    const writer = nests.addCard(nest, { x: 500, y: 0, from: scout.id })!;
    nests.addNote({ cardId: writer.id }, "Sign as Åsa");
    expect(nests.sendEach(writer.id, "Write to the company")).toEqual({ ok: true });
    for (let tries = 0; tries < 5; tries++) await settle();
    expect(sent).toHaveLength(3);
    for (const run of sent.slice(1)) {
      expect(textOf(run)).toContain("<user_note>\nSign as Åsa\n</user_note>");
      expect(textOf(run)).not.toContain("scouts-only.pdf");
      expect(blocksOf(run).some((block) => block.type === "file")).toBe(false);
    }
  });

  it("shows the planner only each file's name, type and size, and gives each planned card only the files the plan named", async () => {
    const { nests } = setup();
    const nest = nests.create();
    expect(nests.attachFile({ nestId: nest }, "one-pager.pdf", PDF, READS_ALL)).toEqual({ ok: true });
    expect(nests.addNote({ nestId: nest }, "Only B2B")).toEqual({ ok: true });
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], attached: ["a2"] }, { ...TWO_JOBS.cards[1], attached: ["a1", "a2"] }] });
    await nests.ask(nest, "Find companies and write to each", PLACE);

    const asked = planned[0].messages[0].content;
    expect(asked).toContain(`<file key="a1" name="one-pager.pdf" type="PDF" size="${PDF.length} B"/>`);
    expect(asked).toContain('<note key="a2">Only B2B</note>');
    expect(asked).not.toContain("/Type /Page");
    const [scout, writer] = nests.board(nest)!.cards;
    expect(scout.attachments.map((each) => each.kind)).toEqual(["note"]);
    expect(writer.attachments.map((each) => each.kind)).toEqual(["file", "note"]);
    // They stay on the composer while the request is open, and go once the plan runs, each card keeping its own copy.
    expect(nests.board(nest)!.attached).toHaveLength(2);
    nests.runPlan(nest);
    expect(nests.board(nest)!.attached).toEqual([]);
    expect(nests.card(writer.id)!.attachments).toHaveLength(2);
  });

  // Two planned cards, Scout's and Berry's, with a file added straight onto Berry's, the second.
  const planWithFileOnSecond = async () => {
    const { nests } = setup();
    const nest = nests.create();
    plans.push(TWO_JOBS);
    await nests.ask(nest, "Find companies and write to each", PLACE);
    const writer = nests.board(nest)!.cards[1];
    expect(nests.attachFile({ cardId: writer.id }, "one-pager.pdf", PDF, READS_ALL)).toEqual({ ok: true });
    return { nests, nest, writer };
  };
  const named = (attachments: { name: string }[]) => attachments.map((each) => each.name);

  it("keeps a file added on a planned card with that card when a new plan keeps its key, and never lets the plan give it to another", async () => {
    const { nests, nest, writer } = await planWithFileOnSecond();

    // The file is the card's, not the planner's: giving it out is giving out something that isn't attached.
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], attached: ["a1"] }, TWO_JOBS.cards[1]] });
    await nests.ask(nest, "Use the one-pager when finding companies", PLACE);
    expect(nests.board(nest)!.talk[0].messages.at(-1)!.text).toBe("I couldn’t lay that out as cards, because it gave a card a file you didn’t attach. Try asking another way.");
    expect(named(nests.card(writer.id)!.attachments)).toEqual(["one-pager.pdf"]);

    // Kept under its key, the card keeps its file. While Berry changes the plan, its cards wait.
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], key: "p1" }, { ...TWO_JOBS.cards[1], key: "p2", from: "p1", prompt: "Write a shorter email to each" }] });
    const changing = nests.ask(nest, "Make the emails shorter", PLACE);
    expect(nests.addNote({ cardId: writer.id }, "Too late")).toEqual({ ok: false, error: "Berry is still changing the plan. Try again in a moment." });
    await changing;
    expect(planned.at(-1)!.messages[0].content).toContain('own_attached="one-pager.pdf"');
    const cards = nests.board(nest)!.cards;
    expect(cards.map((card) => card.plan?.prompt)).toEqual(["Find companies", "Write a shorter email to each"]);
    expect(cards.map((card) => named(card.attachments))).toEqual([[], ["one-pager.pdf"]]);
    expect(nests.board(nest)!.attached).toEqual([]);
  });

  it("puts a file added on a planned card back on the composer when a new plan drops that card", async () => {
    const { nests, nest } = await planWithFileOnSecond();
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], key: "p1" }] });
    await nests.ask(nest, "Only find the companies", PLACE);
    const board = nests.board(nest)!;
    expect(board.cards.map((card) => named(card.attachments))).toEqual([[]]);
    expect(named(board.attached)).toEqual(["one-pager.pdf"]);
    // It's the user's again, to hand out on the next request.
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], key: "p1", attached: ["a1"] }] });
    await nests.ask(nest, "Use the one-pager for it", PLACE);
    expect(nests.board(nest)!.cards.map((card) => named(card.attachments))).toEqual([["one-pager.pdf"]]);
  });

  it("puts a planned card's own file back on the composer when the plan is discarded, and Run keeps a composer file no card got", async () => {
    const { nests, nest } = await planWithFileOnSecond();
    expect(nests.discardPlan(nest)).toBe(true);
    expect(named(nests.board(nest)!.attached)).toEqual(["one-pager.pdf"]);

    nests.addNote({ nestId: nest }, "Only B2B");
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], attached: ["a2"] }, TWO_JOBS.cards[1]] });
    await nests.ask(nest, "Find companies and write to each", PLACE);
    nests.runPlan(nest);
    // The note went to a card, so it's done with. The file went nowhere, so it stays where the user can see it.
    expect(named(nests.board(nest)!.attached)).toEqual(["one-pager.pdf"]);
  });

  it("only points planned cards at the composer's files and notes, so a changed plan, a removal on a card, an edit and Discard leave them where they are", async () => {
    const { nests, store } = setup();
    const nest = nests.create();
    nests.addNote({ nestId: nest }, "Only B2B");
    nests.attachFile({ nestId: nest }, "one-pager.pdf", PDF, READS_ALL);
    const [note, pdf] = nests.board(nest)!.attached;
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], attached: ["a1"] }, { ...TWO_JOBS.cards[1], attached: ["a1", "a2"] }] });
    await nests.ask(nest, "Find companies and write to each", PLACE);
    // One of each, on the composer, which both cards point at. Nothing was copied.
    const [scout, writer] = nests.board(nest)!.cards;
    expect(scout.attachments).toEqual([{ ...note, shared: true }]);
    expect(writer.attachments).toEqual([{ ...note, shared: true }, { ...pdf, shared: true }]);
    expect(store.attachmentRows({ cardId: scout.id })).toEqual([]);
    expect(nests.board(nest)!.attached).toEqual([note, pdf]);

    // Changed from a card, the note is the composer's, so every card pointing at it sees the change.
    expect(nests.editNote(note.id, "Only B2B, in Sweden")).toBe(true);
    expect(nests.board(nest)!.cards.map((card) => card.attachments[0].text)).toEqual(["Only B2B, in Sweden", "Only B2B, in Sweden"]);
    // Removed from one card, it only stops pointing there.
    expect(nests.removeAttachment(note.id, writer.id)).toBe(true);
    expect(nests.board(nest)!.cards.map((card) => card.attachments.map((each) => each.id))).toEqual([[note.id], [pdf.id]]);
    expect(nests.board(nest)!.attached.map((each) => each.id)).toEqual([note.id, pdf.id]);

    // A changed plan only points again.
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], key: "p1", attached: ["a2"] }, { ...TWO_JOBS.cards[1], key: "p2", from: "p1" }] });
    await nests.ask(nest, "Swap them", PLACE);
    expect(planned.at(-1)!.messages[0].content).toContain('<planned key="p2" bird="berry" from="p1" for_each_row="true" waits_for_user="false" table_of="" attached="a2"');
    expect(nests.board(nest)!.cards.map((card) => card.attachments.map((each) => each.id))).toEqual([[pdf.id], []]);
    expect(nests.board(nest)!.attached.map((each) => each.id)).toEqual([note.id, pdf.id]);

    // Discard only takes the pointers away.
    nests.discardPlan(nest);
    expect(nests.board(nest)!.attached).toEqual([{ ...note, text: "Only B2B, in Sweden", size: 19 }, pdf]);
  });

  it("gives a card at Run the composer's note as it is then, edited after planning", async () => {
    const { nests } = setup();
    const nest = nests.create();
    nests.addNote({ nestId: nest }, "Original");
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], attached: ["a1"] }, TWO_JOBS.cards[1]] });
    await nests.ask(nest, "Find companies and write to each", PLACE);
    const [note] = nests.board(nest)!.attached;
    expect(nests.editNote(note.id, "Revised")).toBe(true);
    held = [];
    expect(nests.runPlan(nest)).toEqual({ ok: true });
    const scout = nests.board(nest)!.cards[0];
    // Its own copy now, and a copy only goes with the press that made it: the composer had nothing else.
    expect(scout.attachments).toEqual([expect.objectContaining({ kind: "note", text: "Revised" })]);
    expect(scout.attachments[0].shared).toBeUndefined();
    expect(scout.attachments[0].id).not.toBe(note.id);
    expect(nests.board(nest)!.attached).toEqual([]);
    await settle();
    expect(textOf(sent[0])).toContain("<user_note>\nRevised\n</user_note>");
    await release();
  });

  it("won't start a card from the composer without a model while a plan that points at its files waits", async () => {
    const { nests, store, chats } = setup();
    const nest = nests.create();
    nests.attachFile({ nestId: nest }, "one-pager.pdf", PDF, READS_ALL);
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], attached: ["a1"] }, TWO_JOBS.cards[1]] });
    await nests.ask(nest, "Find companies and write to each", PLACE);

    // As after a launch with no model.
    const flock = [BERRY, SCOUT];
    const without = new Nests(store, chats, { resolve: (id) => flock.find((mascot) => mascot.id === (id ?? BERRY.id))!, all: () => flock }, {
      onBoard: () => {},
      onListChanged: () => {},
      chatDeleted: () => {},
    });
    expect(await without.ask(nest, "Just write one email", PLACE)).toEqual({ ok: false, error: "Run or discard the plan first, since Berry needs a model to change it." });
    expect(without.board(nest)!.cards.map((card) => card.attachments.length)).toEqual([1, 0]);
    expect(without.board(nest)!.attached.map((each) => each.name)).toEqual(["one-pager.pdf"]);
  });

  it("refuses a plan that gives a card a file the user didn't attach", async () => {
    const { nests } = setup();
    const nest = nests.create();
    nests.addNote({ nestId: nest }, "Only B2B");
    plans.push({ ...TWO_JOBS, cards: [{ ...TWO_JOBS.cards[0], attached: ["a1", "a2"] }, TWO_JOBS.cards[1]] });
    await nests.ask(nest, "Find companies and write to each", PLACE);
    expect(nests.board(nest)!.cards).toEqual([]);
    expect(nests.board(nest)!.talk[0].messages.at(-1)!.text).toBe("I couldn’t lay that out as cards, because it gave a card a file you didn’t attach. Try asking another way.");
  });

  it("gives one job everything on the composer", async () => {
    const { nests } = setup();
    const nest = nests.create();
    nests.attachFile({ nestId: nest }, "one-pager.pdf", PDF, READS_ALL);
    plans.push({ reply: "On it.", ask: false, cards: [planCard("c1")] });
    await nests.ask(nest, "Draft an email from this", PLACE);
    await settle();
    expect(nests.board(nest)!.cards[0].attachments.map((each) => each.name)).toEqual(["one-pager.pdf"]);
    expect(nests.board(nest)!.attached).toEqual([]);
    expect(blocksOf(sent[0])[1]).toMatchObject({ type: "file" });
  });
});

describe("A Nest's polish", () => {
  const plannedCards = (nests: Nests, nest: string) => nests.board(nest)!.cards.filter((card) => card.plan);
  const settleAll = async () => {
    for (let tries = 0; tries < 10; tries++) await settle();
  };

  it("says a card was handed work along its line only when it starts from its source without the user typing in it", async () => {
    const { nests, handOffs, sendAndWait } = setup();
    const nest = nests.create();
    plans.push(TWO_JOBS);
    await nests.ask(nest, "Find companies and write to each", PLACE);
    const [scout, writer] = plannedCards(nests, nest);
    replies.push(TABLE(2));
    nests.runPlan(nest);
    await settleAll();
    // Scout read from nothing, so only the For-each card that started from its table was handed anything.
    expect(handOffs).toEqual([`${scout.id}>${writer.id}`]);

    // A draft the user writes and sends on a line is their own press on that card, and a reply is too.
    const draft = nests.addCard(nest, { x: 0, y: 600, from: scout.id })!;
    await sendAndWait(draft.id, "Which is biggest?");
    await sendAndWait(draft.id, "And the smallest?");
    expect(handOffs).toHaveLength(1);

    // For each row sent from a draft starts many runs from the card's line.
    const each = nests.addCard(nest, { x: 600, y: 600, from: scout.id })!;
    expect(nests.sendEach(each.id, "Look each one up")).toEqual({ ok: true });
    expect(handOffs.at(-1)).toBe(`${scout.id}>${each.id}`);
  });

  it("hands work on when the user says Looks right, continue", async () => {
    const { nests, handOffs } = setup();
    const nest = nests.create();
    plans.push({ ...TWO_JOBS, cards: [planCard("c1", { prompt: "Find companies" }), planCard("c2", { prompt: "Draft emails", from: "c1", waits_for_user: true })] });
    await nests.ask(nest, "Find companies and draft emails", PLACE);
    const [scout, writer] = plannedCards(nests, nest);
    replies.push("Found three.");
    nests.runPlan(nest);
    await settleAll();
    expect(handOffs).toEqual([]);
    nests.continueFrom(scout.id);
    expect(handOffs).toEqual([`${scout.id}>${writer.id}`]);
  });

  it("names a new Nest from its first request: its first words at once, then the cheap model's name, never over the user's", async () => {
    let name: (title: string | null) => void = () => {};
    const asked: string[] = [];
    const { nests } = setup((words) => {
      asked.push(words);
      return new Promise((resolve) => (name = resolve));
    });
    const nest = nests.create();
    expect(nests.title(nest)).toBe(NEW_NEST_TITLE);
    plans.push(TWO_JOBS);
    const asking = nests.ask(nest, "Find  Swedish SaaS companies\nand write to each", PLACE);
    expect(nests.title(nest)).toBe("Find Swedish SaaS companies and write to each");
    expect(nests.board(nest)!.naming).toBe(true);
    name("Swedish SaaS outreach");
    await asking;
    await settleAll();
    expect(nests.title(nest)).toBe("Swedish SaaS outreach");
    expect(nests.board(nest)!.naming).toBe(false);

    // Named, it isn't asked again.
    plans.push(TWO_JOBS);
    await nests.ask(nest, "Change the second card", PLACE);
    expect(asked).toHaveLength(1);

    // The user's name is final, even while the model is naming.
    const mine = nests.create();
    const card = nests.addCard(mine, { x: 0, y: 0 })!;
    nests.send(card.id, "Find flights to Berlin");
    nests.rename(mine, "Berlin trip");
    name("Flights to Berlin");
    await settleAll();
    expect(nests.title(mine)).toBe("Berlin trip");
  });

  it("tries naming again on a later request when the first one had no topic, a few times at most", async () => {
    const asked: string[] = [];
    const { nests, sendAndWait } = setup(async (words) => {
      asked.push(words);
      return words.includes("Lisbon") ? "Lisbon weekend" : null;
    });
    const nest = nests.create();
    const card = nests.addCard(nest, { x: 0, y: 0 })!;
    await sendAndWait(card.id, "hi");
    await settle();
    expect(nests.title(nest)).toBe("hi");
    await sendAndWait(card.id, "hello?");
    await sendAndWait(card.id, "a weekend in Lisbon");
    await settle();
    expect(nests.title(nest)).toBe("Lisbon weekend");
    // A fourth try never happens.
    const other = nests.create();
    const quiet = nests.addCard(other, { x: 0, y: 0 })!;
    for (const words of ["hi", "hey", "yo", "a weekend in Lisbon"]) await sendAndWait(quiet.id, words);
    await settle();
    expect(nests.title(other)).toBe("hi");
    expect(asked.slice(3)).toEqual(["hi", "hey", "yo"]);
  });

  it("turns a chat into a Nest's first card, with its thread and bird, out of the Chats list and named as it was", async () => {
    const { nests, chats, chatStore, replyEnded, sendAndWait } = setup();
    const done = replyEnded();
    const thread = chats.send(null, "Find Swedish SaaS companies", { seePage: false, mascotId: "scout" })!;
    await done;
    chatStore.renameChat(thread.id, "Swedish SaaS");

    const result = nests.fromChat(thread.id);
    expect(result.ok).toBe(true);
    const nest = (result as { nestId: string }).nestId;
    const board = nests.board(nest)!;
    expect(board.title).toBe("Swedish SaaS");
    expect(board.cards).toEqual([expect.objectContaining({ chatId: thread.id, mascotId: "scout", plan: null, each: null })]);
    expect(nests.cardChats().has(thread.id)).toBe(true);
    expect(nests.chatInNest(thread.id)).toEqual({ nestId: nest, cardId: board.cards[0].id, runId: null });

    // It carries the same thread on, and is named already.
    await sendAndWait(board.cards[0].id, "Only the ones in Gothenburg");
    expect(chatStore.chat(thread.id)!.messages.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(nests.title(nest)).toBe("Swedish SaaS");
    // Once on a card, it can't become another Nest.
    expect(nests.fromChat(thread.id)).toEqual({ ok: false, error: expect.any(String) });
  });

  it("won't turn a chat into a Nest while it runs, or one another app started", async () => {
    const { nests, chats, chatStore, replyEnded } = setup();
    held = [];
    const running = chats.send(null, "Find flights", { seePage: false })!;
    expect(nests.fromChat(running.id)).toEqual({ ok: false, error: "Wait until it’s finished, or stop it first." });
    const done = replyEnded();
    for (let tries = 0; tries < 5 && held.length === 0; tries++) await settle();
    await release();
    await done;
    held = null;
    expect(nests.fromChat(running.id).ok).toBe(true);

    const fromApp = chatStore.createChat("From Claude Code", null, "Claude Code");
    expect(nests.fromChat(fromApp)).toEqual({ ok: false, error: "Only a chat you started here can become a Nest." });
    expect(nests.fromChat("no-such-chat").ok).toBe(false);
    expect(nests.list()).toHaveLength(1);
  });

  it("finds the card or run a chat belongs to, and counts a For-each card's runs for the sidebar", async () => {
    const { nests, sendAndWait } = setup();
    const nest = nests.create();
    const scout = nests.addCard(nest, { x: 0, y: 0 })!;
    replies.push(TABLE(5));
    await sendAndWait(scout.id, "Find companies");
    expect(nests.list()[0].progress).toBeNull();

    held = [];
    const writer = nests.addCard(nest, { x: 600, y: 0, from: scout.id })!;
    nests.sendEach(writer.id, "Write to each");
    await settle();
    expect(nests.list()[0].progress).toEqual({ done: 0, total: 5 });
    const runs = nests.card(writer.id)!.each!.runs;
    expect(nests.chatInNest(runs[0].chatId!)).toEqual({ nestId: nest, cardId: writer.id, runId: runs[0].id });
    expect(nests.chatInNest(nests.card(scout.id)!.chatId!)).toEqual({ nestId: nest, cardId: scout.id, runId: null });

    await release();
    expect(nests.list()[0].progress).toEqual({ done: 3, total: 5 });
    await release();
    expect(nests.list()[0].progress).toBeNull();
    held = null;
  });
});
