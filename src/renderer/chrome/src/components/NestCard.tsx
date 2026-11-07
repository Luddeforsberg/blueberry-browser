import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BaseEdge, getBezierPath, Handle, Position, type ConnectionLineComponentProps, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { ArrowLeft, GitFork, Maximize2, Minimize2, X } from 'lucide-react'
import type { ChatThread, MascotProfile, NestCard, NestForEach, NestLine, NestPlanned } from '@shared/library'
import { findTable, MAX_RUNS, missingRows, plainCell, rowName, STALE_ROWS, type Table } from '@shared/nestTable'
import type { Mood } from '@common/components/Mascot'
import { Button } from '@common/components/Button'
import { Switch } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { useChatThread, useChatThreads } from '../contexts/ChatContext'
import { useFlock } from '../contexts/LibraryContext'
import { cardStatus, CARD_WIDTH, forEachStatus, latestReply, runPhase, type RunPhase } from '../nestBoard'
import { Berry, useAssistantName } from './Berry'
import { AssistantMessage, ChatApprovalCard, ChatError, Markdown, SHIMMER_TEXT, StatusLine, UserMessage } from './ChatMessage'
import { AddMenu, ChatComposer, Composer } from './Composer'
import { Attachments, useAttaching } from './NestAttachments'
import { MascotChip, MascotPerch } from './MascotPerch'
import { MemoryOffers } from './MemoryInChat'
import { TableResult, type PickMode } from './NestTable'

export type CardNode = Node<{ card: NestCard }, 'card'>
export type LineEdge = Edge<{ draft: boolean }, 'line'>

// Rows selected in one card's table, for the answer they were picked from.
export interface RowSelection {
    cardId: string
    text: string
    table: Table
    rows: number[]
    anchor: number | null
}

