import { beforeEach, describe, expect, it, vi } from "vitest";
import { BERRY } from "../../shared/mascots";
import type { StreamReply } from "./agent";
import { fakeTab, holding, listed, release, resetReplies, SCOUT, setup, started, tool } from "./attachedTabsTesting";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  resetReplies();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats with attachments", () => {
  it("reaches the tabs the user attached, for that chat only, and no other tab", async () => {
    const klm = fakeTab("tab-2", "https://klm.com/");
    const other = fakeTab("tab-3", "https://bank.example/");
    const { chats, replyEnded } = setup({ tabs: [klm, other] });
    const done = replyEnded();
    const thread = chats.send(null, "Look", { seePage: false, tabs: [klm.id] })!;
    await started();
    expect(await listed()).toEqual(["tab-2"]);
    expect(await tool("read_page").run({ tabId: other.id })).toContain("There is no web page in tab tab-3");
    // A call naming no tab goes to the attached one, and it can't close it.
    expect(await tool("read_page").run({})).toContain("The text of https://klm.com/");
    expect(await tool("close_tab").run({ tabId: klm.id })).toBe("You didn't open that tab, so it stays open.");
    await started();
    release();
    await done;

    // A later message in the same chat still reaches it. Another chat doesn't.
    const later = replyEnded();
    chats.send(thread.id, "Again", { seePage: false });
    await started();
    expect(await listed()).toEqual(["tab-2"]);
    release();
    await later;
    const elsewhere = replyEnded();
    chats.send(null, "Something else", { seePage: false });
    await started();
    expect(await listed()).toEqual([]);
    release();
    await elsewhere;
  });

  it("takes an attached tab back once the user uses it, until they attach it again", async () => {
    const klm = fakeTab("tab-2", "https://klm.com/");
    const { chats, replyEnded } = setup({ tabs: [klm] });
    const first = replyEnded();
    const thread = chats.send(null, "Look", { seePage: false, tabs: [klm.id] })!;
    await started();
    release();
    await first;

    // A click or a key press there, as `Tab` reports it.
    chats.releaseTab(klm.id);
    const later = replyEnded();
    chats.send(thread.id, "Again", { seePage: false });
    await started();
    expect(await listed()).toEqual([]);
    expect(await tool("read_page").run({ tabId: klm.id })).toContain("The user took over tab tab-2");
    release();
    await later;

    const again = replyEnded();
    chats.send(thread.id, "Now look", { seePage: false, tabs: [klm.id] });
    await started();
    expect(await listed()).toEqual(["tab-2"]);
    release();
    await again;
  });

  it("puts an attached tab out of reach while another job has it, and quietly forgets one that closed", async () => {
    const klm = fakeTab("tab-2", "https://klm.com/");
    let busy = () => {};
    const tabs = [klm];
    // Another reply is working in the tab: the user's own page, sent with a message in another chat.
    const stream: StreamReply = async function* (messages, signal, options) {
      if (messages.length === 1 && JSON.stringify(messages).includes("Use the page")) {
        await options.tools.find(({ name }) => name === "read_page")!.run({});
        await new Promise<void>((resolve) => (busy = resolve));
        yield "done";
        return;
      }
      yield* holding(messages, signal, options);
    };
    const { chats, replyEnded } = setup({ tabs, active: klm, stream });
    const first = replyEnded();
    const thread = chats.send(null, "Look", { seePage: false, tabs: [klm.id] })!;
    await started();
    release();
    await first;

    chats.send(null, "Use the page", { seePage: true });
    await vi.waitFor(() => expect(chats.tabProblem(klm, thread.id, BERRY)).toBe("Berry is working in it"));
    const later = replyEnded();
    chats.send(thread.id, "Again", { seePage: false });
    await started();
    expect(await listed()).toEqual([]);
    release();
    await later;
    busy();

    chats.tabClosed(klm.id);
    tabs.length = 0;
    const closed = replyEnded();
    chats.send(thread.id, "Once more", { seePage: false });
    await started();
    expect(await tool("read_page").run({ tabId: klm.id })).toContain("There is no web page in tab tab-2");
    release();
    await closed;
  });

  it("refuses a tab handed to the user, and lists it with the reason", async () => {
    const mail = fakeTab("tab-4", "https://mail.example/");
    let handed = () => {};
    const stream: StreamReply = async function* (_messages, _signal, options) {
      handed();
      await options.tools.find(({ name }) => name === "hand_to_user")!.run({ need: "sign-in" });
      yield "back";
    };
    const { chats } = setup({ tabs: [mail], active: mail, stream });
    const asking = new Promise<void>((resolve) => (handed = resolve));
    chats.send(null, "Check my mail", { seePage: true });
    await asking;
    await vi.waitFor(() => expect(chats.waiting()).toHaveLength(1));
    expect(chats.send(null, "Read it", { seePage: false, tabs: [mail.id] })).toBeNull();
  });

  it("only offers a mascot limited to sites the tabs on them, and refuses any other", () => {
    const shop = fakeTab("tab-5", "https://shop.example/deals");
    const bank = fakeTab("tab-6", "https://bank.example/");
    const { chats } = setup({ tabs: [shop, bank] });
    expect(chats.attachableTabs(null, SCOUT.id).map(({ id }) => id)).toEqual(["tab-5"]);
    expect(chats.attachableTabs(null, null).map(({ id }) => id)).toEqual(["tab-6", "tab-5"]);
    expect(chats.tabProblem(bank, null, SCOUT)).toBe("Scout only visits shop.example");
    expect(chats.send(null, "Look", { seePage: false, mascotId: SCOUT.id, tabs: [bank.id] })).toBeNull();
    expect(chats.send(null, "Look", { seePage: false, mascotId: SCOUT.id, tabs: [shop.id] })).not.toBeNull();
  });

  it("refuses a tab it can't find, and the same tab twice", () => {
    const klm = fakeTab("tab-2", "https://klm.com/");
    const { chats } = setup({ tabs: [klm] });
    expect(chats.send(null, "Look", { seePage: false, tabs: ["tab-99"] })).toBeNull();
    expect(chats.send(null, "Look", { seePage: false, tabs: [klm.id, klm.id] })).toBeNull();
  });
});
