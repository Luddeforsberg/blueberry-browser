import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { GenerateTitle, ReplyMessage, ReplyOptions, StreamReply } from "./agent";
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
const setup = (
  streamReply: StreamReply,
  activeTab: Tab | null = tab(),
  generateTitle: GenerateTitle = async () => null
) => {
  const store = new ChatStore(":memory:");
  const threads: ChatThread[] = [];
  const chunks: string[] = [];
  let listChanges = 0;
  let onEnd = () => {};
  const chats = new Chats(store, streamReply, generateTitle, {
    activeTab: () => activeTab,
    allTabs: () => (activeTab ? [activeTab] : []),
    openTab: () => activeTab as Tab,
  }, {
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

  describe("page tools", () => {
    const toolNames = async (activeTab: Tab | null, seePage: boolean, canSee: boolean) => {
      let options: ReplyOptions | null = null;
      const { chats, replyEnded } = setup(async function* (_, __, given) {
        options = given;
        yield "ok";
      }, activeTab);
      chats.setPageAccess(canSee);
      const ended = replyEnded();
      send(chats, null, "first", seePage);
      await ended;
      return (options as ReplyOptions | null)?.tools.map((tool) => tool.name);
    };

    it("are only offered when Berry can see a page", async () => {
      expect(await toolNames(tab(), true, true)).toEqual(expect.arrayContaining(["read_page", "click", "open_tab"]));
      expect(await toolNames(tab(), false, true)).toEqual([]);
      expect(await toolNames(tab(), true, false)).toEqual([]);
      expect(await toolNames(null, true, true)).toEqual([]);
    });

    it("read nothing once Can see is switched off during a reply", async () => {
      const { chats, replyEnded } = setup(async function* (_, __, { tools }) {
        chats.setPageAccess(false);
        for (const tool of tools) yield tool.label({ query: "page" }) + (await tool.run({ query: "page" }));
      });

      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await ended;

      const { content } = chats.thread(id)!.messages.at(-1)!;
      expect(content).not.toContain("page text");
      expect(content).not.toContain("example.com");
    });

    it("drop what they read if Can see is switched off while reading", async () => {
      let chats: Chats | null = null;
      let reads = 0;
      const context = setup(
        async function* (_, __, { tools }) {
          for (const tool of tools) yield await tool.run({ query: "page" });
        },
        tab({
          // The first read is the page sent with the message. The second is the tool's.
          getTabText: async () => {
            if (++reads === 2) chats?.setPageAccess(false);
            return "page text";
          },
        })
      );
      chats = context.chats;

      const ended = context.replyEnded();
      const { id } = send(chats, null, "first")!;
      await ended;

      expect(chats.thread(id)?.messages.at(-1)?.content).not.toContain("page text");
    });

    const stepping =
      (texts: string[], words: string[]): StreamReply =>
      async function* (_, __, { onStep }) {
        yield words[0];
        for (const text of texts) onStep(text)();
        yield words[1];
      };

    it("saves the steps with the reply, and tells the model about them next time", async () => {
      const replies: StreamReply[] = [stepping(["Read a.com"], ["Let me look.", "Found it."]), recording];
      const { chats, chunks, replyEnded } = setup((...args) => replies.shift()!(...args));

      let ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await ended;

      expect(chunks).toEqual(["Let me look.", "\n\nFound it."]);
      expect(chats.thread(id)?.steps).toEqual([]);
      expect(chats.thread(id)?.messages.at(-1)).toEqual({
        role: "assistant",
        content: "Let me look.\n\nFound it.",
        steps: [{ text: "Read a.com", done: true }],
      });

      ended = replyEnded();
      send(chats, id, "second", false);
      await ended;
      expect(sent[0][1].content).toBe("<steps>\n- Read a.com\n</steps>\n\nLet me look.\n\nFound it.");
    });

    it("shows a step while it runs, and saves it as over when stopped with no words yet", async () => {
      const running: StreamReply = async function* (_, signal, { onStep }) {
        onStep("Read a.com");
        yield "";
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
      };
      const { chats, threads, replyEnded } = setup(running);

      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await vi.waitFor(() => expect(threads.at(-1)?.steps).toEqual([{ text: "Read a.com", done: false }]));
      chats.stop(id);
      await ended;

      expect(chats.thread(id)?.messages.at(-1)).toEqual({
        role: "assistant",
        content: "",
        steps: [{ text: "Read a.com", done: true }],
      });
    });
  });

  describe("approvals", () => {
    const asking =
      (answers: boolean[]): StreamReply =>
      async function* (_, __, { approve }) {
        answers.push(await approve("Click “Buy” on a.com"));
        yield "done";
      };

    it("shows the request until it's answered, and takes one answer", async () => {
      const answers: boolean[] = [];
      const { chats, threads, replyEnded } = setup(asking(answers));
      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await vi.waitFor(() => expect(threads.at(-1)?.approval?.text).toBe("Click “Buy” on a.com"));
      const approval = threads.at(-1)!.approval!;

      expect(chats.decide(id, "wrong", true)).toBe(false);
      expect(answers).toEqual([]);
      expect(chats.decide(id, approval.id, true)).toBe(true);
      expect(chats.decide(id, approval.id, false)).toBe(false);
      await ended;

      expect(answers).toEqual([true]);
      expect(chats.thread(id)?.approval).toBeNull();
    });

    it("treats anything but true as no", async () => {
      const answers: boolean[] = [];
      const { chats, threads, replyEnded } = setup(asking(answers));
      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await vi.waitFor(() => expect(threads.at(-1)?.approval).not.toBeNull());

      chats.decide(id, threads.at(-1)!.approval!.id, "yes" as unknown as boolean);
      await ended;

      expect(answers).toEqual([false]);
    });

    it("ends the reply with no action when stopped while waiting", async () => {
      const answers: boolean[] = [];
      const { chats, threads, replyEnded } = setup(asking(answers));
      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await vi.waitFor(() => expect(threads.at(-1)?.approval).not.toBeNull());
      const approvalId = threads.at(-1)!.approval!.id;

      chats.stop(id);
      await ended;

      expect(answers).toEqual([]);
      expect(chats.thread(id)).toMatchObject({ partial: null, approval: null, error: null });
      expect(chats.decide(id, approvalId, true)).toBe(false);
    });
  });

  describe("titles", () => {
    const turn = async (context: ReturnType<typeof setup>, chatId: string | null, text: string) => {
      const ended = context.replyEnded();
      const thread = send(context.chats, chatId, text, false)!;
      await ended;
      // The title is asked for after the reply ends.
      await new Promise((resolve) => setTimeout(resolve));
      return thread.id;
    };

    it("keeps the first message until the model finds a topic, then asks no more", async () => {
      const generate = vi.fn<GenerateTitle>(async () => null);
      const context = setup(replying("ok"), null, generate);

      const id = await turn(context, null, "hey");
      expect(context.chats.thread(id)?.title).toBe("hey");

      generate.mockResolvedValue("Trip to Porto");
      await turn(context, id, "plan a trip");
      expect(context.chats.thread(id)?.title).toBe("Trip to Porto");
      expect(context.threads.at(-1)?.title).toBe("Trip to Porto");

      await turn(context, id, "and food");
      expect(generate).toHaveBeenCalledTimes(2);
    });

    it("gives up after five messages with no topic", async () => {
      const generate = vi.fn<GenerateTitle>(async () => null);
      const context = setup(replying("ok"), null, generate);

      const id = await turn(context, null, "1");
      for (const text of ["2", "3", "4", "5", "6"]) await turn(context, id, text);

      expect(generate).toHaveBeenCalledTimes(5);
    });

    it("doesn't ask when the reply failed or the user named the chat", async () => {
      const generate = vi.fn<GenerateTitle>(async () => "Generated");
      const failing = setup(
        () => {
          throw new Error("boom");
        },
        null,
        generate
      );
      await turn(failing, null, "first");
      expect(generate).not.toHaveBeenCalled();

      const named = setup(replying("ok"), null, generate);
      const ended = named.replyEnded();
      const { id } = send(named.chats, null, "first", false)!;
      named.chats.rename(id, "Mine");
      await ended;
      await new Promise((resolve) => setTimeout(resolve));
      expect(generate).not.toHaveBeenCalled();
      expect(named.chats.thread(id)?.title).toBe("Mine");
    });

    it("keeps the user's name if they rename while a title is being generated", async () => {
      let finish: (title: string) => void = () => {};
      const generate: GenerateTitle = () => new Promise((resolve) => (finish = resolve));
      const context = setup(replying("ok"), null, generate);

      const id = await turn(context, null, "first");
      context.chats.rename(id, "Mine");
      finish("Generated");
      await new Promise((resolve) => setTimeout(resolve));

      expect(context.chats.thread(id)?.title).toBe("Mine");
    });

    it("survives a failed title", async () => {
      const context = setup(replying("ok"), null, async () => {
        throw new Error("no such model");
      });

      const id = await turn(context, null, "first");

      expect(context.chats.thread(id)).toMatchObject({ title: "first", error: null });
    });
  });

  describe("rename", () => {
    it("trims the name, and rejects an empty name or unknown chat", async () => {
      const { chats, replyEnded } = setup(replying("ok"));
      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await ended;

      expect(chats.rename(id, "   ")).toBe(false);
      expect(chats.thread(id)?.title).toBe("first");
      expect(chats.rename("missing", "Name")).toBe(false);
      expect(chats.rename(id, "  a  ")).toBe(true);
      expect(chats.thread(id)?.title).toBe("a");
    });

    it("keeps names to 100 characters", async () => {
      const { chats, replyEnded } = setup(replying("ok"));
      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await ended;

      chats.rename(id, "x".repeat(100));
      expect(chats.thread(id)?.title).toHaveLength(100);
      chats.rename(id, "y".repeat(101));
      expect(chats.thread(id)?.title).toBe("y".repeat(100));
    });
  });

  describe("delete", () => {
    it("removes the chat and its messages", async () => {
      const { chats, store, replyEnded } = setup(replying("ok"));
      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await ended;

      expect(chats.delete(id)).toBe(true);
      expect(chats.thread(id)).toBeNull();
      expect(store.summaries()).toEqual([]);
      expect(chats.delete(id)).toBe(false);
    });

    it("stops a running reply without saving it or crashing", async () => {
      const abortable: StreamReply = async function* (_, signal) {
        yield "partial";
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
      };
      const { chats, chunks, threads, store } = setup(abortable);
      const { id } = send(chats, null, "first")!;
      await vi.waitFor(() => expect(chunks).toEqual(["partial"]));
      const seen = threads.length;

      expect(chats.delete(id)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve));

      expect(store.summaries()).toEqual([]);
      expect(threads).toHaveLength(seen);
    });
  });
});
