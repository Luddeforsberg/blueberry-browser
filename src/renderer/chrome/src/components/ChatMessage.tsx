import React, { useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { ChatApproval, ChatStep, MascotProfile } from '@shared/library'
import { BERRY_ID } from '@shared/mascots'
import { ApprovalCard } from '@common/components/ApprovalCard'
import { Button } from '@common/components/Button'
import { BerryDot } from '@common/components/Mascot'
import { cn } from '@common/lib/utils'
import { useBrowser } from '../contexts/BrowserContext'
import { Berry, useAssistantName } from './Berry'

const FOLLOW_DISTANCE = 120

// Keeps the newest words in view while a reply streams, unless the reader has scrolled up to read.
// Sending a message always comes back down to it.
export const useFollowReply = (sentCount: number, partial: string | null | undefined, stepCount: number) => {
    const scrollerRef = useRef<HTMLDivElement>(null)
    const lastSentCount = useRef(0)

    useLayoutEffect(() => {
        const scroller = scrollerRef.current
        if (!scroller) return
        const nearEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < FOLLOW_DISTANCE
        if (sentCount !== lastSentCount.current || nearEnd) scroller.scrollTop = scroller.scrollHeight
        lastSentCount.current = sentCount
    }, [sentCount, partial, stepCount])

    return scrollerRef
}

// `fromStranger` is for what someone else wrote: nothing in it can load anything or take you anywhere. An image is
// only its description, a link is its words and address as text, and raw HTML shows as text, which ReactMarkdown does
// by itself as long as no plugin here parses it.
const STRANGER_COMPONENTS: Components = {
    img: ({ alt }) => <span>{alt}</span>,
    a: ({ children, href }) => (
        <span>
            {children}
            {href && String(children) !== href && ` (${href})`}
        </span>
    ),
}

export const Markdown: React.FC<{ content: string; fromStranger?: boolean; className?: string }> = ({ content, fromStranger, className }) => (
    <div className={cn("prose max-w-none prose-pre:p-3 prose-pre:overflow-x-auto", className)}>
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
                code: ({ node, className, children, ...props }) => {
                    const inline = !className
                    return inline ? (
                        <code className="bg-muted px-1 py-0.5 rounded-control" {...props}>
                            {children}
                        </code>
                    ) : (
                        <code className={className} {...props}>
                            {children}
                        </code>
                    )
                },
                a: ({ children, href }) => (
                    <a
                        href={href}
                        className="text-accent-ink hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {children}
                    </a>
                ),
                ...(fromStranger ? STRANGER_COMPONENTS : {}),
            }}
        >
            {content}
        </ReactMarkdown>
    </div>
)

export const UserMessage: React.FC<{ content: string }> = ({ content }) => (
    <div className="max-w-[85%] ml-auto px-4 py-2.5 rounded-panel bg-muted text-16 text-foreground whitespace-pre-wrap animate-fade-in">
        {content}
    </div>
)

// Words for work happening right now.
export const SHIMMER_TEXT = 'bg-shimmer bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer'

const ThinkingWord: React.FC = () => <span className={SHIMMER_TEXT}>Thinking</span>

// The main chat has room for Berry beside its replies. In the narrow panel, the reply takes the width.
// With no words yet, it says Thinking in their place, so nothing moves when they arrive.
// A running step already says what Berry is doing, so it doesn't say Thinking as well.
export const AssistantMessage: React.FC<{
    content: string
    steps?: ChatStep[]
    isStreaming?: boolean
    avatar?: boolean
    waiting?: boolean
    // Who wrote it. Anyone but Berry is named, so one can always tell who's working.
    mascot?: MascotProfile
}> = ({ content, steps = [], isStreaming, avatar = false, waiting = false, mascot }) => (
    <div className="relative flex flex-col gap-3 animate-fade-in">
        {avatar && (
            <Berry mood={isStreaming ? 'thinking' : 'rest'} size={28} mascot={mascot} className="absolute -left-11 top-0" />
        )}
        {mascot && mascot.id !== BERRY_ID && (
            <p className="flex items-center gap-2 text-13 font-semibold">
                {!avatar && <Berry mood={isStreaming ? 'thinking' : 'rest'} size={24} mascot={mascot} />}
                {mascot.name}
            </p>
        )}
        {steps.length > 0 && <StepTrail steps={steps} />}
        {content ? (
            <Markdown content={content} />
        ) : (
            isStreaming &&
            !waiting &&
            steps.every((step) => step.done) && (
                <div role="status" className="flex items-center h-7 text-14 text-muted-foreground">
                    <ThinkingWord />
                </div>
            )
        )}
    </div>
)

// What Berry did on the way to a reply: a footprint for each step behind it, and the berry on the one
// it's on now.
export const StepTrail: React.FC<{ steps: ChatStep[] }> = ({ steps }) => (
    <ol aria-label="Steps" className="flex flex-col gap-2.5 text-14 text-muted-foreground">
        {steps.map((step, index) => (
            <li key={index} className="flex items-center gap-3">
                <span className="size-4 shrink-0 flex items-center justify-center text-primary">
                    {step.done ? (
                        <svg aria-hidden viewBox="-8 -8 16 16" className="size-4" style={{ transform: `rotate(${index % 2 ? 12 : -12}deg)` }} fill="currentColor">
                            <ellipse cx={0} cy={-3.6} rx={1.25} ry={2.9} />
                            <ellipse cx={-3.2} cy={-1.2} rx={1.1} ry={2.5} transform="rotate(-34 -3.2 -1.2)" />
                            <ellipse cx={3.2} cy={-1.2} rx={1.1} ry={2.5} transform="rotate(34 3.2 -1.2)" />
                            <ellipse cx={0} cy={3} rx={1} ry={2.1} />
                        </svg>
                    ) : (
                        <BerryDot working />
                    )}
                </span>
                <span>
                    <span className={step.done ? undefined : SHIMMER_TEXT}>{step.text}</span>
                    {!step.done && <span className="sr-only"> (in progress)</span>}
                </span>
            </li>
        ))}
    </ol>
)

