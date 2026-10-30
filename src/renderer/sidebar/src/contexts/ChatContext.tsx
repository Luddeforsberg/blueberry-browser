import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ChatChunk, ChatMessage } from '@shared/ipc'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    isStreaming?: boolean
}

interface ChatContextType {
    messages: Message[]
    isLoading: boolean

    // Chat actions
    sendMessage: (content: string) => Promise<void>
    clearChat: () => void
}

const toMessages = (stored: ChatMessage[]): Message[] =>
    stored.map((msg, index) => ({
        id: `msg-${index}`,
        role: msg.role,
        content: msg.content,
        timestamp: Date.now(),
        isStreaming: false
    }))

const ChatContext = createContext<ChatContextType | null>(null)

export const useChat = () => {
    const context = useContext(ChatContext)
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider')
    }
    return context
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)

    // Load initial messages from main process
    useEffect(() => {
        const loadMessages = async () => {
            try {
                const storedMessages = await window.sidebarAPI.getMessages()
                if (storedMessages.length > 0) {
                    setMessages(toMessages(storedMessages))
                }
            } catch (error) {
                console.error('Failed to load messages:', error)
            }
        }
        loadMessages()
    }, [])

    const sendMessage = useCallback(async (content: string) => {
        setIsLoading(true)

        try {
            const messageId = Date.now().toString()

            // Send message to main process (which will handle context)
            await window.sidebarAPI.sendChatMessage({
                message: content,
                messageId: messageId
            })

            // Messages will be updated via the chat-messages-updated event
        } catch (error) {
            console.error('Failed to send message:', error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const clearChat = useCallback(async () => {
        try {
            await window.sidebarAPI.clearChat()
            setMessages([])
        } catch (error) {
            console.error('Failed to clear chat:', error)
        }
    }, [])

    // Set up message listeners
    useEffect(() => {
        // Listen for streaming response updates
        const handleChatChunk = (data: ChatChunk) => {
            if (data.isComplete) {
                setIsLoading(false)
                return
            }
            setMessages((current) => {
                const last = current[current.length - 1]
                if (last?.role !== 'assistant') return current
                return [...current.slice(0, -1), { ...last, content: last.content + data.content }]
            })
        }

        // Listen for message updates from main process
        const handleMessagesUpdated = (updatedMessages: ChatMessage[]) => {
            setMessages(toMessages(updatedMessages))
        }

        const unsubscribeChunks = window.sidebarAPI.onChatChunk(handleChatChunk)
        const unsubscribeMessages = window.sidebarAPI.onMessagesUpdated(handleMessagesUpdated)

        return () => {
            unsubscribeChunks()
            unsubscribeMessages()
        }
    }, [])

    const value: ChatContextType = {
        messages,
        isLoading,
        sendMessage,
        clearChat
    }

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    )
}

