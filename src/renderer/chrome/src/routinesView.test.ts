import { describe, expect, it } from 'vitest'
import type { Routine, RoutineRun } from '@shared/library'
import { applyRecordedValue, askForRecordedValue, blankForm, changeRecordedValue, groupRoutines, howOften, nextInWords, readBack, recordedForm, routineLine, scheduleSentence, sentenceText, toDraft, WEEKDAYS, withHowOften, withRoutinePart } from './routinesView'

const form = (instructions: string, value: string) =>
    recordedForm({ name: 'Job', instructions, sites: [], changes: [{ label: 'Search', value }] })

describe('what might change', () => {
    it('survives being cleared and retyped, a letter at a time', () => {
        let values = form('Search for usb cable on the shop', 'usb cable')
        for (const typed of ['', 'h', 'hd', 'hdmi']) values = changeRecordedValue(values, 0, typed)
        expect(values.instructions).toBe('Search for usb cable on the shop')
        expect(applyRecordedValue(values, 0).instructions).toBe('Search for hdmi on the shop')
    })

    it('goes back to what it was if left empty', () => {
        const values = applyRecordedValue(changeRecordedValue(form('Search for usb', 'usb'), 0, '  '), 0)
        expect(values.instructions).toBe('Search for usb')
        expect(values.recorded?.[0].value).toBe('usb')
    })

    it("doesn't touch a short value inside other words or numbers", () => {
        const values = applyRecordedValue(changeRecordedValue(form('Book 3 seats at 13:30 for $3', '3'), 0, '4'), 0)
        expect(values.instructions).toBe('Book 4 seats at 13:30 for $4')
    })

    it('reaches a number with a unit on it, and leaves a word inside a longer one', () => {
        expect(applyRecordedValue(changeRecordedValue(form('Set the width to 10px', '10'), 0, '20'), 0).instructions).toBe('Set the width to 20px')
        expect(applyRecordedValue(changeRecordedValue(form('Find a cat in the category', 'cat'), 0, 'dog'), 0).instructions).toBe('Find a dog in the category')
    })

    it("leaves an address's path alone, but not what it's searching for", () => {
        expect(applyRecordedValue(changeRecordedValue(form('Go to shop.example/product/1 and buy 1', '1'), 0, '2'), 0).instructions).toBe('Go to shop.example/product/1 and buy 2')
        expect(applyRecordedValue(changeRecordedValue(form('Go to https://shop.example/usb?q=usb', 'usb'), 0, 'hdmi'), 0).instructions).toBe('Go to https://shop.example/usb?q=hdmi')
        expect(applyRecordedValue(changeRecordedValue(form('Book it on 12/03', '12/03'), 0, '14/03'), 0).instructions).toBe('Book it on 14/03')
    })

    it('takes a value as written, and a pending one still gets saved', () => {
        const pending = changeRecordedValue(form('Find a+b now', 'a+b'), 0, '$& c')
        expect(toDraft(pending).instructions).toBe('Find $& c now')
    })

    it('keeps the question in step with the value', () => {
        const asking = askForRecordedValue(form('Search for usb', 'usb'), 0, true)
        const changed = applyRecordedValue(changeRecordedValue(asking, 0, 'hdmi'), 0)
        expect(changed.instructions).toContain('Last time it was hdmi.')
        expect(changed.instructions).toContain('Search for hdmi')
        expect(askForRecordedValue(changed, 0, false).instructions).toBe('Search for hdmi')
    })
})

describe('when, in words', () => {
    const base = blankForm('', 'Read SVT and sum up the news')
    it('reads the schedule back with what was chosen marked', () => {
        expect(scheduleSentence({ ...base, kind: 'weekly', days: WEEKDAYS, time: '09:00' })).toEqual([{ text: 'Every ' }, { text: 'weekday', chosen: true }, { text: ' at ' }, { text: '09:00', chosen: true }])
        expect(sentenceText(scheduleSentence({ ...base, kind: 'weekly', days: [5, 1], time: '07:00' }))).toBe('Every Monday and Friday at 07:00')
        expect(sentenceText(scheduleSentence({ ...base, kind: 'monthly', day: 22, time: '12:00' }))).toBe('On the 22nd of every month at 12:00')
        expect(sentenceText(scheduleSentence({ ...base, kind: 'monthly', day: 11, time: '12:00' }))).toBe('On the 11th of every month at 12:00')
        expect(sentenceText(scheduleSentence({ ...base, kind: 'manual' }))).toBe('Only when you ask')
    })

    it('tells Weekdays from Weekly, and Weekly from Weekdays starts on one day', () => {
        expect(howOften({ kind: 'weekly', days: [5, 4, 3, 2, 1] })).toBe('weekdays')
        expect(howOften({ kind: 'weekly', days: [1, 2] })).toBe('weekly')
        const weekdays = { ...base, ...withHowOften(base, 'weekdays') }
        expect(weekdays.days).toEqual(WEEKDAYS)
        expect(withHowOften(weekdays, 'weekly').days).toHaveLength(1)
        expect(withHowOften({ ...base, kind: 'weekly', days: [1, 3] }, 'weekly')).toEqual({ kind: 'weekly' })
    })

    it('reads the whole routine back in the user’s words', () => {
        expect(readBack({ ...base, kind: 'daily', time: '09:00' }, 'Berry')).toBe('Every day at 09:00, Berry will read SVT and sum up the news')
        expect(readBack({ ...base, instructions: 'SVT first, then DN', kind: 'manual' }, 'Pip')).toBe('When you ask, Pip will SVT first, then DN')
    })

    it('says when it’s next in a few words', () => {
        const now = new Date(2026, 10, 16, 12, 0).getTime()
        expect(nextInWords(new Date(2026, 10, 16, 17, 0).getTime(), now)).toBe('today 17:00')
        expect(nextInWords(new Date(2026, 10, 17, 9, 0).getTime(), now)).toBe('tomorrow 09:00')
        expect(nextInWords(new Date(2026, 10, 19, 9, 0).getTime(), now)).toBe('Thu 09:00')
        expect(nextInWords(new Date(2026, 10, 30, 9, 0).getTime(), now)).toBe('30 Nov 09:00')
    })
})

