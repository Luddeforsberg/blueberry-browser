import { describe, expect, it } from 'vitest'
import { besideSpot, CARD_GAP, CARD_HEIGHT, CARD_WIDTH, cardStatus, fitViewport, flightDuration, flightMode, flightPath, forEachStatus, freeSpot, PERCH, pickRows, runPhase, showViewport, workingLine, ZOOM } from './nestBoard'

const card = (x: number, y: number) => ({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT })

describe('freeSpot', () => {
    it('is where it was asked for on an empty board', () => {
        expect(freeSpot([], { x: 64, y: 80 })).toEqual({ x: 64, y: 80 })
    })

    it('moves down past a card in the way, and past the one under it', () => {
        const spot = freeSpot([card(64, 80), card(64, 320)], { x: 64, y: 80 })
        expect(spot.x).toBe(64)
        expect(spot.y).toBeGreaterThanOrEqual(320 + CARD_HEIGHT)
    })
})

describe('besideSpot', () => {
    it('is level with the card, past the gap', () => {
        expect(besideSpot(card(0, 100), [card(0, 100)])).toEqual({ x: CARD_WIDTH + CARD_GAP, y: 100 })
    })

    it('goes below a card already beside it', () => {
        const taken = card(CARD_WIDTH + CARD_GAP, 100)
        expect(besideSpot(card(0, 100), [card(0, 100), taken]).y).toBeGreaterThan(100 + CARD_HEIGHT)
    })
})

describe('cardStatus', () => {
    const thread = { partial: null, approval: null, error: null, messages: [] }

    it('says what a running card waits for, if anything', () => {
        expect(cardStatus({ ...thread, partial: '' }).text).toBe('Working')
        expect(cardStatus({ ...thread, partial: '', approval: { id: 'a', text: 'Click Send' } }).text).toBe('Needs your OK')
        expect(cardStatus({ ...thread, partial: '', approval: { id: 'a', text: 'Which?', question: true } }).text).toBe('Has a question')
    })

    it('says how the last reply ended', () => {
        const asked = { role: 'user' as const, content: 'Find' }
        expect(cardStatus({ ...thread, messages: [asked, { role: 'assistant', content: 'Found' }] })).toEqual({ text: 'Done', tone: 'done' })
        expect(cardStatus({ ...thread, messages: [asked, { role: 'assistant', content: '', steps: [{ text: 'Stopped here', done: true }] }] }).text).toBe('Stopped')
        expect(cardStatus({ ...thread, error: 'Couldn’t reach the model.', messages: [asked] }).text).toBe('Didn’t finish')
    })
})

describe('workingLine', () => {
    it('names nobody, one, two and three birds', () => {
        expect(workingLine([])).toBeNull()
        expect(workingLine(['Scout'])).toBe('Scout is working')
        expect(workingLine(['Scout', 'Writer'])).toBe('Scout and Writer are working')
        expect(workingLine(['Scout', 'Writer', 'Berry'])).toBe('Scout, Writer and Berry are working')
    })
})

describe('pickRows', () => {
    it('picks one row with a plain click, and none when that row was the only one', () => {
        expect(pickRows([2, 3], 2, 4, 'one')).toEqual({ rows: [4], anchor: 4 })
        expect(pickRows([4], 4, 4, 'one')).toEqual({ rows: [], anchor: 4 })
    })

    it('adds or takes away one row with Cmd', () => {
        expect(pickRows([0, 4], 4, 2, 'toggle')).toEqual({ rows: [0, 2, 4], anchor: 2 })
        expect(pickRows([0, 2, 4], 2, 4, 'toggle')).toEqual({ rows: [0, 2], anchor: 4 })
    })

    it('picks every row from the last one clicked with Shift, either way, and just the one with nothing clicked yet', () => {
        expect(pickRows([1], 1, 3, 'range')).toEqual({ rows: [1, 2, 3], anchor: 1 })
        expect(pickRows([3], 3, 0, 'range')).toEqual({ rows: [0, 1, 2, 3], anchor: 3 })
        expect(pickRows([], null, 2, 'range')).toEqual({ rows: [2], anchor: 2 })
    })
})

describe('For each row status', () => {
    const answered = { partial: null, approval: null, error: null, messages: [{ role: 'user' as const, content: 'Go' }, { role: 'assistant' as const, content: 'Hej' }] }

    it('reads each run from its state and its chat', () => {
        expect(runPhase({ state: 'waiting' }, undefined)).toBe('waiting')
        expect(runPhase({ state: 'stopped' }, undefined)).toBe('not-started')
        expect(runPhase({ state: 'started' }, undefined)).toBe('working')
        expect(runPhase({ state: 'started' }, { ...answered, partial: '' })).toBe('working')
        expect(runPhase({ state: 'started' }, answered)).toBe('done')
        expect(runPhase({ state: 'started' }, { ...answered, error: 'No key' })).toBe('failed')
    })

    it('counts the runs that have ended while any is going, then says how they went', () => {
        expect(forEachStatus(['done', 'working', 'waiting', 'failed'])).toEqual({ text: '2 of 4', tone: 'working' })
        expect(forEachStatus(['done', 'done'])).toEqual({ text: 'Done', tone: 'done' })
        expect(forEachStatus(['done', 'failed'])).toEqual({ text: '1 didn’t finish', tone: 'failed' })
        expect(forEachStatus(['done', 'not-started'])).toEqual({ text: 'Stopped', tone: 'muted' })
    })
})

