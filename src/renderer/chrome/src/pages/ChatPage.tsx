import React, { useEffect, useRef, useState } from 'react'
import type { TabInfo } from '@shared/ipc'
import type { ChatThread } from '@shared/library'
import { useLibrary } from '../contexts/LibraryContext'
import { AssistantMessage, UserMessage } from '../components/ChatMessage'
import { BerryHero, useAssistantName } from '../components/Berry'
import { ChatComposer } from '../components/Composer'

// A full page for talking to Berry about anything, not about a web page.
export const ChatPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const library = useLibrary()
    const [thread, setThread] = useState<ChatThread | null>(null)
    const name = useAssistantName()
    const endRef = useRef<HTMLDivElement>(null)
    const chatId = tab.pageParam
    const updatedAt = library.chats.find((chat) => chat.id === chatId)?.updatedAt

    useEffect(() => {
        if (!chatId) {
            setThread(null)
            return
        }
        window.chromeAPI.library.getChat(chatId).then(setThread)
    }, [chatId, updatedAt])

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' })
    }, [thread?.messages.length])

    const send = async (message: string) => {
        const chat = await window.chromeAPI.library.sendChat(chatId, message)
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

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="max-w-[800px] mx-auto px-6 pt-8 pb-4 flex flex-col gap-6">
                    {thread.messages.map((message, index) =>
                        message.role === 'user' ? (
                            <UserMessage key={index} content={message.content} />
                        ) : (
                            <AssistantMessage key={index} content={message.content} avatar />
                        )
                    )}
                    <div ref={endRef} />
                </div>
            </div>

            <div className="max-w-[800px] w-full mx-auto px-6 pb-5">{composer}</div>
        </div>
    )
}
