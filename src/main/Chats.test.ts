import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { ReplyMessage, StreamReply } from "./agent";
import type { Tab } from "./Tab";
import type { ChatThread } from "../shared/library";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

const SCREENSHOT = "data:image/png;base64,AAAA";

const tab = (overrides: Partial<Record<"screenshot" | "getTabText", () => Promise<unknown>>> = {}) =>
  ({
    url: "https://example.com/",
    screenshot: async () => ({ toDataURL: () => SCREENSHOT }),
    getTabText: async () => "page text",
    ...overrides,
  }) as unknown as Tab;

// Waits for the reply to end, which is the last thing a run reports.
const setup = (streamReply: StreamReply, activeTab: Tab | null = tab()) => {
  const store = new ChatStore(":memory:");
  const threads: ChatThread[] = [];
  const chunks: string[] = [];
  let listChanges = 0;
  let onEnd = () => {};
  const chats = new Chats(store, streamReply, () => activeTab, {
    onChunk: (_, content) => chunks.push(content),
    onThread: (thread) => {
      threads.push(thread);
      if (thread.partial === null) onEnd();
    },
    onListChanged: () => listChanges++,
  });
  const replyEnded = () => new Promise<void>((resolve) => (onEnd = resolve));
  return { chats, store, threads, chunks, replyEnded, listChanges: () => listChanges };
};

const replying = (...tokens: string[]): StreamReply =>
  async function* () {
    yield* tokens;
  };

let sent: ReplyMessage[][];
const recording: StreamReply = async function* (messages) {
  sent.push(messages);
  yield "ok";
};

const send = (chats: Chats, chatId: string | null, text: string, seePage = true) =>
  chats.send(chatId, text, { seePage });

