import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ChatApproval, ChatStep, ChatThread } from '@shared/library'

export interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    steps?: ChatStep[]
    isStreaming?: boolean
}

interface ChatContextType {
    messages: Message[]
    isLoading: boolean
    error: string | null
    chatId: string | null
    approval: ChatApproval | null
    // Whether Berry can see the open page. The card on the composer is the signal, and + brings it back.
    pageAccess: boolean
    setPageAccess: (enabled: boolean) => void

    // Chat actions
    sendMessage: (content: string) => Promise<void>
    stop: () => void
    clearChat: () => void
}

// One saved chat, kept current while its reply streams.
export const useChatThread = (chatId: string | null): ChatThread | null => {
    const [thread, setThread] = useState<ChatThread | null>(null)

    useEffect(() => {
        if (!chatId) return undefined
        const { chat, library } = window.chromeAPI
        const unsubscribeThread = chat.onChatUpdated((updated) => {
            if (updated.id === chatId) setThread(updated)
        })
        const unsubscribeChunks = chat.onChatChunk(({ chatId: id, content }) => {
            if (id === chatId) setThread((current) => current && { ...current, partial: (current.partial ?? '') + content })
        })
        library.getChat(chatId).then(setThread)
        return () => {
            unsubscribeThread()
            unsubscribeChunks()
        }
    }, [chatId])

    return thread?.id === chatId ? thread : null
}

const toMessages = (thread: ChatThread | null): Message[] => {
    if (!thread) return []
    const saved: Message[] = thread.messages.map((message, index) => ({ id: `msg-${index}`, ...message }))
    // Before the first words arrive, the thinking state stands in for the reply.
    return thread.partial || thread.steps.length > 0 || thread.approval
        ? [...saved, { id: 'partial', role: 'assistant', content: thread.partial ?? '', steps: thread.steps, isStreaming: true }]
        : saved
}

const ChatContext = createContext<ChatContextType | null>(null)

export const useChat = () => {
    const context = useContext(ChatContext)
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider')
    }
    return context
}

// The chat panel's conversation. New chat leaves this one in the sidebar and starts another.
export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [chatId, setChatId] = useState<string | null>(null)
    const thread = useChatThread(chatId)
    const [pageAccess, setPageAccessState] = useState(true)

    useEffect(() => {
        window.chromeAPI.chat.getPageAccess().then(setPageAccessState)
    }, [])

    const setPageAccess = useCallback((enabled: boolean) => {
        setPageAccessState(enabled)
        window.chromeAPI.chat.setPageAccess(enabled).then(setPageAccessState)
    }, [])

    const sendMessage = useCallback(async (content: string) => {
        try {
            const sent = await window.chromeAPI.chat.send(chatId, content, { seePage: true })
            if (sent) setChatId(sent.id)
        } catch (error) {
            console.error('Failed to send message:', error)
        }
    }, [chatId])

    // New messages would otherwise go to a chat that no longer exists.
    useEffect(
        () => window.chromeAPI.chat.onChatDeleted((id) => setChatId((current) => (current === id ? null : current))),
        []
    )

    const stop = useCallback(() => {
        if (chatId) void window.chromeAPI.chat.stop(chatId)
    }, [chatId])

    const clearChat = useCallback(() => setChatId(null), [])

    const value: ChatContextType = {
        messages: toMessages(thread),
        isLoading: thread?.partial != null,
        error: thread?.error ?? null,
        chatId,
        approval: thread?.approval ?? null,
        pageAccess,
        setPageAccess,
        sendMessage,
        stop,
        clearChat
    }

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    )
}