// Berry's working state while a reply is on its way, where there's no room for Berry beside the reply.
export const ThinkingMessage: React.FC<{ mascot?: MascotProfile }> = ({ mascot }) => (
    <div role="status" className="flex items-center gap-2.5 text-14 text-muted-foreground animate-fade-in">
        <Berry mood="thinking" size={22} mascot={mascot} />
        <ThinkingWord />
    </div>
)

// Berry needs something only the user knows, and carries on with the answer. Secrets go in the page, never here.
const ChatQuestionCard: React.FC<{ chatId: string; approval: ChatApproval; mascot?: MascotProfile }> = ({ chatId, approval, mascot }) => {
    const [answer, setAnswer] = useState('')
    const name = useAssistantName(mascot)
    const send = (allow: boolean) => void window.chromeAPI.chat.decide(chatId, approval.id, allow, allow ? answer : undefined)
    return (
        <section aria-label={`${name} is asking`} className="[overflow-wrap:anywhere] animate-fade-in rounded-panel border bg-surface p-3 shadow-float">
            <h3 className="text-13 font-semibold">{approval.text}</h3>
            <p className="mt-1 text-12 text-muted-foreground">{name} waits for your answer. Don’t type passwords or codes here.</p>
            <form
                className="mt-3 flex items-center gap-3"
                onSubmit={(event) => {
                    event.preventDefault()
                    if (answer.trim()) send(true)
                }}
            >
                <input
                    aria-label="Your answer"
                    autoFocus
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    className="min-w-0 flex-1 rounded-control border bg-background px-2 py-1 text-13"
                />
                <Button size="sm" type="submit" disabled={!answer.trim()}>Answer</Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => send(false)}>Skip</Button>
            </form>
        </section>
    )
}

// What the user can do about a tab they've been handed. Words are never typed here, so there's nowhere for a secret to go.
const HandoffActions: React.FC<{
    chatId: string
    approval: ChatApproval
}> = ({ chatId, approval }) => {
    const { tabs, switchTab } = useBrowser()
    const tabId = approval.handoff?.tabId
    const here = tabs.some((tab) => tab.id === tabId && tab.isActive)
    const send = (allow: boolean) => void window.chromeAPI.chat.decide(chatId, approval.id, allow)
    return (
        <div className="flex flex-wrap items-center gap-2">
            {!here && tabId && <Button size="sm" onClick={() => void switchTab(tabId)}>Go to the tab</Button>}
            <Button size="sm" variant={here ? 'default' : 'outline'} onClick={() => send(true)}>I’m done</Button>
            <Button size="sm" variant="ghost" onClick={() => send(false)}>Not now</Button>
        </div>
    )
}

const handoffNote = (name: string) => `${name} can’t see that tab until you press I’m done. Your password or code goes in the page, and ${name} never sees it.`

// Berry has handed a tab to the user, and waits here until they say they're done.
const ChatHandoffCard: React.FC<{ chatId: string; approval: ChatApproval; mascot?: MascotProfile }> = ({ chatId, approval, mascot }) => {
    const name = useAssistantName(mascot)
    return (
        <section aria-label={`${name} needs you`} className="[overflow-wrap:anywhere] animate-fade-in rounded-panel border bg-surface p-3 shadow-float">
            <h3 className="text-13 font-semibold">{approval.text}</h3>
            <p className="mt-1 text-12 text-muted-foreground">{handoffNote(name)}</p>
            <div className="mt-3">
                <HandoffActions chatId={chatId} approval={approval} />
            </div>
        </section>
    )
}

// An action Berry wants to take, which waits here until the user answers.
export const ChatApprovalCard: React.FC<{ chatId: string; approval: ChatApproval; mascot?: MascotProfile }> = ({ chatId, approval, mascot }) => {
    const decide = (allow: boolean) => void window.chromeAPI.chat.decide(chatId, approval.id, allow)
    if (approval.question) return <ChatQuestionCard chatId={chatId} approval={approval} mascot={mascot} />
    if (approval.handoff) return <ChatHandoffCard chatId={chatId} approval={approval} mascot={mascot} />
    return (
        <div className="[overflow-wrap:anywhere] animate-fade-in">
            <ApprovalCard
                request={{
                    question: approval.text,
                    details: 'Nothing happens until you allow it.',
                    confirmLabel: 'Allow'
                }}
                onConfirm={() => decide(true)}
                onCancel={() => decide(false)}
            />
        </div>
    )
}

// Why a reply failed, worded with what to do about it.
export const ChatError: React.FC<{ message: string }> = ({ message }) => (
    <p role="alert" className="text-14 text-destructive animate-fade-in">{message}</p>
)
