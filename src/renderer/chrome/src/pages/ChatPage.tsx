import React from 'react'
import type { TabInfo } from '@shared/ipc'
import { useChatThread } from '../contexts/ChatContext'
import { AssistantMessage, ChatError, UserMessage, useFollowReply } from '../components/ChatMessage'
import { BerryHero, useAssistantName } from '../components/Berry'
import { ChatComposer } from '../components/Composer'

// A full page for talking to Berry about anything, not about a web page.
export const ChatPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const chatId = tab.pageParam
    const thread = useChatThread(chatId)
    const name = useAssistantName()
    const partial = thread?.partial
    const running = partial != null
    const scrollerRef = useFollowReply(
        thread?.messages.filter((message) => message.role === 'user').length ?? 0,
        partial
    )

    const send = async (message: string) => {
        const chat = await window.chromeAPI.chat.send(chatId, message, { seePage: false })
        // A new chat gets its own tab, so it can be found again in the sidebar.
        if (chat && !chatId) {
            await window.chromeAPI.browser.openPage('chat', { param: chat.id, title: chat.title })
            await window.chromeAPI.browser.closeTab(tab.id)
        }
    }

    const empty = !thread || thread.messages.length === 0
    const composer = (
        <ChatComposer
            onSend={(message) => void send(message)}
            disabled={running}
            onStop={running && chatId ? () => void window.chromeAPI.chat.stop(chatId) : undefined}
            placeholder={name === 'Berry' ? 'Ask Berry' : 'Ask a question'}
            autoFocus
        />
    )

    // A new chat looks like the new tab page. Once it has messages, the composer moves to the bottom.
    if (empty) {
        return (
            <div className="h-full overflow-y-auto">
                <div className="max-w-[800px] mx-auto px-6 pt-[18vh] pb-12">
                    <BerryHero title="What are you working on?" />
                    {composer}
                </div>
            </div>
        )
    }

    // The reply being written holds the place it's saved in, so it stays the same element when it ends.
    const messages = running ? [...thread.messages, { role: 'assistant' as const, content: partial }] : thread.messages

    return (
        <div className="h-full flex flex-col">
            <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
                <div className="max-w-[800px] mx-auto px-6 pt-8 pb-4 flex flex-col gap-6">
                    {messages.map((message, index) =>
                        message.role === 'user' ? (
                            <UserMessage key={index} content={message.content} />
                        ) : (
                            <AssistantMessage
                                key={index}
                                content={message.content}
                                isStreaming={running && index === messages.length - 1}
                                avatar
                            />
                        )
                    )}
                    {thread.error && <ChatError message={thread.error} />}
                </div>
            </div>

            <div className="max-w-[800px] w-full mx-auto px-6 pb-5">{composer}</div>
        </div>
    )
}
