// Ways into a Nest that only fill in its composer: starters on an empty board, and a chat's request that's plainly several
// jobs. Nothing here sends. What the user sends is their own words, read by the planner as any typed request is, so a
// starter's words name no site and choose no tool.

export interface NestStarter {
    label: string
    // With blanks in square brackets, the first of which is selected when it fills the composer.
    text: string
}

export const NEST_STARTERS: readonly NestStarter[] = [
    { label: 'Find customers', text: 'Find 10 [kind of company] in [place] that [what makes them a fit], with a contact at each.' },
    { label: 'Compare competitors', text: 'Compare [my product] with [competitor], [competitor] and [competitor] on price, features and who they sell to.' },
    { label: 'Shortlist candidates', text: 'Find 8 people for a [role] in [place] with [must-have experience], and shortlist the best 3 with why.' }
]

// Where the first blank is, to select it so typing replaces it. The whole text when there's none.
export const firstBlank = (text: string): [number, number] => {
    const match = /\[[^\]\n]*\]/.exec(text)
    return match ? [match.index, match.index + match[0].length] : [0, text.length]
}

// How many separate things make a request several jobs: two is one comparison, three is a set of jobs side by side.
export const SEVERAL_AT = 3

const NUMBER_WORDS: Record<string, number> = {
    two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, fifteen: 15, twenty: 20
}
const COUNT = '(\\d{1,3}|' + Object.keys(NUMBER_WORDS).join('|') + ')'
// "for each of these 8 companies", "every one of the twelve leads", "all of my 5 accounts".
const COUNTED_EACH = new RegExp(`\\b(?:each|every|all)\\s+(?:one\\s+)?of\\s+(?:these|those|the|my|our)\\s+${COUNT}\\b`, 'i')
// Words that go through a list one by one, rather than doing one thing with it, as translating it would.
const OVER_A_LIST = /\b(each|every|compare|research|look (?:up|into))\b/i
const LIST_LINE = /^\s*(?:[-*•–]|\d{1,2}[.)])\s+\S/
// What's compared runs to the end of the sentence, where a dot is followed by a space, so acme.com stays whole.
const COMPARE = /\bcompare\s+(.+?)(?=[.?!](?:\s|$)|\n|$)/i
// From here on it's how they're compared, not more of them: "on price, features and integrations".
const COMPARED_ON = /\s(?:on|by|for|across|in terms of|based on|regarding|when it comes to)\s.*$/i
// Each part of a list is a name or a short phrase, never a clause of its own.
const ITEM_WORDS = 5

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length

const countOf = (word: string): number => NUMBER_WORDS[word.toLowerCase()] ?? Number(word)

const listItems = (text: string): number =>
    text
        .split(/,|;|\band\b|\bor\b|\bvs\.?|\bversus\b/i)
        .map((part) => part.trim())
        .filter((part) => part !== '' && words(part) <= ITEM_WORDS).length

// Lines after the first that are a list: bullets or numbers, or short lines with no sentence in them, as a list pasted
// from somewhere is.
const listedLines = (text: string): number =>
    text
        .split('\n')
        .slice(1)
        .filter((line) => LIST_LINE.test(line) || (line.trim() !== '' && words(line) <= ITEM_WORDS && !/[.?!:]\s*$/.test(line.trim()))).length

// "Research these companies: Acme, Globex, Initech", on one line.
const listAfterColon = (text: string): number =>
    Math.max(0, ...text.split('\n').map((line) => {
        const colon = line.indexOf(':')
        return colon > 0 && OVER_A_LIST.test(line.slice(0, colon)) ? listItems(line.slice(colon + 1)) : 0
    }))

// Whether a message is plainly several jobs, such as "for each of these 8 companies…", a pasted list to go through, or
// "compare A, B, C and D". Only plain cases: anything less certain is one chat, as it always was.
export const isSeveralJobs = (message: string): boolean => {
    const text = message.trim()
    if (!text) return false
    const counted = COUNTED_EACH.exec(text)
    if (counted && countOf(counted[1]) >= SEVERAL_AT) return true
    const compared = COMPARE.exec(text)
    if (compared && listItems(compared[1].replace(COMPARED_ON, '')) >= SEVERAL_AT) return true
    if (!OVER_A_LIST.test(text)) return false
    return listedLines(text) >= SEVERAL_AT || listAfterColon(text) >= SEVERAL_AT
}

// What a new Nest's composer starts with, kept for it until its board is drawn and takes it, since the page may be drawn
// before or after it's left. Memory only.
const waiting = new Map<string, string>()
const listeners = new Set<() => void>()

export const leaveInComposer = (nestId: string, text: string): void => {
    waiting.set(nestId, text)
    listeners.forEach((listener) => listener())
}

export const takeFromComposer = (nestId: string): string | null => {
    const text = waiting.get(nestId) ?? null
    waiting.delete(nestId)
    return text
}

export const onLeftInComposer = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
}
