import { FakeListChatModel } from "@langchain/core/utils/testing";
import { describe, expect, it } from "vitest";
import { ModelConfigError, modelConfig, streamReply } from "./agent";

const collect = async (stream: AsyncIterable<string>) => {
  let text = "";
  for await (const token of stream) text += token;
  return text;
};

describe("modelConfig", () => {
  it("defaults to OpenAI, and needs its key", () => {
    expect(modelConfig({ OPENAI_API_KEY: "key" })).toMatchObject({ provider: "openai", apiKey: "key" });
    expect(() => modelConfig({})).toThrow(/OPENAI_API_KEY/);
    expect(() => modelConfig({ OPENAI_API_KEY: "" })).toThrow(ModelConfigError);
  });

  it("uses the chosen provider's key and model", () => {
    const env = { LLM_PROVIDER: "Anthropic", ANTHROPIC_API_KEY: "key", OPENAI_API_KEY: "other", LLM_MODEL: "custom" };
    expect(modelConfig(env)).toEqual({ provider: "anthropic", apiKey: "key", model: "custom" });
    expect(() => modelConfig({ LLM_PROVIDER: "anthropic", OPENAI_API_KEY: "key" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("rejects an unknown provider instead of picking another", () => {
    expect(() => modelConfig({ LLM_PROVIDER: "gemini", OPENAI_API_KEY: "key" })).toThrow(/gemini/);
  });
});

describe("streamReply", () => {
  it("streams the model's text through the agent", async () => {
    const model = new FakeListChatModel({ responses: ["hello there"] });
    const text = await collect(
      streamReply([{ role: "user", content: "hi" }], new AbortController().signal, model)
    );
    expect(text).toBe("hello there");
  });

  it("stops when aborted", async () => {
    const model = new FakeListChatModel({ responses: ["a long reply"], sleep: 20 });
    const controller = new AbortController();
    const seen: string[] = [];
    const run = async () => {
      for await (const token of streamReply([{ role: "user", content: "hi" }], controller.signal, model)) {
        seen.push(token);
        controller.abort();
      }
    };

    await expect(run()).rejects.toThrow();
    expect(seen).toHaveLength(1);
  });
});
