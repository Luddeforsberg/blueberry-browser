import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chats } from "./Chats";
import type { StreamReply } from "./agent";
import { setup } from "./chatsTesting";
import { defined } from "../../shared/testing";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Each reply says what it was asked, then runs until the test lets it finish or it's stopped.
const held = () => {
  const asked: string[] = [];
  const finish: Array<() => void> = [];
  const streamReply: StreamReply = async function* (messages, signal) {
    const last = messages.filter(({ role }) => role === "user").at(-1)?.content;
    asked.push(typeof last === "string" ? last : JSON.stringify(last));
    yield `on ${asked.length}`;
    await new Promise<void>((resolve, reject) => {
      finish.push(resolve);
      signal.addEventListener("abort", () => reject(new Error("stopped")));
    });
  };
  return { streamReply, asked, finishReply: () => defined(finish.shift())() };
};

const typed = (chats: Chats, chatId: string | null, text: string) => chats.send(chatId, text, { seePage: false, userPresent: true });
const waiting = (chats: Chats, chatId: string) => chats.thread(chatId)?.queued.map(({ content }) => content);
const said = (chats: Chats, chatId: string) => chats.thread(chatId)?.messages.map(({ content }) => content);

describe("a message sent while a reply runs", () => {
  it("waits, then goes once that reply is done, in the order they were typed", async () => {
    const { streamReply, asked, finishReply } = held();
    const { chats } = setup(streamReply);
    const { id } = defined(typed(chats, null, "Find a cable") ?? undefined);
    await vi.waitFor(() => expect(asked).toEqual(["Find a cable"]));

    expect(typed(chats, id, "Only braided ones")?.queued).toHaveLength(1);
    typed(chats, id, "Then put it in my cart");
    expect(waiting(chats, id)).toEqual(["Only braided ones", "Then put it in my cart"]);
    expect(said(chats, id)).toEqual(["Find a cable"]);

    finishReply();
    await vi.waitFor(() => expect(asked).toEqual(["Find a cable", "Only braided ones"]));
    expect(waiting(chats, id)).toEqual(["Then put it in my cart"]);
    expect(said(chats, id)).toEqual(["Find a cable", "on 1", "Only braided ones"]);

    finishReply();
    await vi.waitFor(() => expect(asked).toHaveLength(3));
    expect(waiting(chats, id)).toEqual([]);
  });

  it("stays after Stop, and Send goes then", async () => {
    const { streamReply, asked } = held();
    const { chats } = setup(streamReply);
    const { id } = defined(typed(chats, null, "Find a cable") ?? undefined);
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    typed(chats, id, "Only braided ones");

    chats.stop(id);
    await vi.waitFor(() => expect(chats.isRunning(id)).toBe(false));
    await new Promise((resolve) => setTimeout(resolve));
    expect(asked).toHaveLength(1);
    const [first] = defined(chats.thread(id)?.queued);

    expect(chats.followUp(id, defined(first).id, "send-now")).toBe(true);
    await vi.waitFor(() => expect(asked).toEqual(["Find a cable", "Only braided ones"]));
    expect(waiting(chats, id)).toEqual([]);
  });

  it("Send now stops the reply and sends that one first, and the rest keep waiting", async () => {
    const { streamReply, asked } = held();
    const { chats } = setup(streamReply);
    const { id } = defined(typed(chats, null, "Find a cable") ?? undefined);
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    typed(chats, id, "Only braided ones");
    typed(chats, id, "Actually, a charger");
    const second = defined(chats.thread(id)?.queued[1]);

    chats.followUp(id, second.id, "send-now");
    await vi.waitFor(() => expect(asked).toEqual(["Find a cable", "Actually, a charger"]));
    expect(waiting(chats, id)).toEqual(["Only braided ones"]);
  });

  it("can be removed, and is gone with its chat", async () => {
    const { streamReply, asked } = held();
    const { chats } = setup(streamReply);
    const { id } = defined(typed(chats, null, "Find a cable") ?? undefined);
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    typed(chats, id, "Only braided ones");
    typed(chats, id, "Then put it in my cart");

    expect(chats.followUp(id, defined(chats.thread(id)?.queued[0]).id, "remove")).toBe(true);
    expect(waiting(chats, id)).toEqual(["Then put it in my cart"]);
    expect(chats.followUp(id, "missing", "remove")).toBe(false);
    chats.delete(id);
    expect(chats.thread(id)).toBeNull();
  });

  it("is still refused when it isn't the user typing in Blueberry, as from another app", async () => {
    const { streamReply, asked } = held();
    const { chats } = setup(streamReply);
    const { id } = defined(typed(chats, null, "Find a cable") ?? undefined);
    await vi.waitFor(() => expect(asked).toHaveLength(1));

    expect(chats.send(id, "From an app", { seePage: false, from: "Claude" })).toBeNull();
    expect(waiting(chats, id)).toEqual([]);
  });
});
