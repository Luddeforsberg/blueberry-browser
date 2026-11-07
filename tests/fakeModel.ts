import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeModelRequest {
  messages: Array<{ role: string; content: unknown }>;
  tools?: Array<{ function: { name: string } }>;
}

const DEFAULT_TOKENS = ["A reply ", "from the model"];
const TITLE_MODEL = "fake-title-model";

const sseChunk = (delta: object, finish: string | null) =>
  `data: ${JSON.stringify({
    id: "fake",
    object: "chat.completion.chunk",
    created: 0,
    model: "fake",
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;

// A local stand-in for OpenAI's API, so tests run the real app and client without paying for a model.
export const startFakeModel = async () => {
  let tokens = DEFAULT_TOKENS;
  let holdStart: Promise<void> | null = null;
  let hold: Promise<void> | null = null;
  let title = "NONE";
  let toolCalls: Array<{ calls: Array<{ name: string; args: object }>; say?: string }> = [];
  let thinkMs = 0;
  // Tokens each main reply reports, as OpenAI does at the end of a stream when asked.
  let usage: { input: number; output: number } | null = null;
  const usageChunk = () =>
    usage
      ? `data: ${JSON.stringify({ id: "fake", object: "chat.completion.chunk", created: 0, model: "fake", choices: [], usage: { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output } })}\n\n`
      : "";
  const requests: FakeModelRequest[] = [];
  const titleRequests: FakeModelRequest[] = [];
  let memory = '{"facts":[]}';
  const memoryRequests: FakeModelRequest[] = [];
  let suggest: ((digest: string) => string) | null = null;
  const suggestionRequests: FakeModelRequest[] = [];
  let plans: object[] = [];
  let planHold: Promise<void> | null = null;
  const planRequests: FakeModelRequest[] = [];
  // A For-each card's column name and each row's value, from what the cheap model was sent.
  let cell: ((data: string) => string) | null = null;
  let column = "NONE";
  const cellRequests: FakeModelRequest[] = [];

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
      response.statusCode = 404;
      response.end();
      return;
    }
    let body = "";
    for await (const part of request) body += part;
    const parsed = JSON.parse(body);

    if (parsed.model === TITLE_MODEL && /fill in one cell|name one column/.test(JSON.stringify(parsed.messages[0]))) {
      cellRequests.push(parsed);
      const data = String(parsed.messages.at(-1)?.content ?? "");
      const content = JSON.stringify(parsed.messages[0]).includes("name one column") ? column : (cell?.(data) ?? "NONE");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ id: "fake", object: "chat.completion", created: 0, model: TITLE_MODEL, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] }));
      return;
    }

    if (parsed.model === TITLE_MODEL) {
      const asksWhatToRemember = JSON.stringify(parsed.messages[0]).includes("offer to remember");
      const human = parsed.messages.at(-1)?.content;
      const asksForSuggestions = typeof human === "string" && human.startsWith("<browsing_digest>");
      (asksWhatToRemember ? memoryRequests : asksForSuggestions ? suggestionRequests : titleRequests).push(parsed);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "fake",
          object: "chat.completion",
          created: 0,
          model: TITLE_MODEL,
          choices: [{ index: 0, message: { role: "assistant", content: asksWhatToRemember ? memory : asksForSuggestions ? (suggest?.(human) ?? '{"cards":[]}') : title }, finish_reason: "stop" }],
        })
      );
      return;
    }

    // A Nest's planner asks the main model for an answer in a set shape, all at once.
    if (parsed.response_format?.json_schema?.name === "nest_plan") {
      planRequests.push(parsed);
      const plan = plans.shift() ?? { reply: "I couldn't plan that.", ask: true, cards: [] };
      const heldPlan = planHold;
      planHold = null;
      if (heldPlan) await heldPlan;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "fake",
          object: "chat.completion",
          created: 0,
          model: parsed.model,
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(plan) }, finish_reason: "stop" }],
        })
      );
      return;
    }

    requests.push(parsed);
    const nextCalls = toolCalls.shift();
    if (thinkMs) await new Promise((resolve) => setTimeout(resolve, thinkMs));
    if (nextCalls) {
      const calls = nextCalls.calls.map(({ name, args }, index) => ({
        index,
        id: `call-${requests.length}-${index}`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      }));
      response.setHeader("content-type", "text/event-stream");
      // Words come before the call in the same message, as a real model's do.
      if (nextCalls.say) response.write(sseChunk({ role: "assistant", content: nextCalls.say }, null));
      response.write(sseChunk({ role: "assistant", content: null, tool_calls: calls }, null));
      response.write(sseChunk({}, "tool_calls"));
      response.end(`${usageChunk()}data: [DONE]\n\n`);
      return;
    }
    const reply = tokens;
    const heldStart = holdStart;
    const held = hold;
    holdStart = null;
    hold = null;
    response.setHeader("content-type", "text/event-stream");
    if (heldStart) await heldStart;
    response.write(sseChunk({ role: "assistant", content: reply[0] }, null));
    if (held) await held;
    for (const token of reply.slice(1)) response.write(sseChunk({ content: token }, null));
    response.write(sseChunk({}, "stop"));
    response.end(`${usageChunk()}data: [DONE]\n\n`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      LLM_MODEL: "gpt-4o-mini",
      LLM_TITLE_MODEL: TITLE_MODEL,
    },
    requests,
    titleRequests,
    memoryRequests,
    suggestionRequests,
    planRequests,
    cellRequests,
    reset() {
      cell = null;
      column = "NONE";
      cellRequests.length = 0;
      plans = [];
      planHold = null;
      planRequests.length = 0;
      memory = '{"facts":[]}';
      memoryRequests.length = 0;
      tokens = DEFAULT_TOKENS;
      holdStart = null;
      hold = null;
      title = "NONE";
      toolCalls = [];
      thinkMs = 0;
      usage = null;
      requests.length = 0;
      titleRequests.length = 0;
      suggest = null;
      suggestionRequests.length = 0;
    },
    // What the title model answers. NONE means the chat has no topic yet.
    titleWith(next: string) {
      title = next;
    },
    // What the cheap model writes in a For-each card's column for a row, worked out from what it was sent, and what it
    // names the column.
    cellsFrom(next: (data: string) => string) {
      cell = next;
    },
    columnWith(next: string) {
      column = next;
    },
    // What the cheap model proposes for the new tab, worked out from the digest it was sent.
    suggestFrom(next: (digest: string) => string) {
      suggest = next;
    },
    // The next plan waits until the returned function is called, as a real model takes a while to plan.
    holdPlan() {
      let release = () => {};
      planHold = new Promise<void>((resolve) => (release = resolve));
      return () => release();
    },
    // What the planner answers next, as the model would in the plan's shape. Call again for the one after.
    // A card that names no files gets none, as the real model says with an empty list.
    planWith(next: { cards?: object[]; [key: string]: unknown }) {
      plans.push({ ...next, ...(next.cards ? { cards: next.cards.map((card) => ({ attached: [], ...card })) } : {}) });
    },
    // What the cheap model proposes for a bird to remember.
    proposeMemory(...facts: Array<{ text: string; site: string | null }>) {
      memory = JSON.stringify({ facts });
    },
    // The next reply asks for these tools instead of answering. Call again for the reply after that.
    callTools(...calls: Array<{ name: string; args: object }>) {
      toolCalls.push({ calls });
    },
    // The same, with words written first in that message.
    sayThenCallTools(say: string, ...calls: Array<{ name: string; args: object }>) {
      toolCalls.push({ calls, say });
    },
    // How long each answer takes, as a real model's does, for anything watching the time between steps.
    thinkFor(ms: number) {
      thinkMs = ms;
    },
    // The tokens every main reply reports from now on.
    usageWith(next: { input: number; output: number } | null) {
      usage = next;
    },
    replyWith(...next: string[]) {
      tokens = next;
    },
    // The next reply waits before its first token until the returned function is called.
    holdBeforeFirstToken() {
      let release = () => {};
      holdStart = new Promise<void>((resolve) => (release = resolve));
      return () => release();
    },
    // The next reply waits after its first token until the returned function is called.
    holdAfterFirstToken() {
      let release = () => {};
      hold = new Promise<void>((resolve) => (release = resolve));
      return () => release();
    },
    close() {
      server.closeAllConnections();
      server.close();
    },
  };
};

export type FakeModel = Awaited<ReturnType<typeof startFakeModel>>;
