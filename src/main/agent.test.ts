import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, fakeModel, ToolMessage } from "langchain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PageTool } from "./browserTools";
import { generateTitle, ModelConfigError, modelConfig, shortenOldResults, streamReply } from "./agent";

const NO_TOOLS = {
  tools: [],
  actionApproval: () => "always" as const,
  approve: async () => false,
  onStep: () => () => {},
};

const collect = async (stream: AsyncIterable<string>) => {
  let text = "";
  for await (const token of stream) text += token;
  return text;
};

describe("modelConfig", () => {
  it("defaults to OpenAI, and needs its key", () => {
    expect(modelConfig({ OPENAI_API_KEY: "key" })).toMatchObject({ provider: "openai", apiKey: "key", model: "gpt-6.1-terra" });
    expect(() => modelConfig({})).toThrow(/OPENAI_API_KEY/);
    expect(() => modelConfig({ OPENAI_API_KEY: "" })).toThrow(ModelConfigError);
  });

  it("uses the chosen provider's key and model", () => {
    const env = { LLM_PROVIDER: "Anthropic", ANTHROPIC_API_KEY: "key", OPENAI_API_KEY: "other", LLM_MODEL: "custom" };
    expect(modelConfig(env)).toEqual({
      provider: "anthropic",
      apiKey: "key",
      model: "custom",
      titleModel: "claude-haiku-5-5",
    });
    expect(() => modelConfig({ LLM_PROVIDER: "anthropic", OPENAI_API_KEY: "key" })).toThrow(/ANTHROPIC_API_KEY/);
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

  it("reports the tokens each model call used", async () => {
    const model = fakeModel().respond(
      new AIMessage({ content: "hello", usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } })
    );
    const used: number[] = [];

    await collect(
      streamReply(
        [{ role: "user", content: "hi" }],
        new AbortController().signal,
        { ...NO_TOOLS, onUsage: (tokens) => used.push(tokens) },
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
    const seen: string[] = [];
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
    expect(approve).toHaveBeenCalledWith("Click Delete");
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

  it("doesn't let a limit passing late skip the card", async () => {
    // Refused when the card was decided on, allowed by the time it runs: it must not go ahead unasked.
    let checks = 0;
    const run = vi.fn(async () => "clicked");
    const approve = vi.fn(async () => true);
    await reply(click({ refuses: async () => (checks++ === 0 ? { label: "x", message: "x" } : null) }, run), approve);
    expect(run).not.toHaveBeenCalled();
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
  });

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
