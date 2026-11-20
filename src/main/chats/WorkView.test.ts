import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { StreamReply } from "./agent";
import type { PageTool } from "../tools/browserTools";
import type { Tab } from "../tabs/Tab";
import { fakeTab } from "./attachedTabsTesting";
import { defined } from "../../shared/testing";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Each reply runs the next of `replies` with its tools, then ends. The tab it opens starts at shop.example, and stays
// open when the reply ends so where it is can still be looked at.
const setup = (replies: Array<(tools: PageTool[]) => Promise<void>>) => {
  const opened = fakeTab("tab-opened", "https://shop.example/") as Tab & { url: string };
  const tabs: Tab[] = [];
  let ended = () => {};
  const stream: StreamReply = async function* (_, __, { tools }) {
    await defined(replies.shift())(tools);
    yield "ok";
  };
  const chats = new Chats(
    new ChatStore(":memory:"),
    stream,
    async () => null,
    {
      activeTab: () => null,
      allTabs: () => tabs,
      openBackgroundTab: () => {
        tabs.push(opened);
        return opened;
      },
      closeTab: () => false,
      actionApproval: () => "risky",
    },
    {
      onChunk: () => {},
      onThread: (thread) => {
        if (thread.partial === null) ended();
      },
      onListChanged: () => {},
      onWorkingTabs: () => {},
    },
  );
  // The reply's tools run once `send` has returned, so its chat's id is known by then.
  let chatId = "";
  const reply = async (to: string | null, text: string) => {
    const done = new Promise<void>((resolve) => (ended = resolve));
    chatId = chats.send(to, text, { seePage: false })?.id ?? "";
    await done;
    return chatId;
  };
  return { chats, opened, reply, chatId: () => chatId };
};

const call = (tools: PageTool[], name: string, args: object) => defined(tools.find((tool) => tool.name === name)).run(args);
// Whether opening this address would ask first, in the default mode.
const asks = async (tools: PageTool[], url: string) =>
  (await defined(tools.find((tool) => tool.name === "open_tab")).whyRisky?.({ url })) != null;

describe("where a chat has been", () => {
  it("never counts a site the user took a tab to, however often the working view is read", async () => {
    const asked: boolean[] = [];
    let seen: unknown;
    const { chats, opened, reply, chatId } = setup([
      async (tools) => {
        await call(tools, "open_tab", { url: "https://shop.example/" });
        // The user takes the tab and goes somewhere, and the working view is read, as a suggestions refresh does.
        chats.releaseTab(opened.id);
        opened.url = "https://elsewhere.example/";
        seen = chats.work(chatId())?.tabs;
        chats.work(chatId());
        // Berry carries on with something else, which mustn't count where the user's tab is now either.
        await call(tools, "list_tabs", {});
      },
      async (tools) => {
        asked.push(await asks(tools, "https://elsewhere.example/news"), await asks(tools, "https://shop.example/news"));
      },
    ]);
    await reply(null, "Find tea");
    chats.work(chatId());
    await reply(chatId(), "And more");
    expect(seen).toEqual([expect.objectContaining({ state: "yours", site: "elsewhere.example" })]);
    expect(asked).toEqual([true, false]);
  });

  it("settles on how the last reply went once it's over, and starts again with the next", async () => {
    const { chats, opened, reply } = setup([
      async (tools) => {
        await call(tools, "open_tab", { url: "https://shop.example/" });
      },
      async () => {},
    ]);
    const chatId = await reply(null, "Find tea");
    expect(chats.outcome(chatId)).toBe("done");
    expect(chats.work(chatId)).toMatchObject({
      outcome: "done",
      endedAt: expect.any(Number),
      currentId: opened.id,
      sites: ["shop.example"],
      tabs: [expect.objectContaining({ state: "picture" })],
    });
    await reply(chatId, "Nothing this time");
    expect(chats.work(chatId)).toMatchObject({ tabs: [], sites: [], outcome: "done" });
  });
});
