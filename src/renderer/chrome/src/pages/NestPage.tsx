import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    applyNodeChanges,
    Background,
    BackgroundVariant,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type FinalConnectionState,
    type NodeChange
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import type { TabInfo } from '@shared/ipc'
import type { NestBoard, NestRequest } from '@shared/library'
import { BERRY_ID } from '@shared/mascots'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { ChevronRight } from 'lucide-react'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { useAssistantName } from '../components/Berry'
import { SHIMMER_TEXT, UserMessage } from '../components/ChatMessage'
import { Composer } from '../components/Composer'
import { Attachments, useAttaching } from '../components/NestAttachments'
import type { PickedRows } from '@shared/nestTable'
import { CardView, draftText, LineView, NestBoardContext, PullingLine, setDraftText, type CardNode, type LineEdge, type NestBoardActions, type RowSelection } from '../components/NestCard'
import { besideSpot, CARD_HEIGHT, CARD_WIDTH, pickRows, workingLine, type Rect } from '../nestBoard'

const NODE_TYPES = { card: CardView }
const EDGE_TYPES = { line: LineView }
// Room above a card for its bird, and from the board's edge.
const EDGE_INSET = { x: 64, y: 88 }
// Where a pulled line meets a new card, so the card's top sits a little above the pointer.
const DROP_ABOVE = 60
const DOTS = { gap: 20, size: 1.2 }

const rectOf = (node: CardNode): Rect => ({ ...node.position, width: node.measured?.width ?? CARD_WIDTH, height: node.measured?.height ?? CARD_HEIGHT })

const toNodes = (board: NestBoard, openId: string | null, previous: CardNode[]): CardNode[] =>
    board.cards.map((card) => {
        const before = previous.find((node) => node.id === card.id)
        return {
            ...before,
            id: card.id,
            type: 'card',
            position: { x: card.x, y: card.y },
            dragHandle: '.nest-drag',
            // The open card stays over the others, since it's the one being read.
            zIndex: card.id === openId ? 10 : 0,
            data: { card }
        }
    })

// The selected rows, in the table's order, as a line out of their card takes them.
const pickedOf = (selection: RowSelection | null, cardId: string): PickedRows | undefined =>
    selection?.cardId === cardId && selection.rows.length > 0
        ? { header: selection.table.header, rows: selection.rows.map((index) => selection.table.rows[index]) }
        : undefined

const toEdges = (board: NestBoard): LineEdge[] =>
    board.lines.map((line) => ({
        id: line.id,
        source: line.from,
        target: line.to,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'line',
        focusable: false,
        data: { draft: !board.cards.some((card) => card.id === line.to && (card.chatId || card.each)) }
    }))

// The Nest's name, which reads as a title until it's pressed, and then renames it.
const TitleField: React.FC<{ nestId: string; title: string }> = ({ nestId, title }) => {
    const [value, setValue] = useState(title)
    useEffect(() => setValue(title), [title])
    const save = () => {
        if (value.trim() && value.trim() !== title) void window.chromeAPI.nests.rename(nestId, value)
        else setValue(title)
    }
    return (
        <input
            aria-label="Nest name"
            value={value}
            maxLength={100}
            onChange={(event) => setValue(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                    setValue(title)
                    requestAnimationFrame(() => (event.target as HTMLInputElement).blur())
                }
            }}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            className="min-w-24 max-w-[60%] h-9 -ml-2 px-2 rounded-control bg-transparent text-20 font-semibold outline-none transition-colors hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        />
    )
}

