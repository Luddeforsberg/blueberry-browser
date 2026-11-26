import type { ChatThread, ChatThreadMessage, QueuedMessage } from "@shared/library";

interface TranscriptEntry {
  // Its place in the chat. The reply being written holds the place it's saved in, so it stays the same element when it
  // ends.
  key: string;
  message: ChatThreadMessage;
  // The reply being written now. Before its first words or steps, it's the one thinking.
  streaming: boolean;
  // Why this reply went wrong, on the last reply only, once it's over.
  error: string | null;
}

export interface Transcript {
  entries: TranscriptEntry[];
  // A reply is being written.
  running: boolean;
  // Why the last reply went wrong, when there's no reply of its own to say it on, as when there's no key.
  error: string | null;
  // What the user sent while a reply ran, waiting for it.
  queued: QueuedMessage[];
}

// A chat as both layouts show it, the panel beside a page and the chat page: what's saved, then the reply being written.
export const transcriptOf = (thread: ChatThread | null): Transcript => {
  if (!thread) return { entries: [], running: false, error: null, queued: [] };
  const running = thread.partial !== null;
  const messages: ChatThreadMessage[] =
    thread.partial === null
      ? thread.messages
      : [
          ...thread.messages,
          {
            role: "assistant",
            content: thread.partial,
            steps: thread.steps,
            said: thread.said,
            startedAt: thread.startedAt ?? undefined,
            memoryIds: thread.memoryIds,
          },
        ];
  const last = messages.length - 1;
  const onReply = !running && thread.error !== null && messages[last]?.role === "assistant";
  return {
    entries: messages.map((message, index) => ({
      key: String(index),
      message,
      streaming: running && index === last,
      error: onReply && index === last ? thread.error : null,
    })),
    running,
    error: running || onReply ? null : thread.error,
    queued: thread.queued,
  };
};
