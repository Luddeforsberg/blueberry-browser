import { describe, expect, it } from 'vitest'
import { lightAt, lightFor } from './light'

const at = (hours: number, minutes: number) => new Date(2026, 10, 11, hours, minutes)

describe('lightAt', () => {
    it('changes light exactly on the hour each one starts', () => {
        expect(lightAt(at(4, 59))).toBe('night')
        expect(lightAt(at(5, 0))).toBe('dawn')
        expect(lightAt(at(7, 59))).toBe('dawn')
        expect(lightAt(at(8, 0))).toBe('day')
        expect(lightAt(at(17, 29))).toBe('day')
        expect(lightAt(at(17, 30))).toBe('dusk')
        expect(lightAt(at(20, 29))).toBe('dusk')
        expect(lightAt(at(20, 30))).toBe('night')
        expect(lightAt(at(0, 0))).toBe('night')
        expect(lightAt(at(23, 59))).toBe('night')
    })
})

describe('lightFor', () => {
    it('keeps the light a tab opened with, even once the clock has moved on', () => {
        expect(lightFor('tab-1', null, at(17, 29))).toBe('day')
        expect(lightFor('tab-1', null, at(17, 31))).toBe('day')
        expect(lightFor('tab-2', null, at(17, 31))).toBe('dusk')
    })

    it('uses a forced light whatever the clock says', () => {
        expect(lightFor('tab-3', 'night', at(12, 0))).toBe('night')
    })
})
