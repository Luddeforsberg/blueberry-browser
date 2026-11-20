import { describe, expect, it } from "vitest";
import { ModelConfigError, modelConfig } from "./modelConfig";
import { NO_KEY } from "../../shared/aiKey";

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
      ownAddressOnly: false,
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

  it("uses a key saved in Settings before the .env one, with the .env models only for their own provider", () => {
    const env = { OPENAI_API_KEY: "env-key", LLM_MODEL: "custom", LLM_TITLE_MODEL: "custom-title" };
    expect(modelConfig(env, { service: "openai", key: "saved-key" })).toEqual({
      provider: "openai",
      apiKey: "saved-key",
      model: "custom",
      titleModel: "custom-title",
      ownAddressOnly: false,
    });
    expect(modelConfig(env, { service: "anthropic", key: "saved-key" }, true)).toEqual({
      provider: "anthropic",
      apiKey: "saved-key",
      model: "claude-sonnet-5-5",
      titleModel: "claude-haiku-5-5",
      ownAddressOnly: true,
    });
    // A key from the .env file is the developer's, and goes where their environment says.
    expect(modelConfig(env, null, true).ownAddressOnly).toBe(false);
    expect(modelConfig({ LLM_PROVIDER: "gemini" }, { service: "openai", key: "saved-key" }).apiKey).toBe("saved-key");
  });
});
