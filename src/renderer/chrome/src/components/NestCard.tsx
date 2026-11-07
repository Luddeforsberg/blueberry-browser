import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BaseEdge, getBezierPath, Handle, Position, type ConnectionLineComponentProps, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { ArrowLeft, GitFork, Maximize2, Minimize2, Table2, X } from 'lucide-react'
import type { ChatThread, MascotProfile, NestCard, NestForEach, NestLine, NestPlanned, NestTableFile } from '@shared/library'
import { combinedTable, crossingWords, eachWords, findTable, MAX_RUNS, plainCell, PREVIEW_CELL_LENGTH, rowName, rowTooLong, STALE_ROWS, type PickedRows } from '@shared/nestTable'
import type { Mood } from '@common/components/Mascot'
import type { NestSendEachResult } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Switch } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { useChatThread, useChatThreads } from '../contexts/ChatContext'
import { useFlock } from '../contexts/LibraryContext'
import { cardStatus, CARD_WIDTH, forEachStatus, latestReply, runPhase, type RunPhase } from '../nestBoard'
import { Berry, useAssistantName } from './Berry'
import { AssistantMessage, ChatApprovalCard, ChatError, Markdown, SHIMMER_QUIET, SHIMMER_TEXT, StatusLine, UserMessage } from './ChatMessage'
import { AddMenu, ChatComposer, Composer } from './Composer'
import { Attachments, useAttaching } from './NestAttachments'
import { MascotChip, MascotPerch } from './MascotPerch'
import { MemoryOffers } from './MemoryInChat'
import { CellText, TableMenu, TableResult, type PickMode, type WorkingRows } from './NestTable'

export type CardNode = Node<{ card: NestCard }, 'card'>
export type LineEdge = Edge<{ draft: boolean }, 'line'>

// Rows selected in one card's table, for the table they were picked from: `text` is what that table was made from, such as
// the answer, so a new one lets them go.
export interface RowSelection {
    cardId: string
    text: string
    table: PickedRows
    rows: number[]
    anchor: number | null
}

// What a card can ask of the board it's on.
export interface NestBoardActions {
    openId: string | null
    // With `runId`, a For-each card opens at that run's thread.
    setOpen: (cardId: string | null, runId?: string | null) => void
    // The run a For-each card was opened at, from Needs you.
    openRunId: string | null
    // The draft that was just made, whose prompt takes the keyboard.
    focusId: string | null
    sourceOf: (cardId: string) => NestCard | null
    lineInto: (cardId: string) => NestLine | null
    pullOut: (cardId: string) => void
    remove: (cardId: string) => void
    selection: RowSelection | null
    clearSelection: () => void
    pick: (cardId: string, text: string, table: PickedRows, index: number, mode: PickMode) => void
    // The cards of a run plan that wait for the user to say this card's answer is right.
    waitingOn: (cardId: string) => NestCard[]
    // For-each cards whose line comes out of this card, for the rows they're working on in its table.
    forEachFrom: (cardId: string) => NestCard[]
    // Whether a card's own bird is away, flying a hand-off along a line, or about to land there.
    away: (cardId: string) => boolean
    // Berry is changing the plan, so its planned cards are about to be replaced.
    replanning: boolean
    // Threads to show instead of loading them, for the component gallery.
    samples?: Readonly<Record<string, ChatThread>>
}

export const NestBoardContext = createContext<NestBoardActions | null>(null)

const useBoard = () => {
    const board = useContext(NestBoardContext)
    if (!board) throw new Error('A card needs its board')
    return board
}

// A card's chat, kept current, or the gallery's sample.
const useCardThread = (chatId: string | null): ChatThread | null => {
    const { samples } = useBoard()
    const live = useChatThread(samples ? null : chatId)
    return samples ? (chatId ? samples[chatId] ?? null : null) : live
}

const useCardThreads = (chatIds: readonly string[]): Record<string, ChatThread> => {
    const { samples } = useBoard()
    const live = useChatThreads(samples ? [] : chatIds)
    return samples ? Object.fromEntries(chatIds.flatMap((id) => (samples[id] ? [[id, samples[id]]] : []))) : live
}

// What's typed in a draft, kept while the page is away so going to another tab loses nothing. Memory only.
const draftTexts = new Map<string, string>()
export const draftText = (cardId: string) => draftTexts.get(cardId) ?? ''
export const setDraftText = (cardId: string, text: string) => (text ? draftTexts.set(cardId, text) : draftTexts.delete(cardId))
// Whether a draft's For each row is on, once the user has touched it. Memory only, like its text.
const draftEach = new Map<string, boolean>()

// The newest saved answer, not one still being written.
const savedAnswer = (thread: ChatThread | null | undefined) => (thread ? latestReply({ ...thread, partial: null }) : null)

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

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

// The bird stands on the card's top edge, and moves the card with it. While it's away flying a hand-off, its place is
// empty, and it comes back with a quick fade.
const Perched: React.FC<{ cardId: string; mascot: MascotProfile; mood: Mood }> = ({ cardId, mascot, mood }) => {
    const away = useBoard().away(cardId)
    return (
        <div
            className={cn("nest-drag absolute left-5 cursor-grab", away ? "opacity-0" : "opacity-100 transition-opacity duration-layout")}
            style={{ top: -BIRD_SIZE * STANDING_FEET }}
        >
            <Berry size={BIRD_SIZE} mood={mood} mascot={mascot} />
        </div>
    )
}

