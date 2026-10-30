import React, { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import type { TabInfo } from '@shared/ipc'
import type { ChatThread } from '@shared/library'
import { useLibrary } from '../contexts/LibraryContext'
import { Markdown } from '../components/Chat'
import { cn } from '@common/lib/utils'

// A full page for talking to Berry about anything, not about a web page.
export const ChatPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const library = useLibrary()
    const [thread, setThread] = useState<ChatThread | null>(null)
    const [text, setText] = useState('')
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

    const send = async () => {
        const message = text.trim()
        if (!message) return
        setText('')
        const chat = await window.chromeAPI.library.sendChat(chatId, message)
        // A new chat gets its own tab, so it can be found again in the sidebar.
        if (chat && !chatId) {
            await window.chromeAPI.browser.openPage('chat', { param: chat.id, title: chat.title })
            await window.chromeAPI.browser.closeTab(tab.id)
        }
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="max-w-[680px] mx-auto px-6 py-8 flex flex-col gap-6">
                    {!thread || thread.messages.length === 0 ? (
                        <p className="pt-[18vh] text-center text-15 text-muted-foreground">
                            What are you working on?
                        </p>
                    ) : (
                        thread.messages.map((message, index) =>
                            message.role === 'user' ? (
                                <div key={index} className="ml-auto max-w-[85%] bg-muted rounded-panel px-3 py-2 text-15 whitespace-pre-wrap">
                                    {message.content}
                                </div>
                            ) : (
                                <Markdown key={index} content={message.content} />
                            )
                        )
                    )}
                    <div ref={endRef} />
                </div>
            </div>

            <div className="max-w-[680px] w-full mx-auto px-6 pb-6">
                <div className="rounded-panel border bg-surface px-3 pt-2 pb-2 focus-within:border-transparent focus-within:ring-2 focus-within:ring-ring">
                    <textarea
                        aria-label="Message"
                        placeholder="Ask Berry"
                        value={text}
                        rows={1}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                void send()
                            }
                        }}
                        className="w-full resize-none bg-transparent text-15 outline-none placeholder:text-muted-foreground"
                    />
                    <div className="flex items-center gap-2">
                        <span className="flex-1 text-12 text-muted-foreground">Can see: no pages</span>
                        <button
                            type="button"
                            aria-label="Send"
                            onClick={() => void send()}
                            disabled={!text.trim()}
                            className={cn(
                                "size-7 rounded-full flex items-center justify-center outline-none transition-colors",
                                "bg-primary text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring",
                                "disabled:bg-muted disabled:text-muted-foreground"
                            )}
                        >
                            <ArrowUp className="size-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
