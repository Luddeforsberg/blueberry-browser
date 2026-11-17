import type { RecordedChange, RecordedDraft, Routine, RoutineDraft, RoutineSchedule } from '@shared/library'
import { routinesParam, type RoutinePart, type RoutinePlace } from '@shared/routinePlaces'
import { withSiteNames } from './siteNames'

export interface RoutineFormValues {
    // Null for a new routine.
    id: string | null
    // Never asked for while making one. Empty means main names it from what it does, or keeps the name it has.
    name: string
    instructions: string
    kind: RoutineSchedule['kind']
    time: string
    date: string
    days: number[]
    day: number
    // Who runs it. Null is Berry.
    mascotId: string | null
    // Only these sites, or anywhere. The sites are kept while it's anywhere, so turning it back on finds them.
    onlySomeSites: boolean
    // Each as the user added it. Main checks them again when it's saved.
    sites: string[]
    // Runs on its schedule in the cloud, even with the Mac off. Only offered with a runner linked.
    inCloud?: boolean
    // The suggestion that filled this in, which goes away once it's saved.
    suggestionId?: string
    // Filled in from what the user showed Berry: what looks like it changes, and whether to ask for it on each run.
    recorded?: RecordedChangeValue[]
}

export interface RecordedChangeValue extends RecordedChange {
    ask: boolean
    // What the instructions say at the moment, which `value` differs from while it's being typed.
    applied: string
}

const pad = (value: number) => String(value).padStart(2, '0')

