import { randomUUID } from "node:crypto";
import type { SentAttachment } from "../../shared/attachments";
import type { ChatThread, QueuedMessage } from "../../shared/library";
import type { EndedReply } from "./chatTypes";

interface Waiting<Options> {
  id: string;
  text: string;
  // What `Chats.send` was given with it, kept as it was.
  options: Options;
  attached: SentAttachment[];
}

interface FollowUpChats<Options> {
  send(chatId: string, text: string, options: Options): ChatThread | null;
  stop(chatId: string): void;
  isRunning(chatId: string): boolean;
  changed(chatId: string): void;
}

// What the user sends in a chat while its reply runs. It waits here in order, and the first goes once the reply before it
// ends done. A stop or a failure leaves them waiting for the user, unless Send now stopped it to send one. Memory only.
export class FollowUps<Options> {
  private readonly waiting = new Map<string, Array<Waiting<Options>>>();
  // Chats whose reply was stopped to send the first one waiting.
  private readonly sendAfterStop = new Set<string>();

  constructor(private readonly chats: FollowUpChats<Options>) {}

  add(chatId: string, text: string, options: Options, attached: SentAttachment[]): void {
    const list = this.waiting.get(chatId) ?? [];
    list.push({ id: randomUUID(), text, options, attached });
    this.waiting.set(chatId, list);
    this.chats.changed(chatId);
  }

  list(chatId: string): QueuedMessage[] {
    return (this.waiting.get(chatId) ?? []).map(({ id, text, attached }) => ({
      id,
      content: text,
      ...(attached.length > 0 ? { attached } : {}),
    }));
  }

  // What a reply's `onEnd` becomes: whoever started it hears first, then the next one goes.
  after(chatId: string, onEnd: ((ended: EndedReply) => void) | undefined): (ended: EndedReply) => void {
    return (ended) => {
      onEnd?.(ended);
      const now = this.sendAfterStop.delete(chatId);
      // Once the reply has finished ending, so the next starts on a chat that's put away.
      if (ended.outcome === "done" || now) queueMicrotask(() => this.next(chatId));
    };
  }

  // Send now stops the reply and sends this one first. Remove forgets it.
  act(chatId: string, id: string, action: "send-now" | "remove"): boolean {
    const list = this.waiting.get(chatId);
    const index = list?.findIndex((waiting) => waiting.id === id) ?? -1;
    if (!list || index < 0) return false;
    const [chosen] = list.splice(index, 1);
    if (!chosen) return false;
    if (action === "send-now") list.unshift(chosen);
    if (list.length === 0) this.waiting.delete(chatId);
    if (action === "send-now" && this.chats.isRunning(chatId)) {
      this.sendAfterStop.add(chatId);
      this.chats.stop(chatId);
    } else if (action === "send-now") this.next(chatId);
    this.chats.changed(chatId);
    return true;
  }

  forget(chatId: string): void {
    this.waiting.delete(chatId);
    this.sendAfterStop.delete(chatId);
  }

  // A message the user sent in between goes first, and this one waits for its reply. One that can't go now, as when a tab
  // it carries has been handed to the user since, stays first in line for the user to send or remove.
  private next(chatId: string): void {
    const list = this.waiting.get(chatId);
    const first = list?.[0];
    if (!list || !first || this.chats.isRunning(chatId)) return;
    list.shift();
    if (list.length === 0) this.waiting.delete(chatId);
    if (this.chats.send(chatId, first.text, first.options)) return;
    this.waiting.set(chatId, [first, ...(this.waiting.get(chatId) ?? [])]);
    this.chats.changed(chatId);
  }
}
