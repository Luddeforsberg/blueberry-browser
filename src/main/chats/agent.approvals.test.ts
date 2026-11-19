import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, fakeModel, ToolMessage } from "langchain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PageTool } from "../tools/browserTools";
import { shortenOldResults, streamReply } from "./agent";
import { collect, NO_TOOLS } from "./agentTesting";

// A mascot's limits and the approvals a reply stops for, and the step limit that ends a long one.

describe("a mascot's limits and approvals", () => {
  const click = (extra: Partial<PageTool>, run = vi.fn(async () => "clicked")): PageTool => ({
    name: "click",
    description: "Click",
    schema: z.object({}),
    label: () => "Clicked",
    describe: async () => "Click Delete",
    whyRisky: async () => ({ reason: "risky-word", mark: "Delete" }),
    run,
    ...extra,
  });
  const clicking = () =>
    fakeModel()
      .respond(new AIMessage({ content: "", tool_calls: [{ name: "click", args: {}, id: "call-1" }] }))
      .respond(new AIMessage({ content: "done" })) as unknown as BaseChatModel;
  const reply = (tool: PageTool, approve: () => Promise<boolean>, mode: "risky" | "always" | "never" = "risky") =>
    collect(
      streamReply(
        [{ role: "user", content: "hi" }],
        new AbortController().signal,
        { ...NO_TOOLS, tools: [tool], approve, actionApproval: () => mode },
        clicking(),
      ),
    );

  it("still asks before a risky action on a site it's allowed, and does nothing if told no", async () => {
    const run = vi.fn(async () => "clicked");
    const approve = vi.fn(async () => false);
    await reply(click({ refuses: async () => null }, run), approve);
    expect(approve).toHaveBeenCalledWith("Click Delete", { reason: "risky-word", mark: "Delete" });
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses off its sites without a card, in every mode, and nothing runs", async () => {
    for (const mode of ["risky", "always", "never"] as const) {
      const run = vi.fn(async () => "clicked");
      const approve = vi.fn(async () => true);
      await reply(click({ refuses: async () => ({ label: "Stayed off example.com", message: "Not allowed" }) }, run), approve, mode);
      expect(approve).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    }
  });

  it("names what was allowed in the step on screen only, and only once it's allowed", async () => {
    const seen: [string, string | undefined][] = [];
    const run = (mode: "risky" | "never", isRisky: boolean) =>
      collect(
        streamReply(
          [{ role: "user", content: "hi" }],
          new AbortController().signal,
          {
            ...NO_TOOLS,
            tools: [
              click({
                whyRisky: async () => (isRisky ? { reason: "risky-word" } : null),
                allowedLabel: () => "Clicked “Delete” on example.com",
              }),
            ],
            approve: async () => true,
            actionApproval: () => mode,
            onStep: (text, shown) => {
              seen.push([text, shown]);
              return () => {};
            },
          },
          clicking(),
        ),
      );
    await run("risky", true);
    await run("never", true);
    await run("risky", false);
    expect(seen).toEqual([
      ["Clicked", "Clicked “Delete” on example.com"],
      ["Clicked", undefined],
      ["Clicked", undefined],
    ]);
  });

  it("doesn't let a limit passing late skip the card", async () => {
    // Refused when the card was decided on, allowed by the time it runs: it must not go ahead unasked.
    let checks = 0;
    const run = vi.fn(async () => "clicked");
    const approve = vi.fn(async () => true);
    await reply(click({ refuses: async () => (checks++ === 0 ? { label: "x", message: "x" } : null) }, run), approve);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("streamReply with an action that needs approval", () => {
  const callsTool = (...ids: string[]) =>
    fakeModel()
      .respond(
        new AIMessage({
          content: "",
          tool_calls: ids.map((id) => ({ name: "click", args: { ref: `e-${id}` }, id })),
        }),
      )
      .respond(new AIMessage("finished"));

  const click = (overrides: Partial<PageTool> = {}): PageTool => ({
    name: "click",
    description: "Clicks",
    schema: z.object({ ref: z.string() }),
    label: () => "Clicked",
    describe: async (args) => `Click ${(args as { ref: string }).ref}`,
    run: vi.fn(async () => "clicked"),
    ...overrides,
  });

  const reply = (tool: PageTool, model: BaseChatModel, approve: (text: string) => Promise<boolean>) =>
    collect(streamReply([{ role: "user", content: "hi" }], new AbortController().signal, { ...NO_TOOLS, tools: [tool], approve }, model));

  it("runs once allowed, showing the user what will happen", async () => {
    const tool = click();
    const asked: string[] = [];

    const text = await reply(tool, callsTool("1"), async (description) => {
      asked.push(description);
      expect(tool.run).not.toHaveBeenCalled();
      return true;
    });

    expect(asked).toEqual(["Click e-1"]);
    expect(tool.run).toHaveBeenCalledTimes(1);
    expect(text).toBe("finished");
  });

  it("tells the tool once that a card is up, not again when the answer resumes the run", async () => {
    for (const answer of [true, false]) {
      const whileAsking = vi.fn();
      await reply(click({ whileAsking }), callsTool("1", "2"), async () => answer);
      expect(whileAsking).toHaveBeenCalledTimes(2);
      expect(whileAsking.mock.calls.map(([args]) => args)).toEqual([{ ref: "e-1" }, { ref: "e-2" }]);
    }
  });

  it("doesn't run when refused, and tells the model", async () => {
    const tool = click();
    const model = callsTool("1");

    const text = await reply(tool, model, async () => false);

    expect(tool.run).not.toHaveBeenCalled();
    expect(text).toBe("finished");
    expect(model.calls.at(-1)?.messages.at(-1)?.text).toContain("The user said no");
  });

  it("asks about each action in one model turn, and only runs the allowed one", async () => {
    const run = vi.fn(async () => "clicked");
    const asked: string[] = [];

    await reply(click({ run }), callsTool("1", "2"), async (description) => {
      asked.push(description);
      return description === "Click e-2";
    });

    expect(asked.sort()).toEqual(["Click e-1", "Click e-2"]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ ref: "e-2" });
  });

  it("does nothing if the page no longer matches what was allowed", async () => {
    let page = "before";
    const tool = click({ describe: async () => `Click on ${page}` });
    const model = callsTool("1");

    await reply(tool, model, async () => {
      page = "after";
      return true;
    });

    expect(tool.run).not.toHaveBeenCalled();
    expect(model.calls.at(-1)?.messages.at(-1)?.text).toContain("page changed");
  });

  describe("when it's only asked about if risky", () => {
    const ask = (tool: PageTool, model: BaseChatModel, actionApproval: () => "risky" | "never", asked: string[]) =>
      collect(
        streamReply(
          [{ role: "user", content: "hi" }],
          new AbortController().signal,
          {
            ...NO_TOOLS,
            tools: [tool],
            actionApproval,
            approve: async (description) => {
              asked.push(description);
              return true;
            },
          },
          model,
        ),
      );

    it("runs a safe action without asking, and asks about a risky one", async () => {
      const safe = click({ whyRisky: async () => null });
      const asked: string[] = [];
      await ask(safe, callsTool("1"), () => "risky", asked);
      expect(asked).toEqual([]);
      expect(safe.run).toHaveBeenCalledTimes(1);

      const risky = click({ whyRisky: async () => ({ reason: "risky-word" }) });
      await ask(risky, callsTool("1"), () => "risky", asked);
      expect(asked).toEqual(["Click e-1"]);
      expect(risky.run).toHaveBeenCalledTimes(1);
    });

    it("asks about nothing in never mode", async () => {
      const risky = click({ whyRisky: async () => ({ reason: "risky-word" }) });
      const asked: string[] = [];
      await ask(risky, callsTool("1"), () => "never", asked);
      expect(asked).toEqual([]);
      expect(risky.run).toHaveBeenCalledTimes(1);
    });

    it("does nothing if a safe action turned risky before it ran", async () => {
      let checks = 0;
      const tool = click({ whyRisky: async () => (++checks > 1 ? { reason: "risky-word" } : null) });
      const model = callsTool("1");
      await ask(tool, model, () => "risky", []);
      expect(tool.run).not.toHaveBeenCalled();
      expect(model.calls.at(-1)?.messages.at(-1)?.text).toContain("page changed");
    });

    it("says which rule made each call ask", async () => {
      const because = async (tool: PageTool, mode: "risky" | "always") => {
        const approve = vi.fn(async () => true);
        await collect(
          streamReply(
            [{ role: "user", content: "hi" }],
            new AbortController().signal,
            { ...NO_TOOLS, tools: [tool], approve, actionApproval: () => mode },
            callsTool("1"),
          ),
        );
        return approve.mock.calls.map((call) => (call as unknown[])[1]);
      };
      expect(await because(click({ whyRisky: async () => ({ reason: "new-site", mark: "e-1" }) }), "risky")).toEqual([
        { reason: "new-site", mark: "e-1" },
      ]);
      expect(await because(click(), "risky")).toEqual([{ reason: "tool-always-asks" }]);
      expect(await because(click({ whyRisky: async () => null }), "always")).toEqual([{ reason: "always-ask" }]);
    });
  });

  it("ends a run that won't end with a last call that writes up, and no more tools", async () => {
    const model = fakeModel();
    for (let call = 1; call <= 130; call++) {
      model.respond(new AIMessage({ content: "found so far", tool_calls: [{ name: "click", args: { ref: "e1" }, id: `${call}` }] }));
    }
    const tool = click();

    const text = await reply(tool, model, async () => true);

    expect(model.callCount).toBe(120);
    expect(tool.run).toHaveBeenCalledTimes(119);
    expect(text).toContain("found so far");
    expect(text).toContain("limit of 120 steps");
  }, 20_000);

  describe("shortenOldResults", () => {
    const results = (count: number) =>
      Array.from({ length: count }, (_, at) => new ToolMessage({ tool_call_id: `${at}`, content: "x".repeat(1000) }));
    const cut = async (count: number) =>
      (await shortenOldResults(results(count))).filter((message) => String(message.content).length < 1000).length;

    it("keeps the newest whole and cuts the rest in batches", async () => {
      expect(await cut(0)).toBe(0);
      expect(await cut(8)).toBe(0);
      expect(await cut(15)).toBe(0);
      expect(await cut(16)).toBe(8);
      expect(await cut(24)).toBe(16);
    });

    it("drops old pictures, and leaves short results alone", async () => {
      const picture = new ToolMessage({
        tool_call_id: "p",
        content: [
          { type: "text", text: "A page" },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,x" } },
        ],
      });
      const short = new ToolMessage({ tool_call_id: "s", content: "short" });
      const [first, second] = await shortenOldResults([picture, short, ...results(14)]);
      expect(first.content).toContain("A page");
      expect(JSON.stringify(first.content)).not.toContain("base64");
      expect(second).toBe(short);
    });
  });

  it("stops when the wait for an answer is cut short", async () => {
    await expect(
      reply(click(), callsTool("1"), async () => {
        throw new Error("Stopped");
      }),
    ).rejects.toThrow("Stopped");
  });
});
