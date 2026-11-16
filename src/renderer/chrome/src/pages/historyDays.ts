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
    // The app is in English, whatever language the system is in.
    return new Date(time).toLocaleDateString('en-GB', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: new Date(time).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric'
    })
}

// By the day on this computer's calendar, for anything with a time. The items are already newest first.
export const byDay = <T,>(items: T[], timeOf: (item: T) => number, now = Date.now()): { key: string; label: string; items: T[] }[] => {
    const days: { key: string; label: string; items: T[] }[] = []
    for (const item of items) {
        const key = String(dayStart(timeOf(item)))
        const last = days.at(-1)
        if (last?.key === key) last.items.push(item)
        else days.push({ key, label: dayLabel(timeOf(item), now), items: [item] })
    }
    return days
}

export const groupByDay = (entries: HistoryEntry[], now = Date.now()): HistoryDay[] =>
    byDay(entries, (entry) => entry.visitedAt, now).map(({ key, label, items }) => ({ key, label, entries: items }))

export const siteOf = (url: string) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return url
    }
}

// Visits in a row to the same site, as one run. A run of one is a plain row, and a longer one folds into a row with the
// site and how many, which opens in place.
export interface VisitRun {
    key: string
    site: string
    entries: HistoryEntry[]
}

export const foldVisits = (entries: HistoryEntry[]): VisitRun[] => {
    const runs: VisitRun[] = []
    for (const entry of entries) {
        const site = siteOf(entry.url)
        const last = runs.at(-1)
        if (last?.site === site) last.entries.push(entry)
        else runs.push({ key: String(entry.id), site, entries: [entry] })
    }
    return runs
}