const dateValue = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`

export const blankForm = (name = '', instructions = '', mascotId: string | null = null): RoutineFormValues => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return {
        id: null,
        name,
        instructions,
        kind: 'daily',
        time: '09:00',
        date: dateValue(tomorrow),
        days: [tomorrow.getDay()],
        day: tomorrow.getDate(),
        mascotId,
        onlySomeSites: false,
        sites: []
    }
}

const withSchedule = (blank: RoutineFormValues, schedule: RoutineSchedule): RoutineFormValues => {
    const values: RoutineFormValues = { ...blank, kind: schedule.kind }
    if (schedule.kind === 'manual') return values
    if (schedule.kind === 'once') {
        const at = new Date(schedule.at)
        return { ...values, date: dateValue(at), time: `${pad(at.getHours())}:${pad(at.getMinutes())}` }
    }
    if (schedule.kind === 'weekly') return { ...values, time: schedule.time, days: schedule.days }
    if (schedule.kind === 'monthly') return { ...values, time: schedule.time, day: schedule.day }
    return { ...values, time: schedule.time }
}

export const formFor = ({ id, name, instructions, mascotId, sites, inCloud, scheduleSpec }: Routine): RoutineFormValues =>
    withSchedule({ ...blankForm(name, instructions, mascotId), id, onlySomeSites: sites.length > 0, sites, inCloud }, scheduleSpec)

// It does nothing by itself until the user gives it a time, and the sites are the ones they used.
export const recordedForm = ({ name, instructions, sites, changes }: RecordedDraft): RoutineFormValues => ({
    ...blankForm(name, instructions),
    kind: 'manual',
    onlySomeSites: sites.length > 0,
    sites,
    recorded: changes.map((change) => ({ ...change, ask: false, applied: change.value }))
})

const askLine = (label: string, value: string) => `Before you start, ask me for the ${label.toLowerCase()} to use. Last time it was ${value}.`

// Only as a whole value: a digit beside a digit or a letter beside a letter is part of something else. So changing a 3
// leaves 13:30 alone, and changing a 10 still reaches 10px. Taken as written, whatever's in it.
const sameKind = (char: string) => (/\p{L}/u.test(char) ? '\\p{L}' : /\p{N}/u.test(char) ? '\\p{N}' : null)
const swapValue = (text: string, from: string, to: string) => {
    const before = sameKind(from[0])
    const after = sameKind(from[from.length - 1])
    const value = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const whole = `${before ? `(?<!${before})` : ''}${value}${after ? `(?!${after})` : ''}`
    // An address's path isn't the value, even where it looks like it, as a value of 1 in /product/1. Matched first to be passed over.
    if (from.includes('/')) return text.replace(new RegExp(whole, 'gu'), () => to)
    return text.replace(new RegExp(`\\S*/[^\\s?]*|${whole}`, 'gu'), (found) => (found.includes('/') ? found : to))
}

// While it's being typed, only the row changes. A half-typed value, or none, would wreck the instructions.
export const changeRecordedValue = (values: RoutineFormValues, at: number, next: string): RoutineFormValues => ({
    ...values,
    recorded: values.recorded?.map((row, index) => (index === at ? { ...row, value: next } : row))
})

// Once it's finished with, the instructions come to say what the row says. Left empty, the row goes back to what they say.
export const applyRecordedValue = (values: RoutineFormValues, at: number): RoutineFormValues => {
    const rows = values.recorded ?? []
    const row = rows[at]
    const next = row.value.trim()
    const settled = next ? { ...row, value: next, applied: next } : { ...row, value: row.applied }
    return {
        ...values,
        instructions: next && next !== row.applied
            ? swapValue(values.instructions.replace(askLine(row.label, row.applied), () => askLine(row.label, next)), row.applied, next)
            : values.instructions,
        recorded: rows.map((other, index) => (index === at ? settled : other))
    }
}

// A question goes through the same `ask_user` as any other, and it waits on Needs you.
export const askForRecordedValue = (values: RoutineFormValues, at: number, ask: boolean): RoutineFormValues => {
    const rows = values.recorded ?? []
    const line = askLine(rows[at].label, rows[at].applied)
    return {
        ...values,
        instructions: ask ? `${line}\n\n${values.instructions}` : values.instructions.replace(`${line}\n\n`, () => ''),
        recorded: rows.map((other, index) => (index === at ? { ...other, ask } : other))
    }
}

export const suggestedForm = ({ name, instructions, mascotId, schedule }: RoutineDraft, suggestionId: string): RoutineFormValues =>
    withSchedule({ ...blankForm(name, instructions, mascotId ?? null), suggestionId }, schedule)

export const toDraft = (form: RoutineFormValues): RoutineDraft => {
    // Saving with Enter leaves a field that hasn't been finished with.
    const { name, instructions, kind, time, date, days, day, mascotId, onlySomeSites, sites, inCloud } = (form.recorded ?? []).reduce((values, _, at) => applyRecordedValue(values, at), form)
    const schedule = (): RoutineSchedule => {
        switch (kind) {
            case 'manual':
                return { kind }
            case 'once':
                return { kind, at: new Date(`${date}T${time}`).getTime() }
            case 'daily':
                return { kind, time }
            case 'weekly':
                return { kind, days, time }
            case 'monthly':
                return { kind, day, time }
        }
    }
    return { name, instructions, schedule: schedule(), mascotId, sites: onlySomeSites ? sites : [], ...(inCloud && kind !== 'manual' ? { inCloud } : {}) }
}

// What each part of a routine is, among the form's values. The name is its own part, so changing any other sends no
// name, and main keeps the one it has.
const PART_FIELDS = {
    does: ['instructions', 'recorded'],
    when: ['kind', 'time', 'date', 'days', 'day', 'inCloud'],
    who: ['mascotId'],
    where: ['onlySomeSites', 'sites'],
    name: ['name']
} as const satisfies Record<RoutinePart, readonly (keyof RoutineFormValues)[]>

// The routine as it is now with one part as it was changed, so a part changed on its own never puts back anything
// else from when it was opened.
export const withRoutinePart = (current: RoutineFormValues, changed: RoutineFormValues, part: RoutinePart): RoutineFormValues => ({
    ...current,
    name: '',
    ...Object.fromEntries(PART_FIELDS[part].map((field) => [field, changed[field]]))
})

// Save as routine from a chat: what to do is only what the user asked for, and who does it is the chat's mascot.
export const chatRoutine = (title: string, messages: Array<{ role: string; content: string }>, mascotId: string | null): RoutineFormValues =>
    blankForm(title, messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n\n'), mascotId)

// --- When ------------------------------------------------------------------------------------------------------------

// How often, as the pills show it. Weekdays is Weekly with Monday to Friday chosen.
export type HowOften = RoutineSchedule['kind'] | 'weekdays'

export const WEEKDAYS = [1, 2, 3, 4, 5]
export const TIME_CHIPS = ['07:00', '08:00', '09:00', '12:00', '17:00', '21:00']

const isWeekdays = (days: number[]) => days.length === WEEKDAYS.length && WEEKDAYS.every((day) => days.includes(day))

export const howOften = ({ kind, days }: Pick<RoutineFormValues, 'kind' | 'days'>): HowOften =>
    kind === 'weekly' && isWeekdays(days) ? 'weekdays' : kind

// Weekly from Weekdays starts again on one day, today's, so the two pills never look the same.
export const withHowOften = (values: RoutineFormValues, often: HowOften): Partial<RoutineFormValues> => {
    if (often === 'weekdays') return { kind: 'weekly', days: WEEKDAYS }
    if (often === 'weekly' && (values.kind !== 'weekly' || isWeekdays(values.days))) return { kind: 'weekly', days: [new Date().getDay()] }
    return { kind: often }
}

// Sunday first, as the schedule counts them.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const ordinal = (day: number) => {
    const tens = day % 100
    const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
    return `${day}${tens >= 11 && tens <= 13 ? 'th' : suffixes[day % 10] ?? 'th'}`
}

const listed = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

// The schedule read back as a sentence, each part that was chosen marked, as in "Every **weekday** at **09:00**".
export type SentencePart = { text: string; chosen?: boolean }

export const scheduleSentence = ({ kind, time, date, days, day }: Pick<RoutineFormValues, 'kind' | 'time' | 'date' | 'days' | 'day'>): SentencePart[] => {
    const at: SentencePart[] = [{ text: ' at ' }, { text: time, chosen: true }]
    switch (kind) {
        case 'manual':
            return [{ text: 'Only when you ' }, { text: 'ask', chosen: true }]
        case 'once': {
            const on = new Date(`${date}T00:00`)
            const words = Number.isNaN(on.getTime()) ? date : on.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
            return [{ text: 'Once, on ' }, { text: words, chosen: true }, ...at]
        }
        case 'daily':
            return [{ text: 'Every ' }, { text: 'day', chosen: true }, ...at]
        case 'weekly': {
            if (isWeekdays(days)) return [{ text: 'Every ' }, { text: 'weekday', chosen: true }, ...at]
            if (days.length === 7) return [{ text: 'Every ' }, { text: 'day', chosen: true }, ...at]
            // Monday first, as the week reads.
            const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
            return [{ text: 'Every ' }, { text: listed(sorted.map((each) => DAY_NAMES[each])) || 'week', chosen: true }, ...at]
        }
        case 'monthly':
            return [{ text: 'On the ' }, { text: ordinal(day), chosen: true }, { text: ' of every month' }, ...at]
    }
}

export const sentenceText = (parts: SentencePart[]) => parts.map(({ text }) => text).join('')

// The whole routine as one sentence: "Every weekday at 09:00, Berry will read SVT…". The user's words stay as they
// are, except a capital at the start of an ordinary first word.
export const readBack = (values: Pick<RoutineFormValues, 'kind' | 'time' | 'date' | 'days' | 'day' | 'instructions'>, name: string): string => {
    const when = values.kind === 'manual' ? 'When you ask' : sentenceText(scheduleSentence(values))
    const words = values.instructions.trim().replace(/\s+/g, ' ')
    const first = /^[A-Z][a-z]+\b/.exec(words)?.[0]
    const said = first ? words.charAt(0).toLowerCase() + words.slice(1) : words
    return `${when}, ${name} will ${said}`
}

// When it's next, in a few words: "today 17:00", "tomorrow 09:00", "Tue 09:00", or the date further off.
export const nextInWords = (at: number, now = Date.now()): string => {
    const time = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)
    if (days <= 0) return `today ${time}`
    if (days === 1) return `tomorrow ${time}`
    if (days < 7) return `${new Date(at).toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`
    return `${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`
}

// --- The list --------------------------------------------------------------------------------------------------------

// Grouped by what matters, in this order. A one-off that has run waits with those that only run when asked.
export type RoutineGroupKey = 'needs-you' | 'running' | 'scheduled' | 'paused' | 'manual'

export const ROUTINE_GROUPS: { key: RoutineGroupKey; label: string }[] = [
    { key: 'needs-you', label: 'Needs you' },
    { key: 'running', label: 'Running' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'paused', label: 'Paused' },
    { key: 'manual', label: 'Only when you ask' }
]

const groupOf = (routine: Routine): RoutineGroupKey => {
    if (routine.status === 'needs-approval') return 'needs-you'
    if (routine.status === 'running' || routine.status === 'queued') return 'running'
    if (routine.paused) return 'paused'
    return routine.scheduleSpec.kind !== 'manual' && routine.nextRunAt !== null ? 'scheduled' : 'manual'
}

// Empty groups are left out. Scheduled ones are soonest first, and the rest keep the order they came in.
export const groupRoutines = (routines: Routine[]): { key: RoutineGroupKey; label: string; routines: Routine[] }[] =>
    ROUTINE_GROUPS.map(({ key, label }) => {
        const mine = routines.filter((routine) => groupOf(routine) === key)
        return { key, label, routines: key === 'scheduled' ? mine.sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0)) : mine }
    }).filter((group) => group.routines.length > 0)

// A row's second line. One waiting for you says what it wants, in the card's own sentence, and a running one where it
// is. Otherwise it's the schedule, which the group already says for one only run when asked, then how the last run
// went, in `ask` when it went wrong.
export const routineLine = (routine: Routine): { words: string | null; last: { text: string; ask: boolean } | null } => {
    const run = routine.latestRun
    if (routine.status === 'needs-approval') return { words: run?.approval ? withSiteNames(run.approval.text) : routine.lastResult, last: null }
    if (routine.status === 'running') return { words: run?.statusLine ?? run?.steps.at(-1)?.text ?? 'Starting..', last: null }
    const wrong = !routine.cloudNote && (run?.status === 'failed' || run?.status === 'interrupted')
    return {
        words: routine.scheduleSpec.kind === 'manual' ? null : sentenceText(scheduleSentence(formFor(routine))),
        last: { text: routine.cloudNote ?? routine.lastResult, ask: wrong }
    }
}

// --- Where it is -----------------------------------------------------------------------------------------------------

// The Routines page at a place. It moves around itself this way too, so where it is lives in its tab's param, which is
// how Back and a restored session find it.
export const openRoutines = (place: RoutinePlace) => void window.chromeAPI.browser.openPage('routines', { param: routinesParam(place) })

// A new routine started from elsewhere, such as Show Berry how, a suggestion or a mascot's page, with its answers filled
// in. The steps take it when they show, whichever tab they're in.
export const NEW_ROUTINE_EVENT = 'blueberry:new-routine'
let started: RoutineFormValues | null = null

export const startRoutine = (values: RoutineFormValues = blankForm()) => {
    started = values
    window.dispatchEvent(new Event(NEW_ROUTINE_EVENT))
    openRoutines({ page: 'new' })
}

export const takeStartedRoutine = (): RoutineFormValues | null => {
    const values = started
    started = null
    return values
}
