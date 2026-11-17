import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from '@shared/ipc'
import { foldVisits, groupByDay } from './historyDays'

const at = (year: number, month: number, day: number, hour = 12): HistoryEntry => ({
    id: hour,
    url: 'https://a.example/',
    title: 'A',
    favicon: null,
    visitedAt: new Date(year, month - 1, day, hour).getTime()
})

const NOW = new Date(2026, 9, 31, 12).getTime()

describe('groupByDay', () => {
    it('has no days for no entries', () => {
        expect(groupByDay([], NOW)).toEqual([])
    })

    it('splits at local midnight and names the nearest days', () => {
        const days = groupByDay(
            [at(2026, 10, 31, 0), at(2026, 10, 30, 23), at(2026, 10, 30, 0), at(2026, 10, 29, 23)],
            NOW
        )
        expect(days.map((day) => [day.label, day.date, day.entries.length])).toEqual([
            ['Today', 'Saturday 31 October', 1],
            ['Yesterday', 'Friday 30 October', 2],
            ['Thursday', '29 October', 1]
        ])
    })

    it('shows the year only for another year', () => {
        const [day] = groupByDay([at(2025, 12, 31)], NOW)
        expect(day.date).toBe('31 December 2025')
        expect(groupByDay([at(2026, 10, 1)], NOW)[0].date).toBe('1 October')
    })

    it('knows yesterday across a month boundary', () => {
        const [day] = groupByDay([at(2026, 9, 30)], new Date(2026, 9, 1, 12).getTime())
        expect(day.label).toBe('Yesterday')
    })
})

describe('foldVisits', () => {
    const visit = (id: number, url: string): HistoryEntry => ({ id, url, title: url, favicon: null, visitedAt: NOW - id })

    it('folds visits in a row to the same site, and only in a row', () => {
        const runs = foldVisits([
            visit(1, 'https://www.klm.com/a'),
            visit(2, 'https://klm.com/b'),
            visit(3, 'https://svt.se/'),
            visit(4, 'https://klm.com/c')
        ])
        expect(runs.map((run) => [run.site, run.entries.map((entry) => entry.id)])).toEqual([
            ['klm.com', [1, 2]],
            ['svt.se', [3]],
            ['klm.com', [4]]
        ])
        expect(foldVisits([])).toEqual([])
    })
})
