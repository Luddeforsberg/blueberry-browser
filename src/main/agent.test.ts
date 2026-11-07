import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, fakeModel, ToolMessage } from "langchain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PageTool } from "./browserTools";
import { generateTitle, ModelConfigError, modelConfig, NO_KEY, ReplySorter, shortenOldResults, streamReply, systemPrompt, type ReplyPart } from "./agent";

const NO_TOOLS = {
  tools: [],
  actionApproval: () => "always" as const,
  approve: async () => false,
  onStep: () => () => {},
};

// The answer as it ends up: a status line takes back what came before it.
const collect = async (stream: AsyncIterable<ReplyPart>) => {
  let text = "";
  for await (const part of stream) text = typeof part === "string" ? text + part : "";
  return text;
};

describe("modelConfig", () => {
  it("defaults to OpenAI, and needs its key", () => {
    expect(modelConfig({ OPENAI_API_KEY: "key" })).toMatchObject({ provider: "openai", apiKey: "key", model: "gpt-6.1-terra" });
    expect(() => modelConfig({})).toThrow(NO_KEY);
    expect(() => modelConfig({ OPENAI_API_KEY: "" })).toThrow(ModelConfigError);
  });

  it("says plainly what's missing without a key, with no variable names", () => {
    expect(NO_KEY).toMatch(/^Berry needs an AI key to answer\./);
    expect(NO_KEY).not.toMatch(/[A-Z]+_[A-Z_]+/);
  });

  it("uses the chosen provider's key and model", () => {
    const env = { LLM_PROVIDER: "Anthropic", ANTHROPIC_API_KEY: "key", OPENAI_API_KEY: "other", LLM_MODEL: "custom" };
    expect(modelConfig(env)).toEqual({
      provider: "anthropic",
      apiKey: "key",
      model: "custom",
      titleModel: "claude-haiku-5-5",
    });
    expect(() => modelConfig({ LLM_PROVIDER: "anthropic", OPENAI_API_KEY: "key" })).toThrow(NO_KEY);
  });

  it("names chats with a cheap model from the chosen provider, unless overridden", () => {
    expect(modelConfig({ OPENAI_API_KEY: "key" }).titleModel).toBe("gpt-6-luna");
    expect(modelConfig({ OPENAI_API_KEY: "key", LLM_TITLE_MODEL: "custom" }).titleModel).toBe("custom");
  });

  it("rejects an unknown provider instead of picking another", () => {
    expect(() => modelConfig({ LLM_PROVIDER: "gemini", OPENAI_API_KEY: "key" })).toThrow(/gemini/);
  });
});

