import React, { useEffect, useRef, useLayoutEffect, useState } from 'react'
import { useBrowser } from '../contexts/BrowserContext'
import { useChat } from '../contexts/ChatContext'
import { Berry, useAssistantName } from './Berry'
import { AssistantMessage, ThinkingMessage, UserMessage } from './ChatMessage'
import { PageCard } from './PageCard'
import { ChatComposer } from './Composer'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    isStreaming?: boolean
}

// Auto-scroll hook
const useAutoScroll = (messages: Message[]) => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const prevCount = useRef(0)

    useLayoutEffect(() => {
        if (messages.length > prevCount.current) {
            setTimeout(() => {
                scrollRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'end'
                })
            }, 100)
        }
        prevCount.current = messages.length
    }, [messages.length])

    return scrollRef
}

// Conversation Turn Component
interface ConversationTurn {
    user?: Message
    assistant?: Message
}

const ConversationTurnComponent: React.FC<{
    turn: ConversationTurn
    isLoading?: boolean
}> = ({ turn, isLoading }) => (
    <div className="flex flex-col gap-5">
        {turn.user && <UserMessage content={turn.user.content} />}
        {turn.assistant && (
            <AssistantMessage
                content={turn.assistant.content}
                isStreaming={turn.assistant.isStreaming}
            />
        )}
        {isLoading && <ThinkingMessage />}
    </div>
)

const hostOf = (url: string) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return null
    }
}

// Whether Berry can see the open page. The card on the composer is the signal, and + brings it back.
const usePageAccess = () => {
    const [enabled, setEnabled] = useState(true)

    useEffect(() => {
        window.chromeAPI.chat.getPageAccess().then(setEnabled)
    }, [])

    const change = (next: boolean) => {
        setEnabled(next)
        window.chromeAPI.chat.setPageAccess(next).then(setEnabled)
    }

    return { enabled, change }
}

// Main Chat Component
export const Chat: React.FC = () => {
    const { messages, isLoading, sendMessage } = useChat()
    const scrollRef = useAutoScroll(messages)
    const name = useAssistantName()
    const { activeTab } = useBrowser()
    const { enabled, change } = usePageAccess()
    const host = activeTab && !activeTab.page ? hostOf(activeTab.url) : null

    // Group messages into conversation turns
    const conversationTurns: ConversationTurn[] = []
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'user') {
            const turn: ConversationTurn = { user: messages[i] }
            if (messages[i + 1]?.role === 'assistant') {
                turn.assistant = messages[i + 1]
                i++ // Skip next message since we've paired it
            }
            conversationTurns.push(turn)
        } else if (messages[i].role === 'assistant' &&
            (i === 0 || messages[i - 1]?.role !== 'user')) {
            // Handle standalone assistant messages
            conversationTurns.push({ assistant: messages[i] })
        }
    }

    // Check if we need to show loading after the last turn
    const showLoadingAfterLastTurn = isLoading &&
        messages[messages.length - 1]?.role === 'user'

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center animate-fade-in">
                        {name === 'Berry' && <Berry mood="rest" size={72} />}
                        <p className="text-14 text-muted-foreground">
                            Ask about this page, or anything else.
                        </p>
                    </div>
                ) : (
                    <div className="px-5 pt-3 pb-4 flex flex-col gap-6">
                        {conversationTurns.map((turn, index) => (
                            <ConversationTurnComponent
                                key={`turn-${index}`}
                                turn={turn}
                                isLoading={
                                    showLoadingAfterLastTurn &&
                                    index === conversationTurns.length - 1
                                }
                            />
                        ))}
                        <div ref={scrollRef} />
                    </div>
                )}
            </div>

            <div className="p-3 pt-1">
                <ChatComposer
                    onSend={sendMessage}
                    disabled={isLoading}
                    placeholder={name === 'Berry' ? 'Ask Berry' : 'Ask a question'}
                    attachment={
                        enabled && host ? (
                            <PageCard
                                title={activeTab?.title || host}
                                host={host}
                                favicon={activeTab?.favicon}
                                onRemove={() => change(false)}
                            />
                        ) : undefined
                    }
                    onAdd={!enabled && host ? () => change(true) : undefined}
                    addLabel={!enabled && host ? 'Add this page' : undefined}
                />
            </div>
        </div>
    )
}
