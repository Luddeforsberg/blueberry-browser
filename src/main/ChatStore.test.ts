import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { ChatStore } from "./ChatStore";

describe("ChatStore", () => {
  it("keeps chats and their messages in order across opening the file again", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-chats-")), "nested", "chats.db");
    const store = new ChatStore(file);
    const id = store.createChat("Trip");
    store.addMessage(id, { role: "user", content: "first" });
    store.addMessage(id, { role: "assistant", content: "second" });

    expect(new ChatStore(file).chat(id)).toMatchObject({
      title: "Trip",
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "second" },
      ],
    });
  });

  it("has no chat for an unknown id", () => {
    const store = new ChatStore(":memory:");
    expect(store.summaries()).toEqual([]);
    expect(store.chat("missing")).toBeNull();
  });

  it("lists the most recently used chat first", () => {
    let time = 0;
    vi.spyOn(Date, "now").mockImplementation(() => ++time);
    const store = new ChatStore(":memory:");
    const first = store.createChat("First");
    const second = store.createChat("Second");
    expect(store.summaries().map((chat) => chat.id)).toEqual([second, first]);

    store.addMessage(first, { role: "user", content: "again" });
    expect(store.summaries()[0].id).toBe(first);
  });
});
