import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamReply } from "./agent";
import { replying, setup } from "./chatsTesting";
import { REPLY_NOT_SAVED } from "../../shared/library";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// However a reply ends, whoever started it and the thread hear it once.
describe("Chats, as a reply ends", () => {
  it("still says a reply ended, and keeps its answer readable, when saving the answer fails", async () => {
    const { chats, store, threads } = setup(replying("Booked the table."));
    const save = store.addMessage.bind(store);
    let full = true;
    vi.spyOn(store, "addMessage").mockImplementation((chatId, message, files) => {
      if (full && message.role === "assistant") throw new Error("database or disk is full");
      save(chatId, message, files);
    });
    const onEnd = vi.fn();

    const { id } = chats.send(null, "Book a table", { seePage: false, onEnd })!;

    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledOnce());
    expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ reply: "Booked the table.", outcome: "done", error: null }));
    expect(threads.at(-1)).toMatchObject({ id, partial: null, error: REPLY_NOT_SAVED });
    const answered = [
      { role: "user", content: "Book a table" },
      { role: "assistant", content: "Booked the table." },
    ];
    expect(chats.thread(id)?.messages).toMatchObject(answered);

    // The next message saves it first, so it's there for the model and after a restart.
    full = false;
    chats.send(id, "Thanks", { seePage: false });
    await vi.waitFor(() => expect(chats.isRunning(id)).toBe(false));
    expect(store.chat(id)?.messages).toMatchObject([...answered, { role: "user", content: "Thanks" }, { role: "assistant" }]);
    expect(chats.thread(id)?.error).toBeNull();
  });

  it("tells whoever started a reply that it ended when its chat is deleted meanwhile", async () => {
    const answer = Promise.withResolvers<void>();
    const held: StreamReply = async function* () {
      await answer.promise;
      yield "late";
    };
    const { chats, store } = setup(held);
    const onEnd = vi.fn();
    const { id } = chats.send(null, "Look", { seePage: false, onEnd })!;

    chats.delete(id);
    answer.resolve();

    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledOnce());
    expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ outcome: "stopped" }));
    expect(store.chat(id)).toBeNull();
  });
});