// While Berry is changing the plan, a grey sweep runs along a card's outline, as on the shapes where a new plan will
// land. Only while the model is working, and still with reduced motion.
export const GhostSweep: React.FC<{ delay?: number }> = ({ delay = 0 }) => (
    <span
        aria-hidden
        style={{ animationDelay: `${delay}ms` }}
        className="pointer-events-none absolute -inset-px rounded-[inherit] p-[1.5px] bg-ghost-sweep bg-[length:200%_100%] bg-[position:150%_0] animate-shimmer [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]"
    />
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

// A handle one pixel square, centred on the card's edge, so a line starts and ends right on the edge: React Flow puts a
// line's end on the handle's outer side. What's pressed is the larger round target inside it.
const ON_EDGE = "!w-px !h-px !min-w-0 !min-h-0 !border-0 !bg-transparent"

// Where a line comes in, which nobody drags to, and where one is pulled out, which only shows on a card with an answer.
const LineEnds: React.FC<{ canPull: boolean; onPull: () => void; label: string }> = ({ canPull, onPull, label }) => (
    <>
        <Handle type="target" position={Position.Left} id="in" isConnectable={false} style={{ top: LINE_AT }} className={ON_EDGE} />
        {/* Always there, so the board knows where a line leaves from, and only usable once there's an answer to pass on. */}
        <Handle
            type="source"
            position={Position.Right}
            id="out"
            isConnectableStart={canPull}
            isConnectableEnd={false}
            onClick={canPull ? onPull : undefined}
            title={canPull ? label : undefined}
            aria-label={canPull ? label : undefined}
            aria-hidden={!canPull || undefined}
            data-keep-selection
            style={{ top: LINE_AT }}
            className={cn(ON_EDGE, "transition-opacity", canPull ? "cursor-crosshair opacity-0 group-hover/card:opacity-100" : "invisible")}
        >
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-6 flex items-center justify-center">
                <span className="pointer-events-none size-3.5 rounded-full border-[1.5px] border-accent-ink bg-canvas" />
            </span>
        </Handle>
    </>
)

const pullLabel = (name: string, picked: number) => (picked > 0 ? `Pull a new card out of the ${plural(picked, 'selected row')}` : `Pull a new card out of ${name}’s`)

const CARD_SHELL = "group/card relative rounded-panel border bg-surface text-foreground transition-shadow duration-layout"

// A sent card's shadow: the reading ring while it runs, and once it's opened, the raised shadow of something floating
// over the board, under the ring if it runs.
const cardShadow = (running: boolean, open: boolean) =>
    cn(running && "border-transparent", running ? (open ? "shadow-reading-raised" : "shadow-reading") : open ? "shadow-raised" : "shadow-selected")

// A card that has been sent: one bird's chat. Closed, it shows what was asked and the latest answer, or its table, whose
// rows can be selected. Open, the whole chat and a reply field that carries the thread on.
const SentCard: React.FC<{ card: NestCard }> = ({ card }) => {
    const board = useBoard()
    const thread = useCardThread(card.chatId)
    const { find } = useFlock()
    const mascot = find(thread?.mascotId ?? card.mascotId)
    const name = useAssistantName(mascot)
    const source = board.sourceOf(card.id)
    const sourceName = useSourceName(source)
    const open = board.openId === card.id
    const running = thread?.partial != null
    const status = thread && cardStatus(thread)
    const asked = thread?.messages.findLast((message) => message.role === 'user')?.content
    const reply = thread && latestReply(thread)
    const answered = !!savedAnswer(thread)
    const table = useMemo(() => (reply ? findTable(reply, { streaming: running }) : null), [reply, running])
    // A selection is for the answer it was made in, so a new one lets it go.
    const selectedHere = board.selection?.cardId === card.id
    const selected = selectedHere && board.selection?.text === reply ? board.selection.rows : []
    const { clearSelection } = board
    useEffect(() => {
        if (selectedHere && board.selection?.text !== reply) clearSelection()
    }, [selectedHere, board.selection?.text, reply, clearSelection])
    const here = useWorkingRows(card.id, table)
    // Working with nothing to show yet, no words, no step and no question, its status is what shimmers.
    const waitingOnModel = running && !thread.partial && !thread.approval && !thread.statusLine && !thread.steps.some((step) => !step.done)

    return (
        <div className={cn(CARD_SHELL, cardShadow(running, open))} style={{ width: CARD_WIDTH }}>
            <Perched cardId={card.id} mascot={mascot} mood={moodOf(thread)} />
            <LineEnds canPull={answered} onPull={() => board.pullOut(card.id)} label={pullLabel(name, selected.length)} />
            <div className="nest-drag cursor-grab h-12 pl-[76px] pr-3 flex items-center gap-2">
                <span className="text-14 font-semibold truncate">{name}</span>
                {status && (
                    <span role="status" className={cn("text-12 shrink-0", TONES[status.tone])}>
                        <span className={waitingOnModel ? SHIMMER_QUIET : undefined}>{status.text}</span>
                    </span>
                )}
                <span className="ml-auto flex items-center">
                    {table && !running && <TableMenu cardId={card.id} />}
                    {answered && (
                        <span data-keep-selection>
                            <CardButton label="Continue in a new card" onClick={() => board.pullOut(card.id)}>
                                <GitFork className="size-4" />
                            </CardButton>
                        </span>
                    )}
                    <CardButton label={open ? 'Close the chat' : 'Open the whole chat'} onClick={() => board.setOpen(open ? null : card.id)}>
                        {open ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                    </CardButton>
                    <CardButton label="Delete card" onClick={() => board.remove(card.id)}>
                        <X className="size-4" />
                    </CardButton>
                </span>
            </div>
            {source && <p className="px-5 -mt-1 mb-2 text-12 text-muted-foreground">{withWhat(board.lineInto(card.id), sourceName, !!source.table)}</p>}
            <Attachments attachments={card.attachments} target={null} className="px-5 -mt-1 mb-2" />
            {thread &&
                (open ? (
                    <WholeChat
                        thread={thread}
                        mascot={mascot}
                        onSend={(text) => window.chromeAPI.nests.send(card.id, text)}
                        note={source ? `Gets ${getsWhat(board.lineInto(card.id), sourceName)} when you send` : null}
                    />
                ) : (
                    <div className="nodrag select-text cursor-auto flex flex-col">
                        <div className={cn("px-5 flex flex-col gap-3", table ? "pb-3 empty:hidden" : "pb-4")}>
                            {asked && <p className="text-13 text-muted-foreground line-clamp-2 whitespace-pre-wrap">{asked}</p>}
                            {running && !thread.partial && <Working thread={thread} />}
                            {thread.approval && <ChatApprovalCard chatId={thread.id} approval={thread.approval} mascot={mascot} />}
                            {reply && !table && <CutReply text={reply} onMore={() => board.setOpen(card.id)} />}
                            {thread.error && <ChatError message={thread.error} />}
                        </div>
                        {reply && table && (
                            <div className={cn("overflow-hidden", !(!running && answered && board.waitingOn(card.id).length > 0) && "rounded-b-panel")}>
                                <TableResult
                                    table={table}
                                    selected={running ? null : selected}
                                    onPick={(index, mode) => board.pick(card.id, reply, table, index, mode)}
                                    here={here}
                                />
                            </div>
                        )}
                    </div>
                ))}
            {!running && answered && <LooksRight cardId={card.id} />}
        </div>
    )
}

// Under a card whose answer a card of a run plan waits for the user to check: who waits, and the press that starts them.
const LooksRight: React.FC<{ cardId: string }> = ({ cardId }) => {
    const board = useBoard()
    const { find } = useFlock()
    const [busy, setBusy] = useState(false)
    const waiting = board.waitingOn(cardId)
    if (waiting.length === 0) return null
    const names = [...new Set(waiting.map((card) => find(card.mascotId).name))]
    const who = names.length === 1 ? `${names[0]} starts` : `${names.slice(0, -1).join(', ')} and ${names.at(-1)} start`
    return (
        <div className="nodrag cursor-auto px-5 py-3 border-t flex items-center gap-3">
            <p className="flex-1 min-w-0 text-13 text-muted-foreground">{who} when you say this is right.</p>
            <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                    setBusy(true)
                    await window.chromeAPI.nests.continueFrom(cardId)
                    setBusy(false)
                }}
            >
                Looks right, continue
            </Button>
        </div>
    )
}

