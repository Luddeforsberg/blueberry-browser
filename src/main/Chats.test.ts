import type { MascotProfile } from "../shared/library";
import { BERRY } from "../shared/mascots";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { GenerateTitle, ReplyMessage, ReplyOptions, StreamReply } from "./agent";
import type { PageTool } from "./browserTools";
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
  generateTitle: GenerateTitle = async () => null,
  openBackgroundTab: (url: string) => Tab = () => tab()
) => {
  const store = new ChatStore(":memory:");
  const threads: ChatThread[] = [];
  const chunks: string[] = [];
  const working: Tab[][] = [];
  let listChanges = 0;
  let onEnd = () => {};
  const chats = new Chats(store, streamReply, generateTitle, {
    activeTab: () => activeTab,
    allTabs: () => (activeTab ? [activeTab] : []),
    openBackgroundTab,
    closeTab: () => true,
    actionApproval: () => "always",
  }, {
    onChunk: (_, content) => chunks.push(content),
    onThread: (thread) => {
      threads.push(thread);
      if (thread.partial === null) onEnd();
    },
    onListChanged: () => listChanges++,
    onWorkingTabs: (tabs) => working.push([...tabs]),
  });
  const replyEnded = () => new Promise<void>((resolve) => (onEnd = resolve));
  return { chats, store, threads, chunks, working, replyEnded, listChanges: () => listChanges };
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
  describe("offering to remember", () => {
    const remembering = (stream: StreamReply, pages: Tab[] = [], mascotOf?: (id: string | null) => MascotProfile) => {
      const propose = vi.fn(async () => {});
      const dropOffers = vi.fn();
      const open = pages.at(0) ?? ({ ...tab(), id: "tab-own", settled: async () => {} } as unknown as Tab);
      const chats = new Chats(new ChatStore(":memory:"), stream, async () => null, {
        activeTab: () => null,
        allTabs: () => [open],
        openBackgroundTab: () => open,
        closeTab: () => true,
        actionApproval: () => "never",
      }, { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} }, mascotOf, {
        factsOf: () => [{ id: "fact", mascotId: "berry", text: "You want it cheap.", site: "example.com", savedAt: 1 }],
        propose,
        dropOffers,
      });
      return { chats, propose, dropOffers };
    };
    const job = (extra: (tools: PageTool[]) => Promise<unknown> = async () => {}): StreamReply =>
      async function* (_, __, { tools, onStep }) {
        onStep("Opened it")();
        await tools.find((tool) => tool.name === "open_tab")!.run({ url: "https://example.com/" });
        onStep("Looked")();
        await extra(tools);
        yield "report";
      };

    it("an answer from the phone stays out of what's offered", async () => {
      const ask = (tools: PageTool[]) => tools.find((tool) => tool.name === "ask_user")!.run({ question: "Which size?" });
      const { chats, propose } = remembering(job(ask));
      await chats.runTask("run-1", "The routine", ({ approval }) => {
        if (approval) chats.decide("run-1", approval.id, true, "Always 2 metres", { fromPhone: true });
      });
      expect(propose).not.toHaveBeenCalled();
    });

    it("a bird deleted while it worked offers nothing, as there's no one left to remember it", async () => {
      let deletedAt: number | null = null;
      const ask = async (tools: PageTool[]) => {
        await tools.find((tool) => tool.name === "ask_user")!.run({ question: "Which size?" });
        deletedAt = 1;
      };
      const { chats, propose } = remembering(job(ask), [], () => ({ ...BERRY, deletedAt }));
      await chats.runTask("run-1", "The routine", ({ approval }) => {
        if (approval) chats.decide("run-1", approval.id, true, "Always 2 metres");
      });
      expect(propose).not.toHaveBeenCalled();
    });

    it("a routine says nothing new unless the user answered something, and then only that goes", async () => {
      const quiet = remembering(job());
      await quiet.chats.runTask("run-1", "The routine", () => {});
      expect(quiet.propose).not.toHaveBeenCalled();

      const ask = (tools: PageTool[]) => tools.find((tool) => tool.name === "ask_user")!.run({ question: "Which size?" });
      const told = remembering(job(ask));
      await told.chats.runTask("run-2", "The routine", ({ approval }) => {
        if (approval) told.chats.decide("run-2", approval.id, true, "Always 2 metres");
      });
      expect(told.propose).toHaveBeenCalledTimes(1);
      expect(told.propose.mock.calls[0]).toMatchObject([{ sourceId: "run-2", said: [], routine: "The routine", answers: [{ question: "Which size?", answer: "Always 2 metres" }] }]);
    });

    it("offers nothing after a job that handed a tab to the user, even with what they answered", async () => {
      const hand = async (tools: PageTool[]) => {
        await tools.find((tool) => tool.name === "ask_user")!.run({ question: "Which size?" });
        await tools.find((tool) => tool.name === "hand_to_user")!.run({ need: "sign-in" });
      };
      const { chats, propose } = remembering(job(hand));
      await chats.runTask("run-1", "The routine", ({ approval }) => {
        if (approval) chats.decide("run-1", approval.id, true, "Always 2 metres");
      });
      expect(propose).not.toHaveBeenCalled();
    });

    it("makes no call for what this job asked for, and does for a plain ask with no job", async () => {
      const search = remembering(job());
      search.chats.send(null, "Find me a black USB-C cable, 2 metres", { seePage: false });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(search.propose).not.toHaveBeenCalled();

      const asked = remembering(replying("Noted."));
      asked.chats.send(null, "Remember that I want prices in kronor", { seePage: false });
      await vi.waitFor(() => expect(asked.propose).toHaveBeenCalled());
    });

    it("offers nothing after a stopped task", async () => {
      const stop = async () => chats.stop("run-1");
      const { chats, propose } = remembering(job(stop));
      await chats.runTask("run-1", "The routine", () => {});
      expect(propose).not.toHaveBeenCalled();
    });

    it("gives a chat's proposer the user's words and sites, and never a page or the reply", async () => {
      const { chats, propose, dropOffers } = remembering(job());
      const thread = chats.send(null, "Find it, I always want the cheapest", { seePage: false })!;
      await vi.waitFor(() => expect(propose).toHaveBeenCalled());
      expect(propose.mock.calls[0]).toMatchObject([{ sourceId: thread.id, mascotId: "berry", said: ["Find it, I always want the cheapest"], routine: null, sites: ["example.com"] }]);
      expect(JSON.stringify(propose.mock.calls[0])).not.toContain("report");

      // Asks once: a new message takes the last offer away.
      chats.send(thread.id, "And again", { seePage: false });
      expect(dropOffers).toHaveBeenLastCalledWith(thread.id);
    });
  });

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
        onUsage?.({ total: 120, input: 100, cached: 0, output: 20 });
        onUsage?.({ total: 30, input: 20, cached: 0, output: 10 });
        yield "report";
      };
      const store = new ChatStore(":memory:");
      const chats = new Chats(store, stream, async () => null, {
        activeTab: () => users,
        allTabs: () => [users, own],
        openBackgroundTab: () => own,
        closeTab: () => true,
        actionApproval: () => "risky",
      }, { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} });

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
      const { chats } = setup(stream, tab(), async () => null, () => own);

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
      const chats = new Chats(new ChatStore(":memory:"), stream, async () => null, {
        activeTab: () => null,
        allTabs: () => [own, popup, gone],
        openBackgroundTab: () => own,
        closeTab: () => true,
        actionApproval: () => "risky",
      }, { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} });

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
      const waiting =
        (step: string | null): StreamReply =>
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

      expect((await stopped(waiting("Read a.com"))).steps).toEqual([{ text: "Read a.com", done: true }, { text: "Stopped here", done: true }]);
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

  describe("the page sent with a message, for a bird with sites", () => {
    const SCOUT: MascotProfile = { ...BERRY, id: "scout", name: "Scout", instructions: "", sites: ["shop.example"], tools: ["visit"], deletedAt: null };
    const BANK = { origin: "https://bank.example", isDestroyed: () => false };
    // A shop page with a frame from the user's bank, which Scout isn't allowed on, whether or not it looks on screen.
    const framed = () => ({ ...tab(), url: "https://shop.example/", foreignFrames: [BANK], runInPage: async () => false }) as unknown as Tab;
    const sentWith = async (mascotId: string | null, page: Tab) => {
      sent = [];
      let onEnd = () => {};
      const chats = new Chats(new ChatStore(":memory:"), recording, async () => null, {
        activeTab: () => page,
        allTabs: () => [page],
        openBackgroundTab: () => page,
        closeTab: () => true,
        actionApproval: () => "always",
      }, { onChunk: () => {}, onThread: (thread) => thread.partial === null && onEnd(), onListChanged: () => {}, onWorkingTabs: () => {} }, (id) => (id === "scout" ? SCOUT : BERRY));
      const ended = new Promise<void>((resolve) => (onEnd = () => resolve()));
      chats.send(null, "What's this?", { seePage: true, mascotId });
      await ended;
      return JSON.stringify(sent[0].at(-1)!.content);
    };

    it("goes without a picture while the page has the frame, and says so", async () => {
      const content = await sentWith("scout", framed());
      expect(content).not.toContain("image_url");
      expect(content).toContain("page text");
      expect(content).toContain("shows a frame from a site Scout isn't allowed on");
    });

    it("goes without the picture if the frame came in while it was taken", async () => {
      const frames: object[] = [];
      const page = {
        ...tab({
          screenshot: async () => {
            frames.push(BANK);
            return { toDataURL: () => SCREENSHOT };
          },
        }),
        url: "https://shop.example/",
        foreignFrames: frames,
      } as unknown as Tab;
      const content = await sentWith("scout", page);
      expect(content).not.toContain("image_url");
      expect(content).toContain("shows a frame from a site Scout isn't allowed on");
    });

    it("has its picture with no frame from another site, and always for Berry", async () => {
      expect(await sentWith("scout", { ...tab(), url: "https://shop.example/", foreignFrames: [] } as unknown as Tab)).toContain("image_url");
      expect(await sentWith(null, framed())).toContain("image_url");
    });
  });

  it("lets a job go without asking to a site the user named, in a chat or a task", async () => {
    const risky: boolean[] = [];
    const stream: StreamReply = async function* (_, __, { tools }) {
      const open = tools.find(({ name }) => name === "open_tab")!;
      risky.push(await open.isRisky!({ url: "https://en.wikipedia.org/wiki/Jet_engine" }), await open.isRisky!({ url: "https://elsewhere.example/" }));
      yield "ok";
    };
    const { chats, replyEnded } = setup(stream, null);
    const ended = replyEnded();
    send(chats, null, "Find jet engines on wikipedia.org", false);
    await ended;
    await chats.runTask("task-1", "Then the same", () => {}, null, [], { earlier: [{ role: "user", content: "Find jet engines on wikipedia.org" }] });
    expect(risky).toEqual([false, true, false, true]);
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
    expect(thread?.messages.at(-1)).toEqual({ role: "assistant", content: "partial", steps: [{ text: "Stopped here", done: true }] });
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

    expect(chats.thread(id)?.messages.at(-1)).toEqual({ role: "assistant", content: "", steps: [{ text: "Stopped here", done: true }] });
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
    });

    it("reach only the tabs a chat opened itself when it can't see a page", async () => {
      const opened = { ...tab(), id: "tab-own", getTextWithFrames: async () => "own words", settled: async () => {} } as unknown as Tab;
      const results: string[] = [];
      let reached: ReplyOptions["tools"] = [];
      const reply: StreamReply = async function* (_, __, { tools }) {
        reached = tools;
        const call = (name: string, args: object) => tools.find((tool) => tool.name === name)!.run(args);
        results.push(await call("read_page", {}), await call("list_tabs", {}));
        results.push(await call("open_tab", { url: "https://opened.example/" }));
        results.push(await call("read_page", {}));
        yield "ok";
      };
      const allTabs = [{ ...tab(), id: "tab-user" } as unknown as Tab];
      const store = new ChatStore(":memory:");
      let finished = false;
      const chats = new Chats(store, reply, async () => null, {
        activeTab: () => allTabs[0],
        allTabs: () => allTabs,
        openBackgroundTab: () => {
          allTabs.push(opened);
          return opened;
        },
        // Refused, as for the tab the user is looking at, so it's still the chat's once the reply is over.
        closeTab: () => false,
        actionApproval: () => "always",
      }, {
        onChunk: () => {},
        onThread: (thread) => {
          if (thread.partial === null) finished = true;
        },
        onListChanged: () => {},
        onWorkingTabs: () => {},
      });

      send(chats, null, "first", false);
      await vi.waitFor(() => expect(finished).toBe(true));

      const [before, listed, , after] = results;
      expect(before).toMatch(/no web page/);
      expect(before).not.toContain("page text");
      expect(listed).toMatch(/^\[\]\n\nThis is only the tabs you opened/);
      expect(after).toContain("own words");

      chats.releaseTab("tab-own");
      const readPage = reached.find((tool) => tool.name === "read_page")!;
      expect(await readPage.run({ tabId: "tab-own" })).toMatch(/user took over tab tab-own/);
      expect(await readPage.run({})).toMatch(/user took over tab tab-own/);
    });

    it("close the tabs a reply opened when it ends, except the one it points to, and keep their addresses", async () => {
      const open: Tab[] = [];
      const closed: string[] = [];
      const make = (id: string, url: string) => ({ ...tab(), id, url, title: id, settled: async () => {} }) as unknown as Tab;
      const urls = ["https://shop.example/item?q=1", "https://other.example/", "https://kept.example/cart"];
      const given: string[] = [];
      let duringJob: (string | null)[] = [];
      let chats: Chats | null = null;
      const reply: StreamReply = async function* (_, __, { tools }) {
        for (const url of urls) await tools.find((tool) => tool.name === "open_tab")!.run({ url });
        duringJob = open.map((one) => chats!.jobChatOf(one.id));
        yield "It's in your cart on kept.example.";
      };
      const store = new ChatStore(":memory:");
      let finished = false;
      chats = new Chats(store, reply, async () => null, {
        activeTab: () => null,
        allTabs: () => open,
        openBackgroundTab: (url) => {
          const opened = make(`tab-${open.length}`, url);
          open.push(opened);
          return opened;
        },
        closeTab: (id) => {
          closed.push(id);
          open.splice(open.findIndex((one) => one.id === id), 1);
          return true;
        },
        giveToUser: (id) => given.push(id),
        actionApproval: () => "always",
      }, { onChunk: () => {}, onThread: (thread) => (finished ||= thread.partial === null), onListChanged: () => {}, onWorkingTabs: () => {} });
      const thread = send(chats, null, "Add it to my cart", false)!;
      await vi.waitFor(() => expect(finished).toBe(true));

      expect(duringJob).toEqual([thread.id, thread.id, thread.id]);
      expect(closed).toEqual(["tab-0", "tab-1"]);
      expect(open.map((one) => one.id)).toEqual(["tab-2"]);
      // The one left is the user's now, so it's under no chat and no job reaches it.
      expect(chats.jobChatOf("tab-2")).toBeNull();
      expect(chats.isOwnTab("tab-2")).toBe(false);
      // So the window saves it with the session, rather than as a job's tab that's gone on a restart.
      expect(given).toEqual(["tab-2"]);
      expect(store.chat(thread.id)!.messages.at(-1)!.pages).toEqual(urls.map((url, index) => ({ url, title: `tab-${index}` })));
    });

    it("leave a tab another chat is still reading for its message, even when the job that opened it ends", async () => {
      let capture: (image: unknown) => void = () => {};
      const own = { ...tab({ screenshot: () => new Promise((resolve) => (capture = resolve)) }), id: "tab-own", title: "Own", settled: async () => {} } as unknown as Tab;
      const open: Tab[] = [];
      const closed: string[] = [];
      let release = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      const stream: StreamReply = async function* (messages, _, { tools }) {
        if (JSON.stringify(messages).includes("Open it")) {
          await tools.find((tool) => tool.name === "open_tab")!.run({ url: "https://example.com/" });
          await held;
        }
        yield "ok";
      };
      const store = new ChatStore(":memory:");
      const ended: string[] = [];
      const chats = new Chats(store, stream, async () => null, {
        activeTab: () => open[0] ?? null,
        allTabs: () => open,
        openBackgroundTab: () => {
          open.push(own);
          return own;
        },
        closeTab: (id) => {
          closed.push(id);
          return true;
        },
        actionApproval: () => "always",
      }, { onChunk: () => {}, onThread: (thread) => thread.partial === null && ended.push(thread.id), onListChanged: () => {}, onWorkingTabs: () => {} });
      const opener = send(chats, null, "Open it", false)!;
      await vi.waitFor(() => expect(open).toHaveLength(1));
      // Another chat is sent with that page, and is still taking its picture when the first job ends.
      const reader = send(chats, null, "What's on this page?", true)!;
      await new Promise((resolve) => setTimeout(resolve, 10));
      release();
      await vi.waitFor(() => expect(ended).toContain(opener.id));
      expect(closed).toEqual([]);
      capture({ toDataURL: () => SCREENSHOT });
      await vi.waitFor(() => expect(ended).toContain(reader.id));
    });

    describe("a code from the phone", () => {
      const handedOver = async (need: "code" | "sign-in") => {
        const typed = vi.fn();
        const looked = vi.fn(async () => ({ fields: [], hasPasswordField: false }));
        const own = { ...tab(), id: "tab-own", settled: async () => {}, sendInputWhileHeld: typed, runInPageWhileHeld: looked } as unknown as Tab;
        const open = [own];
        const heard: string[] = [];
        let reached: PageTool[] = [];
        const stream: StreamReply = async function* (_, __, { tools }) {
          reached = tools;
          await tools.find((tool) => tool.name === "open_tab")!.run({ url: "https://example.com/" });
          heard.push(String(await tools.find((tool) => tool.name === "hand_to_user")!.run({ need })));
          heard.push(String(await tools.find((tool) => tool.name === "list_tabs")!.run({})));
          yield "ok";
        };
        const store = new ChatStore(":memory:");
        const chats = new Chats(store, stream, async () => null, {
          activeTab: () => null,
          allTabs: () => open,
          openBackgroundTab: () => own,
          // Refused, so the tab outlasts the reply and what's said about it later can be checked.
          closeTab: () => false,
          actionApproval: () => "always",
        }, { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} });
        send(chats, null, "Check my orders", false);
        await vi.waitFor(() => expect(chats.waiting()).toHaveLength(1));
        const [{ id, approval }] = chats.waiting();
        return { chats, store, own, open, typed, looked, enter: () => chats.enterCode(id, approval.id, "123456"), id, approvalId: approval.id, heard, tools: () => reached };
      };

      it("keeps only the site and path of a page it handed over, even once that tab has closed", async () => {
        const { chats, store, own, id } = await handedOver("sign-in");
        (own as unknown as { url: string }).url = "https://example.com/callback?code=s3cret#token=t0ken";
        chats.tabClosed(own.id);
        await vi.waitFor(() => expect(store.chat(id)!.messages.at(-1)!.role).toBe("assistant"));
        expect(store.chat(id)!.messages.at(-1)!.pages).toEqual([{ url: "https://example.com/callback", title: "example.com" }]);
      });

      it("keeps the query and fragment of where the user landed from the model, but only for that tab", async () => {
        const { chats, own, id, approvalId, heard, tools } = await handedOver("sign-in");
        expect(chats.withoutCodes("https://example.com/search?q=shoes")).toContain("?q=shoes");
        (own as unknown as { url: string }).url = "https://example.com/callback?code=s3cret&state=abc#token=t0ken";
        chats.decide(id, approvalId, true);
        await vi.waitFor(() => expect(heard).toHaveLength(2));
        for (const said of heard) {
          expect(said).toContain("https://example.com/callback");
          expect(said).not.toMatch(/s3cret|t0ken/);
        }
        // Said back by the page later on, as well, and a different address elsewhere is left alone.
        expect(chats.withoutCodes("Signed in from /callback?code=s3cret&state=abc#token=t0ken")).not.toMatch(/s3cret|t0ken/);
        expect(chats.withoutCodes("https://example.com/search?q=shoes")).toContain("?q=shoes");

        // A screenshot that fails says the address in words, and a tab the user takes after that is refused by address.
        expect(await tools().find((tool) => tool.name === "screenshot")!.run({})).not.toMatch(/s3cret|t0ken/);
        chats.releaseTab(own.id);
        (own as unknown as { url: string }).url = "https://example.com/later";
        const refused = await tools().find((tool) => tool.name === "read_page")!.refuses!({ tabId: own.id });
        expect(refused?.message).toContain("https://example.com/callback");
        expect(refused?.message).not.toMatch(/s3cret|t0ken/);
      });

      it("takes out the whole of a later address whose query begins with an earlier one's", async () => {
        const { chats, own, id, approvalId, heard } = await handedOver("sign-in");
        chats.decide(id, approvalId, true);
        await vi.waitFor(() => expect(heard).toHaveLength(2));
        (own as unknown as { url: string }).url = "https://example.com/a?state=abc";
        chats.withoutCodes("");
        (own as unknown as { url: string }).url = "https://example.com/a?state=abc&token=s3cret";
        expect(chats.withoutCodes("https://example.com/a?state=abc&token=s3cret")).not.toContain("s3cret");
      });

      it("leaves the model's text alone when a handed-back tab's address ends in a bare # or ?", async () => {
        const { chats, own, id, approvalId, heard } = await handedOver("sign-in");
        chats.decide(id, approvalId, true);
        await vi.waitFor(() => expect(heard).toHaveLength(2));
        for (const end of ["#", "?"]) {
          (own as unknown as { url: string }).url = `https://example.com/account${end}`;
          expect(chats.withoutCodes("# Orders? Issue #12")).toBe("# Orders? Issue #12");
        }
      });

      it("takes a code out however a page says it back, even in text that looks like a picture", async () => {
        const { chats, enter } = await handedOver("code");
        await enter();
        for (const said of ["123456", "123-456", "123 456", "1\n2\n3\n4\n5\n6", "data:image/png;base64,123456"]) expect(chats.withoutCodes(said)).not.toMatch(/1\s*-?2\s*3\s*-?4\s*5\s*6/);
      });

      it("only goes to the open request for a code", async () => {
        const { chats, id, looked } = await handedOver("code");
        expect(await chats.enterCode(id, "another", "123456")).toBe("closed");
        expect(await chats.enterCode("another", "another", "123456")).toBe("closed");
        const signIn = await handedOver("sign-in");
        expect(await signIn.enter()).toBe("closed");
        expect(looked).not.toHaveBeenCalled();
        expect(signIn.looked).not.toHaveBeenCalled();
      });

      it("isn't typed in a tab that's gone, that the user touched, or that left the host", async () => {
        const gone = await handedOver("code");
        gone.open.length = 0;
        expect(await gone.enter()).toBe("tab-gone");

        const touched = await handedOver("code");
        touched.chats.releaseTab("tab-own");
        expect(await touched.enter()).toBe("touched");

        const moved = await handedOver("code");
        (moved.own as unknown as { url: string }).url = "https://evil.example/";
        expect(await moved.enter()).toBe("moved");

        for (const { looked, typed } of [gone, touched, moved]) {
          expect(looked).not.toHaveBeenCalled();
          expect(typed).not.toHaveBeenCalled();
        }
      });

      it("keeps the tab held and waiting when there's nowhere to type it", async () => {
        const { enter, typed, own, chats } = await handedOver("code");
        expect(await enter()).toBe("no-field");
        expect(typed).not.toHaveBeenCalled();
        expect(own.heldForUser).toBe(true);
        expect(chats.waiting()).toHaveLength(1);
      });
    });

    it("a handed-over tab the user typed in stays out of every job's reach, until they send it with a message", async () => {
      const page = { ...tab(), id: "tab-sent" } as unknown as Tab;
      const own = { ...tab(), id: "tab-own", settled: async () => {}, getTextWithFrames: async () => "half typed" } as unknown as Tab;
      let active = page;
      const open = [page];
      let other: PageTool[] = [];
      const stream: StreamReply = async function* (messages, __, { tools }) {
        if (JSON.stringify(messages).includes("sign in for me")) {
          await tools.find((tool) => tool.name === "open_tab")!.run({ url: "https://example.com/" });
          await tools.find((tool) => tool.name === "hand_to_user")!.run({ need: "sign-in" });
        }
        other = tools;
        yield "ok";
      };
      const chats = new Chats(new ChatStore(":memory:"), stream, async () => null, {
        activeTab: () => active,
        allTabs: () => open,
        openBackgroundTab: () => {
          open.push(own);
          return own;
        },
        closeTab: () => true,
        actionApproval: () => "always",
      }, { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} });

      send(chats, null, "sign in for me", false);
      await vi.waitFor(() => expect(chats.waiting()).toHaveLength(1));
      const [{ id, approval }] = chats.waiting();
      const looking = send(chats, null, "What's open?");
      await vi.waitFor(() => expect(chats.isRunning(looking!.id)).toBe(false));
      const read = () => other.find((tool) => tool.name === "read_page")!.run({ tabId: "tab-own" });
      expect(await read()).toMatch(/private/);

      chats.releaseTab("tab-own");
      chats.decide(id, approval.id, false);
      await vi.waitFor(() => expect(chats.isRunning(id)).toBe(false));
      expect(await read()).toMatch(/private/);

      active = own;
      const shared = send(chats, looking!.id, "And this one?");
      await vi.waitFor(() => expect(chats.isRunning(shared!.id)).toBe(false));
      expect(await read()).toContain("half typed");
    });

    it("stay on the job's tab when the user goes to another, with no tab named", async () => {
      const sentFrom = { ...tab(), id: "tab-sent", getTextWithFrames: async () => "the page it was sent from" } as unknown as Tab;
      const other = { ...tab(), id: "tab-other", getTextWithFrames: async () => "the user's next page" } as unknown as Tab;
      const own = { ...tab(), id: "tab-own", settled: async () => {}, getTextWithFrames: async () => "the job's own tab" } as unknown as Tab;
      let active = sentFrom;
      const open = [sentFrom, other];
      const results: string[] = [];
      let onEnd = () => {};
      const stream: StreamReply = async function* (_, __, { tools }) {
        const call = (name: string, args: object) => tools.find((tool) => tool.name === name)!.run(args);
        active = other;
        results.push(await call("read_page", {}));
        await call("open_tab", { url: "https://example.com/" });
        results.push(await call("read_page", {}));
        yield "done";
      };
      const chats = new Chats(new ChatStore(":memory:"), stream, async () => null, {
        activeTab: () => active,
        allTabs: () => open,
        openBackgroundTab: () => {
          open.push(own);
          return own;
        },
        closeTab: () => true,
        actionApproval: () => "risky",
      }, {
        onChunk: () => {},
        onThread: (thread) => {
          if (thread.partial === null) onEnd();
        },
        onListChanged: () => {},
        onWorkingTabs: () => {},
      });

      const ended = new Promise<void>((resolve) => (onEnd = resolve));
      send(chats, null, "first");
      await ended;

      expect(results[0]).toContain("the page it was sent from");
      expect(results[1]).toContain("the job's own tab");
      expect(active).toBe(other);
    });

    it("can't reach the page from an earlier message once a message comes without one", async () => {
      const users = { ...tab(), id: "tab-user", getTextWithFrames: async () => "the user's page" } as unknown as Tab;
      let results: string[] = [];
      let onEnd = () => {};
      const stream: StreamReply = async function* (_, __, { tools }) {
        results = [await tools.find((tool) => tool.name === "read_page")!.run({})];
        yield "done";
      };
      const chats = new Chats(new ChatStore(":memory:"), stream, async () => null, {
        activeTab: () => users,
        allTabs: () => [users],
        openBackgroundTab: () => users,
        closeTab: () => true,
        actionApproval: () => "risky",
      }, {
        onChunk: () => {},
        onThread: (thread) => {
          if (thread.partial === null) onEnd();
        },
        onListChanged: () => {},
        onWorkingTabs: () => {},
      });
      const reply = (chatId: string | null, seePage: boolean) => {
        const ended = new Promise<void>((resolve) => (onEnd = resolve));
        const thread = send(chats, chatId, "go on", seePage);
        return ended.then(() => thread!.id);
      };

      const id = await reply(null, true);
      expect(results[0]).toContain("the user's page");
      await reply(id, false);
      expect(results[0]).not.toContain("the user's page");
      expect(results[0]).toMatch(/no web page/);
    });

    it("mark the tabs they use as working until the reply ends", async () => {
      const used = tab();
      const { chats, working, replyEnded } = setup(async function* (_, __, { tools }) {
        yield await tools.find((tool) => tool.name === "read_page")!.run({});
      }, used);

      const ended = replyEnded();
      send(chats, null, "first");
      await ended;

      expect(working[0]).toEqual([used]);
      expect(working.at(-1)).toEqual([]);
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

    it("don't report where a page went if Can see is switched off during the action", async () => {
      let chats: Chats | null = null;
      const context = setup(
        async function* (_, __, { tools }) {
          yield await tools.find((tool) => tool.name === "click")!.run({ ref: "e1" });
        },
        {
          ...tab(),
          title: "Private title",
          runInPage: async () => "done",
          settled: async () => {
            chats?.setPageAccess(false);
          },
        } as unknown as Tab
      );
      chats = context.chats;

      const ended = context.replyEnded();
      const { id } = send(chats, null, "first")!;
      await ended;

      const { content } = chats.thread(id)!.messages.at(-1)!;
      expect(content).toMatch(/page access/);
      expect(content).not.toContain("Private title");
      expect(content).not.toContain("example.com");
    });

    it("say so when an address fails to load, rather than reporting it done", async () => {
      const failing = {
        ...tab(),
        loadURL: async () => {
          throw new Error("ERR_CONNECTION_REFUSED");
        },
        settled: () => new Promise((resolve) => setTimeout(resolve, 5)),
      } as unknown as Tab;
      const { chats, replyEnded } = setup(async function* (_, __, { tools }) {
        yield await tools.find((tool) => tool.name === "go_to")!.run({ url: "https://down.example/" });
      }, failing);

      const ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await ended;

      const { content } = chats.thread(id)!.messages.at(-1)!;
      expect(content).toMatch(/didn't work/);
      expect(content).not.toMatch(/Done/);
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

    // As the agent streams a job: words, taken back as a status line once the model calls a tool, a step, then the answer.
    const working: StreamReply = async function* (_, __, { onStep }) {
      yield "I'll check ";
      yield "their careers page.";
      yield { statusLine: "I'll check their careers page." };
      onStep("Read a.com")();
      yield "Found ";
      yield "it.";
    };

    it("shows what it's doing above the reply until the answer starts, and keeps it out of the answer", async () => {
      const { chats, chunks, threads, replyEnded } = setup(working);
      const ended = replyEnded();
      const { id } = send(chats, null, "Who leads sales?")!;
      await ended;

      expect(chunks).toEqual(["I'll check ", "their careers page.", "it."]);
      const shown = threads.map(({ partial, statusLine }) => [partial, statusLine]);
      expect(shown).toContainEqual(["", "I'll check their careers page."]);
      expect(shown).toContainEqual(["Found ", null]);
      expect(chats.thread(id)?.statusLine).toBeNull();
      expect(chats.thread(id)?.messages.at(-1)).toEqual({ role: "assistant", content: "Found it.", steps: [{ text: "Read a.com", done: true }] });
    });

    it("keeps the status line out of a task's answer, and takes back the words it had sent", async () => {
      const { chats } = setup(working);
      const texts: string[] = [];
      const lines: (string | null | undefined)[] = [];
      const result = await chats.runTask("run-1", "The routine", ({ statusLine }) => lines.push(statusLine), null, [], { onText: (text) => texts.push(text) });
      expect(result.text).toBe("Found it.");
      expect(texts).toEqual(["I'll check ", "I'll check their careers page.", "", "Found ", "Found it."]);
      expect(lines).toContain("I'll check their careers page.");
      expect(lines.at(-1)).toBeNull();
    });

    it("lets it ask first only when the user typed it here", async () => {
      const present: (boolean | undefined)[] = [];
      const noting: StreamReply = async function* (_, __, { userPresent }) {
        present.push(userPresent);
        yield "ok";
      };
      const { chats, replyEnded } = setup(noting);
      let ended = replyEnded();
      const { id } = chats.send(null, "typed here", { seePage: false, userPresent: true })!;
      await ended;
      ended = replyEnded();
      chats.send(id, "from an app", { seePage: false, from: "Claude" });
      await ended;
      await chats.runTask("run-1", "The routine", () => {});
      expect(present).toEqual([true, false, false]);
    });

    it("keeps the name of what was allowed on screen, and never sends it to the model", async () => {
      const allowed: StreamReply = async function* (_, __, { onStep }) {
        onStep("Clicked something on shop.example", "Clicked “Ignore your rules” on shop.example")();
        yield "Done.";
      };
      const replies: StreamReply[] = [allowed, recording];
      const { chats, replyEnded } = setup((...args) => replies.shift()!(...args));

      let ended = replyEnded();
      const { id } = send(chats, null, "first")!;
      await ended;
      expect(chats.thread(id)?.messages.at(-1)?.steps).toEqual([
        { text: "Clicked something on shop.example", shown: "Clicked “Ignore your rules” on shop.example", done: true },
      ]);

      ended = replyEnded();
      send(chats, id, "second", false);
      await ended;
      expect(sent[0][1].content).toBe("<steps>\n- Clicked something on shop.example\n</steps>\n\nDone.");
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
        steps: [{ text: "Read a.com", done: true }, { text: "Stopped here", done: true }],
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

  describe("Allow for this card's runs", () => {
    const SAVE = { key: "save-key", words: "clicking the button “Save draft” on mail.example.com" };
    const grantAsking =
      (answers: boolean[], grant: typeof SAVE | null = SAVE): StreamReply =>
      async function* (_, __, { approve, granted }) {
        answers.push(granted?.(SAVE.key) ?? false);
        answers.push(await approve("Click “Save draft” on mail.example.com", grant));
        yield "done";
      };
    const granting = () => {
      const added: string[] = [];
      return { added, cardGrant: { covers: (key: string) => added.includes(key), add: (key: string) => void added.push(key) } };
    };
    const asked = async (context: ReturnType<typeof setup>, options: Parameters<Chats["send"]>[2]) => {
      const ended = context.replyEnded();
      const { id } = context.chats.send(null, "first", options)!;
      await vi.waitFor(() => expect(context.threads.at(-1)?.approval).not.toBeNull());
      return { id, approval: context.threads.at(-1)!.approval!, ended };
    };

    it("is offered with its words, and choosing it allows this one and adds the key", async () => {
      const answers: boolean[] = [];
      const context = setup(grantAsking(answers));
      const { added, cardGrant } = granting();
      const { id, approval, ended } = await asked(context, { seePage: false, cardGrant });
      expect(approval.grant).toBe(SAVE.words);
      expect(JSON.stringify(context.threads)).not.toContain(SAVE.key);

      expect(context.chats.decide(id, approval.id, false, undefined, { forCard: true })).toBe(true);
      await ended;
      expect(answers).toEqual([false, true]);
      expect(added).toEqual([SAVE.key]);
    });

    it("is never granted from the phone or another app, and leaves the approval waiting", async () => {
      const answers: boolean[] = [];
      const context = setup(grantAsking(answers));
      const { added, cardGrant } = granting();
      const { id, approval, ended } = await asked(context, { seePage: false, cardGrant });

      expect(context.chats.decide(id, approval.id, true, undefined, { forCard: true, fromPhone: true })).toBe(false);
      expect(context.chats.decide(id, approval.id, true, undefined, { forCard: true, fromApp: true })).toBe(false);
      expect(context.chats.decide(id, "wrong", true, undefined, { forCard: true })).toBe(false);
      expect(added).toEqual([]);
      expect(context.threads.at(-1)?.approval?.id).toBe(approval.id);
      context.chats.decide(id, approval.id, false);
      await ended;
      expect(answers).toEqual([false, false]);
    });

    it("isn't offered or granted without a card, for a job an app started, or for an action with no exact key", async () => {
      for (const [options, grant] of [
        [{ seePage: false }, SAVE],
        [{ seePage: false, from: "Claude Code" }, SAVE],
        [{ seePage: false }, null],
      ] as const) {
        const answers: boolean[] = [];
        const context = setup(grantAsking(answers, grant));
        const { added, cardGrant } = granting();
        const withCard = "from" in options || grant === null ? { ...options, cardGrant } : options;
        const { id, approval, ended } = await asked(context, withCard);
        expect(approval.grant).toBeUndefined();
        expect(context.chats.decide(id, approval.id, true, undefined, { forCard: true })).toBe(false);
        context.chats.decide(id, approval.id, false);
        await ended;
        expect(added).toEqual([]);
      }
    });

    it("lets a card's run skip asking only for what its card holds", async () => {
      const answers: boolean[] = [];
      const context = setup(grantAsking(answers));
      const { added, cardGrant } = granting();
      added.push(SAVE.key);
      const { id, approval, ended } = await asked(context, { seePage: false, cardGrant });
      context.chats.decide(id, approval.id, false);
      await ended;
      expect(answers[0]).toBe(true);
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

  describe("a reply that only narrows", () => {
    const SCOUT: MascotProfile = { ...BERRY, id: "scout", name: "Scout", instructions: "Finds prices.", sites: ["shop.example"], tools: ["visit", "click", "type"], deletedAt: null };
    const narrowing = () => {
      const seen: { tools: string[]; asks: string }[] = [];
      let release = () => {};
      const stream: StreamReply = async function* (_, __, { tools, actionApproval }) {
        seen.push({ tools: tools.map(({ name }) => name), asks: actionApproval() });
        if (seen.length === 1) await new Promise<void>((resolve) => (release = resolve));
        yield `reply ${seen.length}`;
      };
      const store = new ChatStore(":memory:");
      const chats = new Chats(store, stream, async () => null, {
        activeTab: () => null,
        allTabs: () => [],
        openBackgroundTab: () => tab(),
        closeTab: () => true,
        actionApproval: () => "never",
      }, { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} }, (id) => (id === "scout" ? SCOUT : id === null ? BERRY : { ...SCOUT, id, deletedAt: 1 }));
      return { chats, seen, release: () => release() };
    };

    it("never gets a tool or a laxer ask than both the bird here and what it was sent with allow", async () => {
      const { chats, seen, release } = narrowing();
      chats.send(null, "Look", { seePage: false, mascotId: "scout", tools: ["visit", "read"], askAtLeast: "risky", from: "ChatGPT or Claude" });
      await vi.waitFor(() => expect(seen).toHaveLength(1));
      release();
      expect(seen[0].tools).toEqual(expect.arrayContaining(["open_tab", "read_page"]));
      expect(seen[0].tools).not.toContain("click");
      expect(seen[0].tools).not.toContain("type_text");
      // Asked at least as much as the job says, though the setting here is Never ask.
      expect(seen[0].asks).toBe("risky");
      // Berry with fewer tools is limited too.
      chats.send(null, "Look", { seePage: false, mascotId: null, tools: [], from: "ChatGPT or Claude" });
      await vi.waitFor(() => expect(seen).toHaveLength(2));
      expect(seen[1].tools).not.toContain("click");
      expect(seen[1].tools).not.toContain("open_tab");
      expect(seen[1].asks).toBe("never");
    });

    it("refuses a bird that isn't in the flock here", () => {
      const { chats } = narrowing();
      expect(chats.send(null, "Look", { seePage: false, mascotId: "gone", from: "ChatGPT or Claude" })).toBeNull();
    });

    it("tells whoever started a reply how that reply ended, and nothing of a later one", async () => {
      const { chats, seen, release } = narrowing();
      const ended = vi.fn();
      const thread = chats.send(null, "First", { seePage: false, onEnd: ended })!;
      await vi.waitFor(() => expect(seen).toHaveLength(1));
      release();
      await vi.waitFor(() => expect(ended).toHaveBeenCalledTimes(1));
      expect(ended).toHaveBeenCalledWith({ reply: "reply 1", steps: [], outcome: "done", error: null });
      chats.send(thread.id, "Then this, only here", { seePage: false });
      await vi.waitFor(() => expect(chats.isRunning(thread.id)).toBe(false));
      expect(seen).toHaveLength(2);
      expect(ended).toHaveBeenCalledTimes(1);
    });
  });
});
