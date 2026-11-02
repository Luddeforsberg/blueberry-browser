import { describe, expect, it } from 'vitest'
import { liveFrameLock } from './cloudView'

describe('the live view frame', () => {
    it("is inert and out of the tab order until the user takes over", () => {
        expect(liveFrameLock(false)).toMatchObject({ inert: true, tabIndex: -1 })
    })

    it('takes the pointer and the keyboard once they have', () => {
        expect(liveFrameLock(true)).toEqual({})
    })
})
