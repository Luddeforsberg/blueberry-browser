import React from 'react'
import { useBrowser } from '../contexts/BrowserContext'
import { useChat, type Message } from '../contexts/ChatContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useAssistantName, BerrySpot } from './Berry'
import { AssistantMessage, ChatApprovalCard, ChatError, ThinkingMessage, UserMessage, useFollowReply } from './ChatMessage'
import { MemoryOffers } from './MemoryInChat'
import { PageCard } from './PageCard'
import { ChatComposer } from './Composer'
import { siteAllowed } from '@shared/mascots'
import type { MascotProfile } from '@shared/library'

// Conversation Turn Component
interface ConversationTurn {
    user?: Message
    assistant?: Message
}

const ConversationTurnComponent: React.FC<{
    turn: ConversationTurn
    isLoading?: boolean
    waiting?: boolean
    mascot: MascotProfile
    failed?: boolean
}> = ({ turn, isLoading, waiting, mascot, failed }) => (
    <div className="flex flex-col gap-5">
        {turn.user && <UserMessage content={turn.user.content} />}
        {turn.assistant && (
            <AssistantMessage
                content={turn.assistant.content}
                steps={turn.assistant.steps}
                isStreaming={turn.assistant.isStreaming}
                waiting={waiting}
                mascot={mascot}
                failed={failed}
                memoryIds={turn.assistant.memoryIds}
                pages={turn.assistant.pages}
            />
        )}
        {isLoading && <ThinkingMessage mascot={mascot} />}
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
    const { messages, isLoading, error, chatId, approval, sendMessage, stop, pageAccess: enabled, setPageAccess: change, draft, takeDraft, mascotId } = useChat()
    const { find, chosen, choose } = useFlock()
    // A chat not started yet goes to whoever is chosen. After that, it stays with the mascot it started with.
    const mascot = chatId ? find(mascotId) : chosen
    const scrollerRef = useFollowReply(
        messages.filter((message) => message.role === 'user').length,
        messages[messages.length - 1]?.content,
        (messages[messages.length - 1]?.steps?.length ?? 0) + (approval ? 1 : 0)
    )
    const name = useAssistantName(mascot)
    const { activeTab } = useBrowser()
    const host = activeTab && !activeTab.page ? hostOf(activeTab.url) : null
    const canUseSite = !!activeTab && siteAllowed(activeTab.url, mascot.sites)
    const heldByUser = useLibrary().needsYou.some(({ approval }) => !!activeTab && approval.handoff?.tabId === activeTab.id)

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
                        {name !== 'Assistant' && <BerrySpot size={72} />}
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
                                waiting={approval !== null}
                                mascot={mascot}
                                failed={!!error && index === conversationTurns.length - 1}
                                isLoading={
                                    showLoadingAfterLastTurn &&
                                    index === conversationTurns.length - 1
                                }
                            />
                        ))}
                        {chatId && approval && <ChatApprovalCard chatId={chatId} approval={approval} mascot={mascot} />}
                        {error && <ChatError message={error} />}
                        {!isLoading && <MemoryOffers key={chatId} sourceId={chatId} mascot={mascot} />}
                    </div>
                )}
            </div>

            <div className="p-3 pt-1">
                <ChatComposer
                    onSend={(message) => void sendMessage(message, mascot.id)}
                    mascot={mascot}
                    onChooseMascot={chatId ? undefined : choose}
                    draft={draft}
                    onDraftTaken={takeDraft}
                    disabled={isLoading}
                    onStop={isLoading ? stop : undefined}
                    placeholder={name === 'Assistant' ? 'Ask a question' : `Ask ${name}`}
                    attachment={
                        heldByUser ? (
                            <p className="px-2 py-1 text-12 text-muted-foreground">{name} can’t see this tab while it’s with you.</p>
                        ) : host && !canUseSite ? (
                            <p className="px-2 py-1 text-12 text-muted-foreground">{name} isn’t allowed on {host}, so it can’t see this page.</p>
                        ) : enabled && host ? (
                            <PageCard
                                title={activeTab?.title || host}
                                host={host}
                                favicon={activeTab?.favicon}
                                onRemove={() => change(false)}
                            />
                        ) : undefined
                    }
                    onAdd={!enabled && host && canUseSite ? () => change(true) : undefined}
                    addLabel={!enabled && host && canUseSite ? 'Add this page' : undefined}
                />
            </div>
        </div>
    )
}