describe("streamReply", () => {
  it("streams the model's text through the agent", async () => {
    const model = new FakeListChatModel({ responses: ["hello there"] });
    const text = await collect(
      streamReply([{ role: "user", content: "hi" }], new AbortController().signal, NO_TOOLS, model)
    );
    expect(text).toBe("hello there");
  });

  it("shows what it writes before a tool call as a status line, and answers with its last message only", async () => {
    const look: PageTool = { name: "read_page", description: "Reads the page", schema: z.object({}), label: () => "Read example.com", run: async () => "page" };
    const model = fakeModel()
      .respond(new AIMessage({ content: "I'll read the page first.", tool_calls: [{ name: "read_page", args: {}, id: "call-1" }] }))
      .respond(new AIMessage("It says hello."));
    const parts: ReplyPart[] = [];
    for await (const part of streamReply([{ role: "user", content: "hi" }], new AbortController().signal, { ...NO_TOOLS, tools: [look] }, model)) parts.push(part);
    expect(parts).toEqual([{ statusLine: "I'll read the page first." }, "It says hello."]);
  });

  it("lets it ask or plan first only where the user is there to answer", async () => {
    const tools = [{ name: "read_page", description: "Reads the page", schema: z.object({}), label: () => "Read", run: async () => "page" }];
    const promptWith = async (userPresent?: boolean) => {
      const model = fakeModel().respond(new AIMessage({ content: "ok" }));
      await collect(streamReply([{ role: "user", content: "hi" }], new AbortController().signal, { ...NO_TOOLS, tools, userPresent }, model));
      return JSON.stringify(model.calls[0]?.messages[0]?.content);
    };
    expect(await promptWith(true)).toContain("The user is here to answer.");
    expect(await promptWith(false)).not.toContain("The user is here to answer.");
    expect(await promptWith()).not.toContain("The user is here to answer.");
    expect(systemPrompt(false, true)).not.toContain("The user is here to answer.");
  });

  it("tells the model today's date", async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 4, 9), toFake: ["Date"] });
    try {
      const model = fakeModel().respond(new AIMessage({ content: "ok" }));
      await collect(streamReply([{ role: "user", content: "what's new this week?" }], new AbortController().signal, NO_TOOLS, model));
      const system = model.calls[0]?.messages[0];
      expect(JSON.stringify(system?.content)).toContain("Today is Wednesday, 4 November 2026.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports the tokens each model call used", async () => {
    const model = fakeModel().respond(
      new AIMessage({ content: "hello", usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } })
    );
    const used: number[] = [];

    await collect(
      streamReply(
        [{ role: "user", content: "hi" }],
        new AbortController().signal,
        { ...NO_TOOLS, onUsage: (usage) => used.push(usage.total) },
        model as unknown as BaseChatModel
      )
    );

    expect(used.reduce((sum, tokens) => sum + tokens, 0)).toBe(15);
  });

  it("runs a tool, reports it, and keeps its result out of the reply", async () => {
    const pageTool: PageTool = {
      name: "read_page",
      description: "Reads the page",
      schema: z.object({ tabId: z.string() }),
      label: () => "Read example.com",
      run: async (args) => `secret page words from ${(args as { tabId: string }).tabId}`,
    };
    const model = fakeModel()
      .respond(new AIMessage({ content: "", tool_calls: [{ name: "read_page", args: { tabId: "tab-1" }, id: "call-1" }] }))
      .respond(new AIMessage("the answer"));
    const steps: string[] = [];

    const text = await collect(
      streamReply(
        [{ role: "user", content: "hi" }],
        new AbortController().signal,
        {
          ...NO_TOOLS,
          tools: [pageTool],
          onStep: (step) => {
            steps.push(`start ${step}`);
            return () => steps.push(`end ${step}`);
          },
        },
        model
      )
    );

    expect(text).toBe("the answer");
    expect(steps).toEqual(["start Read example.com", "end Read example.com"]);
    const toolMessage = model.calls.at(-1)?.messages.at(-1);
    expect(toolMessage?.text).toBe("secret page words from tab-1");
  });

  it("stops when aborted", async () => {
    const model = new FakeListChatModel({ responses: ["a long reply"], sleep: 20 });
    const controller = new AbortController();
    const seen: ReplyPart[] = [];
    const run = async () => {
      for await (const token of streamReply([{ role: "user", content: "hi" }], controller.signal, NO_TOOLS, model)) {
        seen.push(token);
        controller.abort();
      }
    };

    await expect(run()).rejects.toThrow();
    expect(seen).toHaveLength(1);
  });
});

