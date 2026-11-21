import { describe, expect, it } from "vitest";
import type { ChatThread } from "@shared/library";
import { transcriptOf } from "./chatTranscript";

const thread = (overrides: Partial<ChatThread> = {}): ChatThread => ({
  id: "chat-1",
  title: "Tea",
  updatedAt: 0,
  mascotId: null,
  from: null,
  messages: [],
  partial: null,
  statusLine: null,
  steps: [],
  said: [],
  startedAt: null,
  approval: null,
  error: null,
  memoryIds: [],
  queued: [],
  ...overrides,
});

const asked = { role: "user" as const, content: "Find tea" };
const answered = { role: "assistant" as const, content: "Green tea is £4." };
const shape = (t: ChatThread) => {
  const { entries, running, error } = transcriptOf(t);
  return { entries: entries.map(({ key, message, streaming, error }) => [key, message.role, streaming, error]), running, error };
};

describe("transcriptOf", () => {
  it("is empty with no chat, and for a chat with nothing in it", () => {
    expect(transcriptOf(null)).toEqual({ entries: [], running: false, error: null, queued: [] });
    expect(transcriptOf(thread())).toEqual({ entries: [], running: false, error: null, queued: [] });
  });

  it("puts the reply being written where it will be saved, thinking before it has anything to show", () => {
    expect(shape(thread({ messages: [asked], partial: "" }))).toEqual({
      entries: [
        ["0", "user", false, null],
        ["1", "assistant", true, null],
      ],
      running: true,
      error: null,
    });
    const [, live] = transcriptOf(
      thread({ messages: [asked], partial: "Green", steps: [{ text: "Read tea.example", done: true }], startedAt: 5, memoryIds: ["m1"] }),
    ).entries;
    expect(live?.message).toEqual({
      role: "assistant",
      content: "Green",
      steps: [{ text: "Read tea.example", done: true }],
      said: [],
      startedAt: 5,
      memoryIds: ["m1"],
    });
  });

  it("keeps the reply's key when it ends, so it stays the same element", () => {
    const writing = transcriptOf(thread({ messages: [asked], partial: "Green tea is £4." })).entries.at(-1);
    const saved = transcriptOf(thread({ messages: [asked, answered] })).entries.at(-1);
    expect(saved?.key).toBe(writing?.key);
    expect(saved?.streaming).toBe(false);
  });

  it("says what went wrong on the reply it happened to, or on its own when there was no reply", () => {
    expect(shape(thread({ messages: [asked, answered], error: "Couldn't reach the model." }))).toEqual({
      entries: [
        ["0", "user", false, null],
        ["1", "assistant", false, "Couldn't reach the model."],
      ],
      running: false,
      error: null,
    });
    expect(shape(thread({ messages: [asked], error: "No key." }))).toEqual({
      entries: [["0", "user", false, null]],
      running: false,
      error: "No key.",
    });
  });

  it("says nothing went wrong while a reply is being written", () => {
    expect(shape(thread({ messages: [asked, answered, asked], partial: "", error: "Rate limited." }))).toMatchObject({
      entries: [
        ["0", "user", false, null],
        ["1", "assistant", false, null],
        ["2", "user", false, null],
        ["3", "assistant", true, null],
      ],
      error: null,
    });
  });

  it("puts an error only on the last reply, never an earlier one", () => {
    const { entries } = transcriptOf(thread({ messages: [asked, answered, asked, answered], error: "Rate limited." }));
    expect(entries.map(({ error }) => error)).toEqual([null, null, null, "Rate limited."]);
  });
});
