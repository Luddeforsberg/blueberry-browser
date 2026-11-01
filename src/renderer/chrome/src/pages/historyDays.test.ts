import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from '@shared/ipc'
import { groupByDay } from './historyDays'

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
        expect(days.map((day) => [day.label, day.entries.length])).toEqual([
            ['Today', 1],
            ['Yesterday', 2],
            ['Thursday 29 October', 1]
        ])
    })

    it('shows the year only for another year', () => {
        const [day] = groupByDay([at(2025, 12, 31)], NOW)
        expect(day.label).toContain('2025')
    })

    it('knows yesterday across a month boundary', () => {
        const [day] = groupByDay([at(2026, 9, 30)], new Date(2026, 9, 1, 12).getTime())
        expect(day.label).toBe('Yesterday')
    })
})
