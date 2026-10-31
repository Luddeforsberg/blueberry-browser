import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
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

  it("waits for a title on new chats, and a settled one stays", () => {
    const store = new ChatStore(":memory:");
    const id = store.createChat("hey");
    expect(store.needsTitle(id)).toBe(true);

    expect(store.setGeneratedTitle(id, "Generated")).toBe(true);
    expect(store.needsTitle(id)).toBe(false);
    expect(store.setGeneratedTitle(id, "Another")).toBe(false);
    expect(store.chat(id)?.title).toBe("Generated");

    store.renameChat(id, "Mine");
    expect(store.chat(id)?.title).toBe("Mine");
  });

  it("keeps renaming from moving a chat in the list", () => {
    let time = 0;
    vi.spyOn(Date, "now").mockImplementation(() => ++time);
    const store = new ChatStore(":memory:");
    const first = store.createChat("First");
    const second = store.createChat("Second");

    store.renameChat(first, "Renamed");

    expect(store.summaries().map((chat) => chat.id)).toEqual([second, first]);
  });

  it("deletes a chat's messages with it", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-chats-")), "chats.db");
    const store = new ChatStore(file);
    const id = store.createChat("Trip");
    store.addMessage(id, { role: "user", content: "first" });

    expect(store.deleteChat(id)).toBe(true);
    expect(store.deleteChat(id)).toBe(false);
    const { count } = new DatabaseSync(file).prepare("SELECT COUNT(*) AS count FROM messages").get() as { count: number };
    expect(count).toBe(0);
  });

  it("leaves the titles of chats saved before titles were generated", () => {
    const file = join(mkdtempSync(join(tmpdir(), "blueberry-chats-")), "chats.db");
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE chats (id TEXT PRIMARY KEY, title TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')), content TEXT NOT NULL);
      CREATE INDEX messages_by_chat ON messages(chat_id, id);
      INSERT INTO chats VALUES ('old', 'Old title', 1);
      PRAGMA user_version = 1;`);
    old.close();

    const store = new ChatStore(file);

    expect(store.chat("old")?.title).toBe("Old title");
    expect(store.needsTitle("old")).toBe(false);
  });
});
