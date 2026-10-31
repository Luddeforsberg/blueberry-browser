import type { Routine, RoutineDraft, RoutineSchedule } from '@shared/library'

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
    // The suggestion that filled this in, which goes away once it's saved.
    suggestionId?: string
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
        mascotId
    }
}

const withSchedule = (blank: RoutineFormValues, schedule: RoutineSchedule): RoutineFormValues => {
    const values: RoutineFormValues = { ...blank, kind: schedule.kind }
    if (schedule.kind === 'once') {
        const at = new Date(schedule.at)
        return { ...values, date: dateValue(at), time: `${pad(at.getHours())}:${pad(at.getMinutes())}` }
    }
    if (schedule.kind === 'weekly') return { ...values, time: schedule.time, days: schedule.days }
    if (schedule.kind === 'monthly') return { ...values, time: schedule.time, day: schedule.day }
    return { ...values, time: schedule.time }
}

export const formFor = ({ id, name, instructions, mascotId, scheduleSpec }: Routine): RoutineFormValues =>
    withSchedule({ ...blankForm(name, instructions, mascotId), id }, scheduleSpec)

export const suggestedForm = ({ name, instructions, mascotId, schedule }: RoutineDraft, suggestionId: string): RoutineFormValues =>
    withSchedule({ ...blankForm(name, instructions, mascotId ?? null), suggestionId }, schedule)

export const toDraft = ({ name, instructions, kind, time, date, days, day, mascotId }: RoutineFormValues): RoutineDraft => {
    const schedule = (): RoutineSchedule => {
        switch (kind) {
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
    return { name, instructions, schedule: schedule(), mascotId }
}

// Lasts while the page isn't showing, so going to another tab doesn't lose what's been typed.
let current: RoutinesView = { page: 'list' }

export const routinesView = () => current

export const setRoutinesView = (view: RoutinesView) => {
    current = view
}
