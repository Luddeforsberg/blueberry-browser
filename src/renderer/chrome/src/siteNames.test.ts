import { describe, expect, it } from 'vitest'
import { asContinuation, siteParts, withSiteNames } from './siteNames'

describe('siteParts', () => {
    it('leaves a sentence with no address alone, and an empty one empty', () => {
        expect(siteParts('Press Enter')).toEqual([{ text: 'Press Enter', site: false }])
        expect(siteParts('')).toEqual([])
    })

    it('marks each site and keeps every other word', () => {
        expect(siteParts('Go to https://www.github.com/a?b=1 in the tab showing http://news.ycombinator.com/')).toEqual([
            { text: 'Go to ', site: false },
            { text: 'github.com', site: true },
            { text: ' in the tab showing ', site: false },
            { text: 'news.ycombinator.com', site: true },
        ])
    })

    it('names the host that really gets visited, not one dressed up to look like it', () => {
        expect(withSiteNames('Open https://github.com@evil.example/ in a new tab')).toBe('Open evil.example in a new tab')
        expect(withSiteNames('Open https://github.com.evil.example/ in a new tab')).toBe('Open github.com.evil.example in a new tab')
    })

    it('keeps punctuation after an address, and an address it can’t read', () => {
        expect(withSiteNames('Go back from https://a.example/b.')).toBe('Go back from a.example.')
        expect(withSiteNames('Open http://[bad in a new tab')).toBe('Open http://[bad in a new tab')
    })
})

describe('asContinuation', () => {
    it('lowers only an ordinary first word', () => {
        expect(asContinuation('Open it')).toBe('open it')
        expect(asContinuation('URL here')).toBe('URL here')
        expect(asContinuation('')).toBe('')
    })
})
