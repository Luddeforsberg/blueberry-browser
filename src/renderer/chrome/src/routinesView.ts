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
    // The suggestion that filled this in, which goes away once it's saved.
    suggestionId?: string
    // Filled in from what the user showed Berry: what looks like it changes, and whether to ask for it on each run.
    recorded?: RecordedChangeValue[]
}

export interface RecordedChangeValue extends RecordedChange {
    ask: boolean
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

export const formFor = ({ id, name, instructions, mascotId, sites, scheduleSpec }: Routine): RoutineFormValues =>
    withSchedule({ ...blankForm(name, instructions, mascotId), id, sites: sites.join(', ') }, scheduleSpec)

// It does nothing by itself until the user gives it a time, and the sites are the ones they used.
export const recordedForm = ({ name, instructions, sites, changes }: RecordedDraft): RoutineFormValues => ({
    ...blankForm(name, instructions),
    kind: 'manual',
    sites: sites.join(', '),
    recorded: changes.map((change) => ({ ...change, ask: false }))
})

const askLine = ({ label, value }: RecordedChange) => `Before you start, ask me for the ${label.toLowerCase()} to use. Last time it was ${value}.`

// Keeps the instructions saying what the row says. A value the user has since reworded there is left to them.
export const changeRecordedValue = (values: RoutineFormValues, at: number, next: string): RoutineFormValues => {
    const rows = values.recorded ?? []
    const row = rows[at]
    const line = askLine(row)
    const changed = { ...row, value: next }
    return {
        ...values,
        instructions: values.instructions.replace(line, askLine(changed)).split(row.value).join(next),
        recorded: rows.map((other, index) => (index === at ? changed : other))
    }
}

// A question goes through the same `ask_user` as any other, and it waits on Needs you.
export const askForRecordedValue = (values: RoutineFormValues, at: number, ask: boolean): RoutineFormValues => {
    const rows = values.recorded ?? []
    const line = askLine(rows[at])
    return {
        ...values,
        instructions: ask ? `${line}\n\n${values.instructions}` : values.instructions.replace(`${line}\n\n`, ''),
        recorded: rows.map((other, index) => (index === at ? { ...other, ask } : other))
    }
}

export const suggestedForm = ({ name, instructions, mascotId, schedule }: RoutineDraft, suggestionId: string): RoutineFormValues =>
    withSchedule({ ...blankForm(name, instructions, mascotId ?? null), suggestionId }, schedule)

export const toDraft = ({ name, instructions, kind, time, date, days, day, mascotId, sites }: RoutineFormValues): RoutineDraft => {
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
    return { name, instructions, schedule: schedule(), mascotId, sites: sites.split(/[\s,]+/).filter(Boolean) }
}

// Lasts while the page isn't showing, so going to another tab doesn't lose what's been typed.
let current: RoutinesView = { page: 'list' }

export const routinesView = () => current

export const setRoutinesView = (view: RoutinesView) => {
    current = view
}
