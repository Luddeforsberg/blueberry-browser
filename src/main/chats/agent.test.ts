import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, fakeModel } from "langchain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PageTool } from "../tools/browserTools";
import { forProvider, streamReply, systemPrompt, type ReplyPart } from "./agent";
import { collect, NO_TOOLS } from "./agentTesting";

describe("streamReply", () => {
  it("streams the model's text through the agent", async () => {
    const model = new FakeListChatModel({ responses: ["hello there"] });
    const text = await collect(streamReply([{ role: "user", content: "hi" }], new AbortController().signal, NO_TOOLS, model));
    expect(text).toBe("hello there");
  });

  it("shows what it writes before a tool call as a status line, and answers with its last message only", async () => {
    const look: PageTool = {
      name: "read_page",
      description: "Reads the page",
      schema: z.object({}),
      label: () => "Read example.com",
      run: async () => "page",
    };
    const model = fakeModel()
      .respond(new AIMessage({ content: "I'll read the page first.", tool_calls: [{ name: "read_page", args: {}, id: "call-1" }] }))
      .respond(new AIMessage("It says hello."));
    const parts: ReplyPart[] = [];
    for await (const part of streamReply(
      [{ role: "user", content: "hi" }],
      new AbortController().signal,
      { ...NO_TOOLS, tools: [look] },
      model,
    ))
      parts.push(part);
    expect(parts).toEqual([{ statusLine: "I'll read the page first." }, "It says hello."]);
  });

  it("lets it ask or plan first only where the user is there to answer", async () => {
    const tools = [
      { name: "read_page", description: "Reads the page", schema: z.object({}), label: () => "Read", run: async () => "page" },
    ];
    const promptWith = async (userPresent?: boolean) => {
      const model = fakeModel().respond(new AIMessage({ content: "ok" }));
      await collect(
        streamReply([{ role: "user", content: "hi" }], new AbortController().signal, { ...NO_TOOLS, tools, userPresent }, model),
      );
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
      new AIMessage({ content: "hello", usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } }),
    );
    const used: number[] = [];

    await collect(
      streamReply(
        [{ role: "user", content: "hi" }],
        new AbortController().signal,
        { ...NO_TOOLS, onUsage: (tokens) => used.push(tokens) },
        model as unknown as BaseChatModel,
      ),
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
        model,
      ),
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
      streamReply([{ role: "user", content: "hi" }], new AbortController().signal, { ...NO_TOOLS, tools: [screenshot(result)] }, model),
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
      streamReply([{ role: "user", content: "hi" }], new AbortController().signal, { ...NO_TOOLS, tools: [tool] }, model),
    );

    expect(text).toBe("recovered");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("forProvider", () => {
  // The request each provider's own client would send, caught before it leaves.
  const requestBody = async (model: BaseChatModel, content: unknown, seen: { body: string }) => {
    const { HumanMessage } = await import("@langchain/core/messages");
    await model.invoke([new HumanMessage({ content: content as never })]).catch(() => {});
    return JSON.parse(seen.body);
  };
  const catching = (seen: { body: string }) => async (_url: unknown, init?: { body?: unknown }) => {
    seen.body = String(init?.body ?? "");
    return new Response("{}", { status: 400 });
  };
  const content = [
    { type: "text" as const, text: '<file name="itinerary.pdf" kind="pdf">' },
    { type: "pdf" as const, name: "itinerary.pdf", data: "JVBERi0=" },
    { type: "text" as const, text: "</file>" },
  ];

  it("leaves content without a PDF as it was", () => {
    expect(forProvider("Hi", "anthropic")).toBe("Hi");
    const picture = [{ type: "image_url" as const, image_url: { url: "data:image/png;base64,AA" } }];
    expect(forProvider(picture, "openai")).toBe(picture);
  });

  it("sends a PDF to Anthropic once, as a document", async () => {
    const { ChatAnthropic } = await import("@langchain/anthropic");
    const seen = { body: "" };
    const model = new ChatAnthropic({
      apiKey: "key",
      model: "claude-sonnet-5-5",
      maxRetries: 0,
      clientOptions: { fetch: catching(seen) as never },
    });
    const { messages } = await requestBody(model, forProvider(content, "anthropic"), seen);
    const documents = messages[0].content.filter((block: { type: string }) => block.type === "document");
    expect(documents).toEqual([
      { type: "document", title: "itinerary.pdf", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" } },
    ]);
  });

  it("sends a PDF to OpenAI as a named file, through either API", async () => {
    const { ChatOpenAI } = await import("@langchain/openai");
    for (const useResponsesApi of [true, false]) {
      const seen = { body: "" };
      const model = new ChatOpenAI({
        apiKey: "key",
        model: "gpt-6.1-terra",
        maxRetries: 0,
        useResponsesApi,
        configuration: { fetch: catching(seen) as never },
      });
      const body = await requestBody(model, forProvider(content, "openai"), seen);
      const sent = JSON.stringify(useResponsesApi ? body.input : body.messages);
      expect(sent).toContain(useResponsesApi ? '"type":"input_file"' : '"type":"file"');
      expect(sent).toContain('"file_data":"data:application/pdf;base64,JVBERi0="');
      expect(sent).toContain('"filename":"itinerary.pdf"');
    }
  });
});
