import type { ChatThread, NestRun } from '@shared/library'
import { CARD_HEIGHT, type Rect } from '@shared/nestPlace'

export { besideSpot, CARD_GAP, CARD_HEIGHT, CARD_SIZE, CARD_WIDTH, freeSpot, roomToGrow, settle, type Nudge, type PlacedCard, type Rect } from '@shared/nestPlace'

// What the board remembers of each card's measured height: the last one while closed, and the one while open.
export interface CardHeights {
    closed: Map<string, number>
    open: Map<string, number>
}

// The height a card counts as when the board settles cards. An open card floats over the others, so it counts at its
// last closed height, and so does one just closed until it's measured again, since until then its measurement is still
// the open one. Remembers what it's given.
export const settleHeight = (heights: CardHeights, id: string, measured: number, isOpen: boolean): number => {
    if (isOpen) heights.open.set(id, measured)
    else if (heights.open.get(id) !== measured) {
        heights.open.delete(id)
        heights.closed.set(id, measured)
    }
    return heights.closed.get(id) ?? (heights.open.has(id) ? CARD_HEIGHT : measured)
}

export type CardTone = 'muted' | 'working' | 'done' | 'failed'

// What a sent card says beside its bird's name. The words match a chat's and a routine's, so a card reads like either.
export const cardStatus = (thread: Pick<ChatThread, 'partial' | 'approval' | 'error' | 'messages'>): { text: string; tone: CardTone } => {
    if (thread.partial !== null) {
        if (thread.approval?.handoff) return { text: 'Waiting for you', tone: 'working' }
        if (thread.approval?.question) return { text: 'Has a question', tone: 'working' }
        if (thread.approval) return { text: 'Needs your OK', tone: 'working' }
        return { text: 'Working', tone: 'working' }
    }
    if (thread.error) return { text: 'Didn’t finish', tone: 'failed' }
    const last = thread.messages.at(-1)
    if (last?.role === 'assistant' && last.steps?.at(-1)?.text === 'Stopped here') return { text: 'Stopped', tone: 'muted' }
    if (last?.role === 'assistant') return { text: 'Done', tone: 'done' }
    return { text: 'Not answered', tone: 'muted' }
}

// What a closed card shows: the answer being written, or else the newest one with words since the user last wrote, by
// the same rule as `latestAnswer` in main, so a card never shows an older answer as its latest. Only ever drawn: what
// goes to another card is read in main.
export const latestReply = (thread: Pick<ChatThread, 'partial' | 'messages'>): string | null =>
    thread.partial ||
    (thread.messages
        .slice(thread.messages.findLastIndex((message) => message.role === 'user') + 1)
        .findLast((message) => message.role === 'assistant' && message.content.trim() !== '')?.content ??
        null)

