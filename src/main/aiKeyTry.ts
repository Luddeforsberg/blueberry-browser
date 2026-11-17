import type { AiService } from "../shared/aiKey";
import { modelsFor } from "./agent";

// Trying a key is one short message to the service's cheap model, from main. A 4xx answer is the service turning the
// key down: a wrong key, or an account that can't be charged. No answer, or the service failing, is told apart, since the
// key may be fine. Nothing about the call is logged, as its headers hold the key.

const TIMEOUT_MS = 15_000;
const HELLO = "Say hello.";

export type TryOutcome = "works" | "refused" | "unreachable";

const request = (service: AiService, key: string, env: Record<string, string | undefined>): { url: string; init: RequestInit } => {
  const { titleModel } = modelsFor(service, env);
  if (service === "anthropic") {
    // The same addresses the providers' own clients use, so a test's fake service gets this too.
    const base = (env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
    return {
      url: `${base}/v1/messages`,
      init: {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: titleModel, max_tokens: 16, messages: [{ role: "user", content: HELLO }] }),
      },
    };
  }
  const base = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    url: `${base}/chat/completions`,
    init: {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: titleModel, messages: [{ role: "user", content: HELLO }] }),
    },
  };
};

export const tryAiKey = async (
  service: AiService,
  key: string,
  { fetch = globalThis.fetch, env = process.env }: { fetch?: typeof globalThis.fetch; env?: Record<string, string | undefined> } = {}
): Promise<TryOutcome> => {
  const { url, init } = request(service, key, env);
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    await response.body?.cancel().catch(() => {});
    if (response.ok) return "works";
    return response.status >= 400 && response.status < 500 ? "refused" : "unreachable";
  } catch {
    return "unreachable";
  }
};
