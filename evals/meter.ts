import type { ElectronApplication } from "@playwright/test";

export interface ModelCall {
  model: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  requestBytes: number;
  toolCalls: Array<{ name: string; args: string }>;
  // What the last tool returned, clipped, so a failure can be diagnosed afterwards.
  toolResults: string[];
  status: number;
  error?: string;
}

// US$ per million tokens: [input, cached input, output], from developers.openai.com/api/docs/pricing on 2026-10-31.
// A model not listed here is priced high, so the budget errs towards stopping.
const PRICES: Record<string, [number, number, number]> = {
  "gpt-6.1-terra": [1, 0.05, 5],
  "gpt-6-luna": [0.1, 0.01, 0.5],
};
const FALLBACK_PRICE: [number, number, number] = [10, 1, 50];

export const costOf = (calls: ModelCall[]): number =>
  calls.reduce((total, call) => {
    const match = Object.keys(PRICES).find((name) =>
      call.model.startsWith(name),
    );
    const [input, cached, output] = match ? PRICES[match] : FALLBACK_PRICE;
    const fresh = call.inputTokens - call.cachedTokens;
    return (
      total +
      (fresh * input +
        call.cachedTokens * cached +
        call.outputTokens * output) /
        1_000_000
    );
  }, 0);

const RESULT_CLIP = 400;

// Wraps fetch in the app's main process, so the product code stays as it is. The OpenAI client looks up fetch
// when it's created, on the first message, so this must run before then.
export const installMeter = (app: ElectronApplication) =>
  app.evaluate((_electron, clip) => {
    const calls: unknown[] = [];
    (globalThis as unknown as { __evalCalls: unknown[] }).__evalCalls = calls;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const response = await realFetch(input, init);
      if (!url.includes("api.openai.com")) return response;

      const body = typeof init?.body === "string" ? init.body : "";
      let toolResults: string[] = [];
      try {
        const items: Array<{ type?: string; output?: unknown }> =
          JSON.parse(body).input ?? [];
        const trailing: string[] = [];
        for (const item of [...items].reverse()) {
          if (item.type !== "function_call_output") break;
          trailing.unshift(String(item.output).slice(0, clip));
        }
        toolResults = trailing;
      } catch {
        // A body we can't read only costs the diagnosis.
      }
      const call = {
        model: "",
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        requestBytes: body.length,
        toolCalls: [] as Array<{ name: string; args: string }>,
        toolResults,
        status: response.status,
        error: undefined as string | undefined,
      };
      calls.push(call);

      const finished = (result: {
        model?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          input_tokens_details?: { cached_tokens?: number };
        };
        output?: Array<{ type?: string; name?: string; arguments?: string }>;
      }) => {
        call.model = result.model ?? call.model;
        call.inputTokens = result.usage?.input_tokens ?? 0;
        call.cachedTokens =
          result.usage?.input_tokens_details?.cached_tokens ?? 0;
        call.outputTokens = result.usage?.output_tokens ?? 0;
        call.toolCalls = (result.output ?? [])
          .filter((item) => item.type === "function_call")
          .map((item) => ({
            name: item.name ?? "",
            args: item.arguments ?? "",
          }));
      };

      void response
        .clone()
        .text()
        .then((text) => {
          if (!response.ok) {
            call.error = text.slice(0, clip);
            return;
          }
          if (!text.startsWith("event:") && !text.startsWith("data:")) {
            finished(JSON.parse(text));
            return;
          }
          for (const line of text.split("\n")) {
            if (
              !line.startsWith("data:") ||
              !line.includes('"response.completed"')
            )
              continue;
            finished(JSON.parse(line.slice(5)).response);
          }
        })
        .catch((error) => {
          call.error = String(error).slice(0, clip);
        });
      return response;
    };
  }, RESULT_CLIP);

export const readCalls = (app: ElectronApplication): Promise<ModelCall[]> =>
  app.evaluate(
    () => (globalThis as unknown as { __evalCalls: ModelCall[] }).__evalCalls,
  );

// Refuses addresses that look like the last step of something real, as a backstop to the job's own instruction.
const FINAL_STEP =
  /\/(checkout|buy|payment|purchase|place-?order|signup|sign-up|register)(\/|\?|$)|\/gp\/buy\/|\/book\.[a-z-]+\.html/i;
const TEST_SITES =
  /(saucedemo\.com|herokuapp\.com|demoqa\.com|todomvc\.com|toscrape\.com|127\.0\.0\.1)/;

// Records what it refused on a global, so the report can say so.
export const installGuard = (app: ElectronApplication) =>
  app.evaluate(
    ({ session }, { finalStep, testSites }) => {
      const refused: string[] = [];
      (globalThis as unknown as { __evalRefused: string[] }).__evalRefused =
        refused;
      const final = new RegExp(finalStep, "i");
      const test = new RegExp(testSites);
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const stop =
          details.resourceType === "mainFrame" &&
          final.test(details.url) &&
          !test.test(details.url);
        if (stop) refused.push(details.url.slice(0, 200));
        callback({ cancel: stop });
      });
    },
    { finalStep: FINAL_STEP.source, testSites: TEST_SITES.source },
  );

export const readRefused = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(
    () => (globalThis as unknown as { __evalRefused: string[] }).__evalRefused,
  );
