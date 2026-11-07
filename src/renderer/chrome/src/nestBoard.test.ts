import { describe, expect, it } from 'vitest'
import { besideSpot, CARD_GAP, CARD_HEIGHT, CARD_WIDTH, cardStatus, freeSpot, workingLine } from './nestBoard'

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
