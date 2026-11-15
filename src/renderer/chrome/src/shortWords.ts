import type { MascotDraft } from '@shared/library'

const DAY_MS = 86_400_000

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
    if (Math.abs(days) < 7) return new Date(time).toLocaleDateString('en-GB', { weekday: 'short' })
    return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// When something finished, to follow "finished it": "at 08:00" today, "yesterday", "on Mon" within the week, and
// "on 8 Nov" further back.
export const finishedWhen = (time: number, now = Date.now()): string => {
    const when = shortWhen(time, now)
    if (/^\d\d:\d\d$/.test(when)) return `at ${when}`
    return when === 'yesterday' ? when : `on ${when}`
}

// How long something has been going: "now", "4m", "2h", "3d".
export const shortAge = (since: number, now = Date.now()): string => {
    const minutes = Math.floor((now - since) / 60_000)
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
    return `${Math.floor(minutes / 1440)}d`
}

// What a mascot may do, in one mono line: where, then what with its hands. "goes anywhere · clicks and types".
export const limitsInBrief = ({ sites, tools }: Pick<MascotDraft, 'sites' | 'tools'>): string => {
    const visits = tools.includes('visit')
    const clicks = tools.includes('click')
    const types = tools.includes('type')
    const where =
        sites.length === 1 ? `only ${sites[0]}` : sites.length > 1 ? `${sites.length} sites` : visits ? 'goes anywhere' : 'the page you’re on'
    const hands = clicks && types ? 'clicks and types' : clicks ? 'clicks' : types ? 'types' : 'reads'
    return `${where} · ${hands}`
}
