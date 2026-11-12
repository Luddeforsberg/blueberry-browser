import { describe, expect, it } from 'vitest'
import { paintValley } from './painter'

describe('paintValley', () => {
    it('paints every device pixel, opaque, for an odd size and a scaled screen too', () => {
        for (const [dpr, width, height] of [[1, 31, 21], [1.25, 39, 26], [2, 62, 42]]) {
            const painted = paintValley(31, 21, { top: 10, left: 4, right: 27 }, 'day', dpr)
            expect([painted.width, painted.height]).toEqual([width, height])
            expect(painted.data.length).toBe(width * height * 4)
            expect(painted.data.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true)
        }
    })

    it("works out each pixel on its own, so an edge doesn't step in 2px stairs", () => {
        // At 100% each 2x2 cell shares its grain, so two pixels in one cell differ only where the picture does. Across
        // the whole picture, many cells must hold pixels that differ.
        const { data, width, height } = paintValley(200, 160, { top: 60, left: 20, right: 180 }, 'day')
        let split = 0
        for (let y = 0; y < height - 1; y += 2) {
            for (let x = 0; x < width - 1; x += 2) {
                const a = (y * width + x) * 4, b = a + 4, c = a + width * 4
                if (data[a] !== data[b] || data[a] !== data[c] || data[a + 2] !== data[b + 2] || data[a + 2] !== data[c + 2]) split++
            }
        }
        expect(split).toBeGreaterThan(100)
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