describe('changing one part', () => {
    it('takes only that part, and sends no name unless the name is the part', () => {
        const current = { ...blankForm('SVT news', 'Read SVT'), id: 'r1', kind: 'daily' as const, time: '09:00' }
        const changed = { ...current, instructions: 'Read DN', time: '17:00' }
        expect(withRoutinePart(current, changed, 'does')).toMatchObject({ name: '', instructions: 'Read DN', time: '09:00' })
        expect(withRoutinePart(current, { ...current, name: 'News' }, 'name')).toMatchObject({ name: 'News', instructions: 'Read SVT' })
    })

    it('keeps sites only while it’s limited to them', () => {
        const values = { ...blankForm('', 'Look'), sites: ['svt.se'] }
        expect(toDraft(values).sites).toEqual([])
        expect(toDraft({ ...values, onlySomeSites: true }).sites).toEqual(['svt.se'])
    })
})

describe('the list', () => {
    const NOW = new Date(2026, 10, 16, 12, 0).getTime()
    const run = (patch: Partial<RoutineRun>): RoutineRun => ({
        id: 'run', routineId: 'r', status: 'finished', startedAt: NOW, endedAt: NOW, lateFor: null, steps: [], result: null, error: null, approval: null, tokens: null, seen: true, ...patch
    })
    const routine = (id: string, patch: Partial<Routine> = {}): Routine => ({
        id, name: id, instructions: 'Read SVT', scheduleSpec: { kind: 'daily', time: '09:00' }, mascotId: null, sites: [], inCloud: false, schedule: '', paused: false,
        nextRunAt: NOW + 3_600_000, lastResult: 'Not run yet', status: 'idle', latestRun: null, unseen: false, ...patch
    })
    const keys = (routines: Routine[]) => groupRoutines(routines).map((group) => [group.key, group.routines.map(({ id }) => id)])

    it('has no groups for no routines', () => {
        expect(groupRoutines([])).toEqual([])
    })

    it('groups by what matters, in order, leaving out the empty ones', () => {
        expect(keys([
            routine('manual', { scheduleSpec: { kind: 'manual' }, nextRunAt: null }),
            routine('paused', { paused: true, status: 'paused', nextRunAt: null }),
            routine('later', { nextRunAt: NOW + 7_200_000 }),
            routine('sooner', { nextRunAt: NOW + 60_000 }),
            routine('running', { status: 'running' }),
            routine('queued', { status: 'queued' }),
            routine('asking', { status: 'needs-approval' })
        ])).toEqual([
            ['needs-you', ['asking']],
            ['running', ['running', 'queued']],
            ['scheduled', ['sooner', 'later']],
            ['paused', ['paused']],
            ['manual', ['manual']]
        ])
        expect(keys([routine('one')])).toEqual([['scheduled', ['one']]])
    })

    it('puts what needs you first, even while paused, and a one-off that has run with those only run when asked', () => {
        expect(keys([
            routine('done-once', { scheduleSpec: { kind: 'once', at: NOW - 1000 }, nextRunAt: null }),
            routine('paused-asking', { paused: true, status: 'needs-approval' }),
            routine('failed', { status: 'failed' })
        ])).toEqual([
            ['needs-you', ['paused-asking']],
            ['scheduled', ['failed']],
            ['manual', ['done-once']]
        ])
    })

    it('says what one waiting for you wants, where a running one is, and what went wrong in ask', () => {
        const approval = { id: 'a', text: 'Open https://www.klm.com/orders/123' }
        expect(routineLine(routine('a', { status: 'needs-approval', latestRun: run({ status: 'needs-approval', approval }) }))).toEqual({ words: 'Open klm.com', last: null })
        expect(routineLine(routine('b', { status: 'running', latestRun: run({ status: 'running', statusLine: 'Scanning fares..' }) }))).toEqual({ words: 'Scanning fares..', last: null })
        expect(routineLine(routine('c', { status: 'running', latestRun: run({ status: 'running', steps: [{ text: 'Opened tap.pt', done: true }] }) }))).toEqual({ words: 'Opened tap.pt', last: null })
        expect(routineLine(routine('d', { status: 'failed', lastResult: 'Today: couldn’t finish', latestRun: run({ status: 'failed' }) }))).toEqual({ words: 'Every day at 09:00', last: { text: 'Today: couldn’t finish', ask: true } })
        expect(routineLine(routine('e', { scheduleSpec: { kind: 'manual' }, nextRunAt: null }))).toEqual({ words: null, last: { text: 'Not run yet', ask: false } })
        expect(routineLine(routine('f', { cloudNote: 'Moving back to this Mac…' }))).toEqual({ words: 'Every day at 09:00', last: { text: 'Moving back to this Mac…', ask: false } })
    })
})
