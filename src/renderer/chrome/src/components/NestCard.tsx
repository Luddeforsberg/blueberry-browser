import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BaseEdge, getBezierPath, Handle, NodeResizeControl, Position, useStore, type ConnectionLineComponentProps, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { ArrowLeft, Download, FileText, GitFork, GitMerge, Image, Maximize2, Minimize2, Table2, X } from 'lucide-react'
import type { ChatThread, MascotProfile, NestCard, NestFile, NestFileContent, NestForEach, NestLine, NestPlanned, NestTableFile } from '@shared/library'
import { combinedTable, eachWords, findTable, lineWords, MAX_RUNS, plainCell, PREVIEW_CELL_LENGTH, rowName, rowTooLong, STALE_ROWS, type PickedRows } from '@shared/nestTable'
import { BERRY_ID } from '@shared/mascots'
import { costWords } from '@shared/modelPrices'
import { useShell } from '../contexts/ShellContext'
import type { Mood } from '@common/components/Mascot'
import type { NestSendEachResult } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Switch } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { useChatThread, useChatThreads } from '../contexts/ChatContext'
import { useFlock } from '../contexts/LibraryContext'
import { cardStatus, CARD_SIZE, CARD_WIDTH, forEachStatus, latestReply, runPhase, type RunPhase } from '../nestBoard'
import { Berry, useAssistantName } from './Berry'
import { AssistantMessage, ChatApprovalCard, ChatError, Markdown, SHIMMER_QUIET, SHIMMER_TEXT, StatusLine, UserMessage } from './ChatMessage'
import { AddMenu, ChatComposer, Composer } from './Composer'
import { Attachments, useAttaching } from './NestAttachments'
import { MascotChip, MascotPerch } from './MascotPerch'
import { MemoryOffers } from './MemoryInChat'
import { CARD_PROSE, CellText, TableMenu, TableResult, useCut, type PickMode, type WorkingRows } from './NestTable'
import { formatBytes } from './downloadStatus'

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
    // The lines into a card and the cards they come from, in the order the card lists them and the model gets them.
    inputsOf: (cardId: string) => { line: NestLine; source: NestCard }[]
    // Cards on the board a draft or planned card could read from as well.
    inputCandidates: (cardId: string) => NestCard[]
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
    // The user is making a card bigger or smaller from its corner, and where they left it, which is saved.
    resizeStart: (cardId: string) => void
    resizeEnd: (cardId: string, size: { width: number; height: number }) => void
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

// A card's own size, when the user made it one: then it keeps that size and what's in it fills it. Otherwise it's the
// usual width and as tall as what it shows. An open card always grows with what it shows.
export interface CardBox {
    width: number
    fill: boolean
}

const boxStyle = (box: CardBox): React.CSSProperties => ({ width: box.width, height: box.fill ? '100%' : undefined })

// Made wider than usual from its corner, a table's long cells wrap rather than being cut. At the usual width they stay one line.
const wide = (box: CardBox) => box.fill && box.width > CARD_WIDTH

// The card's bottom-right corner, which makes it bigger or smaller. React Flow's own control, which takes the press, so
// it never moves the card, pans the board or pulls a line out.
const ResizeCorner: React.FC<{ cardId: string }> = ({ cardId }) => {
    const board = useBoard()
    return (
        <NodeResizeControl
            position="bottom-right"
            minWidth={CARD_SIZE.minWidth}
            maxWidth={CARD_SIZE.maxWidth}
            minHeight={CARD_SIZE.minHeight}
            maxHeight={CARD_SIZE.maxHeight}
            onResizeStart={() => board.resizeStart(cardId)}
            onResizeEnd={(_, { width, height }) => board.resizeEnd(cardId, { width, height })}
            // Centred on the corner, so it covers only the card's rounded corner and never a cell under it.
            className="z-10 text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 hover:text-foreground"
            style={{ width: 16, height: 16, border: 0, borderRadius: 0, background: 'transparent' }}
        >
            <svg aria-hidden viewBox="0 0 10 10" className="absolute left-0 top-0 size-2.5 -translate-x-1 -translate-y-1" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <path d="M9 3 3 9M9 7 7 9" />
            </svg>
        </NodeResizeControl>
    )
}

