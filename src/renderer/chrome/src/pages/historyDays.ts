import type { HistoryEntry } from '@shared/ipc'

export interface HistoryDay {
    key: string
    label: string
    entries: HistoryEntry[]
}

const dayStart = (time: number) => new Date(time).setHours(0, 0, 0, 0)

const dayLabel = (time: number, now: number) => {
    const start = dayStart(time)
    const today = dayStart(now)
    if (start === today) return 'Today'
    // Worked out from the date rather than by counting hours, because a day can have 23 or 25 of them.
    const yesterday = new Date(today).setDate(new Date(today).getDate() - 1)
    if (start === yesterday) return 'Yesterday'
    return new Date(time).toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: new Date(time).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric'
    })
}

// By the day on this computer's calendar. The entries are already newest first.
export const groupByDay = (entries: HistoryEntry[], now = Date.now()): HistoryDay[] => {
    const days: HistoryDay[] = []
    for (const entry of entries) {
        const key = String(dayStart(entry.visitedAt))
        const last = days.at(-1)
        if (last?.key === key) last.entries.push(entry)
        else days.push({ key, label: dayLabel(entry.visitedAt, now), entries: [entry] })
    }
    return days
}