const Board: React.FC<{ board: NestBoard }> = ({ board }) => {
    const flow = useReactFlow<CardNode, LineEdge>()
    const { theme } = useShell()
    const { chosen, choose } = useFlock()
    const chosenName = useAssistantName(chosen)
    const berryName = useAssistantName()
    const [openId, setOpenId] = useState<string | null>(null)
    const [focusId, setFocusId] = useState<string | null>(null)
    const [selection, setSelection] = useState<RowSelection | null>(null)
    // Set when a press away from the rows cleared them, so the click that follows on the board doesn't also make a card.
    const clearedByPress = useRef(false)
    const [nodes, setNodes] = useState<CardNode[]>(() => toNodes(board, null, []))
    const edges = useMemo(() => toEdges(board), [board])
    const [prompt, setPrompt] = useState('')
    const wrapper = useRef<HTMLDivElement>(null)
    const pulling = useRef<string | null>(null)
    const api = window.chromeAPI.nests

    useEffect(() => setNodes((previous) => toNodes(board, openId, previous)), [board, openId])

    // Opens where the cards are, with room above the first for its bird.
    const placed = useRef(false)
    useEffect(() => {
        if (placed.current || board.cards.length === 0) return
        placed.current = true
        const left = Math.min(...board.cards.map((card) => card.x))
        const top = Math.min(...board.cards.map((card) => card.y))
        void flow.setViewport({ x: EDGE_INSET.x - left, y: EDGE_INSET.y - top, zoom: 1 })
    }, [board.cards, flow])

    const rects = useCallback((): Rect[] => flow.getNodes().map(rectOf), [flow])

    // Moves the board just enough to show a card that's landed out of sight.
    const reveal = useCallback(
        ({ x, y }: { x: number; y: number }) => {
            const box = wrapper.current?.getBoundingClientRect()
            if (!box) return
            const { x: panX, y: panY } = flow.getViewport()
            const left = x + panX
            const top = y + panY
            const dx = left + CARD_WIDTH + 32 > box.width ? box.width - (left + CARD_WIDTH + 32) : left < 32 ? 32 - left : 0
            const dy = top + CARD_HEIGHT > box.height - 96 ? box.height - 96 - (top + CARD_HEIGHT) : top < 64 ? 64 - top : 0
            if (dx || dy) void flow.setViewport({ x: panX + dx, y: panY + dy, zoom: 1 }, { duration: 240 })
        },
        [flow]
    )

    // Esc, or a press anywhere but the rows and what pulls a line out of them, lets the selection go.
    useEffect(() => {
        if (!selection) return undefined
        const clear = (event: Event) => {
            if (event instanceof KeyboardEvent) {
                if (event.key !== 'Escape') return
            } else {
                const target = event.target as Element | null
                if (target?.closest?.('[data-keep-selection]')) return
                if (target?.closest?.('.react-flow__pane')) clearedByPress.current = true
            }
            setSelection(null)
        }
        window.addEventListener('pointerdown', clear, true)
        window.addEventListener('keydown', clear)
        return () => {
            window.removeEventListener('pointerdown', clear, true)
            window.removeEventListener('keydown', clear)
        }
    }, [selection])

    const add = useCallback(
        async (spot: { x: number; y: number }, extra: { from?: string; mascotId?: string; picked?: PickedRows } = {}) => {
            const card = await api.addCard(board.id, { ...spot, ...extra })
            if (card) {
                setFocusId(card.id)
                reveal(card)
            }
            return card
        },
        [api, board.id, reveal]
    )

    // Empty drafts go when the user starts something else, so the board never fills with them. A plan's cards stay, and
    // so does a draft with a file or note on it.
    const dropEmptyDrafts = useCallback(() => {
        board.cards
            .filter((card) => !card.chatId && !card.each && !card.plan && !draftText(card.id).trim() && card.attachments.length === 0)
            .forEach((card) => void api.deleteCard(card.id))
    }, [api, board.cards])

    const actions = useMemo<NestBoardActions>(
        () => ({
            openId,
            setOpen: setOpenId,
            focusId,
            sourceOf: (cardId) => {
                const line = board.lines.find(({ to }) => to === cardId)
                return (line && board.cards.find((card) => card.id === line.from)) || null
            },
            lineInto: (cardId) => board.lines.find(({ to }) => to === cardId) ?? null,
            pullOut: (cardId) => {
                const source = flow.getNode(cardId)
                if (!source) return
                dropEmptyDrafts()
                const picked = pickedOf(selection, cardId)
                setSelection(null)
                void add(besideSpot(rectOf(source), rects()), { from: cardId, picked })
            },
            remove: (cardId) => {
                setDraftText(cardId, '')
                if (openId === cardId) setOpenId(null)
                void api.deleteCard(cardId)
            },
            selection,
            clearSelection: () => setSelection(null),
            pick: (cardId, text, table, index, mode) => {
                const same = selection?.cardId === cardId && selection.text === text
                const next = pickRows(same ? selection.rows : [], same ? selection.anchor : null, index, mode)
                setSelection(next.rows.length > 0 ? { cardId, text, table, ...next } : null)
            },
            waitingOn: (cardId) =>
                board.cards.filter((card) => card.plan?.state === 'armed' && card.plan.waits && board.lines.some((line) => line.from === cardId && line.to === card.id))
        }),
        [openId, focusId, board, rects, flow, add, api, dropEmptyDrafts, selection]
    )

    // A line pulled out to an empty spot leaves a new card there. A click on the handle never gets here: it's under the
    // drag threshold, so the handle's own click puts the card beside it instead.
    const connectEnd = useCallback(
        (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
            const from = pulling.current ?? state.fromNode?.id
            pulling.current = null
            if (!from || state.isValid) return
            const point = 'changedTouches' in event ? event.changedTouches[0] : event
            const at = flow.screenToFlowPosition({ x: point.clientX, y: point.clientY })
            dropEmptyDrafts()
            const picked = pickedOf(selection, from)
            setSelection(null)
            void add({ x: at.x, y: at.y - DROP_ABOVE }, { from, picked })
        },
        [flow, add, dropEmptyDrafts, selection]
    )

    const paneClick = useCallback(
        (event: React.MouseEvent) => {
            // A click away from an open card or selected rows only closes or clears them.
            if (clearedByPress.current) {
                clearedByPress.current = false
                return
            }
            if (openId) return setOpenId(null)
            const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
            dropEmptyDrafts()
            void add({ x: at.x - 32, y: at.y - 24 })
        },
        [openId, flow, add, dropEmptyDrafts]
    )

    // The composer at the bottom goes to Berry first, which starts one card in the first free place in sight, lays out a
    // plan from there, or asks. If it can't go, the words come back.
    const pending = board.cards.some((card) => card.plan?.state === 'planned')
    const open = board.talk.find((request) => request.open)
    const planning = board.planning ?? null
    const [problem, setProblem] = useState<string | null>(null)
    // What's attached here goes with the request: to its one card, or to the cards Berry's plan gives it to.
    const attaching = useAttaching(planning ? null : { nestId: board.id })
    const sendNew = async () => {
        const text = prompt.trim()
        const box = wrapper.current?.getBoundingClientRect()
        if (!text || !box || planning) return
        const at = flow.screenToFlowPosition({ x: box.left + EDGE_INSET.x, y: box.top + EDGE_INSET.y })
        setPrompt('')
        setProblem(null)
        dropEmptyDrafts()
        const result = await api.ask(board.id, text, { mascotId: chosen.id === BERRY_ID ? null : chosen.id, at, taken: rects() })
        if (!result.ok) {
            setPrompt(text)
            setProblem(result.error)
        }
        setFocusId(null)
    }

    return (
        <NestBoardContext.Provider value={actions}>
            <div ref={wrapper} className="relative flex-1 min-h-0">
                <ReactFlow<CardNode, LineEdge>
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={NODE_TYPES}
                    edgeTypes={EDGE_TYPES}
                    onNodesChange={(changes: NodeChange<CardNode>[]) => setNodes((current) => applyNodeChanges(changes, current))}
                    onNodeDragStop={(_, node) => void api.moveCard(node.id, node.position.x, node.position.y)}
                    onConnectStart={(_, { nodeId }) => (pulling.current = nodeId)}
                    onConnectEnd={connectEnd}
                    connectionLineComponent={PullingLine}
                    connectionDragThreshold={6}
                    connectOnClick={false}
                    onPaneClick={paneClick}
                    colorMode={theme.isDark ? 'dark' : 'light'}
                    defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                    minZoom={1}
                    maxZoom={1}
                    zoomOnScroll={false}
                    zoomOnPinch={false}
                    zoomOnDoubleClick={false}
                    panOnScroll
                    elementsSelectable={false}
                    deleteKeyCode={null}
                    selectionKeyCode={null}
                    multiSelectionKeyCode={null}
                    proOptions={{ hideAttribution: true }}
                    className="nest-board"
                >
                    <Background variant={BackgroundVariant.Dots} gap={DOTS.gap} size={DOTS.size} className="text-muted-foreground/40" color="currentColor" />
                </ReactFlow>
                {board.cards.length === 0 && !planning && board.talk.length === 0 && (
                    <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-14 text-muted-foreground">
                        Each card is one bird’s chat. Write below to start one, or click anywhere on the board.
                    </p>
                )}
                <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 w-[min(640px,calc(100%-32px))] flex flex-col gap-4 [&>*]:pointer-events-auto">
                    <Talk talk={board.talk} planning={planning} />
                    {problem && <p role="alert" className="px-3 text-13 text-destructive">{problem}</p>}
                    <Composer
                        label="Ask in this Nest"
                        placeholder={pending ? 'Change the plan, or press Run' : open ? `Reply to ${berryName}` : `Ask ${chosenName}, or ask for a plan`}
                        value={prompt}
                        onChange={setPrompt}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault()
                                void sendNew()
                            }
                        }}
                        addItems={attaching.items}
                        addLabel="Add a file or note"
                        menuUp
                        attachment={<Attachments attachments={board.attached} target={planning ? null : { nestId: board.id }} attaching={attaching} className="px-1 pb-1" />}
                        canSend={prompt.trim() !== '' && !planning}
                        onSend={() => void sendNew()}
                        mascot={chosen}
                        onChooseMascot={choose}
                    />
                </div>
            </div>
        </NestBoardContext.Provider>
    )
}

