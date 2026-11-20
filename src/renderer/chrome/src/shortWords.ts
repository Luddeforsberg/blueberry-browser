import type { MascotDraft } from '@shared/library'

const DAY_MS = 86_400_000

const weekday = (time: number) => new Date(time).toLocaleDateString('en-GB', { weekday: 'short' })
const dayAndMonth = (time: number) => new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const twoDigits = (n: number) => String(n).padStart(2, '0')

const dayOf = (time: number) => {
    const date = new Date(time)
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
}

// When something happened or will, as short as a row has room for: "08:00" today, "yesterday" or "tomorrow", a
// weekday within the week either way, and a date further off.
export const shortWhen = (time: number, now = Date.now()): string => {
    const days = dayOf(time) - dayOf(now)
    if (days === 0) return new Date(time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (days === -1) return 'yesterday'
    if (days === 1) return 'tomorrow'
    if (Math.abs(days) < 7) return weekday(time)
    return dayAndMonth(time)
}

// When something finished, to follow "finished it": "at 08:00" today, "yesterday", "on Mon" within the week, and
// "on 8 Nov" further back.
export const finishedWhen = (time: number, now = Date.now()): string => {
    const when = shortWhen(time, now)
    if (/^\d\d:\d\d$/.test(when)) return `at ${when}`
    return when === 'yesterday' ? when : `on ${when}`
}

// The one way a row writes a time (DESIGN.md section 10, Sidebar). Something going on is how long so far, "0:48",
// then "1:02:05". The past is how long ago, "now", "12m", "2h", then the weekday for a week, "Sat", then the date,
// "3 Nov". The future is when, as `shortWhen` says it.
export const rowTime = (time: number, { now = Date.now(), going = false }: { now?: number; going?: boolean } = {}): string => {
    if (going) {
        const seconds = Math.max(0, Math.floor((now - time) / 1000))
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor(seconds / 60) % 60
        return hours > 0 ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds % 60)}` : `${minutes}:${twoDigits(seconds % 60)}`
    }
    if (time > now) return shortWhen(time, now)
    const minutes = Math.floor((now - time) / 60_000)
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
    return dayOf(now) - dayOf(time) < 7 ? weekday(time) : dayAndMonth(time)
}

// What a mascot may do, in one line of words: where, then what with its hands. "Goes anywhere · clicks and types".
export const limitsInBrief = ({ sites, tools }: Pick<MascotDraft, 'sites' | 'tools'>): string => {
    const visits = tools.includes('visit')
    const clicks = tools.includes('click')
    const types = tools.includes('type')
    const where = sites.length === 1 ? `Only ${sites[0]}` : sites.length > 1 ? `${sites.length} sites` : visits ? 'Goes anywhere' : 'This page'
    const hands = clicks && types ? 'clicks and types' : clicks ? 'clicks' : types ? 'types' : 'reads'
    return `${where} · ${hands}`
}

// Only what's narrower than Berry, for the pill on a mascot's row: "This page · reads only", "Reads only". Null for a
// mascot that may do all Berry may, since there's nothing to say.
export const narrowerLimits = ({ sites, tools }: Pick<MascotDraft, 'sites' | 'tools'>): string | null => {
    const visits = tools.includes('visit')
    const clicks = tools.includes('click')
    const types = tools.includes('type')
    const where = sites.length === 1 ? `only ${sites[0]}` : sites.length > 1 ? `${sites.length} sites` : visits ? null : 'this page'
    const hands = clicks && types ? null : clicks ? 'no typing' : types ? 'no clicking' : 'reads only'
    const words = [where, hands].filter(Boolean).join(' · ')
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : null
}

// One line on what a mascot is for: the first sentence of its instructions, cut at a word, never mid-word, when it runs
// past `max`.
export const firstSentence = (text: string, max = 90): string => {
    const flat = text.replace(/\s+/g, ' ').trim()
    const end = flat.search(/[.!?](\s|$)/)
    const sentence = end === -1 ? flat : flat.slice(0, end + 1)
    if (sentence.length <= max) return sentence
    const cut = sentence.slice(0, max + 1)
    const space = cut.lastIndexOf(' ')
    return `${(space > 0 ? cut.slice(0, space) : sentence.slice(0, max)).replace(/[\s,;:·–—-]+$/, '')}…`
}
