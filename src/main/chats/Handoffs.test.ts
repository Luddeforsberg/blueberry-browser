import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chats } from "./Chats";
import { ChatStore } from "./ChatStore";
import type { StreamReply } from "./agent";
import type { PageTool } from "../tools/browserTools";
import type { Tab } from "../tabs/Tab";
import { send, tab } from "./chatsTesting";

vi.mock("./agent", async (importOriginal) => {
  const { ModelConfigError } = await importOriginal<typeof import("./agent")>();
  return { ModelConfigError };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Chats", () => {
  describe("page tools", () => {
    describe("a code from the phone", () => {
      const handedOver = async (need: "code" | "sign-in") => {
        const typed = vi.fn();
        const looked = vi.fn(async () => ({ fields: [], hasPasswordField: false }));
        const own = {
          ...tab(),
          id: "tab-own",
          settled: async () => {},
          sendInputWhileHeld: typed,
          runInPageWhileHeld: looked,
        } as unknown as Tab;
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
        const chats = new Chats(
          store,
          stream,
          async () => null,
          {
            activeTab: () => null,
            allTabs: () => open,
            openBackgroundTab: () => own,
            // Refused, so the tab outlasts the reply and what's said about it later can be checked.
            closeTab: () => false,
            actionApproval: () => "always",
          },
          { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} },
        );
        send(chats, null, "Check my orders", false);
        await vi.waitFor(() => expect(chats.waiting()).toHaveLength(1));
        const [{ id, approval }] = chats.waiting();
        return {
          chats,
          store,
          own,
          open,
          typed,
          looked,
          enter: () => chats.enterCode(id, approval.id, "123456"),
          id,
          approvalId: approval.id,
          heard,
          tools: () => reached,
        };
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
        expect(
          await tools()
            .find((tool) => tool.name === "screenshot")!
            .run({}),
        ).not.toMatch(/s3cret|t0ken/);
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
        for (const said of ["123456", "123-456", "123 456", "1\n2\n3\n4\n5\n6", "data:image/png;base64,123456"])
          expect(chats.withoutCodes(said)).not.toMatch(/1\s*-?2\s*3\s*-?4\s*5\s*6/);
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
          actionApproval: () => "always",
        },
        { onChunk: () => {}, onThread: () => {}, onListChanged: () => {}, onWorkingTabs: () => {} },
      );

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
  });
});
