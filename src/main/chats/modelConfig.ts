import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { NO_KEY, type AiService } from "../../shared/aiKey";

// Which model a chat goes to, with whose key: the one saved in Settings, or the .env file's. Each model is made on first
// use, so opening the browser never waits for LangChain.

const DEFAULT_MODELS = {
  openai: "gpt-6.1-terra",
  anthropic: "claude-sonnet-5-5",
};

// Cheap models, from the same provider as the chat so a conversation only goes to the one it's with.
const TITLE_MODELS = {
  openai: "gpt-6-luna",
  anthropic: "claude-haiku-5-5",
};

const API_KEYS = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

const MAX_RETRIES = 3;

// A problem the user fixes in .env, so its message is worded for them.
export class ModelConfigError extends Error {}

// The key the user saved in Settings, which comes before one in the .env file. Only the app sets this: the cloud runner
// and the evals never do, so they use the .env file alone.
export interface SavedKey {
  service: AiService;
  key: string;
}
let savedKey: () => SavedKey | null = () => null;
// Each service's own address. With `ownAddressOnly`, which the packaged app sets, a saved key is only ever sent there,
// whatever the environment says about another address. An unpackaged app keeps the environment's, which is how tests
// point it at a stand-in.
export const SERVICE_ADDRESS: Record<AiService, string> = { openai: "https://api.openai.com/v1", anthropic: "https://api.anthropic.com" };
let savedKeyStaysHome = false;
export const setSavedKeyReader = (read: () => SavedKey | null, { ownAddressOnly = false }: { ownAddressOnly?: boolean } = {}): void => {
  savedKey = read;
  savedKeyStaysHome = ownAddressOnly;
};

// The .env file's choice of models only applies to a key for its own provider.
export const modelsFor = (provider: AiService, env: Record<string, string | undefined> = process.env) => {
  const chosen = (env.LLM_PROVIDER?.toLowerCase() || "openai") === provider;
  return {
    model: (chosen && env.LLM_MODEL) || DEFAULT_MODELS[provider],
    titleModel: (chosen && env.LLM_TITLE_MODEL) || TITLE_MODELS[provider],
  };
};

export const modelConfig = (
  env: Record<string, string | undefined> = process.env,
  saved: SavedKey | null = savedKey(),
  ownAddressOnly = savedKeyStaysHome,
) => {
  if (saved) return { provider: saved.service, apiKey: saved.key, ownAddressOnly, ...modelsFor(saved.service, env) };
  const provider = env.LLM_PROVIDER?.toLowerCase() || "openai";
  if (provider !== "openai" && provider !== "anthropic") {
    throw new ModelConfigError(`LLM_PROVIDER in the .env file must be openai or anthropic, not "${provider}".`);
  }
  const apiKey = env[API_KEYS[provider]];
  if (!apiKey) throw new ModelConfigError(NO_KEY);
  return { provider, apiKey, ownAddressOnly: false, ...modelsFor(provider, env) };
};

// LangChain and the providers load on first use, so opening the browser never waits for them.
export const createModel = async (use: "model" | "titleModel" = "model"): Promise<BaseChatModel> => {
  const { provider, apiKey, ownAddressOnly, [use]: model } = modelConfig();
  // An address given here comes before any the client would take from the environment.
  if (provider === "anthropic") {
    const { ChatAnthropic } = await import("@langchain/anthropic");
    return new ChatAnthropic({
      apiKey,
      model,
      maxRetries: MAX_RETRIES,
      ...(ownAddressOnly && { anthropicApiUrl: SERVICE_ADDRESS.anthropic }),
    });
  }
  const { ChatOpenAI } = await import("@langchain/openai");
  // Newer models only take tools through the Responses API. A custom address, such as the tests' fake model,
  // may only speak the older one.
  return new ChatOpenAI({
    apiKey,
    model,
    maxRetries: MAX_RETRIES,
    useResponsesApi: ownAddressOnly || !process.env.OPENAI_BASE_URL,
    ...(ownAddressOnly && { configuration: { baseURL: SERVICE_ADDRESS.openai } }),
  });
};

// Whether there's a model to ask at all. Features that only add something stay quiet without one.
export const hasModel = (): boolean => {
  try {
    modelConfig();
    return true;
  } catch {
    return false;
  }
};