describe("a mascot's limits and approvals", () => {
  const click = (extra: Partial<PageTool>, run = vi.fn(async () => "clicked")): PageTool => ({
    name: "click",
    description: "Click",
    schema: z.object({}),
    label: () => "Clicked",
    describe: async () => "Click Delete",
    isRisky: async () => true,
    run,
    ...extra,
  });
  const clicking = () =>
    fakeModel()
      .respond(new AIMessage({ content: "", tool_calls: [{ name: "click", args: {}, id: "call-1" }] }))
      .respond(new AIMessage({ content: "done" })) as unknown as BaseChatModel;
  const reply = (tool: PageTool, approve: () => Promise<boolean>, mode: "risky" | "always" | "never" = "risky") =>
    collect(streamReply([{ role: "user", content: "hi" }], new AbortController().signal, { ...NO_TOOLS, tools: [tool], approve, actionApproval: () => mode }, clicking()));

  it("still asks before a risky action on a site it's allowed, and does nothing if told no", async () => {
    const run = vi.fn(async () => "clicked");
    const approve = vi.fn(async () => false);
    await reply(click({ refuses: async () => null }, run), approve);
    expect(approve).toHaveBeenCalledWith("Click Delete", null);
    expect(run).not.toHaveBeenCalled();
  });

  describe("Allow for this card's runs", () => {
    // Clicks one button, then whichever the next calls name, as a run of a For-each card would.
    const clicks = (...names: string[]) => {
      const model = fakeModel();
      names.forEach((name, index) => model.respond(new AIMessage({ content: "", tool_calls: [{ name: "click", args: { name }, id: `call-${index}` }] })));
      return model.respond(new AIMessage({ content: "done" })) as unknown as BaseChatModel;
    };
    const button = (run = vi.fn(async () => "clicked"), lose?: () => boolean) =>
      click({
        schema: z.object({ name: z.string() }),
        describe: async (args) => `Click the button “${(args as { name: string }).name}”`,
        grantKey: async (args) => (lose?.() ? null : { key: `click ${(args as { name: string }).name}`, words: `clicking “${(args as { name: string }).name}”` }),
        run,
      });
    const replyWith = (tool: PageTool, model: BaseChatModel, keys: Set<string> | null, approve: (text: string, grant?: { key: string } | null) => Promise<boolean>, steps: unknown[] = []) =>
      collect(
        streamReply(
          [{ role: "user", content: "hi" }],
          new AbortController().signal,
          {
            ...NO_TOOLS,
            tools: [tool],
            approve,
            actionApproval: () => "risky",
            ...(keys ? { granted: (key: string) => keys.has(key) } : {}),
            onStep: (text, _shown, allowed) => {
              steps.push([text, allowed]);
              return () => {};
            },
          },
          model
        )
      );

    it("offers exactly the action asked about, and after it's granted the same action doesn't ask, while another does", async () => {
      const keys = new Set<string>();
      const run = vi.fn(async () => "clicked");
      const steps: unknown[] = [];
      const approve = vi.fn(async (text: string, grant?: { key: string } | null) => {
        if (text.includes("Save draft") && grant) keys.add(grant.key);
        return true;
      });
      await replyWith(button(run), clicks("Save draft", "Save draft", "Send"), keys, approve, steps);
      expect(approve.mock.calls).toEqual([
        ["Click the button “Save draft”", { key: "click Save draft", words: "clicking “Save draft”" }],
        ["Click the button “Send”", { key: "click Send", words: "clicking “Send”" }],
      ]);
      expect(run).toHaveBeenCalledTimes(3);
      // Only the call that didn't ask is held to the key that matched; the others act as any approved call does.
      expect((run.mock.calls as unknown[][]).map((call) => call[1] ?? null)).toEqual([null, "click Save draft", null]);
      // The first was allowed for the card's runs on its own card, and the second by that.
      expect(steps).toEqual([
        ["Clicked", "card"],
        ["Clicked", "card"],
        ["Clicked", "once"],
      ]);
    });

    it("offers nothing outside a card's runs, or for an action with no exact key, and a grant never covers one", async () => {
      const approve = vi.fn(async () => true);
      await replyWith(button(), clicks("Save draft"), null, approve);
      expect(approve).toHaveBeenCalledWith("Click the button “Save draft”", null);

      const keys = new Set(["click Save draft"]);
      const unmatched = vi.fn(async () => true);
      await replyWith(button(undefined, () => true), clicks("Save draft"), keys, unmatched);
      expect(unmatched).toHaveBeenCalledWith("Click the button “Save draft”", null);
    });

    it("offers nothing when the page gives another key while the card's words are read", async () => {
      let reads = 0;
      const shifting = click({
        schema: z.object({ name: z.string() }),
        describe: async () => "Click the button “Save draft”",
        grantKey: async () => ({ key: `click Save draft to ${reads++}`, words: "clicking “Save draft”" }),
        run: vi.fn(async () => "clicked"),
      });
      const approve = vi.fn(async () => true);
      await replyWith(shifting, clicks("Save draft"), new Set<string>(), approve);
      expect(approve).toHaveBeenCalledWith("Click the button “Save draft”", null);
    });

    it("asks again when the action stops matching between the check and the run", async () => {
      // Covered when LangChain decided not to ask, then a different element by the time it runs: nothing happens.
      let checks = 0;
      const run = vi.fn(async () => "clicked");
      const approve = vi.fn(async () => true);
      await replyWith(button(run, () => checks++ > 0), clicks("Save draft"), new Set(["click Save draft"]), approve);
      expect(approve).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    });

    it("doesn't widen a bird's limits: a refused action is refused even when granted", async () => {
      const run = vi.fn(async () => "clicked");
      const approve = vi.fn(async () => true);
      const tool = { ...button(run), refuses: async () => ({ label: "Stayed off example.com", message: "Not allowed" }) };
      await replyWith(tool, clicks("Save draft"), new Set(["click Save draft"]), approve);
      expect(approve).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    });
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
            tools: [click({ isRisky: async () => isRisky, allowedLabel: () => "Clicked “Delete” on example.com" })],
            approve: async () => true,
            actionApproval: () => mode,
            onStep: (text, shown) => {
              seen.push([text, shown]);
              return () => {};
            },
          },
          clicking()
        )
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

describe("ReplySorter", () => {
  it("streams a message's words as the answer while it calls no tool", () => {
    const sorter = new ReplySorter();
    expect([...sorter.chunk("Found ", false), ...sorter.chunk("it.", false), ...sorter.ended(false)]).toEqual(["Found ", "it."]);
  });

  it("takes words back as a status line once their message calls a tool, and keeps it up to date", () => {
    const sorter = new ReplySorter();
    expect(sorter.chunk("I'll check ", false)).toEqual(["I'll check "]);
    expect(sorter.chunk("their careers page.", false)).toEqual(["their careers page."]);
    expect(sorter.chunk("", true)).toEqual([{ statusLine: "I'll check their careers page." }]);
    expect(sorter.chunk("", true)).toEqual([]);
    expect(sorter.chunk(" Then LinkedIn.", false)).toEqual([{ statusLine: "I'll check their careers page. Then LinkedIn." }]);
    expect(sorter.ended(true)).toEqual([]);
  });

  it("says nothing for a message that only calls tools", () => {
    const sorter = new ReplySorter();
    expect([...sorter.chunk("", true), ...sorter.chunk(" ", false), ...sorter.ended(true)]).toEqual([]);
  });

  it("takes words back when only the whole message shows the call", () => {
    const sorter = new ReplySorter();
    expect([...sorter.chunk("Looking.", false), ...sorter.ended(true)]).toEqual(["Looking.", { statusLine: "Looking." }]);
  });

  it("gives words back as the answer when the message ended up calling nothing", () => {
    const sorter = new ReplySorter();
    expect([...sorter.chunk("Here's what I found.", true), ...sorter.ended(false)]).toEqual([{ statusLine: "Here's what I found." }, "Here's what I found."]);
  });

  it("starts each message afresh", () => {
    const sorter = new ReplySorter();
    sorter.chunk("First.", true);
    sorter.ended(true);
    expect([...sorter.chunk("The answer.", false), ...sorter.ended(false)]).toEqual(["The answer."]);
  });
});

describe("streamReply with a tool that returns an image", () => {
  const screenshot = (result: string): PageTool => ({
    name: "screenshot",
    description: "Looks",
    schema: z.object({}),
    label: () => "Looked",
    returnsImage: true,
    run: async () => result,
  });
  const lastToolMessage = async (result: string) => {
    const model = fakeModel()
      .respond(new AIMessage({ content: "", tool_calls: [{ name: "screenshot", args: {}, id: "call-1" }] }))
      .respond(new AIMessage("seen"));
    await collect(
      streamReply([{ role: "user", content: "hi" }], new AbortController().signal, { ...NO_TOOLS, tools: [screenshot(result)] }, model)
    );
    return model.calls.at(-1)?.messages.at(-1);
  };

  it("sends the picture to the model, marked as untrusted", async () => {
    const message = await lastToolMessage("data:image/jpeg;base64,AAAA");
    expect(message?.content).toEqual([
      { type: "text", text: expect.stringContaining("untrusted") },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } },
    ]);
  });

  it("sends a failure as words", async () => {
    expect((await lastToolMessage("Nothing to look at"))?.content).toBe("Nothing to look at");
  });
});

