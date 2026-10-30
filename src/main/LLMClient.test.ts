import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoreMessage } from "ai";
import type { WebContents } from "electron";
import type { Window } from "./Window";

const streamText = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ streamText }));
vi.mock("@ai-sdk/openai", () => ({ openai: () => "fake-model" }));

const SCREENSHOT = "data:image/png;base64,AAAA";

const setup = async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("LLM_PROVIDER", "openai");
  const { LLMClient } = await import("./LLMClient");

  const send = vi.fn();
  const client = new LLMClient({ send, isDestroyed: () => false } as unknown as WebContents);
  client.setWindow({
    activeTab: {
      url: "https://example.com/",
      screenshot: async () => ({ toDataURL: () => SCREENSHOT }),
      getTabText: async () => "page text",
    },
  } as unknown as Window);

  const sentOn = (channel: string) =>
    send.mock.calls.filter(([name]) => name === channel).map(([, data]) => data);
  return { client, sentOn };
};

const hasImage = (message: CoreMessage) =>
  JSON.stringify(message).includes(SCREENSHOT);

beforeEach(() => {
  streamText.mockReset();
  streamText.mockImplementation(async () => ({
    textStream: (async function* () {
      yield "one ";
      yield "two ";
      yield "three";
    })(),
  }));
});

describe("LLMClient", () => {
  it("only sends the newest screenshot to the model", async () => {
    const { client } = await setup();

    await client.sendChatMessage({ message: "first", messageId: "1" });
    await client.sendChatMessage({ message: "second", messageId: "2" });

    const messages: CoreMessage[] = streamText.mock.calls[1][0].messages;
    const userMessages = messages.filter((message) => message.role === "user");
    expect(userMessages.map(hasImage)).toEqual([false, true]);
    expect(userMessages[0].content).toBe("first");
  });

  it("never sends screenshots to the renderer", async () => {
    const { client, sentOn } = await setup();

    await client.sendChatMessage({ message: "first", messageId: "1" });

    const updates: CoreMessage[][] = sentOn("chat:messages-updated");
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.flat().some(hasImage)).toBe(false);
    expect(client.getMessages().some(hasImage)).toBe(false);
  });

  it("streams chunks instead of resending the history for each one", async () => {
    const { client, sentOn } = await setup();

    await client.sendChatMessage({ message: "first", messageId: "1" });

    const chunks = sentOn("chat:chunk").filter((chunk) => !chunk.isComplete);
    expect(chunks.map((chunk) => chunk.content)).toEqual(["one ", "two ", "three"]);

    // The user message, the empty reply, and the finished reply.
    const updates: CoreMessage[][] = sentOn("chat:messages-updated");
    expect(updates).toHaveLength(3);
    expect(updates[2].at(-1)).toEqual({ role: "assistant", content: "one two three" });
  });

  it("sends no page text or screenshot when Berry can't see the page", async () => {
    const { client } = await setup();
    client.setPageAccess(false);

    await client.sendChatMessage({ message: "first", messageId: "1" });

    const messages: CoreMessage[] = streamText.mock.calls[0][0].messages;
    expect(messages.some(hasImage)).toBe(false);
    expect(JSON.stringify(messages)).not.toContain("page text");
    expect(JSON.stringify(messages)).not.toContain("example.com");
  });
});
