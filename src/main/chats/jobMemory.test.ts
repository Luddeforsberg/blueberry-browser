import type { MascotProfile } from "../../shared/library";
import { BERRY } from "../../shared/mascots";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { StreamReply } from "./agent";
import type { PageTool } from "../tools/browserTools";
import type { Tab } from "../tabs/Tab";
import { replying, tab } from "./chatsTesting";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats", () => {
  describe("offering to remember", () => {
    const remembering = (stream: StreamReply, pages: Tab[] = [], mascotOf?: (id: string | null) => MascotProfile) => {
      const propose = vi.fn(async () => {});
      const dropOffers = vi.fn();
      const open = pages.at(0) ?? ({ ...tab(), id: "tab-own", settled: async () => {} } as unknown as Tab);
      const chats = new Chats(
        new ChatStore(":memory:"),
        stream,
        async () => null,
        {
          activeTab: () => null,
          allTabs: () => [open],
          openBackgroundTab: () => open,
          closeTab: () => true,
          actionApproval: () => "never",
        },
        { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} },
        mascotOf,
        {
          factsOf: () => [{ id: "fact", mascotId: "berry", text: "You want it cheap.", site: "example.com", savedAt: 1 }],
          propose,
          dropOffers,
        },
      );
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

    it("a mascot deleted while it worked offers nothing, as there's no one left to remember it", async () => {
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
      expect(told.propose.mock.calls[0]).toMatchObject([
        { sourceId: "run-2", said: [], routine: "The routine", answers: [{ question: "Which size?", answer: "Always 2 metres" }] },
      ]);
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
      expect(propose.mock.calls[0]).toMatchObject([
        { sourceId: thread.id, mascotId: "berry", said: ["Find it, I always want the cheapest"], routine: null, sites: ["example.com"] },
      ]);
      expect(JSON.stringify(propose.mock.calls[0])).not.toContain("report");

      // Asks once: a new message takes the last offer away.
      chats.send(thread.id, "And again", { seePage: false });
      expect(dropOffers).toHaveBeenLastCalledWith(thread.id);
    });
  });
});