describe("streamReply with a bad tool call", () => {
  it("tells the model, so one bad call doesn't end the reply", async () => {
    const run = vi.fn(async () => "never");
    const model = fakeModel()
      .respond(new AIMessage({ content: "", tool_calls: [{ name: "find", args: { query: "" }, id: "call-1" }] }))
      .respond(new AIMessage("recovered"));
    const tool: PageTool = {
      name: "find",
      description: "Finds",
      schema: z.object({ query: z.string().min(1) }),
      label: () => "Looked",
      run,
    };

    const text = await collect(
      streamReply([{ role: "user", content: "hi" }], new AbortController().signal, { ...NO_TOOLS, tools: [tool] }, model)
    );

    expect(text).toBe("recovered");
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
        })
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
    collect(
      streamReply([{ role: "user", content: "hi" }], new AbortController().signal, { ...NO_TOOLS, tools: [tool], approve }, model)
    );

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
    const ask = (
      tool: PageTool,
      model: BaseChatModel,
      actionApproval: () => "risky" | "never",
      asked: string[]
    ) =>
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
          model
        )
      );

    it("runs a safe action without asking, and asks about a risky one", async () => {
      const safe = click({ isRisky: async () => false });
      const asked: string[] = [];
      await ask(safe, callsTool("1"), () => "risky", asked);
      expect(asked).toEqual([]);
      expect(safe.run).toHaveBeenCalledTimes(1);

      const risky = click({ isRisky: async () => true });
      await ask(risky, callsTool("1"), () => "risky", asked);
      expect(asked).toEqual(["Click e-1"]);
      expect(risky.run).toHaveBeenCalledTimes(1);
    });

    it("asks about nothing in never mode", async () => {
      const risky = click({ isRisky: async () => true });
      const asked: string[] = [];
      await ask(risky, callsTool("1"), () => "never", asked);
      expect(asked).toEqual([]);
      expect(risky.run).toHaveBeenCalledTimes(1);
    });

    it("does nothing if a safe action turned risky before it ran", async () => {
      let checks = 0;
      const tool = click({ isRisky: async () => ++checks > 1 });
      const model = callsTool("1");
      await ask(tool, model, () => "risky", []);
      expect(tool.run).not.toHaveBeenCalled();
      expect(model.calls.at(-1)?.messages.at(-1)?.text).toContain("page changed");
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
      const picture = new ToolMessage({ tool_call_id: "p", content: [{ type: "text", text: "A page" }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,x" } }] });
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
      })
    ).rejects.toThrow("Stopped");
  });
});

describe("generateTitle", () => {
  const titled = (response: string) =>
    generateTitle(
      [{ role: "user", content: "hi" }],
      new FakeListChatModel({ responses: [response] })
    );

  it("cleans up the model's answer", async () => {
    expect(await titled("Trip to Porto")).toBe("Trip to Porto");
    expect(await titled(' "Trip to Porto." ')).toBe("Trip to Porto");
  });

  it("has no title when the model finds no topic", async () => {
    expect(await titled("NONE")).toBeNull();
    expect(await titled("none.")).toBeNull();
    expect(await titled("  ")).toBeNull();
  });

  it("keeps a title to 60 characters", async () => {
    expect(await titled("x".repeat(60))).toBe("x".repeat(60));
    expect(await titled("x".repeat(61))).toBe(`${"x".repeat(59)}…`);
  });
});
