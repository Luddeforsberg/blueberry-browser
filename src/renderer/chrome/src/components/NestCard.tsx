import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react'
import { BaseEdge, getBezierPath, Handle, Position, type ConnectionLineComponentProps, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { GitFork, Maximize2, Minimize2, X } from 'lucide-react'
import type { ChatThread, MascotProfile, NestCard } from '@shared/library'
import type { Mood } from '@common/components/Mascot'
import { cn } from '@common/lib/utils'
import { useChatThread } from '../contexts/ChatContext'
import { useFlock } from '../contexts/LibraryContext'
import { cardStatus, CARD_WIDTH, latestReply } from '../nestBoard'
import { Berry, useAssistantName } from './Berry'
import { AssistantMessage, ChatApprovalCard, ChatError, Markdown, SHIMMER_TEXT, StatusLine, UserMessage } from './ChatMessage'
import { ChatComposer, Composer } from './Composer'
import { MemoryOffers } from './MemoryInChat'

export type CardNode = Node<{ card: NestCard }, 'card'>
export type LineEdge = Edge<{ draft: boolean }, 'line'>

// What a card can ask of the board it's on.
export interface NestBoardActions {
    openId: string | null
    setOpen: (cardId: string | null) => void
    // The draft that was just made, whose prompt takes the keyboard.
    focusId: string | null
    sourceOf: (cardId: string) => NestCard | null
    pullOut: (cardId: string) => void
    remove: (cardId: string) => void
}

export const NestBoardContext = createContext<NestBoardActions | null>(null)

const useBoard = () => {
    const board = useContext(NestBoardContext)
    if (!board) throw new Error('A card needs its board')
    return board
}

// What's typed in a draft, kept while the page is away so going to another tab loses nothing. Memory only.
const draftTexts = new Map<string, string>()
export const draftText = (cardId: string) => draftTexts.get(cardId) ?? ''
export const setDraftText = (cardId: string, text: string) => (text ? draftTexts.set(cardId, text) : draftTexts.delete(cardId))

const BIRD_SIZE = 44
// How far down the standing drawing its feet reach, so its toes grip the card's top edge.
const STANDING_FEET = 113 / 120
// Where lines meet a card: level with its first lines, whatever its height, so a line between two cards stays straight.
const LINE_AT = 60
// How much of the latest reply a closed card shows before it's cut.
const REPLY_HEIGHT = 240

const moodOf = (thread: ChatThread | null): Mood => {
    if (!thread) return 'rest'
    if (thread.partial !== null) return thread.approval ? 'asking' : 'thinking'
    return thread.error ? 'oops' : 'rest'
}

const TONES = {
    muted: 'text-muted-foreground',
    working: 'text-muted-foreground',
    done: 'text-success',
    failed: 'text-destructive'
}

// The bird stands on the card's top edge, and moves the card with it.
const Perched: React.FC<{ mascot: MascotProfile; mood: Mood }> = ({ mascot, mood }) => (
    <div className="nest-drag absolute left-5 cursor-grab" style={{ top: -BIRD_SIZE * STANDING_FEET }}>
        <Berry size={BIRD_SIZE} mood={mood} mascot={mascot} />
    </div>
)

const CardButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        className={cn(
            "nodrag size-7 flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors",
            "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 group-focus-within/card:opacity-100 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        )}
    >
        {children}
    </button>
)

// Where a line comes in, which nobody drags to, and where one is pulled out, which only shows on a card with an answer.
const LineEnds: React.FC<{ canPull: boolean; onPull: () => void; name: string }> = ({ canPull, onPull, name }) => (
    <>
        <Handle type="target" position={Position.Left} id="in" isConnectable={false} style={{ top: LINE_AT }} className="!size-1 !min-w-0 !min-h-0 !border-0 !bg-transparent" />
        {/* Always there, so the board knows where a line leaves from, and only usable once there's an answer to pass on. */}
        <Handle
            type="source"
            position={Position.Right}
            id="out"
            isConnectableStart={canPull}
            isConnectableEnd={false}
            onClick={canPull ? onPull : undefined}
            title={canPull ? `Pull a new card out of ${name}’s` : undefined}
            aria-label={canPull ? `Pull a new card out of ${name}’s` : undefined}
            aria-hidden={!canPull || undefined}
            style={{ top: LINE_AT }}
            className={cn(
                "!size-6 !border-0 !bg-transparent flex items-center justify-center transition-opacity",
                canPull ? "cursor-crosshair opacity-0 group-hover/card:opacity-100" : "invisible"
            )}
        >
            <span className="pointer-events-none size-3.5 rounded-full border-[1.5px] border-accent-ink bg-canvas" />
        </Handle>
    </>
)

const CARD_SHELL = "group/card relative rounded-panel border bg-surface text-foreground"

// A card that has been sent: one bird's chat. Closed, it shows what was asked and the latest answer. Open, the whole chat
// and a reply field that carries the thread on.
const SentCard: React.FC<{ card: NestCard }> = ({ card }) => {
    const board = useBoard()
    const thread = useChatThread(card.chatId)
    const { find } = useFlock()
    const mascot = find(thread?.mascotId ?? card.mascotId)
    const name = useAssistantName(mascot)
    const source = board.sourceOf(card.id)
    const sourceName = useAssistantName(source ? find(source.mascotId) : undefined)
    const open = board.openId === card.id
    const running = thread?.partial != null
    const status = thread && cardStatus(thread)
    const asked = thread?.messages.findLast((message) => message.role === 'user')?.content
    const reply = thread && latestReply(thread)
    const answered = !!thread && thread.messages.some((message) => message.role === 'assistant' && message.content.trim() !== '')

    return (
        <div className={cn(CARD_SHELL, running ? "shadow-reading border-transparent" : "shadow-selected")} style={{ width: CARD_WIDTH }}>
            <Perched mascot={mascot} mood={moodOf(thread)} />
            <LineEnds canPull={answered} onPull={() => board.pullOut(card.id)} name={name} />
            <div className="nest-drag cursor-grab h-12 pl-[76px] pr-3 flex items-center gap-2">
                <span className="text-14 font-semibold truncate">{name}</span>
                {status && <span role="status" className={cn("text-12 shrink-0", TONES[status.tone])}>{status.text}</span>}
                <span className="ml-auto flex items-center">
                    {answered && (
                        <CardButton label="Continue in a new card" onClick={() => board.pullOut(card.id)}>
                            <GitFork className="size-4" />
                        </CardButton>
                    )}
                    <CardButton label={open ? 'Close the chat' : 'Open the whole chat'} onClick={() => board.setOpen(open ? null : card.id)}>
                        {open ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                    </CardButton>
                    <CardButton label="Delete card" onClick={() => board.remove(card.id)}>
                        <X className="size-4" />
                    </CardButton>
                </span>
            </div>
            {source && <p className="px-5 -mt-1 mb-2 text-12 text-muted-foreground">With {sourceName}’s latest answer</p>}
            {thread && (open ? <WholeChat thread={thread} mascot={mascot} card={card} sourceName={source ? sourceName : null} /> : (
                <div className="nodrag select-text cursor-auto px-5 pb-4 flex flex-col gap-3">
                    {asked && <p className="text-13 text-muted-foreground line-clamp-2 whitespace-pre-wrap">{asked}</p>}
                    {running && !thread.partial && <Working thread={thread} />}
                    {thread.approval && <ChatApprovalCard chatId={thread.id} approval={thread.approval} mascot={mascot} />}
                    {reply && <CutReply text={reply} onMore={() => board.setOpen(card.id)} />}
                    {thread.error && <ChatError message={thread.error} />}
                </div>
            ))}
        </div>
    )
}

// What a running card is doing: the bird's own words if it said any, or the step it's on.
const Working: React.FC<{ thread: ChatThread }> = ({ thread }) => {
    if (thread.statusLine) return <StatusLine text={thread.statusLine} />
    const step = thread.steps.findLast((each) => !each.done)
    if (thread.approval) return null
    return <p role="status" className="text-14 line-clamp-2"><span className={SHIMMER_TEXT}>{step ? (step.shown ?? step.text) : 'Thinking'}</span></p>
}

// The latest answer in the chat's own markdown, cut to a height that keeps the board readable, with the rest a press away.
const CutReply: React.FC<{ text: string; onMore: () => void }> = ({ text, onMore }) => {
    const box = useRef<HTMLDivElement>(null)
    const [cut, setCut] = useState(false)
    useLayoutEffect(() => {
        const element = box.current
        if (!element) return undefined
        const check = () => setCut(element.scrollHeight > element.clientHeight + 1)
        check()
        const observer = new ResizeObserver(check)
        observer.observe(element.firstElementChild ?? element)
        return () => observer.disconnect()
    }, [text])
    return (
        <div className="flex flex-col items-start gap-1">
            <div
                ref={box}
                className={cn("w-full overflow-hidden [&_.prose]:text-14", cut && "[mask-image:linear-gradient(to_bottom,black_calc(100%-48px),transparent)]")}
                style={{ maxHeight: REPLY_HEIGHT }}
            >
                <Markdown content={text} />
            </div>
            {cut && (
                <button type="button" onClick={onMore} className="-mx-1.5 px-1.5 h-6 rounded-control text-13 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    Show all of it
                </button>
            )}
        </div>
    )
}

// The card opened: its whole chat, as the chat page draws it, and a field to reply in.
const WholeChat: React.FC<{ thread: ChatThread; mascot: MascotProfile; card: NestCard; sourceName: string | null }> = ({ thread, mascot, card, sourceName }) => {
    const name = useAssistantName(mascot)
    const running = thread.partial != null
    const messages = running ? [...thread.messages, { role: 'assistant' as const, content: thread.partial ?? '', steps: thread.steps, memoryIds: thread.memoryIds }] : thread.messages
    return (
        <div className="nodrag select-text cursor-auto flex flex-col">
            <div className="nowheel max-h-[520px] overflow-y-auto px-5 pb-4 flex flex-col gap-5 border-t pt-4">
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
                            failed={!!thread.error && index === messages.length - 1}
                            memoryIds={message.memoryIds}
                            pages={message.pages}
                        />
                    )
                )}
                {thread.approval && <ChatApprovalCard chatId={thread.id} approval={thread.approval} mascot={mascot} />}
                {thread.error && <ChatError message={thread.error} />}
                {!running && <MemoryOffers key={thread.id} sourceId={thread.id} mascot={mascot} />}
            </div>
            <div className="px-3 pb-3">
                <ChatComposer
                    onSend={(text) => void window.chromeAPI.nests.send(card.id, text)}
                    disabled={running}
                    onStop={running ? () => void window.chromeAPI.chat.stop(thread.id) : undefined}
                    placeholder={`Reply to ${name}`}
                    attachment={sourceName && <p className="px-2 text-12 text-muted-foreground">Gets {sourceName}’s latest answer when you send</p>}
                    autoFocus
                />
            </div>
        </div>
    )
}