// What a card on a line gets, in the words its header and reply field use.
const getsWhat = (line: NestLine | null, sourceName: string, file = false) =>
    line?.picked ? `${plural(line.picked, 'row')} from ${sourceName}` : file ? `every row of ${sourceName}` : `${sourceName}’s latest answer`

// What a sent card got, exactly, as main counts what crosses: "With Scout’s answer, about 900 words".
const withWhat = (line: NestLine | null, sourceName: string, file = false) =>
    line?.crosses?.whole ? `With ${crossingWords(line.crosses.whole, sourceName)}` : `With ${getsWhat(line, sourceName, file)}`

// The name a card goes by on a line: its bird's, or a file's title.
const useSourceName = (source: NestCard | null) => {
    const { find } = useFlock()
    const bird = useAssistantName(source ? find(source.mascotId) : undefined)
    return source?.table ? source.table.name : bird
}

// What a running card is doing: the bird's own words if it said any, or the step it's on. Before either, its status
// shimmers in the header instead.
const Working: React.FC<{ thread: ChatThread }> = ({ thread }) => {
    if (thread.statusLine) return <StatusLine text={thread.statusLine} />
    const step = thread.steps.findLast((each) => !each.done)
    if (thread.approval || !step) return null
    return <p role="status" className="text-14 line-clamp-2"><span className={SHIMMER_TEXT}>{step.shown ?? step.text}</span></p>
}

