import React from 'react'
import { useBrowser } from '../contexts/BrowserContext'
import { useChat, type Message } from '../contexts/ChatContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useAssistantName, BerrySpot } from './Berry'
import { AssistantMessage, ChatApprovalCard, ThinkingMessage, UserMessage, WentWrong, didWork, saveChatAsRoutine, useFollowReply, type ReplyActions } from './ChatMessage'
import { MemoryOffers } from './MemoryInChat'
import { PageCard } from './PageCard'
import { ChatComposer } from './Composer'
import { siteAllowed } from '@shared/mascots'

const hostOf = (url: string) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return null
    }
}

// The chat panel's conversation: the same messages, steps, cards and prompt box as the main chat, beside a page.
export const Chat: React.FC = () => {
    const { messages, isLoading, error, chatId, title, approval, sendMessage, stop, pageAccess: enabled, setPageAccess: change, draft, takeDraft, mascotId } = useChat()
    const { find, chosen, choose } = useFlock()
    // A chat not started yet goes to whoever is chosen. After that, it stays with the mascot it started with.
    const mascot = chatId ? find(mascotId) : chosen
    const library = useLibrary()
    // An offer to remember arrives after the reply has ended, and has to be followed down like a step.
    const offers = library.memory.offers.filter((offer) => offer.sourceId === chatId).length
    const scrollerRef = useFollowReply(
        messages.filter((message) => message.role === 'user').length,
        messages[messages.length - 1]?.content,
        (messages[messages.length - 1]?.steps?.length ?? 0) + (approval ? 1 : 0) + offers
    )
    const name = useAssistantName(mascot)
    const { activeTab } = useBrowser()
    const host = activeTab && !activeTab.page ? hostOf(activeTab.url) : null
    const canUseSite = !!activeTab && siteAllowed(activeTab.url, mascot.sites)
    const heldByUser = library.needsYou.some(({ approval }) => !!activeTab && approval.handoff?.tabId === activeTab.id)

    const last = messages.at(-1)
    // Before the reply has anything to show, there's no message for it yet.
    const thinking = isLoading && last?.role === 'user'
    const failedReply = error && last?.role === 'assistant' ? last : null
    const actions: ReplyActions = {
        onSay: (words) => void sendMessage(words, mascot.id),
        onSaveAsRoutine: chatId && didWork(messages) ? () => saveChatAsRoutine(title ?? '', messages, mascotId) : undefined,
    }

    return (
        <div className="flex flex-col h-full">
            <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center animate-fade-in">
                        <BerrySpot size={40} />
                        <p className="text-13 text-ink-2">
                            Ask about this page, or anything else.
                        </p>
                    </div>
                ) : (
                    <div className="px-3.5 pt-2 pb-4 flex flex-col gap-6">
                        {messages.map((message: Message, index) =>
                            message.role === 'user' ? (
                                <UserMessage key={message.id} content={message.content} />
                            ) : (
                                <AssistantMessage
                                    key={message.id}
                                    content={message.content}
                                    steps={message.steps}
                                    statusLine={message.statusLine}
                                    isStreaming={message.isStreaming}
                                    waiting={approval !== null}
                                    mascot={mascot}
                                    error={message === failedReply && error ? error : undefined}
                                    memoryIds={message.memoryIds}
                                    pages={message.pages}
                                    actions={!isLoading && index === messages.length - 1 ? actions : undefined}
                                />
                            )
                        )}
                        {thinking && <ThinkingMessage mascot={mascot} waiting={approval !== null} />}
                        {chatId && approval && <div className="-mt-2"><ChatApprovalCard chatId={chatId} approval={approval} mascot={mascot} /></div>}
                        {error && !isLoading && !failedReply && <WentWrong message={error} mascot={mascot} actions={actions} />}
                        {!isLoading && <MemoryOffers key={chatId} sourceId={chatId} mascot={mascot} />}
                    </div>
                )}
            </div>

            <div className="px-3.5 pb-3.5 pt-1">
                <ChatComposer
                    onSend={(message) => void sendMessage(message, mascot.id)}
                    mascot={mascot}
                    onChooseMascot={chatId ? undefined : choose}
                    draft={draft}
                    onDraftTaken={takeDraft}
                    disabled={isLoading}
                    onStop={isLoading ? stop : undefined}
                    placeholder={name === 'Assistant' ? 'Write a message' : isLoading ? `Tell ${name} something while it works` : `Tell ${name} something`}
                    attachment={
                        heldByUser ? (
                            <p className="px-2 py-1 text-12 text-ink-2">{name} can’t see this tab while it’s with you.</p>
                        ) : host && !canUseSite ? (
                            <p className="px-2 py-1 text-12 text-ink-2">{name} isn’t allowed on {host}, so it can’t see this page.</p>
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
