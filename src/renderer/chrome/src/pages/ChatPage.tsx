import React from 'react'
import type { TabInfo } from '@shared/ipc'
import { useChatThread } from '../contexts/ChatContext'
import { AssistantMessage, ChatApprovalCard, ChatError, UserMessage, useFollowReply } from '../components/ChatMessage'
import { useAssistantName } from '../components/Berry'
import { ChatComposer } from '../components/Composer'
import { useFlock } from '../contexts/LibraryContext'
import { Button } from '@common/components/Button'
import { blankForm, setRoutinesView } from '../routinesView'

// A full page for talking to Berry about anything, not about a web page.
export const ChatPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const chatId = tab.pageParam
    const thread = useChatThread(chatId)
    const { find } = useFlock()
    // A chat stays with the mascot it started with.
    const mascot = find(thread?.mascotId ?? null)
    const name = useAssistantName(mascot)
    const partial = thread?.partial
    const running = partial != null
    const scrollerRef = useFollowReply(
        thread?.messages.filter((message) => message.role === 'user').length ?? 0,
        partial,
        (thread?.steps.length ?? 0) + (thread?.approval ? 1 : 0)
    )

    // Only what the user asked for, which they can change before saving it.
    const saveAsRoutine = () => {
        if (!thread) return
        const asked = thread.messages.filter((message) => message.role === 'user').map((message) => message.content)
        setRoutinesView({ page: 'form', values: blankForm(thread.title, asked.join('\n\n'), thread.mascotId) })
        void window.chromeAPI.browser.openPage('routines')
    }

    // Chats begin on the new tab page, so this is only ever a moment while the chat loads, or one just deleted.
    if (!chatId || !thread) return null

    // The reply being written holds the place it's saved in, so it stays the same element when it ends.
    const messages = running ? [...thread.messages, { role: 'assistant' as const, content: partial, steps: thread.steps }] : thread.messages

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
                                steps={message.steps}
                                isStreaming={running && index === messages.length - 1}
                                avatar
                                waiting={thread.approval !== null}
                                mascot={mascot}
                            />
                        )
                    )}
                    {thread.approval && <ChatApprovalCard chatId={chatId} approval={thread.approval} mascot={mascot} avatarOutside />}
                    {thread.error && <ChatError message={thread.error} />}
                    {!running && thread.messages.at(-1)?.role === 'assistant' && (
                        <div>
                            <Button size="sm" variant="ghost" className="-ml-3 text-muted-foreground" onClick={saveAsRoutine}>
                                Save as routine
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-[800px] w-full mx-auto px-6 pb-5">
                <ChatComposer
                    onSend={(message) => void window.chromeAPI.chat.send(chatId, message, { seePage: false, mascotId: mascot.id })}
                    disabled={running}
                    onStop={running ? () => void window.chromeAPI.chat.stop(chatId) : undefined}
                    placeholder={name === 'Assistant' ? 'Ask a question' : `Ask ${name}`}
                    autoFocus
                    mascot={mascot}
                />
            </div>
        </div>
    )
}
