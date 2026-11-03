import { describe, expect, it } from 'vitest'
import type { ChatStep } from '@shared/library'
import { trailFor } from './stepTrail'

const steps = (count: number, text = 'Read webhallen.com'): ChatStep[] => Array.from({ length: count }, () => ({ text, done: true }))
const texts = (trail: ReturnType<typeof trailFor>) => trail.shown.map(({ step }) => step.text)

describe('trailFor', () => {
    it('shows every step up to one more than the latest while running', () => {
        expect(trailFor([], { running: true })).toEqual({ shown: [], hidden: 0, line: null })
        expect(trailFor(steps(4), { running: true }).line).toBeNull()
    })

    it('keeps the latest three while running, with the current one last', () => {
        const trail = trailFor([...steps(19), { text: 'Clicked something on webhallen.com', done: false }], { running: true })
        expect(trail.line).toBe('17 earlier steps')
        expect(trail.hidden).toBe(17)
        expect(trail.shown).toHaveLength(3)
        expect(texts(trail).at(-1)).toBe('Clicked something on webhallen.com')
    })

    it('only folds once there are at least two to fold', () => {
        expect(trailFor(steps(5), { running: false, cutShort: true }).line).toBe('2 earlier steps')
    })

    it('collapses to one line with the site once finished', () => {
        expect(trailFor(steps(20), { running: false })).toMatchObject({ shown: [], hidden: 20, line: '20 steps on webhallen.com' })
    })

    it('counts an address with no name as a site', () => {
        expect(trailFor(steps(2, 'Read 127.0.0.1'), { running: false }).line).toBe('2 steps on 127.0.0.1')
    })

    it('leaves a lone step as it is', () => {
        expect(trailFor(steps(1), { running: false })).toMatchObject({ hidden: 0, line: null })
        expect(trailFor(steps(2), { running: false }).line).toBe('2 steps on webhallen.com')
    })

    it('names two sites, then counts them, and needs none', () => {
        const on = (...sites: string[]) => sites.map((site) => ({ text: `Read ${site}`, done: true }))
        expect(trailFor(on('a.se', 'b.se'), { running: false }).line).toBe('2 steps on a.se and b.se')
        expect(trailFor(on('a.se', 'b.se', 'c.se'), { running: false }).line).toBe('3 steps on 3 sites')
        expect(trailFor(steps(2, 'Checked your open tabs'), { running: false }).line).toBe('2 steps')
    })

    it('keeps the latest steps of a job cut short', () => {
        const trail = trailFor(steps(20), { running: false, cutShort: true })
        expect(trail.line).toBe('17 earlier steps')
        expect(trail.shown).toHaveLength(3)
    })

    it('never collapses away what the user was asked', () => {
        const asked = { text: 'Asked you to sign in on github.com', done: true }
        const stayed = { text: 'Stayed off example.com', done: true }
        const trail = trailFor([...steps(4), asked, ...steps(4), stayed, ...steps(4)], { running: false })
        expect(texts(trail)).toEqual([asked.text, stayed.text])
        expect(trail.hidden).toBe(12)
        expect(texts(trailFor([asked, ...steps(9)], { running: true }))).toContain(asked.text)
    })

    it('never collapses away where the user stopped it', () => {
        const stopped = { text: 'Stopped here', done: true }
        expect(texts(trailFor([...steps(6), stopped], { running: false }))).toEqual([stopped.text])
    })

    it('shows every step when open, and still has the line to close it', () => {
        const trail = trailFor(steps(20), { running: false, open: true })
        expect(trail.shown).toHaveLength(20)
        expect(trail.hidden).toBe(0)
        expect(trail.line).toBe('20 steps on webhallen.com')
    })
})
