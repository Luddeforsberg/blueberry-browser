import { describe, expect, it } from 'vitest'
import { paintValley } from './painter'

describe('paintValley', () => {
    it('paints one cell per 2px, opaque, for an odd size too', () => {
        const painted = paintValley(31, 21, { top: 10, left: 4, right: 27 }, 'day')
        expect(painted.width).toBe(16)
        expect(painted.height).toBe(11)
        expect(painted.data.length).toBe(16 * 11 * 4)
        expect(painted.data.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true)
    })

    it('keeps both banks inside the frame, from the smallest window to a large one', () => {
        // The new tab's page at the 900x600 minimum with the sidebar open, and a large window with it closed.
        for (const [width, height] of [[620, 600], [1440, 900], [2560, 1400]]) {
            const { banks } = paintValley(width, height, { top: height * 0.38, left: 40, right: width - 40 }, 'night')
            for (const bank of [banks.left, banks.right]) {
                expect(bank.x).toBeGreaterThan(0)
                expect(bank.x).toBeLessThan(width)
                expect(bank.y).toBeGreaterThan(height * 0.5)
                expect(bank.y).toBeLessThan(height)
            }
            expect(banks.left.y).toBeLessThan(banks.right.y)
        }
    })
})