// What a card can ask of the board it's on.
export interface NestBoardActions {
    openId: string | null
    setOpen: (cardId: string | null) => void
    // The draft that was just made, whose prompt takes the keyboard.
    focusId: string | null
    sourceOf: (cardId: string) => NestCard | null
    lineInto: (cardId: string) => NestLine | null
    pullOut: (cardId: string) => void
    remove: (cardId: string) => void
    selection: RowSelection | null
    clearSelection: () => void
    pick: (cardId: string, text: string, table: Table, index: number, mode: PickMode) => void
    // The cards of a run plan that wait for the user to say this card's answer is right.
    waitingOn: (cardId: string) => NestCard[]
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
// Whether a draft's For each row is on, once the user has touched it. Memory only, like its text.
const draftEach = new Map<string, boolean>()

// The newest saved answer, not one still being written.
const savedAnswer = (thread: ChatThread | null | undefined) => (thread ? latestReply({ ...thread, partial: null }) : null)

// The first line of an answer with words in it, for a run's one-line result.
const answerStart = (text: string) => plainCell(text.split('\n').find((line) => line.replace(/[#>*\-|\s]/g, '') !== '')?.replace(/^\s*(#+|>|[-*]|\d+\.)\s*/, '') ?? '')

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

const CARD_SHELL = "group/card relative rounded-panel border bg-surface text-foreground"

// A card that has been sent: one bird's chat. Closed, it shows what was asked and the latest answer, or its table, whose
// rows can be selected. Open, the whole chat and a reply field that carries the thread on.
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
    const answered = !!savedAnswer(thread)
    const table = useMemo(() => (reply ? findTable(reply, { streaming: running }) : null), [reply, running])
    // A selection is for the answer it was made in, so a new one lets it go.
    const selectedHere = board.selection?.cardId === card.id
    const selected = selectedHere && board.selection?.text === reply ? board.selection.rows : []
    const { clearSelection } = board
    useEffect(() => {
        if (selectedHere && board.selection?.text !== reply) clearSelection()
    }, [selectedHere, board.selection?.text, reply, clearSelection])

    return (
        <div className={cn(CARD_SHELL, running ? "shadow-reading border-transparent" : "shadow-selected")} style={{ width: CARD_WIDTH }}>
            <Perched mascot={mascot} mood={moodOf(thread)} />
            <LineEnds canPull={answered} onPull={() => board.pullOut(card.id)} label={pullLabel(name, selected.length)} />
            <div className="nest-drag cursor-grab h-12 pl-[76px] pr-3 flex items-center gap-2">
                <span className="text-14 font-semibold truncate">{name}</span>
                {status && <span role="status" className={cn("text-12 shrink-0", TONES[status.tone])}>{status.text}</span>}
                <span className="ml-auto flex items-center">
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
            {source && <p className="px-5 -mt-1 mb-2 text-12 text-muted-foreground">{withWhat(board.lineInto(card.id), sourceName)}</p>}
            <Attachments attachments={card.attachments} target={null} className="px-5 -mt-1 mb-2" />
            {thread &&
                (open ? (
                    <WholeChat
                        thread={thread}
                        mascot={mascot}
                        onSend={(text) => void window.chromeAPI.nests.send(card.id, text)}
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
const getsWhat = (line: NestLine | null, sourceName: string) =>
    line?.picked ? `${plural(line.picked.rows.length, 'row')} from ${sourceName}` : `${sourceName}’s latest answer`

const withWhat = (line: NestLine | null, sourceName: string) =>
    line?.picked ? `With ${plural(line.picked.rows.length, 'row')} from ${sourceName}` : `With ${sourceName}’s latest answer`

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

// The card opened: its whole chat, as the chat page draws it, and a field to reply in. `note` says what goes with a reply.
const WholeChat: React.FC<{ thread: ChatThread; mascot: MascotProfile; onSend: (text: string) => void; note: string | null; bordered?: boolean }> = ({
    thread,
    mascot,
    onSend,
    note,
    bordered = true
}) => {
    const name = useAssistantName(mascot)
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
                    onSend={onSend}
                    disabled={running}
                    onStop={running ? () => void window.chromeAPI.chat.stop(thread.id) : undefined}
                    placeholder={`Reply to ${name}`}
                    attachment={note && <p className="px-2 text-12 text-muted-foreground">{note}</p>}
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
    const picked = board.lineInto(card.id)?.picked ?? null
    const sourceMascot = source ? find(source.mascotId) : undefined
    const sourceName = useAssistantName(sourceMascot)
    const sourceThread = useChatThread(source?.chatId ?? null)
    const runThreads = useChatThreads(source?.each?.runs.flatMap((run) => (run.chatId ? [run.chatId] : [])) ?? [])
    const runAnswers = Object.values(runThreads).filter((thread) => savedAnswer(thread)).length
    const sourceAnswer = savedAnswer(sourceThread)
    const sourceTable = useMemo(() => (sourceAnswer ? findTable(sourceAnswer) : null), [sourceAnswer])
    const sourceAnswered = source?.each ? runAnswers > 0 : !!sourceAnswer
    const stale = !!picked && !!sourceThread && missingRows(picked, sourceTable).length > 0
    const rowCount = picked ? picked.rows.length : (sourceTable?.rows.length ?? 0)
    const canEach = !!source && !source.each && (picked !== null || sourceTable !== null)
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
        const result = forEach ? await api.sendEach(card.id, text.trim()) : { ok: (await api.send(card.id, text.trim())) !== null, error: null }
        setSending(false)
        if (result.ok) {
            setDraftText(card.id, '')
            draftEach.delete(card.id)
        } else if (result.error) setProblem(result.error)
    }

    const gets = !source
        ? 'New card'
        : picked
          ? stale
              ? `${sourceName}’s rows have changed`
              : `gets ${plural(picked.rows.length, 'row')} from ${sourceName}`
          : source.each
            ? sourceAnswered
                ? `gets ${sourceName}’s ${plural(runAnswers, 'answer')}`
                : `${sourceName} hasn’t answered yet`
            : sourceAnswered
              ? `gets ${sourceName}’s latest answer`
              : `${sourceName} hasn’t answered yet`

    return (
        <div className={cn(CARD_SHELL, "border-accent-ink shadow-raised")} style={{ width: CARD_WIDTH }}>
            <Perched mascot={mascot} mood="rest" />
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
}

const RUN_WORDS: Record<RunPhase, string> = {
    waiting: 'Waiting its turn',
    working: 'Working',
    done: '',
    failed: 'Didn’t finish',
    stopped: 'Stopped',
    'not-started': 'Didn’t start'
}

// How many finished runs a closed card lists before "N more".
const RUNS_SHOWN = 5

// One run on a For-each card: its row's name, then the start of its answer, or where it is. Pressing it opens its thread.
const RunRow: React.FC<{ view: RunView; onOpen: () => void }> = ({ view, onOpen }) => {
    const answer = savedAnswer(view.thread)
    const step = view.thread?.steps.findLast((each) => !each.done)
    const line = view.phase === 'done' && answer ? answerStart(answer) : view.phase === 'working' && step ? (step.shown ?? step.text) : RUN_WORDS[view.phase]
    return (
        <button
            type="button"
            onClick={onOpen}
            disabled={!view.thread}
            className="w-full px-5 py-2 border-t flex flex-col text-left outline-none transition-colors enabled:hover:bg-muted/60 focus-visible:bg-muted disabled:cursor-default"
        >
            <span className="text-13 font-semibold truncate w-full">{view.name}</span>
            <span className={cn("text-13 truncate w-full", view.phase === 'failed' ? "text-destructive" : "text-muted-foreground")}>{line}</span>
        </button>
    )
}

// A card sent with For each row: the same prompt once for each row, each run its own chat. Closed, it shows how many
// have ended, which rows are being worked on, any approval a run is waiting on, and each finished run's result. There's
// no reply field on the card: a reply goes in one run's thread, which opening the run shows.
const ForEachCard: React.FC<{ card: NestCard; each: NestForEach }> = ({ card, each }) => {
    const board = useBoard()
    const { find } = useFlock()
    const mascot = find(card.mascotId)
    const name = useAssistantName(mascot)
    const source = board.sourceOf(card.id)
    const line = board.lineInto(card.id)
    const sourceName = useAssistantName(source ? find(source.mascotId) : undefined)
    const threads = useChatThreads(each.runs.flatMap((run) => (run.chatId ? [run.chatId] : [])))
    const [openRun, setOpenRun] = useState<string | null>(null)
    const open = board.openId === card.id
    // Closing the card goes back to every run for next time.
    useEffect(() => {
        if (!open) setOpenRun(null)
    }, [open])

    const views: RunView[] = each.runs.map((run) => {
        const thread = run.chatId ? threads[run.chatId] : undefined
        return { id: run.id, name: rowName(run.row), phase: runPhase(run, thread), thread }
    })
    const status = forEachStatus(views.map((view) => view.phase))
    const active = views.some((view) => view.phase === 'waiting' || view.phase === 'working')
    const asking = views.filter((view) => view.thread?.approval)
    const working = views.filter((view) => view.phase === 'working' && !view.thread?.approval)
    const ended = views.filter((view) => view.thread && (view.phase === 'done' || view.phase === 'failed' || view.phase === 'stopped'))
    const answered = views.some((view) => savedAnswer(view.thread))
    const running = working.length + asking.length > 0
    const shownRun = open && openRun ? views.find((view) => view.id === openRun && view.thread) : undefined
    const from = source ? (line?.picked ? `For each of ${plural(line.picked.rows.length, 'row')} from ${sourceName}` : `For each row of ${sourceName}’s table`) : 'For each row'
    const openRunOf = (id: string) => {
        setOpenRun(id)
        board.setOpen(card.id)
    }

    return (
        <div className={cn(CARD_SHELL, running ? "shadow-reading border-transparent" : "shadow-selected")} style={{ width: CARD_WIDTH }}>
            <Perched mascot={mascot} mood={asking.length > 0 ? 'asking' : running ? 'thinking' : 'rest'} />
            <LineEnds canPull={answered} onPull={() => board.pullOut(card.id)} label={pullLabel(name, 0)} />
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
                    {answered && (
                        <CardButton label="Continue in a new card" onClick={() => board.pullOut(card.id)}>
                            <GitFork className="size-4" />
                        </CardButton>
                    )}
                    <CardButton label={open ? 'Close the runs' : 'Open every run'} onClick={() => board.setOpen(open ? null : card.id)}>
                        {open ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                    </CardButton>
                    <CardButton label="Delete card" onClick={() => board.remove(card.id)}>
                        <X className="size-4" />
                    </CardButton>
                </span>
            </div>
            <p className="px-5 -mt-1 mb-2 text-12 text-muted-foreground">{from}</p>
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
                        onSend={(text) => void window.chromeAPI.nests.sendRun(shownRun.id, text)}
                        note={`Gets its row${source ? ` from ${sourceName}` : ''} again when you send`}
                    />
                </div>
            ) : (
                <div className="nodrag select-text cursor-auto flex flex-col">
                    <div className="px-5 pb-3 flex flex-col gap-3">
                        <p className="text-13 text-muted-foreground line-clamp-2 whitespace-pre-wrap">{each.prompt}</p>
                        {!open &&
                            working.map((view) => (
                                <p key={view.id} role="status" className="text-14 line-clamp-1">
                                    <span className="font-semibold">{view.name}</span>{' '}
                                    <span className={SHIMMER_TEXT}>{view.thread?.statusLine ?? view.thread?.steps.findLast((step) => !step.done)?.text ?? 'Working'}</span>
                                </p>
                            ))}
                        {!open &&
                            asking.map((view) => (
                                <div key={view.id} className="flex flex-col gap-1">
                                    <p className="text-12 text-muted-foreground">{view.name}</p>
                                    <ChatApprovalCard chatId={view.thread!.id} approval={view.thread!.approval!} mascot={mascot} />
                                </div>
                            ))}
                    </div>
                    <div className={cn("rounded-b-panel overflow-hidden", open && "nowheel max-h-[520px] overflow-y-auto")}>
                        {(open ? views : ended.slice(0, RUNS_SHOWN)).map((view) => (
                            <RunRow key={view.id} view={view} onOpen={() => openRunOf(view.id)} />
                        ))}
                        {!open && views.length > Math.min(ended.length, RUNS_SHOWN) && (
                            <button
                                type="button"
                                onClick={() => board.setOpen(card.id)}
                                className="w-full h-9 px-5 border-t text-left text-13 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:bg-muted"
                            >
                                {ended.length > RUNS_SHOWN ? `${ended.length - RUNS_SHOWN} more` : 'Every run'}
                            </button>
                        )}
                    </div>
                </div>
            )}
            {!active && answered && <LooksRight cardId={card.id} />}
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
    const sourceName = useAssistantName(source ? find(source.mascotId) : undefined)
    const sourceThread = useChatThread(source?.chatId ?? null)
    const sourceAnswer = savedAnswer(sourceThread)
    const editable = plan.state === 'planned'
    // For each row needs a table to run on: one the card it reads from will answer with, or one already in its answer.
    const getsTable = !!source && !source.each && (source.plan ? !source.plan.each && source.plan.table !== null : !!sourceAnswer && findTable(sourceAnswer) !== null)
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
    const status = editable ? `Planned${plan.each ? ' · for each row' : ''}` : waitsForYou ? 'Waits for you' : source ? `Waiting for ${sourceName}` : 'Starting'
    const gets = source ? (plan.each ? `For each row of ${sourceName}’s table` : `Gets ${sourceName}’s answer`) : null
    const details = [mascot.sites.length > 0 ? `Only goes to ${mascot.sites.join(', ')}` : null, plan.table ? `A table of ${plan.table} lands here` : null].filter(
        (line): line is string => line !== null
    )

    return (
        <div className={cn(CARD_SHELL, "border-dashed border-accent-ink/50")} style={{ width: CARD_WIDTH }}>
            <Perched mascot={mascot} mood="rest" />
            <LineEnds canPull={editable} onPull={() => board.pullOut(card.id)} label={`Pull a new card out of ${name}’s`} />
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
                    {choosing && (
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
                        <MascotChip mascot={mascot} open={choosing} onPress={() => setChoosing(!choosing)} />
                        {attaching.items && <AddMenu items={attaching.items} label="Add a file or note" small />}
                        {getsTable && (
                            <span className="flex items-center gap-2">
                                <Switch checked={plan.each} labelledBy={switchId} onChange={(on) => void api.editPlan(card.id, { each: on })} />
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
const PlanPrompt: React.FC<{ label: string; value: string; onChange: (value: string) => void; onFocus: () => void; onBlur: () => void }> = ({
    label,
    value,
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
            rows={1}
            onChange={(event) => onChange(event.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            className="nowheel block w-[calc(100%+12px)] -mx-1.5 px-1.5 py-1 resize-none overflow-hidden rounded-control bg-transparent text-13 outline-none transition-colors hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground"
        />
    )
}

export const CardView: React.FC<NodeProps<CardNode>> = ({ data: { card } }) =>
    card.each ? (
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
