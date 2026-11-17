import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ChatApproval, ChatStep, ChatThread, SaidOnTheWay, UsedPage } from '@shared/library'
import type { SentAttachment } from '@shared/attachments'
import type { Attached } from '../useAttachments'

export interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    steps?: ChatStep[]
    said?: SaidOnTheWay[]
    startedAt?: number
    took?: number
    memoryIds?: string[]
    pages?: UsedPage[]
    attached?: SentAttachment[]
    isStreaming?: boolean
    statusLine?: string | null
}

interface ChatContextType {
    messages: Message[]
    isLoading: boolean
    error: string | null
    chatId: string | null
    // The open chat's name, once it has one.
    title: string | null
    approval: ChatApproval | null
    // Who the open chat runs as. Null is Berry, and it's also what a chat not started yet has.
    mascotId: string | null
    // Whether Berry can see the open page. The card on the composer is the signal, and + brings it back.
    pageAccess: boolean
    setPageAccess: (enabled: boolean) => void

    // Chat actions
    // A new chat runs as `mascotId`. An open one keeps its own.
    // Whether main took the message.
    sendMessage: (content: string, mascotId: string, attached?: Attached) => Promise<boolean>
    stop: () => void
    clearChat: () => void

    // Text waiting to go into the panel's composer, which may only just be opening.
    draft: string | null
    takeDraft: () => void
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
    return thread.partial || thread.statusLine || thread.steps.length > 0 || thread.approval
        ? [...saved, { id: 'partial', role: 'assistant', content: thread.partial ?? '', statusLine: thread.statusLine, steps: thread.steps, said: thread.said, startedAt: thread.startedAt ?? undefined, memoryIds: thread.memoryIds, isStreaming: true }]
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
    const [draft, setDraft] = useState<string | null>(null)

    useEffect(() => {
        window.chromeAPI.chat.getPageAccess().then(setPageAccessState)
    }, [])

    useEffect(() => window.chromeAPI.chat.onDraft(setDraft), [])

    const setPageAccess = useCallback((enabled: boolean) => {
        setPageAccessState(enabled)
        window.chromeAPI.chat.setPageAccess(enabled).then(setPageAccessState)
    }, [])

    const sendMessage = useCallback(async (content: string, mascotId: string, attached?: Attached) => {
        try {
            const sent = await window.chromeAPI.chat.send(chatId, content, { seePage: true, mascotId, ...attached })
            if (sent) setChatId(sent.id)
            return sent !== null
        } catch (error) {
            console.error('Failed to send message:', error)
            return false
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
    const takeDraft = useCallback(() => setDraft(null), [])

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
        takeDraft
    }

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    )
}
