import { describe, expect, it } from 'vitest'
import type { Routine } from '@shared/library'
import { blankForm, formFor, howOften, nextInWords, readBack, recordedForm, scheduleSentence, sentenceText, stepsPieces, switchAsking, toDraft, typedInto, WEEKDAYS, withHowOften, withRoutinePart, withStepsPieces, type RoutineFormValues } from './routinesView'

const form = (instructions: string, value: string) =>
    recordedForm({ name: 'Job', instructions, sites: [], changes: [{ label: 'Search', value }] })

// The value's mark as the box shows it, or null when it isn't marked.
const marked = (values: RoutineFormValues) => stepsPieces(values).find(({ row }) => row !== undefined)?.text ?? null

// The box after the user has made the value's mark say something else, as the browser would leave it.
const typedInMark = (values: RoutineFormValues, next: string) =>
    withStepsPieces(values, stepsPieces(values).map((piece) => (piece.row === undefined ? piece : { ...piece, text: next })))

describe('what might change', () => {
    it('is marked where it stands, as a whole value', () => {
        expect(stepsPieces(form('Book 3 seats at 13:30 for $3', '3'))).toEqual([{ text: 'Book ' }, { text: '3', row: 0 }, { text: ' seats at 13:30 for $3' }])
        expect(marked(form('Set the width to 10px', '10'))).toBe('10')
        expect(stepsPieces(form('Find a cat in the category', 'cat'))[1]).toEqual({ text: 'cat', row: 0 })
        expect(marked(form('Find a category', 'cat'))).toBeNull()
    })

    it("leaves an address's path alone, but not what it's searching for", () => {
        expect(stepsPieces(form('Go to shop.example/product/1 and buy 1', '1')).at(-1)).toEqual({ text: '1', row: 0 })
        expect(stepsPieces(form('Go to https://shop.example/usb?q=usb', 'usb')).at(-1)).toEqual({ text: 'usb', row: 0 })
        expect(marked(form('Book it on 12/03', '12/03'))).toBe('12/03')
    })

    it('reads back as exactly the text it was made from', () => {
        const values = form('1. Go to the shop\n2. Search for usb cable\n\nThen say how it went.', 'usb cable')
        expect(withStepsPieces(values, stepsPieces(values))).toEqual(values)
        expect(stepsPieces(values).map(({ text }) => text).join('')).toBe(values.instructions)
    })

    it('is edited where it stands, and only there, taken as written', () => {
        const values = typedInMark(form('Search for usb, then pick the cheapest usb', 'usb'), '$& hdmi')
        expect(values.instructions).toBe('Search for $& hdmi, then pick the cheapest usb')
        expect(values.recorded).toEqual([{ label: 'Search', value: '$& hdmi', ask: false, at: 11 }])
        expect(toDraft(values).instructions).toBe(values.instructions)
    })

    it('stays marked while text is typed before it', () => {
        const values = form('Search for usb', 'usb')
        const typed = withStepsPieces(values, [{ text: 'Then search for ' }, { text: 'usb', row: 0 }])
        expect(typed.recorded?.[0].at).toBe(16)
        expect(marked(typed)).toBe('usb')
    })

    it('keeps what is typed over all or part of it in it, and only then', () => {
        const pieces = stepsPieces(form('Search for usb cable now', 'usb cable'))
        expect(typedInto(pieces, 11, 20, 'hdmi')).toEqual([{ text: 'Search for ' }, { text: 'hdmi', row: 0 }, { text: ' now' }])
        expect(typedInto(pieces, 15, 20, 'wire')).toEqual([{ text: 'Search for ' }, { text: 'usb wire', row: 0 }, { text: ' now' }])
        // Over the value and what's beside it, what's typed is plain, and what's left of the value stays one.
        expect(typedInto(pieces, 15, 24, '!')).toEqual([{ text: 'Search for ' }, { text: 'usb ', row: 0 }, { text: '!' }])
    })

    it('never holds a line break: a value one lands in ends there', () => {
        const pieces = stepsPieces(form('Search for usb cable now', 'usb cable'))
        expect(typedInto(pieces, 20, 20, '\n')).toEqual([{ text: 'Search for ' }, { text: 'usb cable', row: 0 }, { text: '\n now' }])
        expect(typedInto(pieces, 15, 15, '\n')).toEqual([{ text: 'Search for ' }, { text: 'usb ', row: 0 }, { text: '\ncable now' }])
        expect(typedInto(pieces, 11, 11, '\n')).toEqual([{ text: 'Search for \n' }, { text: 'usb cable', row: 0 }, { text: ' now' }])
        expect(typedInto(pieces, 11, 20, '\n')).toEqual([{ text: 'Search for \n now' }])
    })

    it('stops being a value once its mark is emptied, and stops being asked for', () => {
        const asking = switchAsking(form('Search for usb', 'usb'), 0)
        for (const left of ['', '  ']) {
            const values = typedInMark(asking, left)
            expect(values.recorded).toEqual([])
            expect(values.instructions).toBe(`Search for ${left}`)
            expect(marked(values)).toBeNull()
        }
    })

    it('asks each run with a line before the steps, which follows the value', () => {
        const asking = switchAsking(form('Search for usb', 'usb'), 0)
        expect(asking.instructions).toBe('Before you start, ask me for the search to use. Last time it was usb.\n\nSearch for usb')
        expect(marked(asking)).toBe('usb')
        const changed = typedInMark(asking, 'hdmi')
        expect(changed.instructions).toBe('Before you start, ask me for the search to use. Last time it was hdmi.\n\nSearch for hdmi')
        expect(switchAsking(changed, 0).instructions).toBe('Search for hdmi')
    })

    it('is marked again from a saved routine that asks for it, and only from the lines as they were made', () => {
        const saved = switchAsking(form('Search for usb', 'usb'), 0).instructions
        const routine = (instructions: string): Routine => ({
            id: 'r1', name: 'Job', instructions, scheduleSpec: { kind: 'manual' }, mascotId: null, sites: [], inCloud: false,
            schedule: 'Only when you ask', paused: false, nextRunAt: null, lastResult: '', status: 'idle', latestRun: null, unseen: false
        })
        const again = formFor(routine(saved))
        expect(again.recorded).toEqual([{ label: 'Search', value: 'usb', ask: true, at: 11 }])
        expect(switchAsking(again, 0).instructions).toBe('Search for usb')
        expect(formFor(routine(`${saved} cable`)).recorded).toHaveLength(1)
        expect(formFor(routine(saved.replace('Search for usb', 'Search for hdmi'))).recorded).toBeUndefined()
        expect(formFor(routine(saved.replace('\n\n', '\n'))).recorded).toBeUndefined()
        expect(formFor(routine('Search for usb')).recorded).toBeUndefined()
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
        expect(nextInWords(new Date(2026, 10, 30, 9, 0).getTime(), now)).toBe('30 Nov')
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
