import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '@xyflow/react'
import { Check, ChevronDown, ChevronUp, MessagesSquare, X } from 'lucide-react'
import type { NestRequest, NestSince, NestTalkMessage } from '@shared/library'
import { cn } from '@common/lib/utils'
import { useShell } from '../contexts/ShellContext'
import { Berry, useAssistantName } from './Berry'
import { Markdown, SHIMMER_QUIET, UserMessage } from './ChatMessage'
import { CARD_PROSE } from './NestTable'
import { plainCell } from '@shared/nestTable'

// The newest of Berry's messages each Nest's talk has been seen up to, by its id: opened in the drawer, or its peek let
// go. Memory only, and a Nest first drawn this launch counts as seen, so an old reply never peeks after a restart.
const seenUpTo = new Map<string, number>()

// Each Nest's newest summary of what changed while it wasn't open that has been let go. Memory only, like the summary.
const sinceSeen = new Map<string, number>()

// How long a new reply's peek stays at full strength before it settles.
const PEEK_SETTLES_MS = 4000
// The drawer is at most this much of the board's height.
const DRAWER_SHARE = 0.4
// How far Berry's feet reach down its drawing, so its toes grip the pill's top edge.
const STANDING_FEET = 113 / 120
const PERCH_SIZE = 32

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

const latestBerry = (talk: readonly NestRequest[]): NestTalkMessage | null => {
    for (let index = talk.length - 1; index >= 0; index--) {
        const found = talk[index].messages.findLast((message) => message.role === 'berry')
        if (found) return found
    }
    return null
}

// The first line with words in it, as plain words with no markdown marks, for the peek.
const firstLine = (text: string) => plainCell(text.split('\n').find((line) => line.trim())?.trim() ?? '')

// Which of Berry's replies the user hasn't seen yet, and a way to say they have.
const useUnseen = (nestId: string, talk: readonly NestRequest[]) => {
    const latest = latestBerry(talk)
    if (!seenUpTo.has(nestId)) seenUpTo.set(nestId, latest?.id ?? 0)
    const [, redraw] = useState(0)
    const unseen = latest && latest.id > (seenUpTo.get(nestId) ?? 0) ? latest : null
    const see = () => {
        if (!latest || (seenUpTo.get(nestId) ?? 0) >= latest.id) return
        seenUpTo.set(nestId, latest.id)
        redraw((count) => count + 1)
    }
    return { unseen, see }
}