describe('fitViewport', () => {
    const box = { width: 1000, height: 800 }
    const insets = { top: 100, right: 50, bottom: 150, left: 50 }
    it('has nothing to fit on an empty board', () => {
        expect(fitViewport([], box, insets)).toBeNull()
    })
    it('centres a small board without zooming past 100%', () => {
        expect(fitViewport([{ x: 0, y: 0, width: 440, height: 200 }], box, insets)).toEqual({ x: 50 + 230, y: 100 + 175, zoom: 1 })
    })
    it('zooms out to show every card, and no further than the smallest zoom', () => {
        const wide = fitViewport([{ x: 0, y: 0, width: 440, height: 200 }, { x: 1360, y: 0, width: 440, height: 200 }], box, insets)!
        expect(wide.zoom).toBeCloseTo(900 / 1800)
        expect(wide.x).toBeCloseTo(50)
        const huge = fitViewport([{ x: 0, y: 0, width: 440, height: 200 }, { x: 0, y: 99_800, width: 440, height: 200 }], box, insets)!
        expect(huge.zoom).toBe(ZOOM.min)
        // Too tall even then, so it shows the top.
        expect(huge.y).toBe(100)
    })
})

describe('showViewport', () => {
    const box = { width: 1000, height: 800 }
    const insets = { top: 100, right: 50, bottom: 150, left: 50 }
    const at = { x: 0, y: 0, zoom: 1 }
    it('leaves the board alone when the card is in view', () => {
        expect(showViewport([{ x: 100, y: 100, width: 440, height: 200 }], at, box, insets)).toBeNull()
    })
    it('moves just enough to show a card off to the right or below', () => {
        expect(showViewport([{ x: 900, y: 100, width: 440, height: 200 }], at, box, insets)).toEqual({ x: -390, y: 0, zoom: 1 })
        expect(showViewport([{ x: 100, y: 700, width: 440, height: 200 }], at, box, insets)).toEqual({ x: 0, y: -250, zoom: 1 })
    })
    it('shows the top of a card taller than the room', () => {
        expect(showViewport([{ x: 100, y: 600, width: 440, height: 900 }], at, box, insets)).toEqual({ x: 0, y: -500, zoom: 1 })
    })
    it('counts the zoom', () => {
        expect(showViewport([{ x: 1800, y: 100, width: 440, height: 200 }], { x: 0, y: 0, zoom: 0.5 }, box, insets)).toEqual({ x: -170, y: 50, zoom: 0.5 })
    })
    it('fits several cards that are too wide together, never closer than now', () => {
        const fitted = showViewport([{ x: 0, y: 0, width: 440, height: 200 }, { x: 1360, y: 0, width: 440, height: 200 }], at, box, insets)!
        expect(fitted.zoom).toBeCloseTo(0.5)
    })
})

describe('flights along a line', () => {
    it('flies only where someone sees it, fades with reduced motion or a still bird, and never with the birds hidden', () => {
        const seen = { showBerry: true, still: false, reducedMotion: false, onScreen: true }
        expect(flightMode(seen)).toBe('fly')
        expect(flightMode({ ...seen, reducedMotion: true })).toBe('fade')
        expect(flightMode({ ...seen, still: true })).toBe('fade')
        expect(flightMode({ ...seen, onScreen: false })).toBe('none')
        expect(flightMode({ ...seen, showBerry: false, reducedMotion: true })).toBe('none')
    })

    const from = { x: 0, y: 0, width: 440, height: 300 }
    const to = { x: 560, y: 0, width: 440, height: 200 }
    it('starts on the source perch and lands on the target card, on its perch only for the same bird', () => {
        const lift = PERCH.size * PERCH.feet
        const same = flightPath(from, to, true)
        expect(same[0]).toMatchObject({ x: PERCH.left, y: -lift, offset: 0 })
        expect(same.at(-1)).toMatchObject({ x: 560 + PERCH.left, y: -lift, offset: 1 })
        expect(flightPath(from, to, false).at(-1)?.x).toBe(560 + PERCH.left + PERCH.size + 12)
    })
    it('goes along the line, at one speed', () => {
        const path = flightPath(from, to, true)
        const offsets = path.map((point) => point.offset)
        expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
        // It passes where the line leaves the source and where it meets the target.
        const lineY = PERCH.lineAt - PERCH.size * PERCH.feet
        expect(path).toContainEqual(expect.objectContaining({ x: 440, y: lineY }))
        expect(path).toContainEqual(expect.objectContaining({ x: 560, y: lineY }))
    })
    it('takes 600 to 900ms', () => {
        expect(flightDuration(flightPath(from, to, true))).toBeGreaterThanOrEqual(600)
        expect(flightDuration(flightPath(from, { ...to, x: 20_000 }, true))).toBe(900)
        expect(flightDuration([{ x: 0, y: 0, offset: 0 }, { x: 1, y: 0, offset: 1 }])).toBe(600)
    })
})