// A card nothing has been sent from yet: who it goes to, what it gets from the card its line comes from, and the prompt.
const DraftCard: React.FC<{ card: NestCard }> = ({ card }) => {
    const board = useBoard()
    const { find } = useFlock()
    const mascot = find(card.mascotId)
    const name = useAssistantName(mascot)
    const [text, setText] = useState(() => draftText(card.id))
    const source = board.sourceOf(card.id)
    const sourceMascot = source ? find(source.mascotId) : undefined
    const sourceName = useAssistantName(sourceMascot)
    const sourceThread = useChatThread(source?.chatId ?? null)
    const sourceAnswered = !!sourceThread && latestReply({ ...sourceThread, partial: null }) !== null
    const [sending, setSending] = useState(false)

    const change = (value: string) => {
        setText(value)
        setDraftText(card.id, value)
    }
    const canSend = text.trim() !== '' && !sending && (!source || sourceAnswered)
    const send = async () => {
        if (!canSend) return
        setSending(true)
        const sent = await window.chromeAPI.nests.send(card.id, text.trim())
        setSending(false)
        if (sent) setDraftText(card.id, '')
    }

    return (
        <div className={cn(CARD_SHELL, "border-accent-ink shadow-raised")} style={{ width: CARD_WIDTH }}>
            <Perched mascot={mascot} mood="rest" />
            <LineEnds canPull={false} onPull={() => undefined} name={name} />
            <div className="nest-drag cursor-grab h-12 pl-[76px] pr-3 flex items-center gap-2">
                <span className="text-14 font-semibold truncate">{name}</span>
                <span className="text-12 text-muted-foreground truncate">
                    {source ? (sourceAnswered ? `gets ${sourceName}’s latest answer` : `${sourceName} hasn’t answered yet`) : 'New card'}
                </span>
                <span className="ml-auto flex items-center">
                    <CardButton label="Delete card" onClick={() => board.remove(card.id)}>
                        <X className="size-4" />
                    </CardButton>
                </span>
            </div>
            <div className="nodrag cursor-auto px-2 pb-2">
                <Composer
                    bare
                    label={`What should ${name} do?`}
                    placeholder={`What should ${name} do?`}
                    value={text}
                    onChange={change}
                    rows={2}
                    autoFocus={board.focusId === card.id}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            void send()
                        }
                    }}
                    noAdd
                    canSend={canSend}
                    onSend={() => void send()}
                    mascot={mascot}
                    onChooseMascot={(id) => void window.chromeAPI.nests.setBird(card.id, id)}
                />
            </div>
        </div>
    )
}

