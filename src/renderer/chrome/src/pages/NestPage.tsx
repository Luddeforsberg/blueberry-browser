import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
    applyNodeChanges,
    Background,
    BackgroundVariant,
    SelectionMode,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    useStore,
    useViewport,
    ViewportPortal,
    type FinalConnectionState,
    type NodeChange
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import type { NestFocus, NestHandOff, TabInfo } from '@shared/ipc'
import type { MascotProfile, NestBoard, NestCard } from '@shared/library'
import { BERRY_ID } from '@shared/mascots'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Scan, Table2 } from 'lucide-react'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { Berry, useAssistantName } from '../components/Berry'
import { SHIMMER_QUIET } from '../components/ChatMessage'
import { Composer } from '../components/Composer'
import { AboutChip, NestComposer } from '../components/NestComposer'
import { SectionDraw, SectionLayer, SectionTools, type SectionMove } from '../components/NestSections'
import { cardsIn, fitSection, SECTION_PAD, sectionsIn } from '@shared/nestSections'
import { useCardsInView, useSinceHighlight } from '../components/NestReturn'
import { firstBlank, NEST_STARTERS, onLeftInComposer, takeFromComposer } from '../nestStart'
import { Attachments, useAttaching } from '../components/NestAttachments'
import { MAX_INPUTS, type PickedRows } from '@shared/nestTable'
import { capitalized, cardName, whose } from '@shared/nestNames'
import { droppedAddress, pageName } from '@shared/nestPages'
import { TAB_DROP_EVENT } from '../components/useTabDrag'
import { CardView, draftText, GhostSweep, LINE_AT, LineView, NestBoardContext, PullingLine, setDraftText, type CardNode, type LineEdge, type NestBoardActions, type PullState, type RowSelection } from '../components/NestCard'
import { useChatThreads } from '../contexts/ChatContext'
import {
    besideSpot,
    CARD_GAP,
    CARD_HEIGHT,
    CARD_WIDTH,
    clearOfPeek,
    fitViewport,
    flightDuration,
    flightMode,
    flightPath,
    freeSpot,
    pickRows,
    roomToGrow,
    settle,
    settleHeight,
    showViewport,
    workingLine,
    ZOOM,
    type CardHeights,
    type FlightMode,
    type FlightPoint,
    type Insets,
    type Rect,
    type Viewport
} from '../nestBoard'

const NODE_TYPES = { card: CardView }
const EDGE_TYPES = { line: LineView }
// Room above a card for its bird, and from the board's edge.
const EDGE_INSET = { x: 64, y: 88 }
// What fitting and showing cards keep clear: the birds over the top cards, and the composer floating at the bottom.
const VIEW_INSETS: Insets = { top: 72, right: 48, bottom: 128, left: 48 }
// Where a pulled line meets a new card, so the card's top sits a little above the pointer.
const DROP_ABOVE = 60
// How near a card's input dot, on screen, a line let go counts as dropped on that card, since its lines end just outside.
const DOT_REACH = 40
const DOTS = { gap: 20, size: 1.2 }
// How tall a planned card is taken to be, as main places a plan, for the shapes shown while Berry plans.
const PLANNED_HEIGHT = 180
const MOVE = { duration: 240 }
// Where the open card sits, and the layer that dims the rest of the board under it.
const OPEN_Z = 10
const DIM_Z = 5

// A card the composer can ask about: one with something on it for Berry to read.
const askable = (card: NestCard) => !!(card.chatId || card.each || card.versions || card.table || card.file || card.note)

const rectOf = (node: CardNode): Rect => ({ ...node.position, width: node.measured?.width ?? CARD_WIDTH, height: node.measured?.height ?? CARD_HEIGHT })

// The words a dragged link was shown with, from the HTML a drag carries with it, read as text only: a parsed document
// that's never shown runs nothing and loads nothing.
const linkWords = (html: string, url: string): string => {
    if (!html) return ''
    const anchors = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a[href]')]
    const anchor = anchors.find((each) => (each as HTMLAnchorElement).href === url) ?? (anchors.length === 1 ? anchors[0] : undefined)
    return anchor?.textContent?.trim() ?? ''
}

// The largest file a drop reads into the chrome, the biggest any kind of file can be. Main says why a bigger one can't go.
const MAX_DROP_READ = 10 * 1024 * 1024
// How many files one drop adds.
const MAX_DROPPED = 10

// What the keyboard and a screen reader are told about a card on the board.
const CARD_KEYS = {
    'node.a11yDescription.default': 'Press Enter to open this card, Escape to close it, or Delete to delete it.',
    'node.a11yDescription.keyboardDisabled': 'Press Enter to open this card, Escape to close it, or Delete to delete it.'
}

const toNodes = (
    board: NestBoard,
    openId: string | null,
    previous: CardNode[],
    label: (card: NestBoard['cards'][number]) => string,
    resizingId: string | null = null
): CardNode[] =>
    board.cards.map((card) => {
        const before = previous.find((node) => node.id === card.id)
        // A card the user made a size of its own keeps it, except while open, when it grows with its whole chat. The one
        // being resized keeps the size its corner has given it so far.
        const size = card.id === resizingId && before ? { width: before.width, height: before.height } : card.size
        return {
            ...before,
            id: card.id,
            type: 'card',
            position: { x: card.x, y: card.y },
            // An HTML card open is bigger than its own size, so the page has room, and so is a card of versions side by side.
            width: card.id === openId && (card.file?.type === 'text/html' || card.versions) ? undefined : size?.width,
            height: card.id === openId ? undefined : size?.height,
            dragHandle: '.nest-drag',
            // The open card floats over the others and the layer that dims them, since it's the one being read.
            zIndex: card.id === openId ? OPEN_Z : 0,
            ariaLabel: label(card),
            ariaRole: 'group',
            data: { card }
        }
    })

// The cards a draft, planned or sent card could also read from: any with something to give, or for a planned card another
// of the plan, that it doesn't read from already and that doesn't read from it. Main checks it again, and refuses a sent
// card while it works.
const inputCandidates = (board: NestBoard, cardId: string): NestCard[] => {
    const card = board.cards.find((each) => each.id === cardId)
    const into = board.lines.filter((line) => line.to === cardId)
    if (!card || card.each || card.versions || card.table || card.file || card.page || card.note || card.plan?.state === 'armed' || into.length >= MAX_INPUTS) return []
    const after = new Set<string>([cardId])
    for (let grew = true; grew; ) {
        grew = false
        for (const line of board.lines) {
            if (after.has(line.from) && !after.has(line.to)) {
                after.add(line.to)
                grew = true
            }
        }
    }
    return board.cards.filter(
        (each) =>
            !after.has(each.id) &&
            !into.some((line) => line.from === each.id) &&
            (!!each.chatId || !!each.each || !!each.versions || !!each.table || !!each.file || !!each.note || (!!each.page && (!card.plan || card.plan.state === 'held')) || (card.plan?.state === 'planned' && each.plan?.state === 'planned'))
    )
}

// The selected rows, in the table's order, as a line out of their card takes them.
const pickedOf = (selection: RowSelection | null, cardId: string): PickedRows | undefined =>
    selection?.cardId === cardId && selection.rows.length > 0
        ? { header: selection.table.header, rows: selection.rows.map((index) => selection.table.rows[index]) }
        : undefined

// A line the user may take away goes into a card they still send from: a draft, a planned or held card, or a sent one.
// Never into a For-each card, whose runs read it, a card of a plan waiting to start, or a file or page card, whose line
// only says where it came from. Main checks it again.
const removable = (card: NestCard | undefined) => !!card && !card.each && !card.versions && !card.file && !card.page && !card.note && card.plan?.state !== 'armed'

