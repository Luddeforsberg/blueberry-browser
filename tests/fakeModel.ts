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
  let toolCalls: Array<Array<{ name: string; args: object }>> = [];
  const requests: FakeModelRequest[] = [];
  const titleRequests: FakeModelRequest[] = [];

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
      response.statusCode = 404;
      response.end();
      return;
    }
    let body = "";
    for await (const part of request) body += part;
    const parsed = JSON.parse(body);

    if (parsed.model === TITLE_MODEL) {
      titleRequests.push(parsed);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "fake",
          object: "chat.completion",
          created: 0,
          model: TITLE_MODEL,
          choices: [{ index: 0, message: { role: "assistant", content: title }, finish_reason: "stop" }],
        })
      );
      return;
    }

    requests.push(parsed);
    const nextCalls = toolCalls.shift();
    if (nextCalls) {
      const calls = nextCalls.map(({ name, args }, index) => ({
        index,
        id: `call-${requests.length}-${index}`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      }));
      response.setHeader("content-type", "text/event-stream");
      response.write(sseChunk({ role: "assistant", content: null, tool_calls: calls }, null));
      response.write(sseChunk({}, "tool_calls"));
      response.end("data: [DONE]\n\n");
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
    response.end("data: [DONE]\n\n");
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
    reset() {
      tokens = DEFAULT_TOKENS;
      holdStart = null;
      hold = null;
      title = "NONE";
      toolCalls = [];
      requests.length = 0;
      titleRequests.length = 0;
    },
    // What the title model answers. NONE means the chat has no topic yet.
    titleWith(next: string) {
      title = next;
    },
    // The next reply asks for these tools instead of answering. Call again for the reply after that.
    callTools(...calls: Array<{ name: string; args: object }>) {
      toolCalls.push(calls);
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