export const CardView: React.FC<NodeProps<CardNode>> = ({ data: { card } }) => (card.chatId ? <SentCard card={card} /> : <DraftCard card={card} />)

const LINE = "stroke-accent-ink/60"

// A line between two cards, dashed while the card it goes to hasn't been sent, with a small round end at each card.
export const LineView: React.FC<EdgeProps<LineEdge>> = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) => {
    const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
    return (
        <>
            <BaseEdge id={id} path={path} className={LINE} style={{ strokeWidth: 1.5, strokeDasharray: data?.draft ? '5 5' : undefined }} />
            <circle cx={sourceX} cy={sourceY} r={3.5} className={cn(LINE, "fill-canvas")} strokeWidth={1.5} />
            <circle cx={targetX} cy={targetY} r={3.5} className="fill-accent-ink/60" />
        </>
    )
}

// The line while it's being pulled out, before there's a card at its end.
export const PullingLine: React.FC<ConnectionLineComponentProps> = ({ fromX, fromY, toX, toY, fromPosition, toPosition }) => {
    const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, sourcePosition: fromPosition, targetX: toX, targetY: toY, targetPosition: toPosition })
    return (
        <g>
            <path d={path} fill="none" className={LINE} strokeWidth={1.5} strokeDasharray="5 5" />
            <circle cx={toX} cy={toY} r={3.5} className="fill-accent-ink/60" />
        </g>
    )
}
