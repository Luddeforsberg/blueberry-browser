import { describe, expect, it } from 'vitest'
import type { ChatStep } from '@shared/library'
import { clock, foldedWords, keptWhenFolded, latestEntries, workEntries } from './workLine'

const read = (site: string): ChatStep => ({ text: `Read ${site}`, done: true, kind: 'read' })
const live = (text: string): ChatStep => ({ text, done: false, kind: 'read' })

describe('the working line', () => {
    it('groups finished steps of one kind on one site in a row', () => {
        const steps = [{ text: 'Opened klm.com', done: true, kind: 'open' as const }, read('klm.com'), read('klm.com'), read('klm.com'), read('sas.se')]
        expect(workEntries(steps)).toEqual([
            { kind: 'step', step: steps[0] },
            { kind: 'group', steps: steps.slice(1, 4), words: 'Read 3 pages on klm.com', stepKind: 'read' },
            { kind: 'step', step: steps[4] },
        ])
    })

    it('keeps words said between steps where they were said, and never groups across them', () => {
        const steps = [read('klm.com'), read('klm.com'), read('klm.com')]
        expect(workEntries(steps, [{ after: 0, text: 'Looking.' }, { after: 2, text: 'Morning is cheaper.' }, { after: 3, text: 'Nearly there.' }])).toEqual([
            { kind: 'said', text: 'Looking.' },
            { kind: 'group', steps: steps.slice(0, 2), words: 'Read 2 pages on klm.com', stepKind: 'read' },
            { kind: 'said', text: 'Morning is cheaper.' },
            { kind: 'step', step: steps[2] },
            { kind: 'said', text: 'Nearly there.' },
        ])
    })

    it('leaves the live step, asking and steps worth keeping out of a group', () => {
        const asked: ChatStep = { text: 'Asked you something', done: true, kind: 'ask' }
        const steps = [read('klm.com'), live('Read klm.com'), asked, asked, { text: 'Stayed off evil.com', done: true }]
        expect(workEntries(steps).map((entry) => entry.kind)).toEqual(['step', 'step', 'step', 'step', 'step'])
    })

    it('groups steps with no site by their kind alone', () => {
        const waited: ChatStep = { text: 'Waited a moment', done: true, kind: 'wait' }
        expect(workEntries([waited, waited])).toMatchObject([{ kind: 'group', words: 'Waited 2 times' }])
        const scanned: ChatStep = { text: 'Scrolled klm.com', done: true, kind: 'scan' }
        expect(workEntries([scanned, scanned])).toMatchObject([{ kind: 'group', words: 'Looked over klm.com 2 times' }])
    })

    it('shows only the latest steps of a long job, with what was said among them', () => {
        const steps = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'].map(read)
        const entries = workEntries(steps, [{ after: 3, text: 'Halfway.' }])
        expect(latestEntries(entries)).toEqual({ shown: entries.slice(2), hidden: true })
        expect(latestEntries(entries).shown.map((entry) => (entry.kind === 'said' ? entry.text : entry.kind === 'step' ? entry.step.text : ''))).toEqual(['Read c.com', 'Halfway.', 'Read d.com', 'Read e.com'])
    })

    it('shows a job of up to four steps whole', () => {
        const entries = workEntries(['a.com', 'b.com', 'c.com', 'd.com'].map(read))
        expect(latestEntries(entries)).toEqual({ shown: entries, hidden: false })
        expect(latestEntries([])).toEqual({ shown: [], hidden: false })
    })

    it('keeps what was asked, refused or stopped showing while folded', () => {
        const asked: ChatStep = { text: 'Asked you to sign in on github.com', done: true, kind: 'ask' }
        expect(keptWhenFolded([read('a.com'), asked, read('a.com')])).toEqual([asked])
    })

    it('says how long it worked and how many steps on which sites', () => {
        expect(foldedWords([read('klm.com'), read('klm.com')], 48_000)).toEqual({ worked: 'Worked 0:48', steps: '2 steps on klm.com' })
        expect(foldedWords([read('klm.com')], 999)).toEqual({ worked: 'Worked 0:00', steps: '1 step on klm.com' })
        expect(foldedWords([read('a.com'), read('b.com'), read('c.com')])).toEqual({ worked: null, steps: '3 steps on 3 sites' })
    })

    it.each([
        [0, '0:00'],
        [-5, '0:00'],
        [999, '0:00'],
        [1000, '0:01'],
        [59_999, '0:59'],
        [60_000, '1:00'],
        [725_000, '12:05'],
        [3_599_999, '59:59'],
        [3_600_000, '1:00:00'],
        [3_729_000, '1:02:09'],
    ])('writes %i ms as %s', (ms, words) => {
        expect(clock(ms)).toBe(words)
    })
})
