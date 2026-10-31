import { describe, expect, it } from 'vitest'
import { permissionQuestion, siteName } from './sitePermissions'

describe('permissionQuestion', () => {
    it('joins permissions into a sentence, and says camera and microphone once', () => {
        expect(permissionQuestion(['location'])).toBe('wants to know your location')
        expect(permissionQuestion(['location', 'midi'])).toBe('wants to know your location and use your MIDI devices')
        expect(permissionQuestion(['location', 'midi', 'screen'])).toBe(
            'wants to know your location, use your MIDI devices and see your entire screen'
        )
        expect(permissionQuestion(['camera', 'microphone'])).toBe('wants to use your camera and microphone')
    })
})

describe('siteName', () => {
    it('hides https but not http, and keeps the port', () => {
        expect(siteName('https://example.com')).toBe('example.com')
        expect(siteName('http://example.com:8080')).toBe('http://example.com:8080')
    })
})
