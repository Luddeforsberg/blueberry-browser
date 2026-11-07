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

// Each reply is the next of `replies`, and what the model got is kept in `sent`.
const model: StreamReply = async function* (messages) {
  sent.push(messages);
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
  return { nests, store, chatStore, deleted, sendAndWait };
};

const newest = (messages: ReplyMessage[]) => messages.at(-1)?.content as string;

beforeEach(() => {
  sent = [];
  replies = [];
});

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
    expect(nests.answerFor(alone.id)).toBeNull();
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
});