// A sent card's shadow: the reading ring while it runs, and once it's opened, the raised shadow of something floating
// over the board, under the ring if it runs.
const cardShadow = (running: boolean, open: boolean) =>
    cn(running && "border-transparent", running ? (open ? "shadow-reading-raised" : "shadow-reading") : open ? "shadow-raised" : "shadow-selected")

// A card that has been sent: one bird's chat. Closed, it shows what was asked and the latest answer, or its table, whose
// rows can be selected. Open, the whole chat and a reply field that carries the thread on.
const SentCard: React.FC<{ card: NestCard; box: CardBox }> = ({ card, box }) => {
    const board = useBoard()
    const thread = useCardThread(card.chatId)
    const { find } = useFlock()
    const mascot = find(thread?.mascotId ?? card.mascotId)
    const name = useAssistantName(mascot)
    const inputs = useInputs(card.id)
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
        <div className={cn(CARD_SHELL, cardShadow(running, open), box.fill && "flex flex-col")} style={boxStyle(box)}>
            <Perched cardId={card.id} mascot={mascot} mood={moodOf(thread)} />
            <LineEnds canPull={answered} onPull={() => board.pullOut(card.id)} label={pullLabel(name, selected.length)} />
            <div className="nest-drag cursor-grab h-12 shrink-0 pl-[76px] pr-3 flex items-center gap-2">
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
            {withWhat(inputs) && <p className="px-5 -mt-1 mb-2 text-12 text-muted-foreground">{withWhat(inputs)}</p>}
            <Attachments attachments={card.attachments} target={null} className="px-5 -mt-1 mb-2" />
            {thread &&
                (open ? (
                    <WholeChat
                        thread={thread}
                        mascot={mascot}
                        onSend={(text) => window.chromeAPI.nests.send(card.id, text)}
                        note={inputs.length > 0 ? `Gets ${listed(inputs.map((input) => getsWhat(input)))} when you send` : null}
                    />
                ) : (
                    <div className={cn("nodrag select-text cursor-auto flex flex-col", box.fill && "flex-1 min-h-0 overflow-hidden rounded-b-panel")}>
                        {/* Made a size, what's above the table scrolls when an approval or question is longer than the card. */}
                        <div
                            className={cn(
                                "px-5 flex flex-col gap-3",
                                table ? "pb-3 empty:hidden" : "pb-4",
                                box.fill && "nowheel min-h-0 overflow-y-auto",
                                box.fill && !table && "flex-1"
                            )}
                        >
                            {asked && <p className="shrink-0 text-13 text-muted-foreground line-clamp-2 whitespace-pre-wrap">{asked}</p>}
                            {running && !thread.partial && <Working thread={thread} />}
                            {thread.approval && <ChatApprovalCard chatId={thread.id} approval={thread.approval} mascot={mascot} />}
                            {reply && !table && <CutReply text={reply} fill={box.fill} onMore={() => board.setOpen(card.id)} />}
                            {thread.error && <ChatError message={thread.error} />}
                        </div>
                        {reply && table && (
                            <div
                                className={cn(
                                    "overflow-hidden",
                                    box.fill && "flex-1 min-h-[100px] flex flex-col",
                                    !(!running && answered && board.waitingOn(card.id).length > 0) && "rounded-b-panel"
                                )}
                            >
                                <TableResult
                                    table={table}
                                    selected={running ? null : selected}
                                    onPick={(index, mode) => board.pick(card.id, reply, table, index, mode)}
                                    here={here}
                                    fill={box.fill}
                                    wrap={wide(box)}
                                />
                            </div>
                        )}
                    </div>
                ))}
            {!running && answered && <LooksRight cardId={card.id} />}
            {!open && <ResizeCorner cardId={card.id} />}
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
        <div className="nodrag cursor-auto shrink-0 px-5 py-3 border-t flex items-center gap-3">
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

// "about $0.40" from what runs like these cost, or "roughly $1.20" when it's only a guess for the model, with nothing
// like it run yet.
const estimateWords = (perRun: NonNullable<NestCard['perRun']>, runs: number) => `${perRun.rough ? 'roughly' : 'about'} ${costWords(perRun.cost * runs)}`

// One input of a card: the line, the card it comes from, the name it goes by there, its bird's or a file's title, whether
// it has anything to give yet, and how many rows its table has.
interface InputView {
    line: NestLine
    source: NestCard
    name: string
    answered: boolean
    running: boolean
    rows: number
}

// What a card goes by on a line: its bird's name, as Show Berry has it, or a file's title.
const nameOn = (source: NestCard, mascot: MascotProfile, showBerry: boolean) =>
    source.table ? source.table.name : source.file ? source.file.name : mascot.id !== BERRY_ID ? mascot.name : showBerry ? 'Berry' : 'Assistant'

const useInputs = (cardId: string): InputView[] => {
    const board = useBoard()
    const { find } = useFlock()
    const { showBerry } = useShell().settings
    const inputs = board.inputsOf(cardId)
    const threads = useCardThreads(inputs.flatMap(({ source }) => (source.chatId ? [source.chatId] : [])))
    return inputs.map(({ line, source }) => {
        const thread = source.chatId ? threads[source.chatId] : undefined
        const answer = savedAnswer(thread)
        return {
            line,
            source,
            name: nameOn(source, find(source.mascotId), showBerry),
            answered: source.table || source.file ? true : source.each ? source.each.runs.some((run) => run.cell !== null) : !!answer,
            running: thread?.partial != null,
            rows: source.table ? source.table.count : source.each ? source.each.runs.length : answer ? (findTable(answer)?.rows.length ?? 0) : 0
        }
    })
}

// The one input For each row runs on, as main picks it: the first that brings rows.
const drivingInput = (inputs: readonly InputView[]) => inputs.find((input) => input.line.picked !== null || input.rows > 0) ?? null

// "Scout, Rival and Writer".
const listed = (words: readonly string[]) => (words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

// What a card on a line gets, in the words its header and reply field use.
const getsWhat = ({ line, name, source }: InputView) =>
    line.picked ? `${plural(line.picked, 'row')} from ${name}` : source.table ? `every row of ${name}` : source.file ? name : `${name}’s thread`

// What a sent card got, exactly, as main counts what crosses: "With Scout’s thread (2 answers) and 1 card before it,
// about 1,800 words".
// Files aren't named here: once it's sent, the card's own copies show on its paperclip line, which stays true after the
// file's card is gone.
const withWhat = (inputs: readonly InputView[]): string | null => {
    const words = inputs.filter((input) => !input.source.file).map((input) => (input.line.crosses?.whole ? lineWords({ whole: input.line.crosses.whole }, input.name) : null) ?? getsWhat(input))
    return words.length > 0 ? `With ${words.join(' · ')}` : null
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

// The latest answer in the chat's own markdown, compact, cut to a height that keeps the board readable, or to what the
// card's own size leaves, with the rest a press away.
const CutReply: React.FC<{ text: string; fill: boolean; onMore: () => void }> = ({ text, fill, onMore }) => {
    const { box, cut } = useCut<HTMLDivElement>(text)
    return (
        <div className={cn("flex flex-col items-start gap-1", fill && "flex-1 min-h-0")}>
            <div
                ref={box}
                className={cn("w-full overflow-hidden", fill && "flex-1 min-h-0", cut && "[mask-image:linear-gradient(to_bottom,black_calc(100%-48px),transparent)]")}
                style={fill ? undefined : { maxHeight: REPLY_HEIGHT }}
            >
                <Markdown content={text} className={cn("text-14", CARD_PROSE)} />
            </div>
            {cut && (
                <button type="button" onClick={onMore} className="shrink-0 -mx-1.5 px-1.5 h-6 rounded-control text-13 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
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
    const inputs = useInputs(card.id)
    const { showBerry } = useShell().settings
    // For each row runs on one input, the first with rows, and the others go to every run whole.
    const driving = drivingInput(inputs)
    // How many rows were picked: the rows stay in main, which says when they've gone from the source.
    const picked = driving?.line.picked ?? null
    const staleInput = inputs.find((input) => input.line.picked !== null && !!input.line.crosses?.stale)
    const stale = !!staleInput
    const silent = inputs.find((input) => !input.answered)
    const rowCount = picked ?? driving?.rows ?? 0
    const canEach = !!driving
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
    const canSend = text.trim() !== '' && !sending && !silent && !stale && !tooMany
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

    const several = inputs.length > 1
    const getsOne = (input: InputView) =>
        input.line.picked
            ? `${plural(input.line.picked, 'row')} from ${input.name}`
            : input.source.table
              ? `every row of ${input.name}`
              : input.source.file
                ? input.name
                : input.source.each
                ? `${input.name}’s table`
                : `${input.name}’s thread`
    const gets =
        inputs.length === 0
            ? 'New card'
            : staleInput
              ? `${staleInput.name}’s rows have changed`
              : silent
                ? `${silent.name} hasn’t answered yet`
                : `gets ${listed(inputs.map(getsOne))}`
    // Exactly what crosses, as main counts it, input by input: what each run gets with For each row, its row from the
    // input that drives the runs and the others whole, or else what the card gets from each.
    const crosses = stale
        ? null
        : forEach
          ? [
                driving?.line.crosses?.each ? `${eachWords(driving.line.crosses.each)}${several ? ` from ${driving.name}` : ''}` : null,
                ...inputs.flatMap((input) => {
                    // Every run gets the other inputs whole, and every file any line brings.
                    const crossing = input.line.crosses
                    const words = crossing && lineWords({ whole: input === driving ? null : (crossing.shared ?? null), files: crossing.files }, input.name)
                    return words ? [`with ${words}`] : []
                })
            ]
                .filter(Boolean)
                .join(' · ') || null
          : inputs.flatMap((input) => {
                const words = input.line.crosses ? lineWords(input.line.crosses, input.name) : null
                return words ? [words] : []
            }).join(' · ') || null
    // Add an input: another card on the board, after the ones it has.
    const inputItems = board.inputCandidates(card.id).map((source) => ({
        label: `Add an input: ${nameOn(source, find(source.mascotId), showBerry)}`,
        icon: <GitMerge />,
        onSelect: async () => {
            const result = await window.chromeAPI.nests.addInput(card.id, source.id)
            if (!result.ok) setProblem(result.error)
        }
    }))

    return (
        <div className={cn(CARD_SHELL, "border-accent-ink shadow-raised")} style={{ width: CARD_WIDTH }}>
            <Perched cardId={card.id} mascot={mascot} mood="rest" />
            <LineEnds canPull={false} onPull={() => undefined} label="" />
            <div className="nest-drag cursor-grab h-12 pl-[76px] pr-3 flex items-center gap-2">
                <span className="text-14 font-semibold truncate">{name}</span>
                <span className="text-12 text-muted-foreground truncate" title={gets}>{gets}</span>
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
                    addItems={attaching.items && [...attaching.items, ...inputItems]}
                    addLabel={inputItems.length > 0 ? 'Add a file, a note or an input' : 'Add a file or note'}
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
                                        {tooMany
                                            ? `${rowCount} rows, ${MAX_RUNS} at most`
                                            : `${plural(rowCount, 'run')}${card.perRun ? `, ${estimateWords(card.perRun, rowCount)}` : ''}`}
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
const ForEachCard: React.FC<{ card: NestCard; each: NestForEach; box: CardBox }> = ({ card, each, box }) => {
    const board = useBoard()
    const { find } = useFlock()
    const mascot = find(card.mascotId)
    const name = useAssistantName(mascot)
    const inputs = useInputs(card.id)
    // The input it ran row by row on: main marks it when there are several.
    const driving = inputs.find((input) => input.line.crosses?.drives) ?? drivingInput(inputs) ?? inputs[0] ?? null
    const others = inputs.filter((input) => input !== driving)
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
    // Runs that didn't finish, failed or stopped, and runs a stop or a restart kept from starting.
    const unfinished = views.filter((view) => view.phase === 'failed' || view.phase === 'stopped').length
    const unstarted = views.filter((view) => view.phase === 'not-started').length
    const again = unfinished + unstarted > 0
    const shownRun = open && openRun ? views.find((view) => view.id === openRun && view.thread) : undefined
    const table = useMemo(() => combinedTable(each), [each])
    // The header too, so renaming the column lets a selection go rather than leaving one main would refuse.
    const key = useMemo(() => JSON.stringify(table), [table])
    const selected = useTablePick(card.id, key)
    const here = useWorkingRows(card.id, table)
    const from = driving
        ? driving.line.picked
            ? `For each of ${plural(driving.line.picked, 'row')} from ${driving.name}`
            : `For each row of ${driving.source.table ? driving.name : `${driving.name}’s table`}`
        : 'For each row'
    const openRunOf = (id: string) => {
        setOpenRun(id)
        board.setOpen(card.id, id)
    }

    return (
        <div className={cn(CARD_SHELL, cardShadow(running, open), box.fill && "flex flex-col")} style={boxStyle(box)}>
            <Perched cardId={card.id} mascot={mascot} mood={asking.length > 0 ? 'asking' : running ? 'thinking' : 'rest'} />
            <LineEnds canPull={answered} onPull={() => board.pullOut(card.id)} label={pullLabel(name, selected.length)} />
            <div className="nest-drag cursor-grab h-12 shrink-0 pl-[76px] pr-3 flex items-center gap-2">
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
            <p data-crosses className="shrink-0 px-5 -mt-1 mb-2 text-12 text-muted-foreground">
                {from} · {eachWords({ columns: each.header.length, cut: rowTooLong(each.header, each.runs.map((run) => run.row)) }).replace(/^O/, 'o')}
                {others.length > 0 && ` · with ${listed(others.map((input) => `${input.name}’s answer`))}`}
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
                        note={`Gets its row${driving ? ` from ${driving.name}` : ''}${others.length > 0 ? ` and ${listed(others.map((input) => `${input.name}’s answer`))}` : ''} again when you send`}
                    />
                </div>
            ) : (
                <div className={cn("nodrag select-text cursor-auto flex flex-col", box.fill && "flex-1 min-h-0")}>
                    <div className={cn("px-5 pb-3 flex flex-col gap-3", box.fill ? "nowheel min-h-0 overflow-y-auto" : "shrink-0")}>
                        <p className="shrink-0 text-13 text-muted-foreground line-clamp-2 whitespace-pre-wrap">{each.prompt}</p>
                        {asking.map((view) => (
                            <div key={view.id} className="flex flex-col gap-1">
                                <p className="text-12 text-muted-foreground">{view.name}</p>
                                <ChatApprovalCard chatId={view.thread!.id} approval={view.thread!.approval!} mascot={mascot} />
                            </div>
                        ))}
                    </div>
                    <div
                        className={cn(
                            "overflow-hidden",
                            box.fill && "flex-1 min-h-[100px] flex flex-col",
                            !(!active && ((answered && board.waitingOn(card.id).length > 0) || again)) && "rounded-b-panel"
                        )}
                    >
                        <TableResult
                            table={table}
                            selected={active ? null : selected}
                            onPick={(index, mode) => board.pick(card.id, key, table, index, mode)}
                            here={here}
                            every={open}
                            fill={box.fill}
                            wrap={wide(box)}
                            own={{
                                header: <ColumnName cardId={card.id} name={each.column} naming={!!each.naming} />,
                                cell: (index) => <RunCell view={views[index]} onOpen={() => openRunOf(views[index].id)} />
                            }}
                        />
                    </div>
                </div>
            )}
            {!active && again && <GoAgain cardId={card.id} unfinished={unfinished} unstarted={unstarted} perRun={card.perRun ?? null} />}
            {!active && answered && <LooksRight cardId={card.id} />}
            {!open && <ResizeCorner cardId={card.id} />}
        </div>
    )
}

// Under a For-each card once nothing on it goes, when some runs didn't finish or didn't start: the presses that run only
// those rows again. If any of them did something the user allowed, main asks first, and the strip says why.
const GoAgain: React.FC<{ cardId: string; unfinished: number; unstarted: number; perRun: NestCard['perRun'] }> = ({ cardId, unfinished, unstarted, perRun }) => {
    const [warning, setWarning] = useState<{ which: 'unfinished' | 'unstarted'; text: string } | null>(null)
    const [problem, setProblem] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const go = async (which: 'unfinished' | 'unstarted', confirmed: boolean) => {
        setBusy(true)
        setProblem(null)
        const result = await window.chromeAPI.nests.retryRuns(cardId, which, confirmed)
        setBusy(false)
        if (result.ok) setWarning(null)
        else if ('warn' in result) setWarning({ which, text: result.warn })
        else setProblem(result.error)
    }
    return (
        <div className="nodrag cursor-auto shrink-0 px-5 py-3 border-t flex flex-col gap-2">
            {warning ? (
                <>
                    <p role="alert" className="text-13 text-destructive">{warning.text}</p>
                    <div className="flex items-center gap-2">
                        <Button size="sm" disabled={busy} onClick={() => void go(warning.which, true)}>
                            {warning.which === 'unfinished' ? 'Retry anyway' : 'Start anyway'}
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setWarning(null)}>
                            Cancel
                        </Button>
                    </div>
                </>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    {unfinished > 0 && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void go('unfinished', false)}>
                            Retry {unfinished} that didn’t finish
                        </Button>
                    )}
                    {unstarted > 0 && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void go('unstarted', false)}>
                            Start {unstarted} that didn’t start
                        </Button>
                    )}
                    {perRun && (
                        <span className="text-12 text-muted-foreground tabular-nums">
                            {estimateWords(perRun, unfinished + unstarted)} for all of them
                        </span>
                    )}
                </div>
            )}
            {problem && <p role="alert" className="text-12 text-destructive">{problem}</p>}
        </div>
    )
}

// A table from a file the user added: its rows, owned by the user, with no chat and no bird. Its rows can be picked and a
// line pulled out of them, and For each row works on it like any table.
const TableCard: React.FC<{ card: NestCard; file: NestTableFile; box: CardBox }> = ({ card, file, box }) => {
    const board = useBoard()
    // A board carries only the first rows, each cell cut. The whole table is asked of main once, when "N more" opens it,
    // or when a row is first pressed while one of the first rows was cut, so what's picked is what main has.
    const [rows, setRows] = useState<string[][] | null>(null)
    // One ask for every press made while it's on its way, so they land in the order they were made.
    const loading = useRef<Promise<string[][] | null> | null>(null)
    const loadRows = (): Promise<string[][] | null> => {
        if (rows) return Promise.resolve(rows)
        loading.current ??= window.chromeAPI.nests.tableRows(card.id).then((loaded) => {
            if (loaded) setRows(loaded)
            else loading.current = null
            return loaded
        })
        return loading.current
    }
    const table = useMemo(() => ({ header: file.header, rows: rows ?? file.rows }), [file, rows])
    const selected = useTablePick(card.id, 'file')
    const whole = rows !== null || file.rows.every((row) => row.every((cell) => cell.length < PREVIEW_CELL_LENGTH))
    const pick = async (index: number, mode: PickMode) => {
        const loaded = whole && !loading.current ? null : await loadRows()
        board.pick(card.id, 'file', loaded ? { header: file.header, rows: loaded } : table, index, mode)
    }
    const here = useWorkingRows(card.id, table, rows === null && file.count > file.rows.length)
    const label = selected.length > 0 ? pullLabel('', selected.length) : `Pull a new card out of ${file.name}`
    return (
        <div className={cn(CARD_SHELL, "shadow-selected", box.fill && "flex flex-col")} style={boxStyle(box)}>
            <LineEnds canPull onPull={() => board.pullOut(card.id)} label={label} />
            <div className="nest-drag cursor-grab h-12 shrink-0 pl-5 pr-3 flex items-center gap-2">
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
            <div className={cn("nodrag cursor-auto overflow-hidden", box.fill && "flex-1 min-h-0 flex flex-col", board.waitingOn(card.id).length === 0 && "rounded-b-panel")}>
                <TableResult
                    table={table}
                    total={file.count}
                    onMore={() => void loadRows()}
                    selected={selected}
                    onPick={(index, mode) => void pick(index, mode)}
                    here={here}
                    fill={box.fill}
                    wrap={wide(box)}
                />
            </div>
            <LooksRight cardId={card.id} />
            <ResizeCorner cardId={card.id} />
        </div>
    )
}

// What a file's card says it is, beside its name.
const FILE_KINDS: Record<string, string> = {
    'application/pdf': 'PDF',
    'image/png': 'PNG image',
    'image/jpeg': 'JPEG image',
    'image/webp': 'WebP image',
    'image/gif': 'GIF image',
    'text/plain': 'Text',
    'text/markdown': 'Markdown',
    'text/csv': 'CSV',
    'application/json': 'JSON'
}

// What a file's card shows of its file, read from main once while it's drawn and wanted, since a file never changes.
const useFileContent = (cardId: string, wanted: boolean): NestFileContent | null => {
    const { samples } = useBoard()
    const [content, setContent] = useState<NestFileContent | null>(null)
    useEffect(() => {
        if (!wanted || content || samples) return undefined
        let live = true
        void window.chromeAPI.nests.fileContent(cardId).then((read) => {
            if (live) setContent(read)
        })
        return () => {
            live = false
        }
    }, [cardId, wanted, content, samples])
    return content
}

// A file opened on its card, drawn here and nowhere else: Markdown with the chat's renderer as a stranger's, so nothing in
// it loads or links anywhere, a CSV as its rows, text and JSON as they are, an image as itself.
const FileWhole: React.FC<{ file: NestFile; content: NestFileContent | null }> = ({ file, content }) => {
    if (!content) return <p role="status" className="text-13"><span className={SHIMMER_QUIET}>Opening</span></p>
    if (content.image) return <img src={content.image} alt={file.name} draggable={false} className="block max-w-full rounded-control" />
    if (content.table) {
        return (
            <div className="overflow-hidden rounded-b-panel">
                <TableResult table={content.table} selected={null} onPick={() => undefined} every />
            </div>
        )
    }
    if (content.text === undefined) return null
    if (file.type === 'text/markdown') {
        return (
            <div className="nowheel max-h-[520px] overflow-y-auto">
                <Markdown content={content.text} fromStranger className={cn("text-14", CARD_PROSE)} />
            </div>
        )
    }
    return <pre className="nowheel max-h-[520px] overflow-auto text-13 font-mono whitespace-pre-wrap break-words">{content.text}</pre>
}

// A file on a card of its own: one the user dropped on the board, or one a card's bird made, joined to that card by a
// line. No bird stands on it. It shows its name, what it is and a little of it, opens in place, downloads where the user
// chooses, and a line pulled out of it gives it to the next card as a file.
const FileCard: React.FC<{ card: NestCard; file: NestFile }> = ({ card, file }) => {
    const board = useBoard()
    const open = board.openId === card.id
    const image = file.type.startsWith('image/')
    const pdf = file.type === 'application/pdf'
    const content = useFileContent(card.id, image || open)
    const Icon = image ? Image : FileText
    const details = [FILE_KINDS[file.type] ?? 'File', pdf && file.pages ? plural(file.pages, 'page') : null, formatBytes(file.size)].filter(Boolean).join(' · ')
    return (
        <div className={cn(CARD_SHELL, open ? "shadow-raised" : "shadow-selected")} style={{ width: CARD_WIDTH }}>
            <LineEnds canPull onPull={() => board.pullOut(card.id)} label={`Pull a new card out of ${file.name}`} />
            <div className="nest-drag cursor-grab h-12 pl-5 pr-3 flex items-center gap-2">
                <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-14 font-semibold truncate" title={file.name}>{file.name}</span>
                <span className="text-12 text-muted-foreground shrink-0">{details}</span>
                <span className="ml-auto flex items-center">
                    <CardButton label={`Download ${file.name}`} onClick={() => void window.chromeAPI.nests.saveFile(card.id)}>
                        <Download className="size-4" />
                    </CardButton>
                    <span data-keep-selection>
                        <CardButton label="Continue in a new card" onClick={() => board.pullOut(card.id)}>
                            <GitFork className="size-4" />
                        </CardButton>
                    </span>
                    {!pdf && (
                        <CardButton label={open ? 'Close the file' : 'Open the file'} onClick={() => board.setOpen(open ? null : card.id)}>
                            {open ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                        </CardButton>
                    )}
                    <CardButton label="Delete card" onClick={() => board.remove(card.id)}>
                        <X className="size-4" />
                    </CardButton>
                </span>
            </div>
            <div className={cn("nodrag cursor-auto select-text", open && content?.table ? "" : "px-5 pb-4", open && !content?.table && "pt-3 border-t")}>
                {open ? (
                    <FileWhole file={file} content={content} />
                ) : image ? (
                    content?.image ? (
                        <img src={content.image} alt={file.name} draggable={false} className="block max-h-48 max-w-full rounded-control" />
                    ) : (
                        <div aria-hidden className="h-24 rounded-control bg-muted" />
                    )
                ) : pdf ? (
                    <p className="text-13 text-muted-foreground">A card you connect it to reads the whole PDF.</p>
                ) : (
                    file.preview && (
                        <pre data-file-preview className="text-12 leading-5 font-mono text-muted-foreground whitespace-pre-wrap break-words line-clamp-6">{file.preview}</pre>
                    )
                )}
            </div>
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
    const inputs = useInputs(card.id)
    const names = listed(inputs.map((input) => input.name))
    const editable = plan.state === 'planned'
    // While Berry changes the plan, which replaces this card from what it was when Berry started, nothing on it changes.
    const waiting = editable && board.replanning
    // For each row needs a table to run on: one the card it reads from will answer with, or one already in its answer.
    const getsTable = inputs.some(({ source, rows }) => (source.table || source.each ? true : source.plan ? source.plan.each || source.plan.table !== null : rows > 0))
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
    const waitsForYou = plan.state === 'armed' && plan.waits && inputs.length > 0 && inputs.every((input) => input.answered && !input.running)
    const status = waiting ? 'Can’t change while Berry changes the plan' : editable ? `Planned${plan.each ? ' · for each row' : ''}` : waitsForYou ? 'Waits for you' : inputs.length > 0 ? `Waiting for ${names}` : 'Starting'
    // For each row goes row by row on the first with a table coming, and the rest go to every run.
    const tableInput = inputs.find(({ source, rows }) => source.table || source.each || source.plan?.each || source.plan?.table || rows > 0) ?? inputs[0]
    const rest = inputs.filter((input) => input !== tableInput)
    const gets =
        inputs.length === 0
            ? null
            : plan.each
              ? `For each row of ${tableInput.name}’s table${rest.length > 0 ? `, with ${listed(rest.map((input) => `${input.name}’s answer`))}` : ''}`
              : `Gets ${listed(inputs.map((input) => `${input.name}’s answer`))}`
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
            {(details.length > 0 || (plan.waits && inputs.length > 0)) && (
                <div className="px-5 py-3 border-t flex flex-col gap-1 text-13 text-muted-foreground">
                    {details.map((line) => <p key={line}>{line}</p>)}
                    {plan.waits && inputs.length > 0 && (
                        <p className="text-accent-ink">Starts when you say {listed(inputs.map((input) => `${input.name}’s answer`))} {inputs.length > 1 ? 'are' : 'is'} right</p>
                    )}
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

// A card made a size of its own has it on its node, as React Flow's corner sets it while it's dragged. React Flow's own
// width and height props fall back to the measured size, so they can't tell.
export const CardView: React.FC<NodeProps<CardNode>> = ({ id, data: { card } }) => {
    const width = useStore((state) => state.nodeLookup.get(id)?.internals.userNode.width)
    const height = useStore((state) => state.nodeLookup.get(id)?.internals.userNode.height)
    const box: CardBox = { width: width ?? CARD_WIDTH, fill: height != null }
    return card.file ? (
        <FileCard card={card} file={card.file} />
    ) : card.table ? (
        <TableCard card={card} file={card.table} box={box} />
    ) : card.each ? (
        <ForEachCard card={card} each={card.each} box={box} />
    ) : card.chatId ? (
        <SentCard card={card} box={box} />
    ) : card.plan && card.plan.state !== 'held' ? (
        <PlannedCard card={card} plan={card.plan} />
    ) : (
        <DraftCard card={card} />
    )
}

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
