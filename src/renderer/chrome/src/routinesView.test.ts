import { describe, expect, it } from 'vitest'
import { applyRecordedValue, askForRecordedValue, changeRecordedValue, recordedForm, toDraft } from './routinesView'

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
