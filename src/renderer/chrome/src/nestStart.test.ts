import { describe, expect, it } from 'vitest'
import { firstBlank, isSeveralJobs, NEST_STARTERS, SEVERAL_AT } from './nestStart'

describe('isSeveralJobs', () => {
    it('is false for nothing', () => {
        expect(isSeveralJobs('')).toBe(false)
        expect(isSeveralJobs('  \n ')).toBe(false)
    })

    it('counts "each of these N" from the threshold', () => {
        expect(SEVERAL_AT).toBe(3)
        expect(isSeveralJobs('For each of these 1 companies, find the CEO')).toBe(false)
        expect(isSeveralJobs('For each of these 2 companies, find the CEO')).toBe(false)
        expect(isSeveralJobs('For each of these 3 companies, find the CEO')).toBe(true)
        expect(isSeveralJobs('For each of these 4 companies, find the CEO')).toBe(true)
        expect(isSeveralJobs('for each of these 8 companies find who runs sales')).toBe(true)
        expect(isSeveralJobs('Every one of the twelve leads needs a short intro')).toBe(true)
    })

    it('counts what is compared', () => {
        expect(isSeveralJobs('Compare Notion')).toBe(false)
        expect(isSeveralJobs('Compare Notion and Coda')).toBe(false)
        expect(isSeveralJobs('Compare Notion, Coda and Slite')).toBe(true)
        expect(isSeveralJobs('compare Notion, Coda, Slite and Confluence')).toBe(true)
        expect(isSeveralJobs('Compare these two laptops and tell me which one is better')).toBe(false)
        expect(isSeveralJobs('Compare Notion and Coda on price, features and integrations')).toBe(false)
        expect(isSeveralJobs('Compare acme.com, globex.com and initech.com')).toBe(true)
    })

    it('counts a pasted list it is asked to go through', () => {
        const list = (count: number) => ['Research each of these companies:', ...['Acme', 'Globex', 'Initech', 'Umbrella'].slice(0, count)].join('\n')
        expect(isSeveralJobs(list(1))).toBe(false)
        expect(isSeveralJobs(list(2))).toBe(false)
        expect(isSeveralJobs(list(3))).toBe(true)
        expect(isSeveralJobs(list(4))).toBe(true)
        expect(isSeveralJobs('Look up the pricing for each:\n- Linear\n- Jira\n- Asana')).toBe(true)
        expect(isSeveralJobs('Research these companies: Acme, Globex, Initech')).toBe(true)
        expect(isSeveralJobs('Research these companies: Acme, Globex')).toBe(false)
    })

    it('leaves ordinary messages alone', () => {
        for (const message of [
            'What is the weather in Stockholm tomorrow?',
            'Give me 10 ideas for a team dinner',
            'Write an email to Anna, Bob and Carl about Friday',
            'Book a table:\n1. Go to the site\n2. Pick Friday at 7\n3. Use my name',
            'Translate these lines:\nHej\nTack\nHejdå',
            'Summarize this page and list the three main points',
            'For each step, explain why, and give an example'
        ]) {
            expect(isSeveralJobs(message), message).toBe(false)
        }
    })
})

describe('starters', () => {
    it('name no site of their own', () => {
        for (const starter of NEST_STARTERS) {
            expect(starter.text).not.toMatch(/:\/\/|www|\w\.[a-z]{2,}/i)
        }
    })

    it('select their first blank', () => {
        expect(firstBlank('Find 10 [kind of company] in [place]')).toEqual([8, 25])
        expect(firstBlank('No blanks')).toEqual([0, 9])
        expect(NEST_STARTERS.every((starter) => starter.text.slice(...firstBlank(starter.text)).startsWith('['))).toBe(true)
    })
})
