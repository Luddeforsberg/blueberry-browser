import type { AiService } from "../shared/aiKey";
import { modelsFor, SERVICE_ADDRESS } from "./agent";

// Trying a key is one short message to the service's cheap model, from main. A 4xx answer is the service turning the
// key down: a wrong key, or an account that can't be charged. No answer, the service failing, or a reply that isn't a
// model's answer is told apart, since the key may be fine. Nothing about the call is logged, as its headers hold the key.

const TIMEOUT_MS = 15_000;
const HELLO = "Say hello.";

export type TryOutcome = "works" | "refused" | "unreachable";

// Where the try goes: the service's own address, or in an unpackaged app the one the environment gives, which is the
// same one the providers' own clients would use, so a test's stand-in gets this too.
const addressOf = (service: AiService, env: Record<string, string | undefined>, ownAddressOnly: boolean): string => {
  const other = service === "anthropic" ? env.ANTHROPIC_BASE_URL : env.OPENAI_BASE_URL;
  return ((!ownAddressOnly && other) || SERVICE_ADDRESS[service]).replace(/\/+$/, "");
};

const request = (service: AiService, key: string, env: Record<string, string | undefined>, ownAddressOnly: boolean): { url: string; init: RequestInit } => {
  const { titleModel } = modelsFor(service, env);
  const base = addressOf(service, env, ownAddressOnly);
  if (service === "anthropic") {
    return {
      url: `${base}/v1/messages`,
      init: {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: titleModel, max_tokens: 16, messages: [{ role: "user", content: HELLO }] }),
      },
    };
  }
  return {
    url: `${base}/chat/completions`,
    init: {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: titleModel, messages: [{ role: "user", content: HELLO }] }),
    },
  };
};

// Whether the reply is a model's answer in the service's own shape, so an empty 200 from something in between isn't
// taken for one.
const answered = (service: AiService, reply: unknown): boolean => {
  if (!reply || typeof reply !== "object") return false;
  const said = service === "anthropic" ? (reply as { content?: unknown }).content : (reply as { choices?: unknown }).choices;
  return Array.isArray(said) && said.length > 0;
};

export const tryAiKey = async (
  service: AiService,
  key: string,
  {
    fetch = globalThis.fetch,
    env = process.env,
    ownAddressOnly = false,
  }: { fetch?: typeof globalThis.fetch; env?: Record<string, string | undefined>; ownAddressOnly?: boolean } = {}
): Promise<TryOutcome> => {
  const { url, init } = request(service, key, env, ownAddressOnly);
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) return answered(service, await response.json().catch(() => null)) ? "works" : "unreachable";
    await response.body?.cancel().catch(() => {});
    return response.status >= 400 && response.status < 500 ? "refused" : "unreachable";
  } catch {
    return "unreachable";
  }
};
