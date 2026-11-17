import { describe, expect, it } from 'vitest'
import { tallyWords, waitedFor, waitingLine } from './needsYouWords'

const NOW = 10_000_000
const item = (id: string, minutesAgo: number, routineId: string | null = null) => ({ id, routineId, askedAt: NOW - minutesAgo * 60_000 })

describe('Needs you, in words', () => {
    it('counts what is waiting, where from, and how long the oldest has waited', () => {
        expect(waitingLine([item('a', 4), item('b', 2), item('c', 0)], NOW)).toBe('3 things are waiting, from 3 chats. The oldest has waited 4 minutes.')
        expect(waitingLine([item('a', 1)], NOW)).toBe('1 thing is waiting, from 1 chat. It has waited 1 minute.')
        expect(waitingLine([item('a', 0.5), item('r', 0, 'routine-1')], NOW)).toBe('2 things are waiting, from 1 chat and 1 routine. The oldest has waited under a minute.')
        expect(waitingLine([item('r', 125, 'routine-1')], NOW)).toBe('1 thing is waiting, from 1 routine. It has waited 2 hours.')
        expect(waitingLine([], NOW)).toBeNull()
    })

    it('counts a chat with two things waiting once', () => {
        expect(waitingLine([item('a', 3), item('a', 1)], NOW)).toBe('2 things are waiting, from 1 chat. The oldest has waited 3 minutes.')
    })

    it.each([
        [0, 'just now'],
        [0.99, 'just now'],
        [1, '1 min'],
        [59, '59 min'],
        [60, '1 h'],
        [180, '3 h'],
    ])('says %f minutes as %s', (minutes, words) => {
        expect(waitedFor(NOW - minutes * 60_000, NOW)).toBe(words)
    })

    it('tallies what was answered this visit', () => {
        expect(tallyWords(0, 3)).toBe('0 of 3 answered')
        expect(tallyWords(1, 2)).toBe('1 of 3 answered')
    })
})
