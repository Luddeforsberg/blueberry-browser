import { describe, expect, it } from "vitest";
import type { ChatThreadSummary, MascotProfile, Suggestion } from "@shared/library";
import { BERRY } from "@shared/mascots";
import { suggestionRows } from "./newTabSuggestions";

const chat = (id: string, updatedAt: number, more: Partial<ChatThreadSummary> = {}): ChatThreadSummary => ({
  id,
  title: id,
  updatedAt,
  mascotId: null,
  from: null,
  ...more,
});
const idea = (id: string): Suggestion => ({ id, title: id, why: "You do it often", kind: "prompt", prompt: id });
const mascot = (id: string, galleryId?: string, deletedAt: number | null = null): MascotProfile => ({
  ...BERRY,
  id,
  name: id,
  deletedAt,
  ...(galleryId ? { galleryId } : {}),
});
const examples = { "meeting-prep": "Prep me for a call.", "competitor-watch": "What changed on Linear?" };
const none = { chats: [], asking: new Set<string>(), suggestions: [], flock: [BERRY], examples, chosenAtOpen: BERRY.id };
const keys = (rows: ReturnType<typeof suggestionRows>) => rows.map(({ key }) => key);

describe("suggestionRows", () => {
  it("is empty with nothing real to show", () => {
    expect(suggestionRows(none)).toEqual([]);
    // A mascot from the Gallery with no example on file has nothing to try.
    expect(suggestionRows({ ...none, flock: [BERRY, mascot("w", "plain-words")] })).toEqual([]);
  });

  it("picks up only the newest finished chat the user started here, and nothing running or waiting", () => {
    const chats = [
      chat("old", 1),
      chat("newer", 2),
      chat("running", 9, { running: true }),
      chat("asking", 8),
      chat("from-app", 7, { from: "Claude Code" }),
    ];
    expect(keys(suggestionRows({ ...none, chats, asking: new Set(["asking"]) }))).toEqual(["chat-newer"]);
  });

  it("goes pick up, then the suggestions in their order, then mascots to try, four at most", () => {
    const rows = suggestionRows({
      ...none,
      chats: [chat("done", 1)],
      suggestions: [idea("b"), idea("a")],
      flock: [BERRY, mascot("prep", "meeting-prep"), mascot("watch", "competitor-watch")],
    });
    expect(keys(rows)).toEqual(["chat-done", "suggestion-b", "suggestion-a", "try-prep"]);
  });

  it("tries the mascots not chosen when the page opened first, and leaves out deleted ones", () => {
    const flock = [BERRY, mascot("prep", "meeting-prep"), mascot("watch", "competitor-watch"), mascot("gone", "competitor-watch", 5)];
    expect(keys(suggestionRows({ ...none, flock, chosenAtOpen: "prep" }))).toEqual(["try-watch", "try-prep"]);
    const [first] = suggestionRows({ ...none, flock });
    expect(first).toMatchObject({ kind: "try", prompt: "Prep me for a call." });
  });

  it("keeps to four with more of everything", () => {
    const rows = suggestionRows({ ...none, chats: [chat("done", 1)], suggestions: ["a", "b", "c", "d", "e"].map(idea) });
    expect(keys(rows)).toEqual(["chat-done", "suggestion-a", "suggestion-b", "suggestion-c"]);
  });
});