beforeEach(() => {
  sent = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats", () => {
  it("streams a reply and saves it when it ends", async () => {
    const { chats, chunks, replyEnded, listChanges } = setup(replying("one ", "two"));

    const ended = replyEnded();
    const thread = send(chats, null, "  Plan a trip  ");
    expect(thread?.title).toBe("Plan a trip");
    expect(thread?.partial).toBe("");
    await ended;

    expect(chunks).toEqual(["one ", "two"]);
    expect(chats.thread(thread!.id)).toMatchObject({
      partial: null,
      error: null,
      messages: [
        { role: "user", content: "Plan a trip" },
        { role: "assistant", content: "one two" },
      ],
    });
    expect(listChanges()).toBe(2);
  });

  it("ignores an empty message, an unknown chat, and a second message during a reply", async () => {
    let finish = () => {};
    let holding = false;
    const held: StreamReply = async function* () {
      await new Promise<void>((resolve) => {
        finish = resolve;
        holding = true;
      });
      yield "done";
    };
    const { chats, store, replyEnded } = setup(held);

    expect(send(chats, null, "   ")).toBeNull();
    expect(send(chats, "missing", "hello")).toBeNull();
    expect(store.summaries()).toHaveLength(0);

    const ended = replyEnded();
    const thread = send(chats, null, "first")!;
    expect(send(chats, thread.id, "second")).toBeNull();
    await vi.waitFor(() => expect(holding).toBe(true));
    finish();
    await ended;

    expect(chats.thread(thread.id)?.messages.map((message) => message.content)).toEqual(["first", "done"]);
  });

  it("sends the history, with the page only on the newest message", async () => {
    const { chats, replyEnded } = setup(recording);

    let ended = replyEnded();
    const { id } = send(chats, null, "first")!;
    await ended;
    ended = replyEnded();
    send(chats, id, "second");
    await ended;

    const [, second] = sent;
    expect(second.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(second[0].content).toBe("first");
    expect(JSON.stringify(second[2].content)).toContain(SCREENSHOT);
    expect(JSON.stringify(second[2].content)).toContain("page text");
    expect(JSON.stringify(second[2].content)).toContain("second");
  });

  it("never saves the page", async () => {
    const { chats, replyEnded } = setup(recording);

    const ended = replyEnded();
    const { id } = send(chats, null, "first")!;
    await ended;

    expect(JSON.stringify(chats.thread(id))).not.toContain(SCREENSHOT);
    expect(JSON.stringify(chats.thread(id))).not.toContain("page text");
  });

  it("sends no page from the main chat, without Can see, or on an internal page", async () => {
    const cases = [
      { seePage: false, canSee: true, activeTab: tab() },
      { seePage: true, canSee: false, activeTab: tab() },
      { seePage: true, canSee: true, activeTab: null },
    ];
    for (const { seePage, canSee, activeTab } of cases) {
      sent = [];
      const { chats, replyEnded } = setup(recording, activeTab);
      chats.setPageAccess(canSee);
      const ended = replyEnded();
      send(chats, null, "first", seePage);
      await ended;
      expect(sent[0]).toEqual([{ role: "user", content: "first" }]);
    }
  });

  it("sends nothing from the page when Can see goes off while the page is being read", async () => {
    for (const reader of ["screenshot", "getTabText"] as const) {
      sent = [];
      let chats: Chats | null = null;
      const context = setup(
        recording,
        tab({
          [reader]: async () => {
            chats?.setPageAccess(false);
            return reader === "screenshot" ? { toDataURL: () => SCREENSHOT } : "page text";
          },
        })
      );
      chats = context.chats;
      const ended = context.replyEnded();
      send(chats, null, "first");
      await ended;
      expect(sent[0]).toEqual([{ role: "user", content: "first" }]);
    }
  });

  it("still replies when the page can't be read", async () => {
    const { chats, replyEnded } = setup(
      recording,
      tab({
        screenshot: async () => {
          throw new Error("no capture");
        },
        getTabText: async () => {
          throw new Error("no script");
        },
      })
    );

    const ended = replyEnded();
    send(chats, null, "first");
    await ended;

    expect(JSON.stringify(sent[0][0].content)).toContain("first");
    expect(JSON.stringify(sent[0][0].content)).not.toContain("image_url");
  });

  it("keeps what was written when stopped, with no error", async () => {
    const abortable: StreamReply = async function* (_, signal) {
      yield "partial";
      await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    const { chats, chunks, replyEnded } = setup(abortable);

    const ended = replyEnded();
    const { id } = send(chats, null, "first")!;
    await vi.waitFor(() => expect(chunks).toEqual(["partial"]));
    expect(chats.thread(id)?.partial).toBe("partial");
    chats.stop(id);
    await ended;

    const thread = chats.thread(id);
    expect(thread).toMatchObject({ partial: null, error: null });
    expect(thread?.messages.at(-1)).toEqual({ role: "assistant", content: "partial" });
  });

  it("shows why a reply failed until the next message, and leaves no empty reply", async () => {
    const reply = vi.fn<StreamReply>(() => {
      throw new Error("429 Too Many Requests");
    });
    const { chats, replyEnded } = setup(reply);

    let ended = replyEnded();
    const { id } = send(chats, null, "first")!;
    await ended;
    expect(chats.thread(id)?.error).toMatch(/rate limited/);
    expect(chats.thread(id)?.messages).toHaveLength(1);

    reply.mockImplementation(replying("fine"));
    ended = replyEnded();
    expect(send(chats, id, "again")?.error).toBeNull();
    await ended;
    expect(chats.thread(id)?.error).toBeNull();
  });

  it("can run several chats at once", async () => {
    const finishers: Array<() => void> = [];
    const held: StreamReply = async function* () {
      await new Promise<void>((resolve) => finishers.push(resolve));
      yield "done";
    };
    const { chats, threads } = setup(held);

    send(chats, null, "first");
    send(chats, null, "second");
    await vi.waitFor(() => expect(finishers).toHaveLength(2));
    finishers.forEach((finish) => finish());

    await vi.waitFor(() => expect(threads.filter((thread) => thread.partial === null)).toHaveLength(2));
  });
});