// The rows of this card's table that For-each cards reading from it are working on right now, with who. With `some`,
// the table is only its first rows, and a row being worked on past them is named as outside.
const useWorkingRows = (cardId: string, table: PickedRows | null, some = false): WorkingRows | null => {
    const board = useBoard()
    const { find } = useFlock()
    const berryName = useAssistantName()
    const cards = table ? board.forEachFrom(cardId) : []
    const threads = useCardThreads(cards.flatMap((card) => card.each?.runs.flatMap((run) => (run.chatId ? [run.chatId] : [])) ?? []))
    if (!table || cards.length === 0) return null
    const nameOf = (card: NestCard) => (card.mascotId ? find(card.mascotId).name : berryName)
    const keyOf = (row: readonly string[]) => JSON.stringify(row)
    const index = new Map(table.rows.map((row, at) => [keyOf(row), at]))
    const rows = new Map<number, string>()
    const outside: WorkingRows['outside'] = []
    for (const card of cards) {
        for (const run of card.each?.runs ?? []) {
            if (!run.chatId || threads[run.chatId]?.partial == null) continue
            const at = index.get(keyOf(run.row))
            if (at !== undefined) rows.set(at, nameOf(card))
            else if (some) outside.push({ who: nameOf(card), name: rowName(run.row) })
        }
    }
    return { who: nameOf(cards[0]), rows, outside }
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

// The card opened: its whole chat, as the chat page draws it, and a field to reply in. `note` says what goes with a reply,
// and why a reply couldn't be sent shows in its place.
const WholeChat: React.FC<{ thread: ChatThread; mascot: MascotProfile; onSend: (text: string) => Promise<NestSendEachResult>; note: string | null; bordered?: boolean }> = ({
    thread,
    mascot,
    onSend,
    note,
    bordered = true
}) => {
    const name = useAssistantName(mascot)
    const [problem, setProblem] = useState<string | null>(null)
    const running = thread.partial != null
    const messages = running ? [...thread.messages, { role: 'assistant' as const, content: thread.partial ?? '', steps: thread.steps, memoryIds: thread.memoryIds }] : thread.messages
    return (
        <div className="nodrag select-text cursor-auto flex flex-col">
            <div className={cn("nowheel max-h-[520px] overflow-y-auto px-5 pb-4 flex flex-col gap-5 pt-4", bordered && "border-t")}>
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
                    onSend={async (text) => {
                        setProblem(null)
                        const result = await onSend(text)
                        if (!result.ok) setProblem(result.error)
                    }}
                    disabled={running}
                    onStop={running ? () => void window.chromeAPI.chat.stop(thread.id) : undefined}
                    placeholder={`Reply to ${name}`}
                    attachment={
                        problem ? (
                            <p role="alert" className="px-2 text-12 text-destructive">{problem}</p>
                        ) : (
                            note && <p className="px-2 text-12 text-muted-foreground">{note}</p>
                        )
                    }
                    autoFocus
                />
            </div>
        </div>
    )
}

// A card nothing has been sent from yet: who it goes to, what it gets from the card its line comes from, and the prompt.
// When that's a table or rows picked from one, For each row sends it once per row instead.
const DraftCard: React.FC<{ card: NestCard }> = ({ card }) => {
    const board = useBoard()
    const { find } = useFlock()
    const mascot = find(card.mascotId)
    const name = useAssistantName(mascot)
    // A card of a plan that didn't start is a draft with its prompt, which the user can still send.
    const [text, setText] = useState(() => draftText(card.id) || (card.plan?.prompt ?? ''))
    const source = board.sourceOf(card.id)
    const line = board.lineInto(card.id)
    // How many rows were picked: the rows stay in main, which says when they've gone from the source.
    const picked = line?.picked ?? null
    const sourceName = useSourceName(source)
    const sourceThread = useCardThread(source?.chatId ?? null)
    const sourceAnswer = savedAnswer(sourceThread)
    // How many rows the table it reads from has: a file's, a For-each card's, or the one in the source's latest answer.
    const sourceRows = useMemo(
        () => (source?.table ? source.table.count : source?.each ? source.each.runs.length : sourceAnswer ? (findTable(sourceAnswer)?.rows.length ?? 0) : 0),
        [source?.table, source?.each, sourceAnswer]
    )
    const sourceAnswered = source?.table ? true : source?.each ? source.each.runs.some((run) => run.cell !== null) : !!sourceAnswer
    const stale = picked !== null && !!line?.crosses?.stale
    const rowCount = picked ?? sourceRows
    const canEach = !!source && (picked !== null || sourceRows > 0)
    const [eachOn, setEachOn] = useState(() => draftEach.get(card.id) ?? (picked !== null || !!card.plan?.each))
    const forEach = canEach && eachOn
    const tooMany = forEach && rowCount > MAX_RUNS
    const [sending, setSending] = useState(false)
    const [problem, setProblem] = useState<string | null>(null)
    const switchId = useId()
    const attaching = useAttaching({ cardId: card.id })

    const change = (value: string) => {
        setText(value)
        setDraftText(card.id, value)
    }
    const canSend = text.trim() !== '' && !sending && (!source || sourceAnswered) && !stale && !tooMany
    const send = async () => {
        if (!canSend) return
        setSending(true)
        setProblem(null)
        const api = window.chromeAPI.nests
        const result = forEach ? await api.sendEach(card.id, text.trim()) : await api.send(card.id, text.trim())
        setSending(false)
        if (result.ok) {
            setDraftText(card.id, '')
            draftEach.delete(card.id)
        } else setProblem(result.error)
    }

    const gets = !source
        ? 'New card'
        : picked
          ? stale
              ? `${sourceName}’s rows have changed`
              : `gets ${plural(picked, 'row')} from ${sourceName}`
          : source.table
            ? `gets every row of ${sourceName}`
            : source.each
              ? sourceAnswered
                  ? `gets ${sourceName}’s table`
                  : `${sourceName} hasn’t answered yet`
              : sourceAnswered
                ? `gets ${sourceName}’s latest answer`
                : `${sourceName} hasn’t answered yet`
    // Exactly what crosses, as main counts it: what each run gets with For each row, or else what the card gets.
    const crosses = stale ? null : forEach ? (line?.crosses?.each ? eachWords(line.crosses.each) : null) : line?.crosses?.whole ? crossingWords(line.crosses.whole, sourceName) : null

    return (
        <div className={cn(CARD_SHELL, "border-accent-ink shadow-raised")} style={{ width: CARD_WIDTH }}>
            <Perched cardId={card.id} mascot={mascot} mood="rest" />
            <LineEnds canPull={false} onPull={() => undefined} label="" />
            <div className="nest-drag cursor-grab h-12 pl-[76px] pr-3 flex items-center gap-2">
                <span className="text-14 font-semibold truncate">{name}</span>
                <span className="text-12 text-muted-foreground truncate">{gets}</span>
                <span className="ml-auto flex items-center">
                    <CardButton label="Delete card" onClick={() => board.remove(card.id)}>
                        <X className="size-4" />
                    </CardButton>
                </span>
            </div>
            {crosses && <p data-crosses className="px-5 -mt-1 mb-1 text-12 text-muted-foreground">{crosses}</p>}
            <div className="nodrag cursor-auto px-2 pb-2">
                <Composer
                    bare
                    label={`What should ${name} do?`}
                    placeholder={forEach ? `What should ${name} do with each row?` : `What should ${name} do?`}
                    value={text}
                    onChange={change}
                    rows={2}
                    autoFocus={board.focusId === card.id}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            void send()
                        }
                        // Esc closes an empty draft, and leaves one with words in it, back on the card.
                        if (event.key === 'Escape') {
                            event.preventDefault()
                            if (!text.trim() && card.attachments.length === 0 && !card.plan) board.remove(card.id)
                            else (event.currentTarget.closest('.react-flow__node') as HTMLElement | null)?.focus()
                        }
                    }}
                    addItems={attaching.items}
                    addLabel="Add a file or note"
                    attachment={<Attachments attachments={card.attachments} target={{ cardId: card.id }} attaching={attaching} className="px-2 pb-1" />}
                    canSend={canSend}
                    onSend={() => void send()}
                    mascot={mascot}
                    onChooseMascot={(id) => void window.chromeAPI.nests.setBird(card.id, id)}
                    footer={
                        canEach && (
                            <>
                                <span className="flex items-center gap-2 pl-2">
                                    <Switch
                                        checked={forEach}
                                        labelledBy={switchId}
                                        onChange={(on) => {
                                            setEachOn(on)
                                            draftEach.set(card.id, on)
                                            setProblem(null)
                                        }}
                                    />
                                    <span id={switchId} className="text-13">For each row</span>
                                </span>
                                {forEach && (
                                    <span className={cn("ml-auto pr-1 text-13 truncate", tooMany ? "text-destructive" : "text-muted-foreground")}>
                                        {tooMany ? `${rowCount} rows, ${MAX_RUNS} at most` : plural(rowCount, 'run')}
                                    </span>
                                )}
                            </>
                        )
                    }
                />
                {(stale || problem || tooMany) && (
                    <p role="alert" className={cn("px-2 pt-1 text-12", problem || tooMany ? "text-destructive" : "text-muted-foreground")}>
                        {problem ?? (stale ? STALE_ROWS : `For each row runs at most ${MAX_RUNS} times. Select ${MAX_RUNS} rows or fewer, or turn it off.`)}
                    </p>
                )}
                {card.plan?.note && <p role="status" className="px-2 pt-1 text-12 text-muted-foreground">{card.plan.note}. You can still send it yourself.</p>}
            </div>
        </div>
    )
}

