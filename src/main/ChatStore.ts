import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";
import type { ChatThreadMessage, ChatThreadSummary } from "../shared/library";

export interface StoredChat extends ChatThreadSummary {
  messages: ChatThreadMessage[];
}

// Each step takes the database to the next `user_version`. Add new steps at the end.
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
];

// Saved chats, in a SQLite file in the user data folder. Built-in SQLite needs no native module to
// rebuild for Electron, and the same code runs under Vitest.
export class ChatStore {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    const { user_version: version } = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    MIGRATIONS.slice(version).forEach((step, index) => {
      this.db.exec(`BEGIN; ${step} PRAGMA user_version = ${version + index + 1}; COMMIT;`);
    });
  }

  summaries(): ChatThreadSummary[] {
    return this.db
      .prepare("SELECT id, title, updated_at AS updatedAt FROM chats ORDER BY updated_at DESC, rowid DESC")
      .all() as unknown as ChatThreadSummary[];
  }

  chat(id: string): StoredChat | null {
    const summary = this.db
      .prepare("SELECT id, title, updated_at AS updatedAt FROM chats WHERE id = ?")
      .get(id) as unknown as ChatThreadSummary | undefined;
    if (!summary) return null;
    const messages = this.db
      .prepare("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id")
      .all(id) as unknown as ChatThreadMessage[];
    return { ...summary, messages };
  }

  createChat(title: string): string {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO chats (id, title, updated_at) VALUES (?, ?, ?)")
      .run(id, title, Date.now());
    return id;
  }

  addMessage(chatId: string, message: ChatThreadMessage): void {
    this.db
      .prepare("INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)")
      .run(chatId, message.role, message.content);
    this.db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(Date.now(), chatId);
  }
}
