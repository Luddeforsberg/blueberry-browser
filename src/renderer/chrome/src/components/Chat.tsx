import React from 'react'
import { useBrowser } from '../contexts/BrowserContext'
import { useChat, type Message } from '../contexts/ChatContext'
import { useAssistantName, BerrySpot } from './Berry'
import { AssistantMessage, ChatError, ThinkingMessage, UserMessage, useFollowReply } from './ChatMessage'
import { PageCard } from './PageCard'
import { ChatComposer } from './Composer'

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
                steps={turn.assistant.steps}
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

// Main Chat Component
export const Chat: React.FC = () => {
    const { messages, isLoading, error, sendMessage, stop, pageAccess: enabled, setPageAccess: change } = useChat()
    const scrollerRef = useFollowReply(
        messages.filter((message) => message.role === 'user').length,
        messages[messages.length - 1]?.content,
        messages[messages.length - 1]?.steps?.length ?? 0
    )
    const name = useAssistantName()
    const { activeTab } = useBrowser()
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
            <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center animate-fade-in">
                        {name === 'Berry' && <BerrySpot size={72} />}
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
                        {error && <ChatError message={error} />}
                    </div>
                )}
            </div>

            <div className="p-3 pt-1">
                <ChatComposer
                    onSend={sendMessage}
                    disabled={isLoading}
                    onStop={isLoading ? stop : undefined}
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