const toEdges = (board: NestBoard, label: (card: NestCard) => string): LineEdge[] =>
    board.lines.map((line) => {
        const to = board.cards.find((card) => card.id === line.to)
        const from = board.cards.find((card) => card.id === line.from)
        const canRemove = removable(to)
        // A line into a file's, page's or note's card only says where it came from: nothing goes through it.
        const reads = !!to && !to.file && !to.page && !to.note && !to.table
        return {
            id: line.id,
            source: line.from,
            target: line.to,
            sourceHandle: 'out',
            targetHandle: 'in',
            type: 'line',
            focusable: canRemove || reads,
            // Never one of React Flow's selected elements: the board picks a line itself, and selection is for cards.
            selectable: false,
            // A drawing even when the keyboard can reach it, so it's never taken for one of the cards, which are groups.
            ariaRole: 'img',
            ariaLabel: from && to ? `The line from ${label(from)} into ${label(to)}.${canRemove ? ' Press Delete to take it away.' : ''}` : undefined,
            data: {
                draft: !(to && (to.chatId || to.each || to.versions || to.file || to.page)),
                view: !!to?.page,
                ...(line.fresh ? { fresh: true } : {}),
                ...(line.changed ? { changed: true } : {}),
                ...(canRemove ? { removable: true } : {}),
                // Pressed, it says what goes through it. A light runs along it whenever its card's message goes.
                ...(reads ? { reads: true } : {}),
                ...(to?.each || to?.plan?.each ? { forEach: true } : {}),
                ...(to?.knows?.sent ? { pulseAt: to.knows.at } : {})
            }
        }
    })

// Where each Nest was last looked at, so going to another tab and back keeps the place. Memory only.
const lastViewport = new Map<string, Viewport>()

// The card a Needs you row, a notification or a card's chat asked to open, kept for each Nest until its board takes it,
// since the page may only be drawn after the ask arrives.
const asked = new Map<string, NestFocus>()
const askListeners = new Set<() => void>()
window.chromeAPI.nests.onFocus((focus) => {
    asked.set(focus.nestId, focus)
    askListeners.forEach((listener) => listener())
})

const useAskedCard = (nestId: string, take: (focus: NestFocus) => void) => {
    const taking = useRef(take)
    taking.current = take
    useEffect(() => {
        const check = () => {
            const focus = asked.get(nestId)
            if (!focus) return
            asked.delete(nestId)
            taking.current(focus)
        }
        askListeners.add(check)
        check()
        return () => void askListeners.delete(check)
    }, [nestId])
}

// The Nest's name, which reads as a title until it's pressed, and then renames it. While the cheap model names a new
// Nest, the first words stand in and shimmer.
const TitleField: React.FC<{ nestId: string; title: string; naming: boolean }> = ({ nestId, title, naming }) => {
    const [value, setValue] = useState(title)
    const [editing, setEditing] = useState(false)
    useEffect(() => setValue(title), [title])
    const save = () => {
        setEditing(false)
        if (value.trim() && value.trim() !== title) void window.chromeAPI.nests.rename(nestId, value)
        else setValue(title)
    }
    return (
        <span className="relative -ml-2 min-w-24 max-w-[60%] flex">
            <input
                aria-label="Nest name"
                value={value}
                maxLength={100}
                onChange={(event) => setValue(event.target.value)}
                onFocus={() => setEditing(true)}
                onBlur={save}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                        setValue(title)
                        requestAnimationFrame(() => (event.target as HTMLInputElement).blur())
                    }
                }}
                style={{ fieldSizing: 'content' } as React.CSSProperties}
                className={cn(
                    "min-w-24 max-w-full h-9 px-2 rounded-control bg-transparent text-20 font-semibold outline-none transition-colors hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                    naming && !editing && "text-transparent"
                )}
            />
            {naming && !editing && (
                <span aria-hidden className="pointer-events-none absolute inset-y-0 inset-x-2 flex items-center text-20 font-semibold truncate">
                    <span className={cn(SHIMMER_QUIET, "truncate")}>{value}</span>
                </span>
            )}
        </span>
    )
}

// One hand-off along a line, being drawn: the source card's bird carrying the berry to the card that just started.
interface Flight {
    id: number
    from: string
    to: string
    mode: Exclude<FlightMode, 'none'>
    mascot: MascotProfile
    path: FlightPoint[]
    sameBird: boolean
    flipped: boolean
}

// How long a still bird's fade takes, and how long a bird that landed beside another waits and fades.
const FADE_MS = 560
const LEAVE_MS = 160

// The bird in flight, in board coordinates so it moves with the board. It only draws: the job started before it took
// off, and nothing waits for it to land.
const FlightView: React.FC<{ flight: Flight; onLanded: (flight: Flight) => void; onDone: (id: number) => void }> = ({ flight, onLanded, onDone }) => {
    const box = useRef<HTMLDivElement>(null)
    const ends = useRef({ onLanded, onDone })
    ends.current = { onLanded, onDone }
    useLayoutEffect(() => {
        const element = box.current
        if (!element) return undefined
        const turn = flight.flipped ? ' scaleX(-1)' : ''
        const land = flight.path.at(-1)!
        const duration = flight.mode === 'fly' ? flightDuration(flight.path) : FADE_MS
        let stopped = false
        let landed = false
        const animations: Animation[] = []
        const home = () => {
            if (landed || stopped) return
            landed = true
            ends.current.onLanded(flight)
        }
        const finish = () => {
            home()
            if (!stopped) ends.current.onDone(flight.id)
        }
        // A window out of sight draws no frames, so its animations stand still. The birds come home by the clock anyway,
        // so no perch stays empty and no flight plays late.
        const deadline = window.setTimeout(finish, duration + LEAVE_MS * 2 + 200)
        const run = async () => {
            if (flight.mode === 'fly') {
                const flying = element.animate(
                    flight.path.map((point) => ({ transform: `translate(${point.x}px, ${point.y}px)${turn}`, offset: point.offset })),
                    { duration, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'forwards' }
                )
                animations.push(flying)
                await flying.finished
                home()
                // On its own perch it's simply home. Beside another bird it hands the berry over and goes.
                if (!flight.sameBird && !stopped) {
                    const leaving = element.animate([{ opacity: 1 }, { opacity: 0 }], { delay: LEAVE_MS, duration: LEAVE_MS, fill: 'forwards' })
                    animations.push(leaving)
                    await leaving.finished
                }
            } else {
                element.style.transform = `translate(${land.x}px, ${land.y}px)`
                const fading = element.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: flight.sameBird ? 1 : 0 }], { duration, fill: 'forwards' })
                animations.push(fading)
                await fading.finished
            }
            finish()
        }
        run().catch(() => undefined)
        return () => {
            stopped = true
            window.clearTimeout(deadline)
            animations.forEach((animation) => animation.cancel())
        }
    }, [flight])
    return (
        <div ref={box} aria-hidden className="pointer-events-none absolute left-0 top-0 z-[1000]" style={{ transform: `translate(${flight.path[0].x}px, ${flight.path[0].y}px)` }}>
            <Berry size={44} mood={flight.mode === 'fly' ? 'fetching' : 'rest'} mascot={flight.mascot} />
        </div>
    )
}

// Fit to screen, and how far the board is zoomed when it isn't at 100%, which a press puts back. Nothing else: the
// board moves with two fingers, pinches to zoom, and ⌘+, ⌘− and ⌘0 do the same from the keyboard.
const ZoomControls: React.FC<{ onFit: () => void; onActualSize: () => void; children?: React.ReactNode }> = ({ onFit, onActualSize, children }) => {
    const { zoom } = useViewport()
    const percent = Math.round(zoom * 100)
    return (
        <div className="absolute top-3 right-4 flex items-center gap-1">
            {children}
            {percent !== 100 && (
                <button
                    type="button"
                    onClick={onActualSize}
                    title="Actual size"
                    aria-label={`Zoomed to ${percent}%. Back to 100%`}
                    className="h-7 px-2 rounded-control text-12 tabular-nums text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {percent}%
                </button>
            )}
            <button
                type="button"
                onClick={onFit}
                title="Fit to screen (⌘0)"
                aria-label="Fit to screen"
                className="size-7 flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Scan className="size-4" />
            </button>
        </div>
    )
}