interface RunView {
    id: string
    name: string
    phase: RunPhase
    thread: ChatThread | undefined
    cell: string | null
}

const RUN_WORDS: Record<RunPhase, string> = {
    waiting: 'Waiting its turn',
    working: 'Working',
    done: '',
    failed: 'Didn’t finish',
    stopped: 'Stopped',
    'not-started': 'Didn’t start'
}

// One row's cell in a For-each card's column: its value once its run has one, or else how its run is going. A press on
// it opens the run's thread, and a link in it opens in a new tab.
const RunCell: React.FC<{ view: RunView; onOpen: () => void }> = ({ view, onOpen }) => {
    const { phase, thread, cell } = view
    const asking = phase === 'working' && thread?.approval ? cardStatus(thread).text : null
    const content =
        phase === 'done' ? (
            cell ? <CellText cell={cell} /> : <span className="text-muted-foreground">No answer</span>
        ) : asking ? (
            <span className="text-accent-ink">{asking}</span>
        ) : phase === 'working' ? (
            <span className={SHIMMER_QUIET}>Working</span>
        ) : (
            <span className={phase === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{RUN_WORDS[phase]}</span>
        )
    return (
        <>
            {thread && (
                <button
                    type="button"
                    aria-label={`Open ${view.name}’s run`}
                    onClick={(event) => {
                        event.stopPropagation()
                        onOpen()
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    className="absolute inset-0 w-full outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                />
            )}
            <span title={phase === 'done' && cell ? plainCell(cell) : undefined} className="relative block truncate pointer-events-none [&_a]:pointer-events-auto">
                {content}
            </span>
        </>
    )
}

// A For-each card's own column's name, which reads as a header until it's pressed, and then renames it. While the cheap
// model names it, it shimmers.
const ColumnName: React.FC<{ cardId: string; name: string; naming: boolean }> = ({ cardId, name, naming }) => {
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState(name)
    useEffect(() => setValue(name), [name])
    const save = () => {
        setEditing(false)
        if (value.trim() && value.trim() !== name) void window.chromeAPI.nests.renameColumn(cardId, value)
        else setValue(name)
    }
    if (editing) {
        return (
            <input
                aria-label="Column name"
                value={value}
                maxLength={60}
                autoFocus
                onChange={(event) => setValue(event.target.value)}
                onBlur={save}
                onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                        event.preventDefault()
                        setValue(name)
                        setEditing(false)
                    }
                }}
                style={{ fieldSizing: 'content' } as React.CSSProperties}
                className="min-w-16 h-6 -mx-1 px-1 rounded-control bg-muted text-12 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
        )
    }
    return (
        <button
            type="button"
            title="Rename the column"
            aria-label={`${name}, rename the column`}
            onClick={() => setEditing(true)}
            className="h-6 -mx-1 px-1 rounded-control text-12 text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
            <span className={naming ? SHIMMER_QUIET : undefined}>{name}</span>
        </button>
    )
}

// Rows picked in a table that isn't an answer, such as a For-each card's or a file's, kept for the table they were
// picked in: `key` says what it was made from.
const useTablePick = (cardId: string, key: string) => {
    const board = useBoard()
    const selectedHere = board.selection?.cardId === cardId
    const selected = selectedHere && board.selection?.text === key ? board.selection.rows : []
    const { clearSelection } = board
    useEffect(() => {
        if (selectedHere && board.selection?.text !== key) clearSelection()
    }, [selectedHere, board.selection?.text, key, clearSelection])
    return selected
}

