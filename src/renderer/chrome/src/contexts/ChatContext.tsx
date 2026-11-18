import React, { useEffect, useState, useCallback } from "react";
import type { ChatThread } from "@shared/library";
import type { Attached } from "../useAttachments";
import { ChatContext, useChatThread, type ChatContextType, type Message } from "./useChat";

const toMessages = (thread: ChatThread | null): Message[] => {
  if (!thread) return [];
  const saved: Message[] = thread.messages.map((message, index) => ({ id: `msg-${index}`, ...message }));
  // Before the first words arrive, the thinking state stands in for the reply.
  return thread.partial || thread.statusLine || thread.steps.length > 0 || thread.approval
    ? [
        ...saved,
        {
          id: "partial",
          role: "assistant",
          content: thread.partial ?? "",
          statusLine: thread.statusLine,
          steps: thread.steps,
          said: thread.said,
          startedAt: thread.startedAt ?? undefined,
          memoryIds: thread.memoryIds,
          isStreaming: true,
        },
      ]
    : saved;
};

// The chat panel's conversation. New chat leaves this one in the sidebar and starts another.
export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [chatId, setChatId] = useState<string | null>(null);
  const thread = useChatThread(chatId);
  const [pageAccess, setPageAccessState] = useState(true);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    window.chromeAPI.chat.getPageAccess().then(setPageAccessState);
  }, []);

  // A panel chat has no tab, so main is told which one the panel has. A reply that ends in the open panel is then seen.
  useEffect(() => {
    void window.chromeAPI.chat.panelShows(chatId);
  }, [chatId]);

  useEffect(() => window.chromeAPI.chat.onDraft(setDraft), []);

  const setPageAccess = useCallback((enabled: boolean) => {
    setPageAccessState(enabled);
    window.chromeAPI.chat.setPageAccess(enabled).then(setPageAccessState);
  }, []);

  const sendMessage = useCallback(
    async (content: string, mascotId: string, attached?: Attached) => {
      try {
        const sent = await window.chromeAPI.chat.send(chatId, content, { seePage: true, mascotId, ...attached });
        if (sent) setChatId(sent.id);
        return sent !== null;
      } catch (error) {
        console.error("Failed to send message:", error);
        return false;
      }
    },
    [chatId],
  );

  // New messages would otherwise go to a chat that no longer exists.
  useEffect(() => window.chromeAPI.chat.onChatDeleted((id) => setChatId((current) => (current === id ? null : current))), []);

  const stop = useCallback(() => {
    if (chatId) void window.chromeAPI.chat.stop(chatId);
  }, [chatId]);

  const clearChat = useCallback(() => setChatId(null), []);
  const takeDraft = useCallback(() => setDraft(null), []);

  const value: ChatContextType = {
    messages: toMessages(thread),
    isLoading: thread?.partial != null,
    error: thread?.error ?? null,
    chatId,
    title: thread?.title ?? null,
    approval: thread?.approval ?? null,
    mascotId: thread?.mascotId ?? null,
    pageAccess,
    setPageAccess,
    sendMessage,
    stop,
    clearChat,
    draft,
    takeDraft,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