// While a card is open, the rest of the board, its cards, lines and dots, fades a little behind it, so the open card
// reads as a layer of its own rather than lying across the cards under it. A press on it closes the card. It sits in
// the board's own layers, between the cards and the open one, and covers just what's on screen.
const OpenDim: React.FC<{ shown: boolean; onClose: () => void }> = ({ shown, onClose }) => {
    const { x, y, zoom } = useViewport()
    const width = useStore((state) => state.width)
    const height = useStore((state) => state.height)
    return (
        <div
            aria-hidden
            data-open-dim
            onClick={shown ? onClose : undefined}
            className={cn("absolute left-0 top-0 bg-canvas/60 transition-opacity duration-layout", shown ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")}
            style={{ zIndex: DIM_Z, transform: `translate(${-x / zoom}px, ${-y / zoom}px)`, width: width / zoom, height: height / zoom }}
        />
    )
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const Board: React.FC<{ board: NestBoard }> = ({ board }) => {
    const flow = useReactFlow<CardNode, LineEdge>()
    const { theme, settings } = useShell()
    const { chosen, choose, find } = useFlock()
    const chosenName = useAssistantName(chosen)
    const berryName = useAssistantName()
    const [openId, setOpenId] = useState<string | null>(null)
    const [openRunId, setOpenRunId] = useState<string | null>(null)
    const [focusId, setFocusId] = useState<string | null>(null)
    const [selection, setSelection] = useState<RowSelection | null>(null)
    // Set when a press away from the rows cleared them, so the click that follows on the board doesn't also make a card.
    const clearedByPress = useRef(false)
    const label = useCallback(
        (card: NestBoard['cards'][number]) =>
            card.note
                ? `${berryName}’s note`
                : card.page
                ? `The page ${pageName(card.page.tab?.url ?? card.page.url)}`
                : card.table
                  ? `The table ${card.table.name}`
                  : card.file
                    ? `The file ${card.file.name}`
                    : capitalized(whose(cardName(card.title, card.mascotId ? find(card.mascotId).name : berryName), 'card')),
        [find, berryName]
    )
    const [nodes, setNodes] = useState<CardNode[]>(() => toNodes(board, null, [], label))
    const edges = useMemo(() => toEdges(board, label), [board, label])
    // Cards selected on the board, which the composer then asks about alone: Shift or ⌘ and a press on a card's header or
    // bird, or Shift and a drag on empty board. Only those select, so a plain press on a card, or Enter on one, does what
    // it always has. Set as each press starts, and gone with any key.
    const selectGesture = useRef(false)
    const selectedCards = useMemo(() => nodes.filter((node) => node.selected && askable(node.data.card)).map((node) => node.id), [nodes])
    const clearCards = useCallback(() => setNodes((current) => current.map((node) => (node.selected ? { ...node, selected: false } : node))), [])
    // Sections: the one selected, whose name a press selected with its cards, the one being named, and the section tool.
    const [sectionId, setSectionId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [drawing, setDrawing] = useState(false)
    const section = board.sections.find((each) => each.id === sectionId) ?? null
    const inSectionNow = useCallback(
        (rect: Rect) => cardsIn(rect, nodes.map((node) => ({ id: node.id, ...rectOf(node) }))),
        [nodes]
    )
    // The chip names the section while exactly the cards in it that Berry can read are selected.
    const sectionCards = useMemo(() => (section ? inSectionNow(section).filter((id) => askable(nodes.find((node) => node.id === id)!.data.card)) : []), [section, inSectionNow, nodes])
    const aboutSection = section && sectionCards.length > 0 && sectionCards.length === selectedCards.length && sectionCards.every((id) => selectedCards.includes(id)) ? section.name : null
    const [prompt, setPrompt] = useState('')
    // A starter or a chat's request fills the composer and moves the keyboard there, never sending.
    const [composerFocus, setComposerFocus] = useState<{ key: number; range?: [number, number] }>({ key: 0 })
    const focusComposer = useCallback(() => setComposerFocus((current) => ({ key: current.key + 1 })), [])
    // Tucked down to a tab at the bottom edge, as the Nest keeps it, at once. Bringing it back, the keyboard goes there.
    const [tucked, setTuckedNow] = useState(!!board.composerTucked)
    const tuckedNow = useRef(tucked)
    tuckedNow.current = tucked
    useEffect(() => setTuckedNow(!!board.composerTucked), [board.composerTucked])
    const tuck = useCallback(
        (on: boolean) => {
            setTuckedNow(on)
            if (on) setDrawerOpen(false)
            else focusComposer()
            void window.chromeAPI.nests.setTucked(board.id, on)
        },
        [board.id, focusComposer]
    )
    const fillComposer = useCallback(
        (text: string, range?: [number, number]) => {
            if (tuckedNow.current) tuck(false)
            setPrompt(text)
            setComposerFocus((current) => ({ key: current.key + 1, range }))
        },
        [tuck]
    )
    // The drawer with the whole talk, and what had the keyboard before it opened, which gets it back when it closes.
    const [drawerOpen, setDrawerOpen] = useState(false)
    const backTo = useRef<HTMLElement | null>(null)
    useEffect(() => {
        const take = () => {
            const text = takeFromComposer(board.id)
            if (text) fillComposer(text)
        }
        take()
        return onLeftInComposer(take)
    }, [board.id, fillComposer])
    const wrapper = useRef<HTMLDivElement>(null)
    const pulling = useRef<string | null>(null)
    const api = window.chromeAPI.nests
    // The line being pulled, and the card it would go into if let go now.
    const [pull, setPull] = useState<{ from: string; over: string | null } | null>(null)
    const [dropProblem, setDropProblem] = useState<{ cardId: string; text: string } | null>(null)
    const [selectedLine, setSelectedLine] = useState<string | null>(null)
    // Whether a sent card is working, only looked at while a line is pulled, since it can't take one then.
    const sentChats = useMemo(() => (pull ? board.cards.flatMap((card) => (card.chatId ? [card.chatId] : [])) : []), [pull, board.cards])
    const sentThreads = useChatThreads(sentChats)

    // The card whose corner is being dragged, which neither the board's updates nor settling may move or size meanwhile,
    // and where it was when the drag began, which says what's in its way.
    const resizing = useRef<string | null>(null)
    const resizeFrom = useRef<{ id: string; rect: Rect } | null>(null)
    useEffect(() => setNodes((previous) => toNodes(board, openId, previous, label, resizing.current)), [board, openId, label])

    const open = useCallback((cardId: string | null, runId: string | null = null) => {
        setOpenId(cardId)
        setOpenRunId(cardId ? runId : null)
        if (cardId) setDrawerOpen(false)
    }, [])

    // Opening the drawer closes the open card, so the talk never sits over the dim. The keyboard goes to the composer
    // under it, and back where it was once it closes with Esc or its ×.
    const openDrawer = useCallback(() => {
        const active = document.activeElement
        backTo.current = active instanceof HTMLElement && active !== document.body && !active.closest('[data-nest-composer]') ? active : null
        setOpenId(null)
        setDrawerOpen(true)
        focusComposer()
    }, [focusComposer])
    const closeDrawer = useCallback((giveBack: boolean) => {
        setDrawerOpen(false)
        const back = backTo.current
        backTo.current = null
        if (giveBack && back?.isConnected) back.focus()
    }, [])

    // Opens where it was last looked at, or else where the cards are, with room above the first for its bird.
    const placed = useRef(false)
    useEffect(() => {
        if (placed.current || board.cards.length === 0) return
        placed.current = true
        const last = lastViewport.get(board.id)
        if (last) return void flow.setViewport(last)
        const left = Math.min(...board.cards.map((card) => card.x))
        const top = Math.min(...board.cards.map((card) => card.y))
        void flow.setViewport({ x: EDGE_INSET.x - left, y: EDGE_INSET.y - top, zoom: 1 })
    }, [board.cards, board.id, flow])

    const rects = useCallback((): Rect[] => flow.getNodes().map(rectOf), [flow])
    const boxSize = () => {
        const box = wrapper.current?.getBoundingClientRect()
        return box ? { width: box.width, height: box.height } : null
    }

    // Moves the board just enough to show cards that are out of sight, once they've been drawn and measured, and anything
    // else that should show with them.
    const reveal = useCallback(
        (cardIds: readonly string[], around: readonly Rect[] = []) => {
            requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                    const size = boxSize()
                    const shown = [
                        ...cardIds.flatMap((id) => {
                            const node = flow.getNode(id)
                            return node ? [rectOf(node)] : []
                        }),
                        ...around
                    ]
                    const next = size && showViewport(shown, flow.getViewport(), size, VIEW_INSETS)
                    if (next) void flow.setViewport(next, MOVE)
                })
            )
        },
        [flow]
    )

    // What changed since the Nest was last open peeks over the composer, so the board moves up, once, to clear any card
    // it would cover, when it can. Only once every card has been measured, or a card's height would be a guess.
    const uncover = useCallback(
        (peek: DOMRect) => {
            const box = wrapper.current?.getBoundingClientRect()
            if (!box || flow.getNodes().some((node) => !node.measured?.height)) return false
            const { x, y, zoom } = flow.getViewport()
            const cards = rects().map((rect) => ({ x: rect.x * zoom + x, y: rect.y * zoom + y, width: rect.width * zoom, height: rect.height * zoom }))
            const move = clearOfPeek(cards, { x: peek.left - box.left, y: peek.top - box.top, width: peek.width, height: peek.height }, { top: VIEW_INSETS.top, width: box.width })
            if (move < 0) void flow.setViewport({ x, y: y + move, zoom }, MOVE)
            return true
        },
        [flow, rects]
    )

    const fit = useCallback(() => {
        const size = boxSize()
        const next = size && fitViewport(rects(), size, VIEW_INSETS)
        if (next) void flow.setViewport(next, MOVE)
    }, [flow, rects])

    // Cards grow once they're drawn, such as when an answer or a table arrives, or runs come in. Whenever one does, the
    // cards placed for the user that it now covers move down out of its way, and the ones the user placed stay. The open
    // card counts at its closed size, since it floats over the others. Not while a card is being dragged.
    const heights = useRef<CardHeights>({ closed: new Map(), open: new Map() })
    useEffect(() => {
        if (resizing.current || nodes.some((node) => node.dragging || !node.measured?.height)) return
        const cards = nodes.map((node) => ({
            id: node.id,
            ...node.position,
            width: node.measured!.width ?? CARD_WIDTH,
            height: settleHeight(heights.current, node.id, node.measured!.height!, node.id === openId),
            movable: node.data.card.autoPlaced
        }))
        const nudges = settle(cards)
        if (nudges.length === 0) return
        setNodes((current) =>
            current.map((node) => {
                const nudge = nudges.find(({ id }) => id === node.id)
                return nudge ? { ...node, position: { x: nudge.x, y: nudge.y } } : node
            })
        )
        void api.nudgeCards(board.id, nudges)
    }, [nodes, openId, api, board.id])

    // A card made bigger from its corner stops short of any card in its way rather than covering it, and nothing moves for
    // it. React Flow sends what the corner asks for while it's dragged and once more as it's let go, both with `resizing`.
    const stopAtNeighbours = (change: NodeChange<CardNode>, current: CardNode[]): NodeChange<CardNode> => {
        const from = resizeFrom.current
        if (change.type !== 'dimensions' || typeof change.resizing !== 'boolean' || !change.dimensions || change.id !== from?.id) return change
        const others = current.filter((node) => node.id !== change.id).map(rectOf)
        return { ...change, dimensions: roomToGrow(from.rect, others, change.dimensions) }
    }

    // ⌘+, ⌘− and ⌘0 come from the View menu, since they're its accelerators.
    useEffect(
        () =>
            api.onZoom((zoom) => {
                if (zoom === 'fit') fit()
                else void (zoom === 'in' ? flow.zoomIn({ duration: 160 }) : flow.zoomOut({ duration: 160 }))
            }),
        [api, flow, fit]
    )

    // A card Needs you asked about: opened, at its run if it's one of a For-each card's, and moved into view.
    useAskedCard(board.id, (focus) => {
        if (!board.cards.some((card) => card.id === focus.cardId)) return
        open(focus.cardId, focus.runId)
        reveal([focus.cardId])
    })

    // A card that appears out of sight comes into view, such as one the composer started below the others, and a new
    // plan's cards come into view together.
    const seen = useRef<Set<string> | null>(null)
    useEffect(() => {
        const before = seen.current
        seen.current = new Set(board.cards.map((card) => card.id))
        if (!before) return
        const fresh = board.cards.filter((card) => !before.has(card.id))
        if (fresh.length === 0) return
        if (!fresh.some((card) => card.plan?.state === 'planned')) return reveal(fresh.map((card) => card.id))
        const planned = board.cards.filter((card) => card.plan?.state === 'planned').map((card) => ({ id: card.id, x: card.x, y: card.y, width: CARD_WIDTH, height: CARD_HEIGHT }))
        // With the name of the plan's section, never the whole of it, which may not fit at this zoom.
        reveal(
            planned.map((card) => card.id),
            board.sections.filter((section) => cardsIn(section, planned).length > 0).map((section) => ({ x: section.x, y: section.y, width: Math.min(section.width, 240), height: SECTION_PAD.top / 2 }))
        )
    }, [board.cards, board.sections, reveal])

    // An HTML card, or a card of versions side by side, opens wider than it was, so the board moves to show it.
    useEffect(() => {
        const opened = openId ? board.cards.find((card) => card.id === openId) : undefined
        if (opened && (opened.file?.type === 'text/html' || opened.versions)) reveal([opened.id])
        // Only when it opens, not each time the board changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openId, reveal])

    // Esc closes the open card from anywhere on the page, unless something else already took it, such as a draft's prompt.
    useEffect(() => {
        if (!openId) return undefined
        const close = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            const target = event.target as Element | null
            if (target && target !== document.body && !wrapper.current?.contains(target)) return
            open(null)
            wrapper.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(openId)}"]`)?.focus()
        }
        window.addEventListener('keydown', close)
        return () => window.removeEventListener('keydown', close)
    }, [openId, open])

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

    // Hand-offs along a line, drawn while someone can see them. A bird away flying leaves its card's perch empty.
    const [flights, setFlights] = useState<Flight[]>([])
    const [away, setAway] = useState<ReadonlySet<string>>(new Set())
    const flightCount = useRef(0)
    const birdOf = useCallback((cardId: string) => find(board.cards.find((card) => card.id === cardId)?.mascotId ?? null), [board.cards, find])
    const fly = useCallback(
        ({ from, to }: NestHandOff) => {
            const box = wrapper.current?.getBoundingClientRect()
            const source = flow.getInternalNode(from)
            const target = flow.getInternalNode(to)
            if (!box || !source || !target) return
            const rectFor = (node: NonNullable<typeof source>): Rect => ({
                ...node.internals.positionAbsolute,
                width: node.measured.width ?? CARD_WIDTH,
                height: node.measured.height ?? CARD_HEIGHT
            })
            const fromRect = rectFor(source)
            const toRect = rectFor(target)
            const viewport = flow.getViewport()
            const inView = (rect: Rect) =>
                rect.x * viewport.zoom + viewport.x < box.width && (rect.x + rect.width) * viewport.zoom + viewport.x > 0 && rect.y * viewport.zoom + viewport.y < box.height && (rect.y + rect.height) * viewport.zoom + viewport.y > 0
            const mode = flightMode({
                showBerry: settings.showBerry,
                still: settings.keepBerryStill,
                reducedMotion: prefersReducedMotion(),
                onScreen: document.visibilityState === 'visible' && (inView(fromRect) || inView(toRect))
            })
            if (mode === 'none') return
            const mascot = birdOf(from)
            const sameBird = mascot.id === birdOf(to).id
            const flight: Flight = { id: ++flightCount.current, from, to, mode, mascot, sameBird, path: flightPath(fromRect, toRect, sameBird), flipped: toRect.x < fromRect.x }
            setFlights((current) => [...current, flight])
            // It takes off from its own card, and when it's the target's bird too, that perch waits for it.
            if (mode === 'fly' || sameBird) setAway((current) => new Set([...current, ...(mode === 'fly' ? [from] : []), ...(sameBird ? [to] : [])]))
        },
        [flow, settings.showBerry, settings.keepBerryStill, birdOf]
    )
    useEffect(
        () =>
            api.onHandOff((handOff) => {
                // After the board has the card that just started, so it's measured where it now is.
                if (handOff.nestId === board.id) requestAnimationFrame(() => requestAnimationFrame(() => fly(handOff)))
            }),
        [api, board.id, fly]
    )
    // Home: both cards have their birds back, the one it left fading in.
    const landed = useCallback(({ from, to }: Flight) => {
        setAway((was) => {
            const next = new Set(was)
            next.delete(from)
            next.delete(to)
            return next
        })
    }, [])
    const doneFlying = useCallback((id: number) => setFlights((current) => current.filter((flight) => flight.id !== id)), [])

    // A new card closes the open one, so it never lands behind the layer that dims the board.
    const add = useCallback(
        async (spot: { x: number; y: number }, extra: { from?: string; mascotId?: string; picked?: PickedRows; auto?: boolean } = {}) => {
            open(null)
            const card = await api.addCard(board.id, { ...spot, ...extra })
            if (card) {
                setFocusId(card.id)
                reveal([card.id])
            }
            return card
        },
        [api, board.id, reveal, open]
    )

    // Empty drafts go when the user starts something else, so the board never fills with them. A plan's cards stay, and
    // so does a draft with a file or note on it.
    const dropEmptyDrafts = useCallback(() => {
        board.cards
            .filter((card) => !card.chatId && !card.each && !card.versions && !card.plan && !card.table && !card.file && !card.page && !card.note && !draftText(card.id).trim() && card.attachments.length === 0)
            .forEach((card) => void api.deleteCard(card.id))
    }, [api, board.cards])

    // Why the last thing sent from the composer, or a line dropped on a card, couldn't go.
    const [problem, setProblem] = useState<string | null>(null)
    const planning = board.planning ?? null
    const pending = board.cards.some((card) => card.plan?.state === 'planned')

    // The page cards on screen, each with the width its picture is drawn at, told to main once a frame, which pictures
    // only those, and nothing at all once the board has gone.
    const watched = useRef(new Map<string, number>())
    const watchSent = useRef<number | null>(null)
    const watchPage = useCallback(
        (cardId: string, width: number) => {
            if (width > 0) watched.current.set(cardId, width)
            else if (!watched.current.delete(cardId)) return
            if (watchSent.current !== null) return
            watchSent.current = requestAnimationFrame(() => {
                watchSent.current = null
                void api.watchPages(board.id, [...watched.current].map(([id, each]) => ({ cardId: id, width: each })))
            })
        },
        [api, board.id]
    )
    useEffect(
        () => () => {
            if (watchSent.current !== null) cancelAnimationFrame(watchSent.current)
            void api.watchPages(board.id, [])
        },
        [api, board.id]
    )

    // The card a line let go here goes into: the one under the pointer, or the one whose input dot it's near, where its
    // lines end just outside its edge, or the one a line under the pointer goes into, when nearer that end.
    const cardAt = useCallback(
        (x: number, y: number): string | null => {
            const hit = document.elementFromPoint(x, y) as HTMLElement | null
            const onNode = hit?.closest<HTMLElement>('.react-flow__node')?.dataset.id
            if (onNode) return onNode
            const zoom = flow.getZoom()
            const dotOf = (id: string) => {
                const node = flow.getInternalNode(id)
                const at = node ? flow.flowToScreenPosition(node.internals.positionAbsolute) : null
                return at ? { x: at.x, y: at.y + LINE_AT * zoom } : null
            }
            let near: string | null = null
            let nearest = DOT_REACH
            for (const card of board.cards) {
                const dot = dotOf(card.id)
                const away = dot ? Math.hypot(x - dot.x, y - dot.y) : Infinity
                if (away < nearest) {
                    near = card.id
                    nearest = away
                }
            }
            if (near) return near
            const lineId = hit?.closest<SVGElement>('.react-flow__edge')?.dataset.id
            const line = board.lines.find((each) => each.id === lineId)
            const source = line && flow.getInternalNode(line.from)
            const into = line && dotOf(line.to)
            if (!line || !source || !into) return null
            const out = flow.flowToScreenPosition({ x: source.internals.positionAbsolute.x + (source.measured.width ?? CARD_WIDTH), y: source.internals.positionAbsolute.y + LINE_AT })
            return Math.hypot(x - into.x, y - into.y) < Math.hypot(x - out.x, y - out.y) ? line.to : null
        },
        [flow, board.cards, board.lines]
    )
    // Every card a line from `from` could go into now, as main would take it, less a sent card that's working.
    const pullState = useMemo((): PullState | null => {
        if (!pull) return null
        const accepts = board.cards.filter(
            (card) =>
                !(card.chatId && sentThreads[card.chatId]?.partial != null) &&
                inputCandidates(board, card.id).some((each) => each.id === pull.from)
        )
        return { ...pull, accepts: new Set(accepts.map((card) => card.id)) }
    }, [pull, board, sentThreads])
    // While a line is pulled, which card it's over, once a frame.
    useEffect(() => {
        if (!pull) return undefined
        let frame: number | null = null
        const move = (event: PointerEvent) => {
            if (frame !== null) cancelAnimationFrame(frame)
            const { clientX, clientY } = event
            frame = requestAnimationFrame(() => {
                frame = null
                const over = cardAt(clientX, clientY)
                setPull((current) => (current && current.over !== over ? { ...current, over } : current))
            })
        }
        window.addEventListener('pointermove', move)
        return () => {
            window.removeEventListener('pointermove', move)
            if (frame !== null) cancelAnimationFrame(frame)
        }
    }, [pull, cardAt])
    // A card's refusal stays until the next press anywhere.
    useEffect(() => {
        if (!dropProblem) return undefined
        const clear = () => setDropProblem(null)
        window.addEventListener('pointerdown', clear, { once: true })
        return () => window.removeEventListener('pointerdown', clear)
    }, [dropProblem])
    const removeLine = useCallback(
        (lineId: string) => {
            setSelectedLine(null)
            void api.removeInput(lineId).then((result) => setProblem(result.ok ? null : result.error))
        },
        [api]
    )

    useCardsInView(board, openId)
    // The cards that changed since the Nest was last open are highlighted for a moment as Berry says so.
    const sinceCards = useSinceHighlight(board.id, board.since)
    // While a line is pulled, the cards that wouldn't take it step back a little. The one it comes from stays as it is.
    const shownNodes = useMemo(
        () =>
            nodes.map((node) => {
                const dim = pullState && node.id !== pullState.from && !pullState.accepts.has(node.id)
                const className = cn(dim && 'nest-drop-dim', sinceCards.has(node.id) && 'nest-since')
                return className ? { ...node, className } : node
            }),
        [nodes, pullState, sinceCards]
    )

    const actions = useMemo<NestBoardActions>(
        () => ({
            openId,
            openRunId,
            setOpen: open,
            focusId,
            inputsOf: (cardId) =>
                board.lines.flatMap((line) => {
                    const source = line.to === cardId ? board.cards.find((card) => card.id === line.from) : undefined
                    return source ? [{ line, source }] : []
                }),
            inputCandidates: (cardId) => inputCandidates(board, cardId),
            pullOut: (cardId) => {
                const source = flow.getNode(cardId)
                if (!source) return
                dropEmptyDrafts()
                const picked = pickedOf(selection, cardId)
                setSelection(null)
                void add(besideSpot(rectOf(source), rects()), { from: cardId, picked, auto: true })
            },
            remove: (cardId) => {
                setDraftText(cardId, '')
                if (openId === cardId) open(null)
                void api.deleteCard(cardId)
            },
            selection,
            clearSelection: () => setSelection(null),
            // Against the selection as it is when the pick lands, so presses that waited, such as for a file's whole table,
            // each count, in order.
            pick: (cardId, text, table, index, mode) =>
                setSelection((current) => {
                    const same = current?.cardId === cardId && current.text === text
                    const next = pickRows(same ? current.rows : [], same ? current.anchor : null, index, mode)
                    return next.rows.length > 0 ? { cardId, text, table, ...next } : null
                }),
            waitingOn: (cardId) =>
                board.cards.filter((card) => card.plan?.state === 'armed' && card.plan.waits && board.lines.some((line) => line.from === cardId && line.to === card.id)),
            forEachFrom: (cardId) => board.cards.filter((card) => card.each && board.lines.some((line) => line.from === cardId && line.to === card.id)),
            away: (cardId) => away.has(cardId),
            replanning: !!planning && pending,
            resizeStart: (cardId) => {
                resizing.current = cardId
                const node = flow.getNode(cardId)
                resizeFrom.current = node ? { id: cardId, rect: rectOf(node) } : null
            },
            // Kept on the card at once, so nothing puts it back before main says so. It's the size the card stopped at,
            // which is less than where the corner was let go if another card was in the way.
            resizeEnd: (cardId, wanted) => {
                const node = flow.getNode(cardId)
                const size = { width: node?.width ?? wanted.width, height: node?.height ?? wanted.height }
                resizing.current = null
                setNodes((current) => current.map((each) => (each.id === cardId ? { ...each, ...size, data: { card: { ...each.data.card, size } } } : each)))
                void api.resizeCard(cardId, Math.round(size.width), Math.round(size.height))
            },
            watchPage,
            pull: pullState,
            dropProblem,
            selectedLine,
            removeLine
        }),
        [openId, openRunId, open, focusId, board, rects, flow, add, api, dropEmptyDrafts, selection, away, planning, pending, watchPage, pullState, dropProblem, selectedLine, removeLine]
    )

    // A line pulled out to an empty spot leaves a new card there. A click on the handle never gets here: it's under the
    // drag threshold, so the handle's own click puts the card beside it instead.
    const connectEnd = useCallback(
        (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
            const from = pulling.current ?? state.fromNode?.id
            pulling.current = null
            setPull(null)
            if (!from || state.isValid) return
            const point = 'changedTouches' in event ? event.changedTouches[0] : event
            const picked = pickedOf(selection, from)
            // Let go on a card, it's one more input there, or the card says why it can't be.
            const onCard = cardAt(point.clientX, point.clientY)
            if (onCard) {
                if (onCard === from) return
                setSelection(null)
                void api.addInput(onCard, from, picked).then((result) => setDropProblem(result.ok ? null : { cardId: onCard, text: result.error }))
                return
            }
            const at = flow.screenToFlowPosition({ x: point.clientX, y: point.clientY })
            dropEmptyDrafts()
            setSelection(null)
            void add({ x: at.x, y: at.y - DROP_ABOVE }, { from, picked })
        },
        [flow, add, dropEmptyDrafts, selection, api, cardAt]
    )

    const paneClick = useCallback(
        (event: React.MouseEvent) => {
            // A click away from an open card or selected rows only closes or clears them.
            if (clearedByPress.current) {
                clearedByPress.current = false
                return
            }
            // A click on the board closes the drawer, or lets selected cards go, which React Flow has just done, and
            // nothing else.
            if (drawerOpen) return closeDrawer(false)
            if (selectedLine) return setSelectedLine(null)
            if (openId) return open(null)
            if (sectionId) return setSectionId(null)
            if (nodes.some((node) => node.selected)) return
            const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
            dropEmptyDrafts()
            void add({ x: at.x - 32, y: at.y - 24 })
        },
        [openId, open, flow, add, dropEmptyDrafts, drawerOpen, closeDrawer, nodes, selectedLine, sectionId]
    )

    // `/` while the board has the keyboard and no field does opens the drawer, or brings the tucked composer back. Esc
    // closes the drawer, and with it closed lets selected cards go.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const element = wrapper.current
            if (!element || event.defaultPrevented || element.offsetParent === null) return
            const active = document.activeElement
            if (active && active !== document.body && !element.contains(active)) return
            const typing = active instanceof HTMLElement && (active.isContentEditable || active.matches('input, textarea, select'))
            if (event.key === 'Escape') {
                if (drawerOpen) {
                    event.preventDefault()
                    closeDrawer(true)
                } else if ((!typing || active.closest('[data-nest-composer]')) && nodes.some((node) => node.selected)) clearCards()
                return
            }
            if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || typing) return
            event.preventDefault()
            if (tuckedNow.current) tuck(false)
            else openDrawer()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [drawerOpen, closeDrawer, openDrawer, tuck, nodes, clearCards])

    // One of Berry's answers as a note's card, in the first free place near the top of what's in sight. Main reads the
    // answer itself, by its message's id.
    const putOnBoard = async (messageId: number): Promise<string | null> => {
        const box = wrapper.current?.getBoundingClientRect()
        if (!box) return 'The board isn’t there any more.'
        const { zoom } = flow.getViewport()
        const at = flow.screenToFlowPosition({ x: box.left + box.width / 2 - (CARD_WIDTH * zoom) / 2, y: box.top + EDGE_INSET.y })
        const result = await api.putOnBoard(board.id, messageId, { at, taken: rects() })
        return result.ok ? null : result.error
    }

    // A press on a section's name selects it and every card in it, so the composer asks about them alone. A press on the
    // name of the one selected renames it.
    const selectSection = (rect: Rect & { id: string }) => {
        const inside = new Set(inSectionNow(rect))
        setSectionId(rect.id)
        setNodes((current) => current.map((node) => (!!node.selected === inside.has(node.id) ? node : { ...node, selected: inside.has(node.id) })))
    }
    const pressSectionName = (id: string) => {
        const pressed = board.sections.find((each) => each.id === id)
        if (!pressed) return
        if (id === sectionId) return setRenamingId(id)
        selectSection(pressed)
    }
    const sectionInside = (id: string): SectionMove => {
        const pressed = board.sections.find((each) => each.id === id)
        if (!pressed) return { cards: [], sections: [] }
        const inside = new Set(inSectionNow(pressed))
        return {
            cards: nodes.filter((node) => inside.has(node.id)).map((node) => ({ id: node.id, ...node.position })),
            sections: board.sections.filter((each) => sectionsIn(pressed, board.sections).includes(each.id)).map(({ id: inner, x, y }) => ({ id: inner, x, y }))
        }
    }
    // Cards carried by a section count as dragged while it moves, so nothing settles them meanwhile, and as moved by hand
    // once it's let go, as main keeps them.
    const moveWithSection = (moves: { id: string; x: number; y: number }[], done: boolean) => {
        const to = new Map(moves.map((move) => [move.id, move]))
        setNodes((current) =>
            current.map((node) => {
                const move = to.get(node.id)
                if (!move) return node
                return { ...node, position: { x: move.x, y: move.y }, dragging: !done, ...(done ? { data: { card: { ...node.data.card, autoPlaced: false } } } : {}) }
            })
        )
    }
    // A new section, drawn or fitted around cards, is selected with the cards in it and its name ready to type. Never
    // under an open card.
    const makeSection = async (rect: Rect) => {
        open(null)
        const made = await api.addSection(board.id, rect)
        if (!made) return setProblem('That section couldn’t be made.')
        selectSection(made)
        setRenamingId(made.id)
    }
    const toggleDrawing = () => {
        if (!drawing) open(null)
        setDrawing(!drawing)
    }
    const drawingToggle = useRef(toggleDrawing)
    drawingToggle.current = toggleDrawing
    const group = () => {
        const around = fitSection(nodes.filter((node) => node.selected).map(rectOf))
        if (around) void makeSection(around)
    }
    const grouping = useRef(group)
    grouping.current = group
    useEffect(() => api.onGroup(() => grouping.current()), [api])
    // S puts the section tool on or away, and with a section selected, ⌫ deletes it, never its cards, and Esc lets it go.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const element = wrapper.current
            if (!element || event.defaultPrevented || element.offsetParent === null || event.metaKey || event.ctrlKey || event.altKey) return
            const active = document.activeElement
            if (active && active !== document.body && !element.contains(active)) return
            if (active instanceof HTMLElement && (active.isContentEditable || active.matches('input, textarea, select'))) return
            if (event.key === 's' || event.key === 'S') {
                event.preventDefault()
                drawingToggle.current()
            } else if (sectionId && (event.key === 'Backspace' || event.key === 'Delete') && !active?.closest('.react-flow__node, .react-flow__edge')) {
                event.preventDefault()
                setSectionId(null)
                void api.deleteSection(sectionId)
            } else if (sectionId && event.key === 'Escape') setSectionId(null)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [api, sectionId])

    // From the keyboard, Tab goes from card to card. On a card itself, Enter opens it and ⌫ deletes it, asking first as
    // the × does.
    const onKeyDown = (event: React.KeyboardEvent) => {
        const target = event.target as HTMLElement
        // A line pressed or reached from the keyboard: Delete takes it away, and Escape lets it go.
        const lineId = target.closest<SVGElement>('.react-flow__edge')?.dataset.id
        if (lineId && (event.key === 'Backspace' || event.key === 'Delete')) {
            event.preventDefault()
            if (edges.some((edge) => edge.id === lineId && edge.data?.removable)) removeLine(lineId)
            return
        }
        if (lineId && event.key === 'Escape') return setSelectedLine(null)
        const node = target.closest<HTMLElement>('.react-flow__node')
        if (!node || target !== node) return
        const cardId = node.dataset.id
        if (!cardId) return
        if (event.key === 'Enter') {
            event.preventDefault()
            const card = board.cards.find((each) => each.id === cardId)
            if (card?.page) void api.goToTab(cardId)
            else if (card?.chatId || card?.each || card?.versions || (card?.file && card.file.type !== 'application/pdf')) open(openId === cardId ? null : cardId)
            else node.querySelector<HTMLElement>('textarea')?.focus()
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault()
            actions.remove(cardId)
        }
    }

    // The composer at the bottom goes to Berry first, which starts one card in the first free place in sight, lays out a
    // plan from there, or asks. If it can't go, the words come back.
    const talking = board.talk.find((request) => request.open)
    // Where a new plan will land, while Berry makes it: in sight, as main places it.
    const [ghostsAt, setGhostsAt] = useState<{ x: number; y: number } | null>(null)
    useEffect(() => {
        if (!planning) setGhostsAt(null)
    }, [planning])
    // What's attached here goes with the request: to its one card, or to the cards Berry's plan gives it to. A table from a
    // file is a card of its own, in the first free place in sight.
    const attaching = useAttaching(planning ? null : { nestId: board.id })
    const addTable = async () => {
        const box = wrapper.current?.getBoundingClientRect()
        if (!box) return
        setProblem(null)
        open(null)
        const at = flow.screenToFlowPosition({ x: box.left + EDGE_INSET.x, y: box.top + EDGE_INSET.y })
        const result = await api.addTableFile(board.id, { at, taken: rects() })
        if (!result.ok) setProblem(result.error)
    }
    const addItems = attaching.items && [...attaching.items, { label: 'Add a table from a file', icon: <Table2 />, onSelect: () => void addTable() }]

    // Files dropped anywhere on the board, each a card of its own where it was let go, or a table card for a CSV. The
    // chrome only reads what was dropped and hands main the bytes, never a path, and main checks each as + does.
    const [dropping, setDropping] = useState(false)
    const dragDepth = useRef(0)
    // A link, from a page or another app, as a list of addresses or one plain one. Files come first, since a dragged file
    // can carry its address too.
    const hasFiles = (event: React.DragEvent) => event.dataTransfer.types.includes('Files')
    const hasLink = (event: React.DragEvent) => !hasFiles(event) && (event.dataTransfer.types.includes('text/uri-list') || event.dataTransfer.types.includes('text/plain'))
    const droppable = (event: React.DragEvent) => hasFiles(event) || hasLink(event)
    const dropPage = async (at: { x: number; y: number }, page: Parameters<typeof api.dropPage>[1]) => {
        setProblem(null)
        open(null)
        const result = await api.dropPage(board.id, page, { at: { x: at.x - 32, y: at.y - 24 }, taken: rects() })
        if (!result.ok) setProblem(result.error)
        else setFocusId(result.cardId)
    }
    const dropLink = (event: React.DragEvent) => {
        event.preventDefault()
        dragDepth.current = 0
        setDropping(false)
        const url = droppedAddress({ uriList: event.dataTransfer.getData('text/uri-list'), text: event.dataTransfer.getData('text/plain') })
        if (!url) return setProblem('Only a link to a web page can go on the board.')
        void dropPage(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }), { url, title: linkWords(event.dataTransfer.getData('text/html'), url) })
    }
    // A tab dragged out of the sidebar or the tab row and let go over the board. Main reads the tab's own address.
    useEffect(() => {
        const element = wrapper.current
        if (!element) return undefined
        const onTab = (event: Event) => {
            const { tabId, x, y } = (event as CustomEvent<{ tabId: string; x: number; y: number }>).detail
            void dropPage(flow.screenToFlowPosition({ x, y }), { tabId })
        }
        element.addEventListener(TAB_DROP_EVENT, onTab)
        return () => element.removeEventListener(TAB_DROP_EVENT, onTab)
    })
    const dropFiles = async (event: React.DragEvent) => {
        if (hasLink(event)) return dropLink(event)
        if (!hasFiles(event)) return
        event.preventDefault()
        dragDepth.current = 0
        setDropping(false)
        const files = [...event.dataTransfer.files]
        if (files.length === 0) return
        setProblem(null)
        open(null)
        const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
        const taken = rects()
        const problems: string[] = []
        for (const file of files.slice(0, MAX_DROPPED)) {
            let bytes: Uint8Array | null = null
            try {
                bytes = file.size <= MAX_DROP_READ ? new Uint8Array(await file.arrayBuffer()) : null
            } catch {
                problems.push(`${file.name} couldn’t be read.`)
                continue
            }
            const result = await api.dropFile(board.id, { name: file.name, size: file.size, bytes }, { at: { x: at.x - 32, y: at.y - 24 }, taken })
            if (!result.ok) problems.push(result.error)
        }
        if (files.length > MAX_DROPPED) problems.push(`Drop ${MAX_DROPPED} files at a time at most. The first ${MAX_DROPPED} were added.`)
        if (problems.length > 0) setProblem(problems.join(' '))
    }
    const sendNew = async () => {
        const text = prompt.trim()
        const box = wrapper.current?.getBoundingClientRect()
        if (!text || !box || planning) return
        const at = flow.screenToFlowPosition({ x: box.left + EDGE_INSET.x, y: box.top + EDGE_INSET.y })
        setPrompt('')
        setProblem(null)
        open(null)
        dropEmptyDrafts()
        const taken = rects()
        if (!pending) setGhostsAt(freeSpot(taken, at, { width: CARD_WIDTH * 2 + CARD_GAP, height: PLANNED_HEIGHT }))
        const result = await api.ask(board.id, text, { mascotId: chosen.id === BERRY_ID ? null : chosen.id, at, taken, ...(selectedCards.length > 0 ? { about: selectedCards } : {}) })
        if (!result.ok) {
            setPrompt(text)
            setProblem(result.error)
        }
        setFocusId(null)
    }

    return (
        <NestBoardContext.Provider value={actions}>
            <div
                ref={wrapper}
                data-tab-drop
                className={cn("relative flex-1 min-h-0", dropping && "after:pointer-events-none after:absolute after:inset-2 after:rounded-panel after:border-2 after:border-dashed after:border-accent-ink/50")}
                onKeyDown={onKeyDown}
                onPointerDownCapture={(event) => {
                    const target = event.target as Element
                    if (target.closest('.react-flow__node')) setSectionId(null)
                    selectGesture.current =
                        (event.shiftKey || event.metaKey || event.ctrlKey) &&
                        (target.classList.contains('react-flow__pane') || (!!target.closest('.nest-drag') && !target.closest('button, a, input, textarea')))
                }}
                onKeyDownCapture={(event) => {
                    selectGesture.current = false
                    // Arrow keys never move a selected card, which nothing would save.
                    if (event.key.startsWith('Arrow') && (event.target as Element).classList.contains('react-flow__node')) event.stopPropagation()
                }}
                onFocus={(event) => {
                    const lineId = (event.target as Element).closest<SVGElement>('.react-flow__edge')?.dataset.id
                    if (lineId && edges.some((edge) => edge.id === lineId && (edge.data?.removable || edge.data?.reads))) setSelectedLine(lineId)
                }}
                onDragEnter={(event) => {
                    if (!droppable(event)) return
                    dragDepth.current++
                    setDropping(true)
                }}
                onDragOver={(event) => {
                    if (!droppable(event)) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                }}
                onDragLeave={(event) => {
                    if (!droppable(event)) return
                    dragDepth.current = Math.max(0, dragDepth.current - 1)
                    if (dragDepth.current === 0) setDropping(false)
                }}
                onDrop={(event) => void dropFiles(event)}
            >
                <ReactFlow<CardNode, LineEdge>
                    nodes={shownNodes}
                    edges={edges}
                    nodeTypes={NODE_TYPES}
                    edgeTypes={EDGE_TYPES}
                    onNodesChange={(changes: NodeChange<CardNode>[]) =>
                        setNodes((current) =>
                            applyNodeChanges(
                                changes.filter((change) => change.type !== 'select' || !change.selected || selectGesture.current).map((change) => stopAtNeighbours(change, current)),
                                current
                            )
                        )
                    }
                    onNodeDragStart={() => drawerOpen && closeDrawer(false)}
                    onNodeDragStop={(_, _node, dragged) => {
                        // Moved by hand, it stays where it's left, even before main says so. Selected cards move together.
                        const moved = new Set(dragged.map((each) => each.id))
                        setNodes((current) => current.map((each) => (moved.has(each.id) ? { ...each, data: { card: { ...each.data.card, autoPlaced: false } } } : each)))
                        dragged.forEach((each) => void api.moveCard(each.id, each.position.x, each.position.y))
                    }}
                    onConnectStart={(_, { nodeId }) => {
                        pulling.current = nodeId
                        if (drawerOpen) closeDrawer(false)
                        setDropProblem(null)
                        setSelectedLine(null)
                        if (nodeId) setPull({ from: nodeId, over: null })
                    }}
                    onEdgeClick={(_, edge) => setSelectedLine(edge.data?.removable || edge.data?.reads ? edge.id : null)}
                    onConnectEnd={connectEnd}
                    connectionLineComponent={PullingLine}
                    connectionDragThreshold={6}
                    connectOnClick={false}
                    onPaneClick={paneClick}
                    onMove={(_, viewport) => lastViewport.set(board.id, viewport)}
                    colorMode={theme.isDark ? 'dark' : 'light'}
                    defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                    minZoom={ZOOM.min}
                    maxZoom={ZOOM.max}
                    zoomOnScroll={false}
                    zoomOnPinch
                    zoomOnDoubleClick={false}
                    panOnScroll
                    elementsSelectable
                    selectNodesOnDrag={false}
                    elevateNodesOnSelect={false}
                    deleteKeyCode={null}
                    selectionKeyCode="Shift"
                    selectionMode={SelectionMode.Partial}
                    multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
                    ariaLabelConfig={CARD_KEYS}
                    autoPanOnNodeFocus
                    proOptions={{ hideAttribution: true }}
                    className="nest-board"
                >
                    <Background variant={BackgroundVariant.Dots} gap={DOTS.gap} size={DOTS.size} className="text-muted-foreground/40" color="currentColor" />
                    <ViewportPortal>
                        {board.sections.length > 0 && (
                            <SectionLayer
                                sections={board.sections}
                                selectedId={sectionId}
                                renamingId={renamingId}
                                onPressName={pressSectionName}
                                onRenaming={setRenamingId}
                                inside={sectionInside}
                                moveCards={moveWithSection}
                            />
                        )}
                        <OpenDim
                            shown={!!openId}
                            onClose={() => {
                                clearedByPress.current = false
                                open(null)
                            }}
                        />
                        {ghostsAt && planning && <PlanGhosts at={ghostsAt} />}
                        {flights.map((flight) => (
                            <FlightView key={flight.id} flight={flight} onLanded={landed} onDone={doneFlying} />
                        ))}
                    </ViewportPortal>
                </ReactFlow>
                {drawing && (
                    <SectionDraw
                        onDrawn={(rect) => {
                            setDrawing(false)
                            void makeSection(rect)
                        }}
                        onCancel={() => setDrawing(false)}
                    />
                )}
                {board.cards.length > 0 ? (
                    <ZoomControls onFit={fit} onActualSize={() => void flow.zoomTo(1, MOVE)}>
                        <SectionTools drawing={drawing} onDraw={toggleDrawing} canGroup={nodes.some((node) => node.selected)} onGroup={group} />
                    </ZoomControls>
                ) : (
                    <div className="absolute top-3 right-4 flex items-center gap-1">
                        <SectionTools drawing={drawing} onDraw={toggleDrawing} canGroup={false} onGroup={group} />
                    </div>
                )}
                {board.cards.length === 0 && !planning && board.talk.length === 0 && (
                    <div className="pointer-events-none absolute inset-x-0 top-[38%] px-4 flex flex-col items-center gap-4">
                        <p className="text-center text-14 text-muted-foreground">
                            Each card is one bird’s chat. Write below to start one, or click anywhere on the board.
                        </p>
                        <div role="group" aria-label="Start from" className="pointer-events-auto flex flex-wrap justify-center gap-2">
                            {NEST_STARTERS.map((starter) => (
                                <Button key={starter.label} variant="outline" size="sm" onClick={() => fillComposer(starter.text, firstBlank(starter.text))}>
                                    {starter.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}
                <NestComposer
                    nestId={board.id}
                    talk={board.talk}
                    planning={planning}
                    problem={problem}
                    tucked={tucked}
                    onTuck={tuck}
                    open={drawerOpen}
                    onOpen={openDrawer}
                    onClose={() => closeDrawer(true)}
                    onPutOnBoard={putOnBoard}
                    since={board.since ?? null}
                    onSinceShown={uncover}
                >
                    <Composer
                        label="Ask in this Nest"
                        placeholder={pending ? 'Change the plan, or press Run' : talking ? `Reply to ${berryName}` : `Ask ${chosenName}, or ask for a plan`}
                        value={prompt}
                        onChange={setPrompt}
                        focusKey={composerFocus.key}
                        focusRange={composerFocus.range}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault()
                                void sendNew()
                            }
                        }}
                        addItems={addItems}
                        addLabel="Add a file or note"
                        menuUp
                        attachment={
                            <>
                                {selectedCards.length > 0 && (
                                    <div className="px-1 pb-1">
                                        <AboutChip
                                            count={selectedCards.length}
                                            name={aboutSection}
                                            onClear={() => {
                                                clearCards()
                                                setSectionId(null)
                                            }}
                                        />
                                    </div>
                                )}
                                <Attachments attachments={board.attached} target={planning ? null : { nestId: board.id }} attaching={attaching} className="px-1 pb-1" />
                            </>
                        }
                        canSend={prompt.trim() !== '' && !planning}
                        onSend={() => void sendNew()}
                        mascot={chosen}
                        onChooseMascot={choose}
                    />
                </NestComposer>
            </div>
        </NestBoardContext.Provider>
    )
}

// Where a new plan's cards will land, while Berry makes it: two plain outlines with a grey sweep along them, replaced
// by the real cards when the plan comes. No made-up lines of text: Berry hasn't said anything yet.
export const PlanGhosts: React.FC<{ at: { x: number; y: number } }> = ({ at }) => (
    <div aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
        <div className="animate-fade-in">
        {[0, 1].map((index) => (
            <div
                key={index}
                data-plan-ghost
                className="absolute rounded-panel bg-surface/40"
                style={{ left: index * (CARD_WIDTH + CARD_GAP), width: CARD_WIDTH, height: PLANNED_HEIGHT }}
            >
                <GhostSweep delay={index * 160} />
            </div>
        ))}
        </div>
    </div>
)

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
                <TitleField nestId={board.id} title={board.title} naming={!!board.naming} />
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
