import type { ChatParts } from "./chatTypes";

const MAX_TITLE_LENGTH = 40;
export const MAX_RENAME_LENGTH = 100;
// A chat with no topic by then probably won't get one, so stop paying to ask.
const MAX_TITLE_ATTEMPTS = 5;

export const titleFrom = (text: string): string =>
  text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : text;

// A chat's name: its first message, until a cheap model finds it a topic.
export class ChatTitles {
  private readonly store: ChatParts["store"];
  private readonly generateTitle: ChatParts["generateTitle"];
  private readonly notify: ChatParts["notify"];

  constructor(parts: Pick<ChatParts, "store" | "generateTitle" | "notify">) {
    this.store = parts.store;
    this.generateTitle = parts.generateTitle;
    this.notify = parts.notify;
  }

  // Never rejects: a chat keeps its first message as its title until this works.
  async nameChat(chatId: string): Promise<void> {
    const chat = this.store.chat(chatId);
    if (!chat || !this.store.needsTitle(chatId)) return;
    if (chat.messages.filter((message) => message.role === "user").length > MAX_TITLE_ATTEMPTS) return;
    try {
      const title = await this.generateTitle(chat.messages);
      if (title && this.store.setGeneratedTitle(chatId, title)) this.notify(chatId);
    } catch (error) {
      console.error("Failed to generate a chat title:", error);
    }
  }
}
