import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import type { ChatThreadMessage, ChatThreadSummary } from "../shared/library";
import { migrate } from "./database";

export interface StoredChat extends ChatThreadSummary {
  messages: ChatThreadMessage[];
}

const MIGRATIONS = [
  `CREATE TABLE chats (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
     role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
     content TEXT NOT NULL
   );
   CREATE INDEX messages_by_chat ON messages(chat_id, id);`,
  // A settled title is final: the user chose it, or it was generated. Chats from before this keep theirs.
  `ALTER TABLE chats ADD COLUMN title_settled INTEGER NOT NULL DEFAULT 1;`,
  `ALTER TABLE messages ADD COLUMN steps TEXT;`,
  // Chats from before the flock have none, which means Berry.
  `ALTER TABLE chats ADD COLUMN mascot_id TEXT;`,
  `ALTER TABLE messages ADD COLUMN memory TEXT;`,
];

// Saved chats, in a SQLite file in the user data folder. Built-in SQLite needs no native module to
// rebuild for Electron, and the same code runs under Vitest.
export class ChatStore {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    migrate(this.db, MIGRATIONS);
  }

  summaries(): ChatThreadSummary[] {
    return this.db
      .prepare("SELECT id, title, updated_at AS updatedAt, mascot_id AS mascotId FROM chats ORDER BY updated_at DESC, rowid DESC")
      .all() as unknown as ChatThreadSummary[];
  }

  // What each of the newest chats began with, for noticing what the user keeps asking.
  firstMessages(limit: number): Array<ChatThreadSummary & { firstMessage: string }> {
    return this.db
      .prepare(
        `SELECT id, title, updated_at AS updatedAt, mascot_id AS mascotId,
           (SELECT content FROM messages WHERE chat_id = chats.id AND role = 'user' ORDER BY id LIMIT 1) AS firstMessage
         FROM chats ORDER BY updated_at DESC, rowid DESC LIMIT ?`
      )
      .all(limit)
      .flatMap((row) => ((row as { firstMessage: string | null }).firstMessage ? [row as unknown as ChatThreadSummary & { firstMessage: string }] : []));
  }

  chat(id: string): StoredChat | null {
    const summary = this.db
      .prepare("SELECT id, title, updated_at AS updatedAt, mascot_id AS mascotId FROM chats WHERE id = ?")
      .get(id) as unknown as ChatThreadSummary | undefined;
    if (!summary) return null;
    const rows = this.db
      .prepare("SELECT role, content, steps, memory FROM messages WHERE chat_id = ? ORDER BY id")
      .all(id) as unknown as Array<Pick<ChatThreadMessage, "role" | "content"> & { steps: string | null; memory: string | null }>;
    const messages = rows.map(({ steps, memory, ...message }): ChatThreadMessage => ({
      ...message,
      ...(steps ? { steps: JSON.parse(steps) } : {}),
      ...(memory ? { memoryIds: JSON.parse(memory) } : {}),
    }));
    return { ...summary, messages };
  }

  createChat(title: string, mascotId: string | null = null): string {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO chats (id, title, updated_at, title_settled, mascot_id) VALUES (?, ?, ?, 0, ?)")
      .run(id, title, Date.now(), mascotId);
    return id;
  }

  needsTitle(id: string): boolean {
    return this.db.prepare("SELECT 1 FROM chats WHERE id = ? AND title_settled = 0").get(id) !== undefined;
  }

  // The user's choice, which a generated title never replaces.
  renameChat(id: string, title: string): boolean {
    const { changes } = this.db
      .prepare("UPDATE chats SET title = ?, title_settled = 1 WHERE id = ?")
      .run(title, id);
    return changes > 0;
  }

  // False if the chat was renamed or deleted while the title was being generated.
  setGeneratedTitle(id: string, title: string): boolean {
    const { changes } = this.db
      .prepare("UPDATE chats SET title = ?, title_settled = 1 WHERE id = ? AND title_settled = 0")
      .run(title, id);
    return changes > 0;
  }

  deleteChat(id: string): boolean {
    return this.db.prepare("DELETE FROM chats WHERE id = ?").run(id).changes > 0;
  }

  addMessage(chatId: string, message: ChatThreadMessage): void {
    this.db
      .prepare("INSERT INTO messages (chat_id, role, content, steps, memory) VALUES (?, ?, ?, ?, ?)")
      .run(chatId, message.role, message.content, message.steps?.length ? JSON.stringify(message.steps) : null, message.memoryIds?.length ? JSON.stringify(message.memoryIds) : null);
    this.db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(Date.now(), chatId);
  }
}
