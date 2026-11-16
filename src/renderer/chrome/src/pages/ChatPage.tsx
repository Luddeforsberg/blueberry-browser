import React, { useEffect, useRef, useState } from 'react'
import type { TabInfo } from '@shared/ipc'
import { useChatThread } from '../contexts/ChatContext'
import { AssistantMessage, ChatApprovalCard, UserMessage, WentWrong, didWork, saveChatAsRoutine, useFollowReply, type ReplyActions } from '../components/ChatMessage'
import { Berry, useAssistantName } from '../components/Berry'
import { MemoryOffers } from '../components/MemoryInChat'
import { ChatComposer } from '../components/Composer'
import { useFlock } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { useWorkView, WorkingStrip, WorkingView } from '../components/WorkingView'
import { RunnerView } from '../components/RunnerView'

// DESIGN.md section 2: the working view is 420px, with 18px either side of the picture, and goes beside the conversation
// only while that keeps room to read.
const WORK_VIEW = 420
const PICTURE_WIDTH = WORK_VIEW - 2 * 18
const ROOM_FOR_WORK = WORK_VIEW + 480

// The conversation, its header and the prompt box share one column, so they line up however wide the page is.
const COLUMN = 'w-full max-w-[720px] mx-auto px-7'

// A full page for talking to a mascot about anything, not about a web page.
export const ChatPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const chatId = tab.pageParam
    const thread = useChatThread(chatId)
    const { find } = useFlock()
    // A chat stays with the mascot it started with.
    const mascot = find(thread?.mascotId ?? null)
    const name = useAssistantName(mascot)
    const { platform } = useShell().theme
    const partial = thread?.partial
    const pageRef = useRef<HTMLDivElement>(null)
    const askingRef = useRef<HTMLDivElement>(null)
    const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
    // Hide work holds for this chat, until Show work.
    const [workHidden, setWorkHidden] = useState(false)
    useEffect(() => setWorkHidden(false), [chatId])
    const hasThread = !!chatId && !!thread
    useEffect(() => {
        const page = pageRef.current
        if (!page) return undefined
        const observer = new ResizeObserver(([entry]) => setPageSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }))
        observer.observe(page)
        return () => observer.disconnect()
    }, [hasThread])
    const roomBeside = pageSize.width >= ROOM_FOR_WORK
    // Nothing is captured while the view is hidden or has no room.
    const { view: work, frames } = useWorkView(chatId, roomBeside && !workHidden ? PICTURE_WIDTH : 0)
    const running = partial != null
    const scrollerRef = useFollowReply(
        thread?.messages.filter((message) => message.role === 'user').length ?? 0,
        partial,
        (thread?.steps.length ?? 0) + (thread?.approval ? 1 : 0)
    )

    // Chats begin on the new tab page, so this is only ever a moment while the chat loads, or one just deleted.
    if (!chatId || !thread) return <div ref={pageRef} className="h-full" />

    const actions: ReplyActions = {
        onSay: (words) => void window.chromeAPI.chat.send(chatId, words, { seePage: false, mascotId: mascot.id }),
        onSaveAsRoutine: didWork(thread.messages) ? () => saveChatAsRoutine(thread.title, thread.messages, thread.mascotId) : undefined,
    }

    const onRunner = !!thread.runner && running && roomBeside
    const workBeside = !!work && roomBeside && !workHidden
    const where = thread.from ? `from ${thread.from}` : thread.runner || thread.cloud ? 'in the cloud' : platform === 'mac' ? 'on this Mac' : 'on this PC'

    // The reply being written holds the place it's saved in, so it stays the same element when it ends.
    const messages = running ? [...thread.messages, { role: 'assistant' as const, content: partial, steps: thread.steps, memoryIds: thread.memoryIds }] : thread.messages
    const last = messages.at(-1)
    const failedReply = thread.error && last?.role === 'assistant' ? last : null

    return (
        <div ref={pageRef} className="h-full flex">
            <div className="flex-1 min-w-0 h-full flex flex-col">
                <header className={`${COLUMN} shrink-0 pt-4 h-[46px] flex items-end`}>
                    <div className="w-full h-[30px] flex items-center gap-2.5 text-13">
                        <Berry mood="rest" size={24} mascot={mascot} still />
                        <span className="min-w-0 truncate font-medium text-ink">{name}</span>
                        <span className="shrink-0 font-mono text-11.5 text-ink-3">{where}</span>
                        {work && roomBeside && workHidden && (
                            <button
                                type="button"
                                onClick={() => setWorkHidden(false)}
                                className="ml-auto -mr-1.5 h-6 px-1.5 shrink-0 rounded-row text-12 text-ink-3 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
                            >
                                Show work
                            </button>
                        )}
                    </div>
                </header>

                <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
                    <div className={`${COLUMN} pt-[18px] pb-4 flex flex-col gap-6`}>
                        {messages.map((message, index) =>
                            message.role === 'user' ? (
                                <UserMessage key={index} content={message.content} />
                            ) : (
                                <AssistantMessage
                                    key={index}
                                    content={message.content}
                                    steps={message.steps}
                                    statusLine={thread.statusLine}
                                    isStreaming={running && index === messages.length - 1}
                                    waiting={thread.approval !== null}
                                    mascot={mascot}
                                    failed={message === failedReply}
                                    memoryIds={message.memoryIds}
                                    pages={message.pages}
                                    startedAt={work && work.endedAt === null ? work.startedAt : undefined}
                                    actions={!running && index === messages.length - 1 ? actions : undefined}
                                />
                            )
                        )}
                        {thread.approval && (
                            <div ref={askingRef} className="-mt-2">
                                <ChatApprovalCard chatId={chatId} approval={thread.approval} mascot={mascot} />
                            </div>
                        )}
                        {/* With no room beside the chat, a page handed to the user still has to be somewhere to do it in. */}
                        {thread.runner && running && !roomBeside && thread.approval?.handoff && (
                            <RunnerView chatId={chatId} steps={thread.steps} approval={thread.approval} />
                        )}
                        {thread.error && !running && <WentWrong message={thread.error} steps={failedReply?.steps} mascot={mascot} actions={actions} />}
                        {!running && <MemoryOffers key={chatId} sourceId={chatId} mascot={mascot} />}
                    </div>
                </div>

                <div className={`${COLUMN} shrink-0 pb-4`}>
                    {work && !roomBeside && work.outcome === null && <WorkingStrip view={work} mascot={mascot} approval={thread.approval} />}
                    <ChatComposer
                        onSend={(message) => void window.chromeAPI.chat.send(chatId, message, { seePage: false, mascotId: mascot.id })}
                        disabled={running}
                        onStop={running ? () => void window.chromeAPI.chat.stop(chatId) : undefined}
                        placeholder={name === 'Assistant' ? 'Write a message' : running ? `Tell ${name} something while it works` : `Tell ${name} something`}
                        autoFocus
                        mascot={mascot}
                    />
                </div>
            </div>
            {onRunner && (
                <aside aria-label="What it’s working on" className="shrink-0 h-full overflow-y-auto overflow-x-hidden bg-well shadow-[inset_1px_0_0_var(--line)] px-[18px] pt-16 pb-5" style={{ width: WORK_VIEW }}>
                    <RunnerView chatId={chatId} steps={thread.steps} approval={thread.approval} />
                </aside>
            )}
            {workBeside && (
                <aside aria-label="What it’s working on" className="relative shrink-0 h-full overflow-y-auto overflow-x-hidden bg-well shadow-[inset_1px_0_0_var(--line)]" style={{ width: WORK_VIEW }}>
                    {/* The well's dot grid, coming in towards the bottom, under everything else. */}
                    <div aria-hidden className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,var(--dot)_1px,transparent_1.3px)] bg-[length:14px_14px] [mask-image:linear-gradient(transparent_40%,#000)]" />
                    <div className="relative min-h-full flex flex-col">
                        <WorkingView
                            view={work}
                            frames={frames}
                            mascot={mascot}
                            approval={thread.approval}
                            aspect={pageSize.height > 0 ? pageSize.width / pageSize.height : 1}
                            onHide={() => setWorkHidden(true)}
                            onShowAsking={() => askingRef.current?.scrollIntoView({ block: 'nearest' })}
                        />
                    </div>
                </aside>
            )}
        </div>
    )
}
