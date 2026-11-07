import type { ChatThread, NestRun } from '@shared/library'

export { besideSpot, CARD_GAP, CARD_HEIGHT, CARD_WIDTH, freeSpot, type Rect } from '@shared/nestPlace'

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

// What a closed card shows: the answer being written, or else the newest one with words. Only ever drawn: what goes to
// another card is read in main.
export const latestReply = (thread: Pick<ChatThread, 'partial' | 'messages'>): string | null =>
    thread.partial || (thread.messages.findLast((message) => message.role === 'assistant' && message.content.trim() !== '')?.content ?? null)

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

// Where one run of For each row is, from its state on the card and its chat.
export const runPhase = (run: Pick<NestRun, 'state'>, thread: Pick<ChatThread, 'partial' | 'approval' | 'error' | 'messages'> | undefined): RunPhase => {
    if (run.state === 'waiting') return 'waiting'
    if (run.state === 'stopped') return 'not-started'
    if (run.state === 'failed') return 'failed'
    if (!thread || thread.partial !== null) return 'working'
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
