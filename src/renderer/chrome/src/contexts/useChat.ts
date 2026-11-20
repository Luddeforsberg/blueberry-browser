import { createContext, useContext, useEffect, useState } from "react";
import type { ChatApproval, ChatThread } from "@shared/library";
import type { Attached } from "../useAttachments";
import type { Transcript } from "../chatTranscript";

export interface ChatContextType {
  transcript: Transcript;
  chatId: string | null;
  // The open chat's name, once it has one.
  title: string | null;
  approval: ChatApproval | null;
  // Who the open chat runs as. Null is Berry, and it's also what a chat not started yet has.
  mascotId: string | null;
  // Whether Berry can see the open page. The card on the composer is the signal, and + brings it back.
  pageAccess: boolean;
  setPageAccess: (enabled: boolean) => void;

  // Chat actions
  // A new chat runs as `mascotId`. An open one keeps its own.
  // Whether main took the message.
  sendMessage: (content: string, mascotId: string, attached?: Attached) => Promise<boolean>;
  stop: () => void;
  clearChat: () => void;

  // Text waiting to go into the panel's composer, which may only just be opening.
  draft: string | null;
  takeDraft: () => void;
}

// One saved chat, kept current while its reply streams.
export const useChatThread = (chatId: string | null): ChatThread | null => {
  const [thread, setThread] = useState<ChatThread | null>(null);

  useEffect(() => {
    if (!chatId) return undefined;
    const { chat, library } = window.chromeAPI;
    const unsubscribeThread = chat.onChatUpdated((updated) => {
      if (updated.id === chatId) setThread(updated);
    });
    const unsubscribeChunks = chat.onChatChunk(({ chatId: id, content }) => {
      if (id === chatId) setThread((current) => current && { ...current, partial: (current.partial ?? "") + content });
    });
    void library.getChat(chatId).then(setThread);
    return () => {
      unsubscribeThread();
      unsubscribeChunks();
    };
  }, [chatId]);

  return thread?.id === chatId ? thread : null;
};

export const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};