// "Scout is working", "Scout and Writer are working", "Scout, Writer and Berry are working".
export const workingLine = (names: readonly string[]): string | null => {
    if (names.length === 0) return null
    if (names.length === 1) return `${names[0]} is working`
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)} are working`
}

// Picks rows in a card's table: a plain click picks only that row, or none if it was the only one, Cmd adds or takes
// one away, and Shift picks every row from the last one clicked.
export const pickRows = (rows: readonly number[], anchor: number | null, index: number, mode: 'one' | 'range' | 'toggle'): { rows: number[]; anchor: number } => {
    if (mode === 'range' && anchor !== null) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor]
        return { rows: Array.from({ length: to - from + 1 }, (_, offset) => from + offset), anchor }
    }
    if (mode === 'toggle') return { rows: rows.includes(index) ? rows.filter((row) => row !== index) : [...rows, index].sort((a, b) => a - b), anchor: index }
    return { rows: rows.length === 1 && rows[0] === index ? [] : [index], anchor: index }
}

export type RunPhase = 'waiting' | 'working' | 'done' | 'failed' | 'stopped' | 'not-started'

// Where one run of For each row is, from its state on the card, its chat, and whether its value is still being written.
export const runPhase = (run: Pick<NestRun, 'state' | 'filling'>, thread: Pick<ChatThread, 'partial' | 'approval' | 'error' | 'messages'> | undefined): RunPhase => {
    if (run.state === 'waiting') return 'waiting'
    if (run.state === 'stopped') return 'not-started'
    if (run.state === 'failed') return 'failed'
    // Its value is still being written from its answer, so its row isn't done yet.
    if (!thread || thread.partial !== null || run.filling) return 'working'
    const { tone, text } = cardStatus(thread)
    if (tone === 'done') return 'done'
    if (tone === 'failed') return 'failed'
    return text === 'Working' ? 'working' : 'stopped'
}

// What a For-each card says beside its bird's name: how many runs have ended while any is going, then how it went.
export const forEachStatus = (phases: readonly RunPhase[]): { text: string; tone: CardTone } => {
    const ended = phases.filter((phase) => phase !== 'waiting' && phase !== 'working').length
    if (ended < phases.length) return { text: `${ended} of ${phases.length}`, tone: 'working' }
    const failed = phases.filter((phase) => phase === 'failed').length
    if (phases.some((phase) => phase === 'stopped' || phase === 'not-started')) return { text: 'Stopped', tone: 'muted' }
    if (failed > 0) return { text: failed === phases.length ? 'Didn’t finish' : `${failed} didn’t finish`, tone: 'failed' }
    return { text: 'Done', tone: 'done' }
}

// Where the board is looked at from: React Flow's pan, in screen pixels, and its zoom.
export interface Viewport {
    x: number
    y: number
    zoom: number
}

// Room kept clear around what the board shows: birds stand above a card, and the composer floats at the bottom.
export interface Insets {
    top: number
    right: number
    bottom: number
    left: number
}

// How far the board zooms out, to see a big Nest whole, and in, to read a small card.
export const ZOOM = { min: 0.25, max: 1.5 }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const union = (rects: readonly Rect[]): Rect => {
    const left = Math.min(...rects.map((rect) => rect.x))
    const top = Math.min(...rects.map((rect) => rect.y))
    const right = Math.max(...rects.map((rect) => rect.x + rect.width))
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
    return { x: left, y: top, width: right - left, height: bottom - top }
}

// Fit to screen: every card in the room left by `insets`, never closer than 100%, and centred. Too tall even at the
// smallest zoom, it shows the top. Null with no cards.
export const fitViewport = (rects: readonly Rect[], box: { width: number; height: number }, insets: Insets, max = 1): Viewport | null => {
    if (rects.length === 0) return null
    const all = union(rects)
    const room = { width: Math.max(1, box.width - insets.left - insets.right), height: Math.max(1, box.height - insets.top - insets.bottom) }
    const zoom = clamp(Math.min(room.width / all.width, room.height / all.height), ZOOM.min, max)
    const spare = { x: room.width - all.width * zoom, y: room.height - all.height * zoom }
    return {
        x: insets.left + Math.max(0, spare.x / 2) - all.x * zoom,
        y: insets.top + Math.max(0, spare.y / 2) - all.y * zoom,
        zoom
    }
}

// The smallest move that brings cards into view at the zoom they're seen at, the top left first when they can't all
// show, or a fit when they're too big for the screen. Null when they're in view already.
export const showViewport = (rects: readonly Rect[], viewport: Viewport, box: { width: number; height: number }, insets: Insets): Viewport | null => {
    if (rects.length === 0) return null
    const all = union(rects)
    const { zoom } = viewport
    const room = { width: box.width - insets.left - insets.right, height: box.height - insets.top - insets.bottom }
    // More than one card, too big to show together: fit them, though never closer than now.
    if (rects.length > 1 && (all.width * zoom > room.width || all.height * zoom > room.height)) return fitViewport(rects, box, insets, zoom)
    const left = all.x * zoom + viewport.x
    const top = all.y * zoom + viewport.y
    const right = left + all.width * zoom
    const bottom = top + all.height * zoom
    let dx = right > box.width - insets.right ? box.width - insets.right - right : 0
    if (left + dx < insets.left) dx = insets.left - left
    let dy = bottom > box.height - insets.bottom ? box.height - insets.bottom - bottom : 0
    if (top + dy < insets.top) dy = insets.top - top
    return dx === 0 && dy === 0 ? null : { x: viewport.x + dx, y: viewport.y + dy, zoom }
}

// How far the board moves up so no card sits under the composer's peek, the cards and the peek on screen in the board's
// own pixels. Only when that clears every card under it and lifts neither their tops nor any other that shows below `top`
// past it, so a tall card, or a board with no room above, stays where it is. 0 when nothing's under it.
export const clearOfPeek = (cards: readonly Rect[], peek: Rect, top: number, gap = 12): number => {
    const under = cards.filter((card) => card.x < peek.x + peek.width && card.x + card.width > peek.x && card.y < peek.y + peek.height && card.y + card.height > peek.y - gap)
    if (under.length === 0) return 0
    const move = peek.y - gap - Math.max(...under.map((card) => card.y + card.height))
    const tops = cards.filter((card) => under.includes(card) || (card.y >= top && card.y < peek.y + peek.height)).map((card) => card.y)
    return Math.min(...tops) + move >= top ? move : 0
}

// What a hand-off along a line shows: the bird flying it, a short fade with reduced motion or Keep Berry still, or
// nothing where nobody would see it or the birds are hidden. It's only ever drawn, after the job has started.
export type FlightMode = 'fly' | 'fade' | 'none'

export const flightMode = ({ showBerry, still, reducedMotion, onScreen }: { showBerry: boolean; still: boolean; reducedMotion: boolean; onScreen: boolean }): FlightMode =>
    !showBerry || !onScreen ? 'none' : still || reducedMotion ? 'fade' : 'fly'

export interface FlightPoint {
    x: number
    y: number
    // How far along the flight, from 0 to 1, by distance.
    offset: number
}

// Where a card's bird stands and lines meet it, as `NestCard` draws them.
export const PERCH = { left: 20, size: 44, feet: 113 / 120, lineAt: 60 }

// The bird's path, as the top left of its drawing in board coordinates: up off the source card's top edge, along it to
// where the line leaves, along the line, and onto the target card's top edge, on its perch when it's the same bird, or
// beside the bird already there. Offsets go by distance, so it keeps one speed.
export const flightPath = (from: Rect, to: Rect, sameBird: boolean): FlightPoint[] => {
    const { left, size, feet, lineAt } = PERCH
    const lift = size * feet
    const start = { x: from.x + left, y: from.y - lift }
    const land = { x: to.x + left + (sameBird ? 0 : size + 12), y: to.y - lift }
    // The line, as `LineView` draws it: out of the right edge, into the left, level with each card's first lines.
    const out = { x: from.x + from.width, y: from.y + lineAt - lift }
    const into = { x: to.x, y: to.y + lineAt - lift }
    const bend = Math.max(Math.abs(into.x - out.x) * 0.5, 40)
    const along = (t: number) => {
        const u = 1 - t
        return {
            x: u ** 3 * out.x + 3 * u * u * t * (out.x + bend) + 3 * u * t * t * (into.x - bend) + t ** 3 * into.x,
            y: u ** 3 * out.y + 3 * u * u * t * out.y + 3 * u * t * t * into.y + t ** 3 * into.y
        }
    }
    const takeOff = { x: from.x + from.width - size * 1.5, y: from.y - lift - 16 }
    const raw = [start, takeOff, ...Array.from({ length: 13 }, (_, index) => along(index / 12)), land]
    const lengths = raw.map((point, index) => (index === 0 ? 0 : Math.hypot(point.x - raw[index - 1].x, point.y - raw[index - 1].y)))
    const total = lengths.reduce((sum, length) => sum + length, 0) || 1
    let run = 0
    return raw.map((point, index) => {
        run += lengths[index]
        return { x: point.x, y: point.y, offset: index === raw.length - 1 ? 1 : run / total }
    })
}

// Long enough to follow, never a show: 600ms for a short hop, up to 900ms across the board.
export const flightDuration = (path: readonly FlightPoint[]): number => {
    const length = path.reduce((sum, point, index) => (index === 0 ? 0 : sum + Math.hypot(point.x - path[index - 1].x, point.y - path[index - 1].y)), 0)
    return Math.round(clamp(600 + length * 0.25, 600, 900))
}

// How many HTML cards run their page at once. Each is a page of its own, with its scripts going, so the rest wait.
export const MAX_LIVE_PAGES = 4

// Which HTML cards run their page: the open one always, then those on screen, the most recently shown first, up to the
// cap. `shown` is in the order they came on screen or were asked for, the latest last.
export const livePages = (shown: readonly string[], openId: string | null, max = MAX_LIVE_PAGES): Set<string> => {
    const live = new Set<string>(openId && shown.includes(openId) ? [openId] : [])
    for (let index = shown.length - 1; index >= 0 && live.size < max; index--) live.add(shown[index])
    return live
}
