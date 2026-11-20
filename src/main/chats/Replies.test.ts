import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { StreamReply } from "./agent";
import type { Tab } from "../tabs/Tab";
import { replying, send, setup, tab, timed } from "./chatsTesting";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats", () => {
  describe("runTask", () => {
    it("runs in its own tabs, reaches no others, and saves no chat", async () => {
      const own = { ...tab(), id: "tab-own", settled: async () => {} } as unknown as Tab;
      const users = { ...tab(), id: "tab-user", url: "https://user.example/" } as unknown as Tab;
      let toolNames: string[] = [];
      let listed = "";
      const stream: StreamReply = async function* (_, __, { tools, onUsage }) {
        toolNames = tools.map((tool) => tool.name);
        await tools.find((tool) => tool.name === "open_tab")!.run({ url: "https://example.com/" });
        listed = await tools.find((tool) => tool.name === "list_tabs")!.run({});
        onUsage?.(120);
        onUsage?.(30);
        yield "report";
      };
      const store = new ChatStore(":memory:");
      const chats = new Chats(
        store,
        stream,
        async () => null,
        {
          activeTab: () => users,
          allTabs: () => [users, own],
          openBackgroundTab: () => own,
          closeTab: () => true,
          actionApproval: () => "risky",
        },
        { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} },
      );

      const result = await chats.runTask("run-1", "Look", () => {});

      expect(toolNames).toContain("open_tab");
      expect(listed).toContain("tab-own");
      expect(listed).not.toContain("tab-user");
      expect(result).toMatchObject({ text: "report", error: null, stopped: false, tokens: 150, tabIds: ["tab-own"] });
      expect(store.summaries()).toEqual([]);
    });

    it("gives back only the tabs still its own", async () => {
      const own = { ...tab(), id: "tab-own", settled: async () => {} } as unknown as Tab;
      const stream: StreamReply = async function* (_, __, { tools }) {
        await tools.find((tool) => tool.name === "open_tab")!.run({ url: "https://example.com/" });
        chats.releaseTab("tab-own");
        yield "report";
      };
      const { chats } = setup(
        stream,
        tab(),
        async () => null,
        () => own,
      );

      expect((await chats.runTask("run-1", "Look", () => {})).tabIds).toEqual([]);
    });

    it("clears up popups from its tabs, without being able to reach them", async () => {
      const own = { ...tab(), id: "tab-own", settled: async () => {} } as unknown as Tab;
      const popup = { ...tab(), id: "tab-popup" } as unknown as Tab;
      const gone = { ...tab(), id: "tab-gone" } as unknown as Tab;
      let listed = "";
      const stream: StreamReply = async function* (_, __, { tools }) {
        await tools.find((tool) => tool.name === "open_tab")!.run({ url: "https://example.com/" });
        chats.notePopup("tab-own", "tab-popup");
        chats.notePopup("tab-popup", "tab-gone");
        chats.notePopup("tab-user", "tab-unrelated");
        chats.releaseTab("tab-gone");
        listed = await tools.find((tool) => tool.name === "list_tabs")!.run({});
        yield "report";
      };
      const chats = new Chats(
        new ChatStore(":memory:"),
        stream,
        async () => null,
        {
          activeTab: () => null,
          allTabs: () => [own, popup, gone],
          openBackgroundTab: () => own,
          closeTab: () => true,
          actionApproval: () => "risky",
        },
        { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} },
      );

      const { tabIds } = await chats.runTask("run-1", "Look", () => {});

      expect(listed).toContain("tab-own");
      expect(listed).not.toContain("tab-popup");
      expect(tabIds).toEqual(["tab-own", "tab-popup"]);
    });

    it("waits for an approval by its own id, and doesn't act if stopped first", async () => {
      const acted: string[] = [];
      const stream: StreamReply = async function* (_, __, { approve }) {
        if (await approve("Delete it")) acted.push("first");
        if (await approve("Pay for it")) acted.push("second");
        yield "never reached";
      };
      const { chats } = setup(stream);
      const seen: Array<string | null> = [];

      const ended = chats.runTask("run-1", "Look", ({ approval }) => {
        seen.push(approval?.text ?? null);
        if (approval?.text === "Delete it") chats.decide("run-1", approval.id, true);
        if (approval?.text === "Pay for it") chats.stop("run-1");
      });
      const result = await ended;

      expect(seen).toEqual(["Delete it", null, "Pay for it"]);
      expect(acted).toEqual(["first"]);
      expect(result).toMatchObject({ stopped: true, error: null, text: "" });
      expect(chats.decide("run-1", "any", true)).toBe(false);
    });

    it("ends a stopped run with the step that says so, even before it did anything", async () => {
      let started = 0;
      const waiting = (step: string | null): StreamReply =>
        async function* (_, signal, { onStep }) {
          if (step) onStep(step)();
          started++;
          yield "";
          if (!signal.aborted) await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
        };
      const stopped = async (stream: StreamReply) => {
        const { chats } = setup(stream);
        const before = started;
        const ended = chats.runTask("run-1", "Look", () => {});
        await vi.waitFor(() => expect(started).toBe(before + 1));
        chats.stop("run-1");
        return ended;
      };

      expect((await stopped(waiting("Read a.com"))).steps).toEqual([
        { text: "Read a.com", done: true },
        { text: "Stopped here", done: true },
      ]);
      expect(await stopped(waiting(null))).toMatchObject({ stopped: true, text: "", steps: [{ text: "Stopped here", done: true }] });
    });

    it("adds no stopped step to a run that finished", async () => {
      const { chats } = setup(replying("report"));
      expect((await chats.runTask("run-1", "Look", () => {})).steps).toEqual([]);
    });
  });

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
    expect(thread?.messages.at(-1)).toEqual({
      role: "assistant",
      content: "partial",
      steps: [{ text: "Stopped here", done: true }],
      ...timed(),
    });
  });

  it("says it was stopped when stopped before anything was written or done", async () => {
    let started = false;
    const waiting: StreamReply = async function* (_, signal) {
      started = true;
      yield "";
      await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    const { chats, replyEnded } = setup(waiting);

    const ended = replyEnded();
    const { id } = send(chats, null, "first")!;
    await vi.waitFor(() => expect(started).toBe(true));
    chats.stop(id);
    await ended;

    expect(chats.thread(id)?.messages.at(-1)).toEqual({
      role: "assistant",
      content: "",
      steps: [{ text: "Stopped here", done: true }],
      ...timed(),
    });
  });

  it("counts a reply as new only when it ended, not stopped, with its tab behind, until the tab comes to the front", async () => {
    const store = new ChatStore(":memory:");
    let inFront = false;
    let ended = () => {};
    const abortable: StreamReply = async function* (_, signal) {
      yield "partial";
      await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    let stream: StreamReply = replying("done");
    const chats = new Chats(
      store,
      (...args) => stream(...args),
      async () => null,
      {
        activeTab: () => null,
        allTabs: () => [],
        openBackgroundTab: () => tab(),
        closeTab: () => true,
        actionApproval: () => "always",
        chatInFront: () => inFront,
      },
      {
        onChunk: () => {},
        onThread: (thread) => thread.partial === null && ended(),
        onListChanged: () => {},
        onWorkingTabs: () => {},
      },
    );
    const reply = async (chatId: string | null, stop = false) => {
      const end = new Promise<void>((resolve) => (ended = resolve));
      const { id } = chats.send(chatId, "go", { seePage: false })!;
      if (stop) {
        await vi.waitFor(() => expect(chats.thread(id)?.partial).toBe("partial"));
        chats.stop(id);
      }
      await end;
      return id;
    };
    const unseen = (id: string) => store.summaries().find((chat) => chat.id === id)?.unseen;

    const away = await reply(null);
    expect(unseen(away)).toBe(true);
    chats.markSeen(away);
    expect(unseen(away)).toBe(false);

    inFront = true;
    expect(unseen(await reply(null))).toBe(false);
    inFront = false;

    stream = abortable;
    const stopped = await reply(null, true);
    expect(unseen(stopped)).toBe(false);
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

  it("says the model couldn't be reached when the connection fails", async () => {
    // What LangChain's OpenAI client says when there's no network, wrapped or not.
    const { chats, replyEnded } = setup(() => {
      throw new Error("Connection error.");
    });

    const ended = replyEnded();
    const { id } = send(chats, null, "first")!;
    await ended;
    expect(chats.thread(id)?.error).toBe("Couldn't reach the model. Check your connection and try again.");
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
