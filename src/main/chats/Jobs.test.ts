import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { StreamReply } from "./agent";
import type { Tab } from "../tabs/Tab";
import { SCREENSHOT, send, tab } from "./chatsTesting";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats", () => {
  describe("page tools", () => {
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
      chats = new Chats(
        store,
        reply,
        async () => null,
        {
          activeTab: () => null,
          allTabs: () => open,
          openBackgroundTab: (url) => {
            const opened = make(`tab-${open.length}`, url);
            open.push(opened);
            return opened;
          },
          closeTab: (id) => {
            closed.push(id);
            open.splice(
              open.findIndex((one) => one.id === id),
              1,
            );
            return true;
          },
          giveToUser: (id) => given.push(id),
          actionApproval: () => "always",
        },
        {
          onChunk: () => {},
          onThread: (thread) => (finished ||= thread.partial === null),
          onListChanged: () => {},
          onWorkingTabs: () => {},
        },
      );
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
      const own = {
        ...tab({ screenshot: () => new Promise((resolve) => (capture = resolve)) }),
        id: "tab-own",
        title: "Own",
        settled: async () => {},
      } as unknown as Tab;
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
      const chats = new Chats(
        store,
        stream,
        async () => null,
        {
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
        },
        {
          onChunk: () => {},
          onThread: (thread) => thread.partial === null && ended.push(thread.id),
          onListChanged: () => {},
          onWorkingTabs: () => {},
        },
      );
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
  });
});
