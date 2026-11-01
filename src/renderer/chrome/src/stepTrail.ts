import type { ChatStep } from '@shared/library'

// How many of the latest steps show while a job runs, or where one was cut short.
const LATEST = 3

// The user was asked something or the job stayed out of somewhere, which is worth seeing on any trail. The words come
// from the tools' labels in `browserTools.ts`.
const WORTH_KEEPING = /^(Asked you|Stayed off|Left the tab you took over)/

export type TrailStep = { step: ChatStep; index: number }

export interface Trail {
    // The steps showing, in order.
    shown: TrailStep[]
    // How many more the quiet line stands for.
    hidden: number
    // What the quiet line says.
    line: string | null
}

// Each step names its site in plain words, so this is only ever a host.
const SITE = /\b(?:localhost|(?:[a-z0-9-]+\.)+[a-z0-9-]+)\b/gi

const sitesIn = (steps: ChatStep[]): string[] => {
    const counts = new Map<string, number>()
    for (const { text } of steps) {
        for (const [site] of text.matchAll(SITE)) counts.set(site.toLowerCase(), (counts.get(site.toLowerCase()) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([site]) => site)
}

const onSites = (steps: ChatStep[]): string => {
    const sites = sitesIn(steps)
    if (sites.length === 0) return ''
    if (sites.length === 1) return ` on ${sites[0]}`
    if (sites.length === 2) return ` on ${sites[0]} and ${sites[1]}`
    return ` on ${sites.length} sites`
}

// While a job runs, the latest steps are what tell you what's going on, with the current one last. Once it has finished,
// one line says what it came to. A job cut short keeps its latest steps showing, so you can see where it ended.
export const trailFor = (steps: ChatStep[], { running, cutShort = false, open = false }: { running: boolean; cutShort?: boolean; open?: boolean }): Trail => {
    const all = steps.map((step, index) => ({ step, index }))
    const tail = running || cutShort
    // One line in place of one more step would say less and save nothing.
    if (all.length <= (tail ? LATEST + 1 : 1)) return { shown: all, hidden: 0, line: null }
    const line = tail ? `${all.length - LATEST} earlier steps` : `${all.length} steps${onSites(steps)}`
    if (open) return { shown: all, hidden: 0, line }
    const latest = tail ? all.slice(-LATEST) : []
    const shown = all.filter((item) => latest.includes(item) || WORTH_KEEPING.test(item.step.text))
    return { shown, hidden: all.length - shown.length, line }
}
