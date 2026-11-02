import type { RecordedChange, RecordedDraft, Routine, RoutineDraft, RoutineSchedule } from '@shared/library'

export interface RoutineFormValues {
    // Null for a new routine.
    id: string | null
    name: string
    instructions: string
    kind: RoutineSchedule['kind']
    time: string
    date: string
    days: number[]
    day: number
    // Who runs it. Null is Berry.
    mascotId: string | null
    // The sites a run may use, as typed, split by commas. Empty adds no limit.
    sites: string
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

export type RoutinesView =
    | { page: 'list' }
    | { page: 'detail'; id: string }
    | { page: 'form'; values: RoutineFormValues }

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
        sites: ''
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
    withSchedule({ ...blankForm(name, instructions, mascotId), id, sites: sites.join(', '), inCloud }, scheduleSpec)

// It does nothing by itself until the user gives it a time, and the sites are the ones they used.
export const recordedForm = ({ name, instructions, sites, changes }: RecordedDraft): RoutineFormValues => ({
    ...blankForm(name, instructions),
    kind: 'manual',
    sites: sites.join(', '),
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
    const { name, instructions, kind, time, date, days, day, mascotId, sites, inCloud } = (form.recorded ?? []).reduce((values, _, at) => applyRecordedValue(values, at), form)
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
    return { name, instructions, schedule: schedule(), mascotId, sites: sites.split(/[\s,]+/).filter(Boolean), ...(inCloud ? { inCloud } : {}) }
}

// Lasts while the page isn't showing, so going to another tab doesn't lose what's been typed.
let current: RoutinesView = { page: 'list' }

export const routinesView = () => current

export const setRoutinesView = (view: RoutinesView) => {
    current = view
}
