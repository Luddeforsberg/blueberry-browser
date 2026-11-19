import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { ReplyOptions, StreamReply } from "./agent";
import type { Tab } from "../tabs/Tab";
import { send, setup, tab } from "./chatsTesting";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats", () => {
  it("lets a job go without asking to a site the user named, in a chat or a task", async () => {
    const risky: boolean[] = [];
    const stream: StreamReply = async function* (_, __, { tools }) {
      const open = tools.find(({ name }) => name === "open_tab")!;
      risky.push(
        (await open.whyRisky!({ url: "https://en.wikipedia.org/wiki/Jet_engine" })) !== null,
        (await open.whyRisky!({ url: "https://elsewhere.example/" })) !== null,
      );
      yield "ok";
    };
    const { chats, replyEnded } = setup(stream, null);
    const ended = replyEnded();
    send(chats, null, "Find jet engines on wikipedia.org", false);
    await ended;
    await chats.runTask("task-1", "Then the same", () => {}, null, [], {
      earlier: [{ role: "user", content: "Find jet engines on wikipedia.org" }],
    });
    expect(risky).toEqual([false, true, false, true]);
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
      const chats = new Chats(
        store,
        reply,
        async () => null,
        {
          activeTab: () => allTabs[0],
          allTabs: () => allTabs,
          openBackgroundTab: () => {
            allTabs.push(opened);
            return opened;
          },
          // Refused, as for the tab the user is looking at, so it's still the chat's once the reply is over.
          closeTab: () => false,
          actionApproval: () => "always",
        },
        {
          onChunk: () => {},
          onThread: (thread) => {
            if (thread.partial === null) finished = true;
          },
          onListChanged: () => {},
          onWorkingTabs: () => {},
        },
      );

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

    it("stay on the job's tab when the user goes to another, with no tab named", async () => {
      const sentFrom = { ...tab(), id: "tab-sent", getTextWithFrames: async () => "the page it was sent from" } as unknown as Tab;
      const other = { ...tab(), id: "tab-other", getTextWithFrames: async () => "the user's next page" } as unknown as Tab;
      const own = {
        ...tab(),
        id: "tab-own",
        settled: async () => {},
        getTextWithFrames: async () => "the job's own tab",
      } as unknown as Tab;
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
      const chats = new Chats(
        new ChatStore(":memory:"),
        stream,
        async () => null,
        {
          activeTab: () => active,
          allTabs: () => open,
          openBackgroundTab: () => {
            open.push(own);
            return own;
          },
          closeTab: () => true,
          actionApproval: () => "risky",
        },
        {
          onChunk: () => {},
          onThread: (thread) => {
            if (thread.partial === null) onEnd();
          },
          onListChanged: () => {},
          onWorkingTabs: () => {},
        },
      );

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
      const chats = new Chats(
        new ChatStore(":memory:"),
        stream,
        async () => null,
        {
          activeTab: () => users,
          allTabs: () => [users],
          openBackgroundTab: () => users,
          closeTab: () => true,
          actionApproval: () => "risky",
        },
        {
          onChunk: () => {},
          onThread: (thread) => {
            if (thread.partial === null) onEnd();
          },
          onListChanged: () => {},
          onWorkingTabs: () => {},
        },
      );
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
        } as unknown as Tab,
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
        }),
      );
      chats = context.chats;

      const ended = context.replyEnded();
      const { id } = send(chats, null, "first")!;
      await ended;

      expect(chats.thread(id)?.messages.at(-1)?.content).not.toContain("page text");
    });
  });
});
