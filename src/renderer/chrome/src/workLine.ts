import type { ChatStep, SaidOnTheWay, StepKind } from '@shared/library'
import { SITE, onSites, worthKeeping } from './stepTrail'

// DESIGN.md section 10, Main chat: one line leads a reply while it works and folds where it is when it ends. Under it,
// the steps, with steps of one kind in a row on one site as one line, and what the mascot said between them where it
// said it.

// How many of the latest steps show while a job runs.
const LATEST = 3

export type WorkEntry =
    | { kind: 'step'; step: ChatStep }
    // Two or more finished steps of one kind on one site, in a row, which open to show them.
    | { kind: 'group'; steps: ChatStep[]; words: string; stepKind: StepKind }
    | { kind: 'said'; text: string }

type Grouped = Exclude<StepKind, 'ask'>

// What a group says, from its kind, how many and where. Asking is never grouped: each one is worth seeing.
const on = (site: string | null) => (site ? ` on ${site}` : '')
const GROUP_WORDS: Record<Grouped, (count: number, site: string | null) => string> = {
    open: (count, site) => `Opened ${count} pages${on(site)}`,
    read: (count, site) => `Read ${count} pages${on(site)}`,
    scan: (count, site) => `Looked over ${site ?? 'your tabs'} ${count} times`,
    search: (count, site) => `Searched ${site ?? 'the web'} ${count} times`,
    click: (count, site) => `Clicked ${count} times${on(site)}`,
    type: (count, site) => `Typed ${count} times${on(site)}`,
    wait: (count) => `Waited ${count} times`,
}

// Each step names its site in plain words, so its first host is where it was.
const siteOf = (step: ChatStep): string | null => step.text.match(SITE)?.[0]?.toLowerCase() ?? null

const groupable = (step: ChatStep): step is ChatStep & { kind: Grouped } =>
    step.done && step.kind !== undefined && step.kind !== 'ask' && !worthKeeping(step)

// The steps and the words between them, in the order they happened. Words said between two steps keep them apart, and
// the live step stands alone, so a group only ever holds finished steps.
export const workEntries = (steps: readonly ChatStep[], said: readonly SaidOnTheWay[] = []): WorkEntry[] => {
    const entries: WorkEntry[] = []
    let run: Array<ChatStep & { kind: Grouped }> = []
    const flush = () => {
        if (run.length === 1) entries.push({ kind: 'step', step: run[0] })
        if (run.length > 1) {
            entries.push({ kind: 'group', steps: run, words: GROUP_WORDS[run[0].kind](run.length, siteOf(run[0])), stepKind: run[0].kind })
        }
        run = []
    }
    const sayAfter = (count: number, last = false) =>
        said.filter(({ after }) => (last ? after >= count : after === count)).forEach(({ text }) => {
            flush()
            entries.push({ kind: 'said', text })
        })
    steps.forEach((step, index) => {
        sayAfter(index)
        if (!groupable(step)) {
            flush()
            entries.push({ kind: 'step', step })
            return
        }
        const before = run.at(-1)
        if (before && (before.kind !== step.kind || siteOf(before) !== siteOf(step))) flush()
        run.push(step)
    })
    flush()
    sayAfter(steps.length, true)
    return entries
}

// While a job runs, its latest steps and what it said among them. The working line opens the rest. One line in place
// of one more step would say less and save nothing, so a short job shows it all.
export const latestEntries = (entries: readonly WorkEntry[]): { shown: WorkEntry[]; hidden: boolean } => {
    const steps = entries.flatMap((entry, index) => (entry.kind === 'said' ? [] : [index]))
    if (steps.length <= LATEST + 1) return { shown: [...entries], hidden: false }
    return { shown: entries.slice(steps[steps.length - LATEST]), hidden: true }
}

// Folded, a finished reply still shows the steps worth seeing on any trail: anything asked, refused or handed back.
export const keptWhenFolded = (steps: readonly ChatStep[]): ChatStep[] => steps.filter(worthKeeping)

// "0:48", "12:05", "1:02:09".
export const clock = (ms: number): string => {
    const seconds = Math.max(0, Math.floor(ms / 1000))
    const two = (value: number) => String(value).padStart(2, '0')
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds % 60)}` : `${minutes}:${two(seconds % 60)}`
}

export const stepsWord = (count: number): string => `${count} ${count === 1 ? 'step' : 'steps'}`

// The folded line: "Worked 0:48", then "7 steps on klm.com". A reply saved before replies kept their time has no
// "Worked".
export const foldedWords = (steps: readonly ChatStep[], took?: number): { worked: string | null; steps: string } => ({
    worked: took === undefined ? null : `Worked ${clock(took)}`,
    steps: `${stepsWord(steps.length)}${onSites([...steps])}`,
})