// One of Berry's messages in the drawer: an answer about the board in the chat's markdown, as a stranger's since it came
// from cards that came from web pages, with Put on board, a plan with how many cards it laid out, or plain words.
const BerryMessage: React.FC<{ message: NestTalkMessage; onPutOnBoard: (messageId: number) => Promise<string | null> }> = ({ message, onPutOnBoard }) => {
    const [put, setPut] = useState<'idle' | 'busy' | 'done'>('idle')
    const [problem, setProblem] = useState<string | null>(null)
    if (message.kind === 'answer') {
        return (
            <div className="flex flex-col gap-1">
                <Markdown content={message.text} fromStranger className={cn("text-16", CARD_PROSE)} />
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={put === 'busy'}
                        onClick={async () => {
                            setPut('busy')
                            const error = await onPutOnBoard(message.id)
                            setProblem(error)
                            setPut(error ? 'idle' : 'done')
                        }}
                        className="-ml-1.5 h-7 px-1.5 rounded-control flex items-center gap-1 text-12 text-muted-foreground outline-none transition-colors hover:text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {put === 'done' && <Check aria-hidden className="size-3.5 text-success" />}
                        {put === 'done' ? 'On the board' : 'Put on board'}
                    </button>
                    {problem && <p role="alert" className="text-12 text-destructive">{problem}</p>}
                </div>
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-1">
            <p className="text-16 whitespace-pre-wrap">{message.text}</p>
            {message.kind === 'plan' && message.planned ? <p className="text-13 text-muted-foreground">Planned {plural(message.planned, 'card')}</p> : null}
        </div>
    )
}

// The Nest's whole conversation with Berry, oldest first, opened upward from the pill. It scrolls inside, at most about
// 40% of the board's height, and keeps its newest message in view.
const Drawer: React.FC<{
    id: string
    talk: readonly NestRequest[]
    planning: string | null
    onClose: () => void
    onPutOnBoard: (messageId: number) => Promise<string | null>
}> = ({ id, talk, planning, onClose, onPutOnBoard }) => {
    const berryName = useAssistantName()
    const boardHeight = useStore((state) => state.height)
    const scroller = useRef<HTMLDivElement>(null)
    const count = talk.reduce((total, request) => total + request.messages.length, 0)
    useLayoutEffect(() => {
        const element = scroller.current
        if (element) element.scrollTop = element.scrollHeight
    }, [count, planning])
    return (
        <div
            id={id}
            role="region"
            aria-label={`Talk with ${berryName}`}
            className="nowheel nopan flex flex-col rounded-panel border bg-surface shadow-raised animate-fade-in"
            style={{ maxHeight: Math.max(160, boardHeight * DRAWER_SHARE) }}
        >
            <div className="shrink-0 h-10 pl-4 pr-2 flex items-center justify-between border-b">
                <p className="text-13 text-muted-foreground">Talk with {berryName}</p>
                <button
                    type="button"
                    aria-label={`Close the talk with ${berryName}`}
                    title="Close (Esc)"
                    onClick={onClose}
                    className="size-7 flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <X className="size-4" />
                </button>
            </div>
            <div ref={scroller} className="min-h-0 overflow-y-auto px-4 pt-3 pb-3 flex flex-col gap-6">
                {talk.length === 0 && !planning && <p className="text-14 text-muted-foreground">Ask {berryName} about the cards, or for work to lay out as cards.</p>}
                {talk.map((request) => (
                    <div key={request.id} className="flex flex-col gap-3">
                        {request.messages.map((message) =>
                            message.role === 'user' ? (
                                <div key={message.id} className="flex flex-col items-end gap-1">
                                    <UserMessage content={message.text} />
                                    {message.about ? <p className="text-12 text-muted-foreground">About {plural(message.about, 'card')}</p> : null}
                                </div>
                            ) : (
                                <BerryMessage key={message.id} message={message} onPutOnBoard={onPutOnBoard} />
                            )
                        )}
                    </div>
                ))}
                {planning && (
                    <div className="flex flex-col gap-3">
                        <UserMessage content={planning} />
                        <p role="status" className="text-16"><span className={SHIMMER_QUIET}>Thinking</span></p>
                    </div>
                )}
            </div>
        </div>
    )
}

// The cards selected on the board, which the next message asks about alone. The × lets them go.
// Names the section instead when exactly its cards are selected, from a press on its name. The name stays here: Berry gets
// only the cards, by id, as with any selection.
export const AboutChip: React.FC<{ count: number; name?: string | null; onClear: () => void }> = ({ count, name, onClear }) => (
    <span data-about-chip className="inline-flex items-center h-7 pl-2.5 pr-1 gap-1 rounded-full bg-muted text-13">
        <span className="truncate max-w-64">Ask about {name ?? plural(count, 'card')}</span>
        <button
            type="button"
            aria-label="Ask about the whole board"
            title="Ask about the whole board"
            onClick={onClear}
            className="size-5 flex items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
            <X className="size-3.5" />
        </button>
    </span>
)

// The Nest's composer at the bottom of the board. Collapsed, it's the pill with Berry perched on its left edge, and a new
// reply peeks in one muted line above it. The drawer opens upward with the whole talk. Tucked away, it's a small tab at
// the board's bottom edge, with a quiet dot when Berry has said something new, and never a popup.
export const NestComposer: React.FC<{
    nestId: string
    talk: readonly NestRequest[]
    planning: string | null
    problem: string | null
    tucked: boolean
    onTuck: (tucked: boolean) => void
    open: boolean
    onOpen: () => void
    onClose: () => void
    onPutOnBoard: (messageId: number) => Promise<string | null>
    // What changed since the Nest was last open, which peeks until it's let go.
    since: NestSince | null
    // The composer itself, drawn as the pill.
    children: React.ReactNode
}> = ({ nestId, talk, planning, problem, tucked, onTuck, open, onOpen, onClose, onPutOnBoard, since, children }) => {
    const berryName = useAssistantName()
    const { showBerry } = useShell().settings
    const drawerId = useId()
    const { unseen, see } = useUnseen(nestId, talk)
    const [, redraw] = useState(0)
    const news = since && sinceSeen.get(nestId) !== since.id ? since : null
    const letGo = () => {
        if (!news) return
        sinceSeen.set(nestId, news.id)
        redraw((count) => count + 1)
    }
    // Whatever's open is what's seen, including a reply that comes in while it is.
    useEffect(() => {
        if (open && unseen) see()
    })
    // A new reply's peek settles to a quieter line after a few seconds, and stays until it's opened or let go.
    const [settled, setSettled] = useState(false)
    useEffect(() => {
        setSettled(false)
        if (!unseen && !news) return undefined
        const timer = window.setTimeout(() => setSettled(true), PEEK_SETTLES_MS)
        return () => window.clearTimeout(timer)
    }, [unseen?.id, news?.id])

    if (tucked) {
        return (
            <div data-nest-composer className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
                <button
                    type="button"
                    data-composer-tab
                    aria-label={unseen ? `Bring back the composer. ${berryName} replied` : news ? `Bring back the composer. ${berryName} says what changed` : 'Bring back the composer'}
                    title="Bring back the composer (/)"
                    onClick={() => onTuck(false)}
                    className="pointer-events-auto relative h-7 w-16 flex items-center justify-center rounded-t-panel border border-b-0 bg-surface shadow-raised text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ChevronUp className="size-4" />
                    {(unseen || news) && <span aria-hidden data-unseen-dot className="absolute top-1.5 right-3 size-1.5 rounded-full bg-accent-ink" />}
                </button>
            </div>
        )
    }

    const peek = !open && (planning || unseen)
    return (
        <div data-nest-composer className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 w-[min(640px,calc(100%-32px))] flex flex-col gap-3 [&>*]:pointer-events-auto">
            {open && <Drawer id={drawerId} talk={talk} planning={planning} onClose={onClose} onPutOnBoard={onPutOnBoard} />}
            {!open && !peek && news && (
                // A few plain lines from Berry, or from code, on what changed while the Nest wasn't open. Only words.
                <div data-since className={cn("self-start max-w-full flex items-start gap-1 pr-1 rounded-card border bg-surface shadow-selected animate-fade-in transition-opacity duration-layout", settled ? "opacity-60" : "opacity-100")}>
                    <p role="status" className="min-w-0 px-3 py-2 text-14 text-muted-foreground whitespace-pre-line line-clamp-3">
                        {berryName}: {news.text}
                    </p>
                    <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={letGo}
                        className="shrink-0 mt-1.5 size-6 flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
            )}
            {peek && (
                <div data-peek className={cn("self-start max-w-full flex items-center gap-1 animate-fade-in transition-opacity duration-layout", settled && !planning ? "opacity-60" : "opacity-100")}>
                    <button
                        type="button"
                        aria-controls={drawerId}
                        aria-expanded={false}
                        onClick={onOpen}
                        className="min-w-0 h-7 px-2 rounded-control flex items-center text-14 text-muted-foreground outline-none transition-colors hover:text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <span role="status" className="truncate">
                            {berryName}: {planning ? <span className={SHIMMER_QUIET}>Thinking</span> : firstLine(unseen!.text)}
                        </span>
                    </button>
                    {!planning && (
                        <button
                            type="button"
                            aria-label="Dismiss"
                            onClick={see}
                            className="shrink-0 size-6 flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
            )}
            {problem && <p role="alert" className="px-3 text-13 text-destructive">{problem}</p>}
            <div className={cn("relative", showBerry && "mt-5")}>
                {/* Berry perches on the pill's left edge, and opens the talk. With Berry hidden, a quiet button stands in. */}
                <button
                    type="button"
                    data-talk-button
                    aria-label={open ? `Close the talk with ${berryName}` : `Talk with ${berryName} (/)`}
                    title={open ? 'Close the talk' : 'The talk so far (/)'}
                    aria-expanded={open}
                    aria-controls={open ? drawerId : undefined}
                    onClick={open ? onClose : onOpen}
                    className={cn(
                        "absolute left-5 z-10 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        showBerry ? "" : "size-7 flex items-center justify-center border bg-surface text-muted-foreground transition-colors hover:text-foreground"
                    )}
                    style={{ top: showBerry ? -PERCH_SIZE * STANDING_FEET : -14 }}
                >
                    {showBerry ? <Berry size={PERCH_SIZE} mood={planning ? 'thinking' : 'rest'} /> : <MessagesSquare className="size-3.5" />}
                </button>
                <button
                    type="button"
                    aria-label="Tuck the composer away"
                    title="Tuck away"
                    onClick={() => onTuck(true)}
                    className="absolute -top-3 right-5 z-10 size-6 flex items-center justify-center rounded-full border bg-surface text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ChevronDown className="size-3.5" />
                </button>
                {children}
            </div>
        </div>
    )
}