// What the user wrote in the composer and Berry's answers, over it. The request that's open shows whole, and the one before
// it folds to one line that opens. While Berry reads a message, it says Thinking under it.
const Talk: React.FC<{ talk: NestRequest[]; planning: string | null }> = ({ talk, planning }) => {
    const berryName = useAssistantName()
    const [unfolded, setUnfolded] = useState<string | null>(null)
    const folded = talk.filter((request) => !request.open)
    const open = talk.find((request) => request.open)
    if (talk.length === 0 && !planning) return null
    const messages = (request: NestRequest) =>
        request.messages.map((message, index) =>
            message.role === 'user' ? (
                <UserMessage key={index} content={message.text} />
            ) : (
                <p key={index} className="max-w-[85%] text-16 whitespace-pre-wrap">{message.text}</p>
            )
        )
    return (
        <div aria-label={`Talking with ${berryName}`} className="nowheel max-h-[40vh] overflow-y-auto flex flex-col gap-3">
            {folded.map((request) => {
                const shown = unfolded === request.id
                return (
                    <div key={request.id} className="flex flex-col gap-3">
                        <button
                            type="button"
                            aria-expanded={shown}
                            onClick={() => setUnfolded(shown ? null : request.id)}
                            className="self-start max-w-full h-7 -ml-1.5 px-1.5 rounded-control flex items-center gap-1 text-13 text-muted-foreground outline-none transition-colors hover:text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <ChevronRight className={cn("size-4 shrink-0 transition-transform", shown && "rotate-90")} />
                            <span className="truncate">{request.messages[0]?.text}</span>
                        </button>
                        {shown && messages(request)}
                    </div>
                )
            })}
            {open && messages(open)}
            {planning && (
                <>
                    <UserMessage content={planning} />
                    <p role="status" className="text-16"><span className={SHIMMER_TEXT}>Thinking</span></p>
                </>
            )}
        </div>
    )
}

