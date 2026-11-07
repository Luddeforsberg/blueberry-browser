import { describe, expect, it } from 'vitest'
import { besideSpot, CARD_GAP, CARD_HEIGHT, CARD_WIDTH, cardStatus, fitViewport, flightDuration, flightMode, flightPath, forEachStatus, freeSpot, latestReply, PERCH, pickRows, roomToGrow, runPhase, settle, settleHeight, showViewport, workingLine, ZOOM, type PlacedCard } from './nestBoard'

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

    it('goes below every card when a long column leaves no gap nearer, and never onto one', () => {
        const column = Array.from({ length: 60 }, (_, index) => card(64, 80 + index * (CARD_HEIGHT + 24)))
        const spot = freeSpot(column, { x: 64, y: 80 })
        expect(spot.x).toBe(64)
        const last = column.at(-1)!
        expect(spot.y).toBeGreaterThanOrEqual(last.y + last.height)
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

describe('settle', () => {
    const placed = (id: string, y: number, height: number, movable = true, x = 0): PlacedCard => ({ id, x, y, width: CARD_WIDTH, height, movable })
    // Applies the nudges, as the board does.
    const after = (cards: PlacedCard[]) => {
        const nudges = settle(cards)
        return cards.map((card) => ({ ...card, ...nudges.find((nudge) => nudge.id === card.id) }))
    }
    const covering = (cards: PlacedCard[]) =>
        cards.flatMap((a, index) => cards.slice(index + 1).filter((b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).map((b) => [a.id, b.id]))

    it('leaves a board where nothing covers anything', () => {
        expect(settle([])).toEqual([])
        expect(settle([placed('a', 0, 200), placed('b', 300, 200), placed('c', 0, 200, true, CARD_WIDTH + CARD_GAP)])).toEqual([])
    })

    it('moves the cards placed for the user down, once one above them grows, so nothing overlaps', () => {
        // A table card's answer arrived: it grew from 200 to 520, over the two placed under it.
        const cards = after([placed('table', 0, 520), placed('next', 260, 200), placed('last', 500, 300)])
        expect(covering(cards)).toEqual([])
        expect(cards.find((card) => card.id === 'table')!.y).toBe(0)
        // Only down, and only as far as needed.
        const next = cards.find((card) => card.id === 'next')!
        expect(next.y).toBeGreaterThanOrEqual(520)
        expect(next.y).toBeLessThan(600)
        expect(cards.find((card) => card.id === 'last')!.y).toBeGreaterThanOrEqual(next.y + 200)
    })

    it('never moves a card the user placed or moved, and moves the others past it', () => {
        const nudges = settle([placed('table', 0, 520), placed('dragged', 400, 200, false), placed('auto', 300, 200)])
        expect(nudges.map((nudge) => nudge.id)).toEqual(['auto'])
        expect(nudges[0].y).toBeGreaterThanOrEqual(600)
    })

    it('leaves a card that grew over one the user placed, rather than jump it past', () => {
        expect(settle([placed('grew', 0, 520), placed('dragged', 300, 200, false)])).toEqual([])
    })

    it('leaves cards beside the one that grew', () => {
        expect(settle([placed('table', 0, 900), placed('beside', 100, 200, true, CARD_WIDTH + CARD_GAP)])).toEqual([])
    })
})

describe('settleHeight', () => {
    it('counts an open card, and one just closed, at its closed height until it is measured closed again', () => {
        const heights = { closed: new Map<string, number>(), open: new Map<string, number>() }
        expect(settleHeight(heights, 'a', 200, false)).toBe(200)
        // Opened, it measures 800, and still counts as 200.
        expect(settleHeight(heights, 'a', 200, true)).toBe(200)
        expect(settleHeight(heights, 'a', 800, true)).toBe(200)
        // Closed, before it's measured again, the 800 is the open one.
        expect(settleHeight(heights, 'a', 800, false)).toBe(200)
        // Measured closed again, and then grown with an answer.
        expect(settleHeight(heights, 'a', 210, false)).toBe(210)
        expect(settleHeight(heights, 'a', 480, false)).toBe(480)
    })

    it('counts a card opened before it was ever measured closed at the size a card is taken to be', () => {
        const heights = { closed: new Map<string, number>(), open: new Map<string, number>() }
        expect(settleHeight(heights, 'a', 800, true)).toBe(CARD_HEIGHT)
        expect(settleHeight(heights, 'a', 800, false)).toBe(CARD_HEIGHT)
        expect(settleHeight(heights, 'a', 260, false)).toBe(260)
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

describe('latestReply', () => {
    it('is the answer being written, or the newest one with words since the user last wrote', () => {
        const messages = [
            { role: 'user' as const, content: 'Find companies' },
            { role: 'assistant' as const, content: 'Twelve companies' },
            { role: 'user' as const, content: 'Only Swedish ones' }
        ]
        expect(latestReply({ partial: null, messages: [...messages, { role: 'assistant', content: 'Five' }, { role: 'assistant', content: ' ' }] })).toBe('Five')
        expect(latestReply({ partial: 'Fi', messages })).toBe('Fi')
        expect(latestReply({ partial: null, messages: [...messages, { role: 'assistant', content: '' }] })).toBeNull()
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

describe('roomToGrow', () => {
    const card = { x: 0, y: 0, width: 440, height: 300 }
    const right = { x: 600, y: 0, width: 440, height: 300 }
    const below = { x: 0, y: 500, width: 440, height: 300 }

    it('lets a card grow as far as asked with nothing in the way', () => {
        expect(roomToGrow(card, [], { width: 1200, height: 1200 })).toEqual({ width: 1200, height: 1200 })
        expect(roomToGrow(card, [{ x: 0, y: -400, width: 440, height: 300 }], { width: 900, height: 900 })).toEqual({ width: 900, height: 900 })
    })

    it('stops short of a card to its right or below it, and nothing else moves', () => {
        expect(roomToGrow(card, [right], { width: 900, height: 300 })).toEqual({ width: 576, height: 300 })
        expect(roomToGrow(card, [below], { width: 440, height: 900 })).toEqual({ width: 440, height: 476 })
        expect(roomToGrow(card, [right, below], { width: 900, height: 900 })).toEqual({ width: 576, height: 476 })
        // Up to the edge it's allowed, and one past it stops there.
        expect(roomToGrow(card, [right], { width: 576, height: 300 })).toEqual({ width: 576, height: 300 })
        expect(roomToGrow(card, [right], { width: 601, height: 300 })).toEqual({ width: 576, height: 300 })
    })

    it('at a card off its corner, stops at whichever edge leaves it bigger', () => {
        const corner = { x: 600, y: 400, width: 200, height: 200 }
        expect(roomToGrow(card, [corner], { width: 1000, height: 500 })).toEqual({ width: 1000, height: 376 })
        expect(roomToGrow(card, [corner], { width: 700, height: 1000 })).toEqual({ width: 576, height: 1000 })
    })

    it('never shrinks a card below where it started, and a card it already covered never stops it', () => {
        const close = { x: 460, y: 0, width: 440, height: 300 }
        expect(roomToGrow(card, [close], { width: 800, height: 300 })).toEqual({ width: 440, height: 300 })
        const under = { x: 100, y: 100, width: 200, height: 200 }
        expect(roomToGrow(card, [under], { width: 900, height: 900 })).toEqual({ width: 900, height: 900 })
        expect(roomToGrow(card, [right], { width: 380, height: 260 })).toEqual({ width: 380, height: 260 })
    })
})
