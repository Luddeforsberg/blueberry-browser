import type { MascotProfile } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { StreamReply } from "./agent";
import { replying, send, setup, tab } from "./chatsTesting";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats", () => {
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
    const SCOUT: MascotProfile = {
      ...BERRY,
      id: "scout",
      name: "Scout",
      instructions: "Finds prices.",
      sites: ["shop.example"],
      tools: ["visit", "click", "type"],
      deletedAt: null,
    };
    const narrowing = () => {
      const seen: { tools: string[]; asks: string }[] = [];
      let release = () => {};
      const stream: StreamReply = async function* (_, __, { tools, actionApproval }) {
        seen.push({ tools: tools.map(({ name }) => name), asks: actionApproval() });
        if (seen.length === 1) await new Promise<void>((resolve) => (release = resolve));
        yield `reply ${seen.length}`;
      };
      const store = new ChatStore(":memory:");
      const chats = new Chats(
        store,
        stream,
        async () => null,
        {
          activeTab: () => null,
          allTabs: () => [],
          openBackgroundTab: () => tab(),
          closeTab: () => true,
          actionApproval: () => "never",
        },
        { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} },
        (id) => (id === "scout" ? SCOUT : id === null ? BERRY : { ...SCOUT, id, deletedAt: 1 }),
      );
      return { chats, seen, release: () => release() };
    };

    it("never gets a tool or a laxer ask than both the mascot here and what it was sent with allow", async () => {
      const { chats, seen, release } = narrowing();
      chats.send(null, "Look", {
        seePage: false,
        mascotId: "scout",
        tools: ["visit", "read"],
        askAtLeast: "risky",
        from: "ChatGPT or Claude",
      });
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

    it("refuses a mascot that isn't here", () => {
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