// A card sent with For each row: the same prompt once for each row, each run its own chat. Its result is one table, the
// rows it ran on with their columns and one more, each row's value filled in as its run ends, or how that run is going
// until then. Rows waiting on the user show their approval or question above it, in the same card as a chat. A press on
// a cell opens its run's thread under Every run. There's no reply field on the card: a reply goes in one run's thread.
const ForEachCard: React.FC<{ card: NestCard; each: NestForEach }> = ({ card, each }) => {
    const board = useBoard()
    const { find } = useFlock()
    const mascot = find(card.mascotId)
    const name = useAssistantName(mascot)
    const source = board.sourceOf(card.id)
    const line = board.lineInto(card.id)
    const sourceName = useSourceName(source)
    const threads = useCardThreads(each.runs.flatMap((run) => (run.chatId ? [run.chatId] : [])))
    const [openRun, setOpenRun] = useState<string | null>(null)
    const open = board.openId === card.id
    // Closing the card goes back to the table for next time. Opened at a run, from Needs you, it shows that run.
    useEffect(() => {
        setOpenRun(open ? board.openRunId : null)
    }, [open, board.openRunId])

    const views: RunView[] = each.runs.map((run) => {
        const thread = run.chatId ? threads[run.chatId] : undefined
        return { id: run.id, name: rowName(run.row), phase: runPhase(run, thread), thread, cell: run.cell }
    })
    const status = forEachStatus(views.map((view) => view.phase))
    const active = views.some((view) => view.phase === 'waiting' || view.phase === 'working')
    const asking = views.filter((view) => view.thread?.approval && view.thread.partial !== null)
    const running = views.some((view) => view.phase === 'working')
    const answered = each.runs.some((run) => run.cell !== null)
    const shownRun = open && openRun ? views.find((view) => view.id === openRun && view.thread) : undefined
    const table = useMemo(() => combinedTable(each), [each])
    // The header too, so renaming the column lets a selection go rather than leaving one main would refuse.
    const key = useMemo(() => JSON.stringify(table), [table])
    const selected = useTablePick(card.id, key)
    const here = useWorkingRows(card.id, table)
    const from = source ? (line?.picked ? `For each of ${plural(line.picked, 'row')} from ${sourceName}` : `For each row of ${source.table ? sourceName : `${sourceName}’s table`}`) : 'For each row'
    const openRunOf = (id: string) => {
        setOpenRun(id)
        board.setOpen(card.id, id)
    }

    return (
        <div className={cn(CARD_SHELL, cardShadow(running, open))} style={{ width: CARD_WIDTH }}>
            <Perched cardId={card.id} mascot={mascot} mood={asking.length > 0 ? 'asking' : running ? 'thinking' : 'rest'} />
            <LineEnds canPull={answered} onPull={() => board.pullOut(card.id)} label={pullLabel(name, selected.length)} />
            <div className="nest-drag cursor-grab h-12 pl-[76px] pr-3 flex items-center gap-2">
                <span className="text-14 font-semibold truncate">{name}</span>
                <span role="status" className={cn("text-12 shrink-0", TONES[status.tone])}>{status.text}</span>
                <span className="ml-auto flex items-center">
                    {active && (
                        <button
                            type="button"
                            onClick={() => void window.chromeAPI.nests.stopCard(card.id)}
                            className="nodrag mr-1 h-7 px-2.5 rounded-control border text-13 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Stop
                        </button>
                    )}
                    {answered && <TableMenu cardId={card.id} />}
                    {answered && (
                        <span data-keep-selection>
                            <CardButton label="Continue in a new card" onClick={() => board.pullOut(card.id)}>
                                <GitFork className="size-4" />
                            </CardButton>
                        </span>
                    )}
                    <CardButton label={open ? 'Close the table' : 'Open every row'} onClick={() => board.setOpen(open ? null : card.id)}>
                        {open ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                    </CardButton>
                    <CardButton label="Delete card" onClick={() => board.remove(card.id)}>
                        <X className="size-4" />
                    </CardButton>
                </span>
            </div>
            <p data-crosses className="px-5 -mt-1 mb-2 text-12 text-muted-foreground">
                {from} · {eachWords({ columns: each.header.length, cut: rowTooLong(each.header, each.runs.map((run) => run.row)) }).replace(/^O/, 'o')}
            </p>
            <Attachments attachments={card.attachments} target={null} className="px-5 -mt-1 mb-2" />
            {shownRun?.thread ? (
                <div className="nodrag flex flex-col">
                    <div className="px-3 pb-1 flex items-center gap-1 border-t pt-2">
                        <button
                            type="button"
                            onClick={() => setOpenRun(null)}
                            className="h-7 px-2 rounded-control flex items-center gap-1.5 text-13 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <ArrowLeft className="size-4" />
                            Every run
                        </button>
                        <span className="text-13 font-semibold truncate">{shownRun.name}</span>
                    </div>
                    <WholeChat
                        thread={shownRun.thread}
                        mascot={mascot}
                        bordered={false}
                        onSend={(text) => window.chromeAPI.nests.sendRun(shownRun.id, text)}
                        note={`Gets its row${source ? ` from ${sourceName}` : ''} again when you send`}
                    />
                </div>
            ) : (
                <div className="nodrag select-text cursor-auto flex flex-col">
                    <div className="px-5 pb-3 flex flex-col gap-3">
                        <p className="text-13 text-muted-foreground line-clamp-2 whitespace-pre-wrap">{each.prompt}</p>
                        {asking.map((view) => (
                            <div key={view.id} className="flex flex-col gap-1">
                                <p className="text-12 text-muted-foreground">{view.name}</p>
                                <ChatApprovalCard chatId={view.thread!.id} approval={view.thread!.approval!} mascot={mascot} />
                            </div>
                        ))}
                    </div>
                    <div className={cn("overflow-hidden", !(!active && answered && board.waitingOn(card.id).length > 0) && "rounded-b-panel")}>
                        <TableResult
                            table={table}
                            selected={active ? null : selected}
                            onPick={(index, mode) => board.pick(card.id, key, table, index, mode)}
                            here={here}
                            every={open}
                            own={{
                                header: <ColumnName cardId={card.id} name={each.column} naming={!!each.naming} />,
                                cell: (index) => <RunCell view={views[index]} onOpen={() => openRunOf(views[index].id)} />
                            }}
                        />
                    </div>
                </div>
            )}
            {!active && answered && <LooksRight cardId={card.id} />}
        </div>
    )
}

// A table from a file the user added: its rows, owned by the user, with no chat and no bird. Its rows can be picked and a
// line pulled out of them, and For each row works on it like any table.
const TableCard: React.FC<{ card: NestCard; file: NestTableFile }> = ({ card, file }) => {
    const board = useBoard()
    // A board carries only the first rows, each cell cut. The whole table is asked of main once, when "N more" opens it,
    // or when a row is first pressed while one of the first rows was cut, so what's picked is what main has.
    const [rows, setRows] = useState<string[][] | null>(null)
    const loadRows = async (): Promise<string[][] | null> => {
        if (rows) return rows
        const loaded = await window.chromeAPI.nests.tableRows(card.id)
        if (loaded) setRows(loaded)
        return loaded
    }
    const table = useMemo(() => ({ header: file.header, rows: rows ?? file.rows }), [file, rows])
    const selected = useTablePick(card.id, 'file')
    const whole = rows !== null || file.rows.every((row) => row.every((cell) => cell.length < PREVIEW_CELL_LENGTH))
    const pick = async (index: number, mode: PickMode) => {
        const loaded = whole ? null : await loadRows()
        board.pick(card.id, 'file', loaded ? { header: file.header, rows: loaded } : table, index, mode)
    }
    const here = useWorkingRows(card.id, table, rows === null && file.count > file.rows.length)
    const label = selected.length > 0 ? pullLabel('', selected.length) : `Pull a new card out of ${file.name}`
    return (
        <div className={cn(CARD_SHELL, "shadow-selected")} style={{ width: CARD_WIDTH }}>
            <LineEnds canPull onPull={() => board.pullOut(card.id)} label={label} />
            <div className="nest-drag cursor-grab h-12 pl-5 pr-3 flex items-center gap-2">
                <Table2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-14 font-semibold truncate">{file.name}</span>
                <span className="text-12 text-muted-foreground shrink-0">
                    {plural(file.count, 'row')}, {plural(file.header.length, 'column')}
                </span>
                <span className="ml-auto flex items-center">
                    <TableMenu cardId={card.id} />
                    <span data-keep-selection>
                        <CardButton label="Continue in a new card" onClick={() => board.pullOut(card.id)}>
                            <GitFork className="size-4" />
                        </CardButton>
                    </span>
                    <CardButton label="Delete card" onClick={() => board.remove(card.id)}>
                        <X className="size-4" />
                    </CardButton>
                </span>
            </div>
            <div className={cn("nodrag cursor-auto overflow-hidden", board.waitingOn(card.id).length === 0 && "rounded-b-panel")}>
                <TableResult
                    table={table}
                    total={file.count}
                    onMore={() => void loadRows()}
                    selected={selected}
                    onPick={(index, mode) => void pick(index, mode)}
                    here={here}
                />
            </div>
            <LooksRight cardId={card.id} />
        </div>
    )
}

// A card Berry planned, dashed until it starts. Before Run, its prompt edits in place, its bird and For each row change,
// and a line pulls out of it to add another. Once the plan runs, it only says what it's waiting for.
const PlannedCard: React.FC<{ card: NestCard; plan: NestPlanned }> = ({ card, plan }) => {
    const board = useBoard()
    const { find } = useFlock()
    const mascot = find(card.mascotId)
    const name = useAssistantName(mascot)
    const source = board.sourceOf(card.id)
    const sourceName = useSourceName(source)
    const sourceThread = useCardThread(source?.chatId ?? null)
    const sourceAnswer = savedAnswer(sourceThread)
    const editable = plan.state === 'planned'
    // While Berry changes the plan, which replaces this card from what it was when Berry started, nothing on it changes.
    const waiting = editable && board.replanning
    // For each row needs a table to run on: one the card it reads from will answer with, or one already in its answer.
    const getsTable =
        !!source && (source.table || source.each ? true : source.plan ? source.plan.each || source.plan.table !== null : !!sourceAnswer && findTable(sourceAnswer) !== null)
    const [text, setText] = useState(plan.prompt)
    const [choosing, setChoosing] = useState(false)
    const attaching = useAttaching(editable ? { cardId: card.id } : null)
    const editing = useRef(false)
    const saveTimer = useRef<number | undefined>(undefined)
    const switchId = useId()
    const api = window.chromeAPI.nests
    // A changed plan brings new words, unless the user is the one changing them.
    useEffect(() => {
        if (!editing.current) setText(plan.prompt)
    }, [plan.prompt])
    useEffect(() => () => window.clearTimeout(saveTimer.current), [])
    const change = (value: string) => {
        setText(value)
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => void api.editPlan(card.id, { prompt: value }), 400)
    }
    const waitsForYou = plan.state === 'armed' && plan.waits && !!sourceAnswer && sourceThread?.partial == null
    const status = waiting ? 'Can’t change while Berry changes the plan' : editable ? `Planned${plan.each ? ' · for each row' : ''}` : waitsForYou ? 'Waits for you' : source ? `Waiting for ${sourceName}` : 'Starting'
    const gets = source ? (plan.each ? `For each row of ${sourceName}’s table` : `Gets ${sourceName}’s answer`) : null
    const details = [mascot.sites.length > 0 ? `Only goes to ${mascot.sites.join(', ')}` : null, plan.table ? `A table of ${plan.table} lands here` : null].filter(
        (line): line is string => line !== null
    )

    return (
        <div className={cn(CARD_SHELL, "border-dashed border-accent-ink/50 transition-opacity duration-layout", waiting && "opacity-60")} style={{ width: CARD_WIDTH }}>
            {waiting && <GhostSweep />}
            <Perched cardId={card.id} mascot={mascot} mood="rest" />
            <LineEnds canPull={editable && !waiting} onPull={() => board.pullOut(card.id)} label={`Pull a new card out of ${name}’s`} />
            <div className="nest-drag cursor-grab h-12 pl-[76px] pr-3 flex items-center gap-2">
                <span className="text-14 font-semibold truncate">{name}</span>
                <span role="status" className="text-12 text-muted-foreground truncate">{status}</span>
                {editable && (
                    <span className="ml-auto flex items-center">
                        <CardButton label="Delete card" onClick={() => board.remove(card.id)}>
                            <X className="size-4" />
                        </CardButton>
                    </span>
                )}
            </div>
            {gets && <p className="px-5 -mt-1 mb-1 text-12 text-muted-foreground">{gets}</p>}
            <div className="nodrag cursor-auto px-5 pb-3">
                {editable ? (
                    <PlanPrompt
                        label={`What ${name} will do`}
                        value={text}
                        readOnly={waiting}
                        onChange={change}
                        onFocus={() => (editing.current = true)}
                        onBlur={() => {
                            editing.current = false
                            window.clearTimeout(saveTimer.current)
                            if (text !== plan.prompt) void api.editPlan(card.id, { prompt: text })
                        }}
                    />
                ) : (
                    <p className="text-13 whitespace-pre-wrap line-clamp-4">{plan.prompt}</p>
                )}
                <Attachments attachments={card.attachments} target={editable ? { cardId: card.id } : null} attaching={attaching} className="pt-1" />
            </div>
            {(details.length > 0 || (plan.waits && source)) && (
                <div className="px-5 py-3 border-t flex flex-col gap-1 text-13 text-muted-foreground">
                    {details.map((line) => <p key={line}>{line}</p>)}
                    {plan.waits && source && <p className="text-accent-ink">Starts when you say {sourceName}’s answer is right</p>}
                </div>
            )}
            {editable && (
                <div className="nodrag cursor-auto px-3 pb-3 flex flex-col gap-2">
                    {choosing && !waiting && (
                        <MascotPerch
                            selectedId={mascot.id}
                            onChoose={(id) => {
                                setChoosing(false)
                                void api.setBird(card.id, id)
                            }}
                            onClose={() => setChoosing(false)}
                        />
                    )}
                    <div className="flex items-center gap-3">
                        <MascotChip mascot={mascot} open={choosing} onPress={waiting ? undefined : () => setChoosing(!choosing)} />
                        {attaching.items && <AddMenu items={attaching.items} label="Add a file or note" small />}
                        {getsTable && (
                            <span className="flex items-center gap-2">
                                <Switch checked={plan.each} labelledBy={switchId} disabled={waiting} onChange={(on) => void api.editPlan(card.id, { each: on })} />
                                <span id={switchId} className="text-13">For each row</span>
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// A planned card's prompt, edited in place: it reads as text until it's pressed, and grows with what's written.
const PlanPrompt: React.FC<{ label: string; value: string; readOnly: boolean; onChange: (value: string) => void; onFocus: () => void; onBlur: () => void }> = ({
    label,
    value,
    readOnly,
    onChange,
    onFocus,
    onBlur
}) => {
    const box = useRef<HTMLTextAreaElement>(null)
    useLayoutEffect(() => {
        const element = box.current
        if (!element) return
        element.style.height = 'auto'
        element.style.height = `${element.scrollHeight}px`
    }, [value])
    return (
        <textarea
            ref={box}
            aria-label={label}
            placeholder={label}
            value={value}
            readOnly={readOnly}
            rows={1}
            onChange={(event) => onChange(event.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            className={cn(
                "nowheel block w-[calc(100%+12px)] -mx-1.5 px-1.5 py-1 resize-none overflow-hidden rounded-control bg-transparent text-13 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground",
                !readOnly && "hover:bg-muted focus:bg-muted"
            )}
        />
    )
}

export const CardView: React.FC<NodeProps<CardNode>> = ({ data: { card } }) =>
    card.table ? (
        <TableCard card={card} file={card.table} />
    ) : card.each ? (
        <ForEachCard card={card} each={card.each} />
    ) : card.chatId ? (
        <SentCard card={card} />
    ) : card.plan && card.plan.state !== 'held' ? (
        <PlannedCard card={card} plan={card.plan} />
    ) : (
        <DraftCard card={card} />
    )

const LINE = "stroke-accent-ink/60"
// The round ends sit just outside the cards, touching their edges, since a line is drawn under the cards.
const END = 3.5
const STROKE = 1.5

// A line between two cards, dashed while the card it goes to hasn't been sent, with a small round end at each card.
export const LineView: React.FC<EdgeProps<LineEdge>> = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) => {
    const from = sourceX + END + STROKE / 2
    const to = targetX - END
    const [path] = getBezierPath({ sourceX: from, sourceY, sourcePosition, targetX: to, targetY, targetPosition })
    return (
        <>
            <BaseEdge id={id} path={path} className={LINE} style={{ strokeWidth: STROKE, strokeDasharray: data?.draft ? '5 5' : undefined }} />
            <circle cx={from} cy={sourceY} r={END} className={cn(LINE, "fill-canvas")} strokeWidth={STROKE} />
            <circle cx={to} cy={targetY} r={END} className="fill-accent-ink/60" />
        </>
    )
}

// The line while it's being pulled out, before there's a card at its end.
export const PullingLine: React.FC<ConnectionLineComponentProps> = ({ fromX, fromY, toX, toY, fromPosition, toPosition }) => {
    const [path] = getBezierPath({ sourceX: fromX + END + STROKE / 2, sourceY: fromY, sourcePosition: fromPosition, targetX: toX, targetY: toY, targetPosition: toPosition })
    return (
        <g>
            <path d={path} fill="none" className={LINE} strokeWidth={STROKE} strokeDasharray="5 5" />
            <circle cx={toX} cy={toY} r={END} className="fill-accent-ink/60" />
        </g>
    )
}