// The top bar's end while a plan hasn't run: Discard plan, quiet, and Run, the one decision.
// Run waits while Berry is changing the plan, so the plan that runs is the one on the board.
const PlanControls: React.FC<{ nestId: string; planning: boolean }> = ({ nestId, planning }) => {
    const [problem, setProblem] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const api = window.chromeAPI.nests
    return (
        <div className="ml-auto shrink-0 flex items-center gap-2">
            {problem && <p role="alert" className="text-13 text-destructive truncate max-w-80">{problem}</p>}
            <Button variant="ghost" size="sm" onClick={() => void api.discardPlan(nestId)}>
                Discard plan
            </Button>
            <Button
                size="sm"
                disabled={busy || planning}
                onClick={async () => {
                    setBusy(true)
                    const result = await api.runPlan(nestId)
                    setBusy(false)
                    setProblem(result.ok ? null : result.error)
                }}
            >
                Run
            </Button>
        </div>
    )
}

// A board where each card is one bird's chat thread. Cards run only when the user sends them, or runs a plan.
export const NestPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const nestId = tab.pageParam
    const [board, setBoard] = useState<NestBoard | null>(null)
    const { nests } = useLibrary()
    const { find } = useFlock()
    const summary = nests.find((nest) => nest.id === nestId)
    const working = workingLine((summary?.working ?? []).map((id) => find(id).name))
    const berryName = useAssistantName()

    useEffect(() => {
        if (!nestId) return undefined
        const api = window.chromeAPI.nests
        const off = api.onUpdated((updated) => {
            if (updated.id === nestId) setBoard(updated)
        })
        void api.board(nestId).then(setBoard)
        return off
    }, [nestId])

    if (!nestId || !board) return <div className="h-full" />
    const pending = board.cards.some((card) => card.plan?.state === 'planned')

    return (
        <div className="h-full flex flex-col">
            <header className="shrink-0 h-14 px-6 flex items-center gap-3 border-b">
                <TitleField nestId={board.id} title={board.title} />
                {pending && <span className="shrink-0 text-14 text-muted-foreground">{berryName}’s plan</span>}
                {working && <p role="status" className="text-14 text-muted-foreground truncate">{working}</p>}
                {pending && <PlanControls nestId={board.id} planning={!!board.planning} />}
            </header>
            <ReactFlowProvider>
                <Board board={board} />
            </ReactFlowProvider>
        </div>
    )
}
