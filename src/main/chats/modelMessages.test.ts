import type { MascotProfile } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { ReplyMessage, StreamReply } from "./agent";
import type { Tab } from "../tabs/Tab";
import { SCREENSHOT, send, setup, tab } from "./chatsTesting";
import { defined } from "../../shared/testing";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

let sent: ReplyMessage[][];
const recording: StreamReply = async function* (messages) {
  sent.push(messages);
  yield "ok";
};

beforeEach(() => {
  sent = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats", () => {
  it("sends the history, with the page only on the newest message", async () => {
    const { chats, replyEnded } = setup(recording);

    let ended = replyEnded();
    const { id } = send(chats, null, "first")!;
    await ended;
    ended = replyEnded();
    send(chats, id, "second");
    await ended;

    const second = defined(sent[1]);
    expect(second.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(defined(second[0]).content).toBe("first");
    expect(JSON.stringify(defined(second[2]).content)).toContain(SCREENSHOT);
    expect(JSON.stringify(defined(second[2]).content)).toContain("page text");
    expect(JSON.stringify(defined(second[2]).content)).toContain("second");
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
        }),
      );
      chats = context.chats;
      const ended = context.replyEnded();
      send(chats, null, "first");
      await ended;
      expect(sent[0]).toEqual([{ role: "user", content: "first" }]);
    }
  });

  describe("the page sent with a message, for a mascot with sites", () => {
    const SCOUT: MascotProfile = {
      ...BERRY,
      id: "scout",
      name: "Scout",
      instructions: "",
      sites: ["shop.example"],
      tools: ["visit"],
      deletedAt: null,
    };
    const BANK = { origin: "https://bank.example", isDestroyed: () => false };
    // A shop page with a frame from the user's bank, which Scout isn't allowed on, whether or not it looks on screen.
    const framed = () =>
      ({ ...tab(), url: "https://shop.example/", foreignFrames: [BANK], runInPage: async () => false }) as unknown as Tab;
    const sentWith = async (mascotId: string | null, page: Tab) => {
      sent = [];
      let onEnd = () => {};
      const chats = new Chats(
        new ChatStore(":memory:"),
        recording,
        async () => null,
        {
          activeTab: () => page,
          allTabs: () => [page],
          openBackgroundTab: () => page,
          closeTab: () => true,
          actionApproval: () => "always",
        },
        { onChunk: () => {}, onThread: (thread) => thread.partial === null && onEnd(), onListChanged: () => {}, onWorkingTabs: () => {} },
        (id) => (id === "scout" ? SCOUT : BERRY),
      );
      const ended = new Promise<void>((resolve) => (onEnd = () => resolve()));
      chats.send(null, "What's this?", { seePage: true, mascotId });
      await ended;
      return JSON.stringify(defined(sent[0]).at(-1)!.content);
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
      expect(await sentWith("scout", { ...tab(), url: "https://shop.example/", foreignFrames: [] } as unknown as Tab)).toContain(
        "image_url",
      );
      expect(await sentWith(null, framed())).toContain("image_url");
    });
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
      }),
    );

    const ended = replyEnded();
    send(chats, null, "first");
    await ended;

    expect(JSON.stringify(defined(sent[0]?.[0]).content)).toContain("first");
    expect(JSON.stringify(defined(sent[0]?.[0]).content)).not.toContain("image_url");
  });
});
