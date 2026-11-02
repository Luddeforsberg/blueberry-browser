import React, { useEffect, useRef, useState } from 'react'
import type { TabInfo } from '@shared/ipc'
import { useChatThread } from '../contexts/ChatContext'
import { AssistantMessage, ChatApprovalCard, ChatError, UserMessage, useFollowReply } from '../components/ChatMessage'
import { useAssistantName } from '../components/Berry'
import { MemoryOffers } from '../components/MemoryInChat'
import { ChatComposer } from '../components/Composer'
import { useFlock } from '../contexts/LibraryContext'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { blankForm, setRoutinesView } from '../routinesView'
import { useWorkView, WorkingStrip, WorkingView } from '../components/WorkingView'
import { RunnerView } from '../components/RunnerView'

// The chat keeps its width, so the working view only goes beside it when it can have this much of the page.
const ROOM_FOR_WORK = 960
const PICTURE_WIDTH = { min: 300, share: 0.32, max: 440 }
const WORK_GUTTER = 48
const COLUMN_WITH_BIRD = 888

// A full page for talking to Berry about anything, not about a web page.
export const ChatPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const chatId = tab.pageParam
    const thread = useChatThread(chatId)
    const { find } = useFlock()
    // A chat stays with the mascot it started with.
    const mascot = find(thread?.mascotId ?? null)
    const name = useAssistantName(mascot)
    const partial = thread?.partial
    const pageRef = useRef<HTMLDivElement>(null)
    const askingRef = useRef<HTMLDivElement>(null)
    const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
    const hasThread = !!chatId && !!thread
    useEffect(() => {
        const page = pageRef.current
        if (!page) return undefined
        const observer = new ResizeObserver(([entry]) => setPageSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }))
        observer.observe(page)
        return () => observer.disconnect()
    }, [hasThread])
    const pageWidth = pageSize.width
    const roomBeside = pageWidth >= ROOM_FOR_WORK
    const pictureWidth = roomBeside ? Math.round(Math.max(PICTURE_WIDTH.min, Math.min(pageWidth * PICTURE_WIDTH.share, PICTURE_WIDTH.max))) : 0
    const { view: work, frames } = useWorkView(chatId, pictureWidth)
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
    if (!chatId || !thread) return <div ref={pageRef} className="h-full" />

    // Its bird hangs outside the column, so a column without room beside it moves over to make some.
    const onRunner = !!thread.runner && running && roomBeside
    const gutter = pageWidth < COLUMN_WITH_BIRD || ((work || onRunner) && roomBeside) ? "pl-14" : "pl-6"

    // The reply being written holds the place it's saved in, so it stays the same element when it ends.
    const messages = running ? [...thread.messages, { role: 'assistant' as const, content: partial, steps: thread.steps, memoryIds: thread.memoryIds }] : thread.messages

    return (
        <div ref={pageRef} className="h-full flex">
            <div className="flex-1 min-w-0 h-full flex flex-col">
                <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
                    <div className={cn("max-w-[800px] mx-auto pr-6 pt-8 pb-4 flex flex-col gap-6", gutter)}>
                        {messages.map((message, index) =>
                            message.role === 'user' ? (
                                <div key={index} className="flex flex-col">
                                    {/* Another app wrote the first message, so it says whose words they are. */}
                                    {index === 0 && thread.from && <p className="mb-1.5 text-12 text-muted-foreground text-right">From {thread.from}</p>}
                                    {index === 0 && thread.runner && <p className="mb-1.5 text-12 text-muted-foreground text-right">Sent to the runner</p>}
                                    <UserMessage content={message.content} />
                                </div>
                            ) : (
                                <AssistantMessage
                                    key={index}
                                    content={message.content}
                                    steps={message.steps}
                                    isStreaming={running && index === messages.length - 1}
                                    avatar
                                    waiting={thread.approval !== null}
                                    mascot={mascot}
                                    failed={!!thread.error && index === messages.length - 1}
                                    memoryIds={message.memoryIds}
                                    pages={message.pages}
                                />
                            )
                        )}
                        {thread.approval && (
                            <div ref={askingRef}>
                                <ChatApprovalCard chatId={chatId} approval={thread.approval} mascot={mascot} avatarOutside />
                            </div>
                        )}
                        {/* With no room beside the chat, a page handed to the user still has to be somewhere to do it in. */}
                        {thread.runner && running && !roomBeside && thread.approval?.handoff && (
                            <RunnerView chatId={chatId} steps={thread.steps} approval={thread.approval} />
                        )}
                        {thread.error && <ChatError message={thread.error} />}
                        {!running && thread.messages.at(-1)?.role === 'assistant' && (
                            <div>
                                <Button size="sm" variant="ghost" className="-ml-3 text-muted-foreground" onClick={saveAsRoutine}>
                                    Save as routine
                                </Button>
                            </div>
                        )}
                        {!running && <MemoryOffers key={chatId} sourceId={chatId} mascot={mascot} />}
                    </div>
                </div>

                <div className={cn("max-w-[800px] w-full mx-auto pr-6 pb-5", gutter)}>
                    {work && !roomBeside && work.outcome === null && <WorkingStrip view={work} mascot={mascot} approval={thread.approval} />}
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
            {onRunner && (
                <aside aria-label="What it’s working on" className="shrink-0 h-full overflow-y-auto overflow-x-hidden pl-6 pr-6 pt-16 pb-5" style={{ width: pictureWidth + WORK_GUTTER }}>
                    <RunnerView chatId={chatId} steps={thread.steps} approval={thread.approval} />
                </aside>
            )}
            {work && roomBeside && (
                <aside aria-label="What it’s working on" className="shrink-0 h-full overflow-y-auto overflow-x-hidden pl-6 pr-6 pt-16 pb-5" style={{ width: pictureWidth + WORK_GUTTER }}>
                    <WorkingView
                        view={work}
                        frames={frames}
                        mascot={mascot}
                        approval={thread.approval}
                        aspect={pageSize.height > 0 ? pageSize.width / pageSize.height : 1}
                        onStop={() => void window.chromeAPI.chat.stop(chatId)}
                        onShowAsking={() => askingRef.current?.scrollIntoView({ block: 'nearest' })}
                    />
                </aside>
            )}
        </div>
    )
}
