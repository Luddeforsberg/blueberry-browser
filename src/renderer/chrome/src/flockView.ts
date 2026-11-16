import type { ChatThread, MascotAccessory, MascotDraft, MascotPalette, MascotProfile, MascotTool } from '@shared/library'
import { ACCESSORIES, BERRY, MASCOT_TOOLS, PALETTES } from '@shared/mascots'
import { flockParam, type FlockPlace, type MascotPart } from '@shared/flockPlaces'

export interface MascotFormValues {
    // Null for a new mascot.
    id: string | null
    name: string
    palette: MascotPalette
    accessory: MascotAccessory
    instructions: string
    onlySomeSites: boolean
    // Each as the user added it. Main checks them again when it's saved.
    sites: string[]
    tools: MascotTool[]
    worksInCloud: boolean
    // The suggestion that filled this in, which goes away once it's saved.
    suggestionId?: string
}

// What's being chosen on the way to publishing. It's only what the user typed: nothing goes anywhere until they confirm.
export interface PublishValues {
    author: string
    description: string
    category: string
    // The chat the example started from. The words below are what would go, and they've been checked only once `checked` is on.
    exampleChatId: string | null
    prompt: string
    answer: string
    checked: boolean
    // Filled in from what's already published, so it only happens once.
    filledIn: boolean
}

export const blankPublish = (): PublishValues => ({ author: '', description: '', category: 'Other', exampleChatId: null, prompt: '', answer: '', checked: false, filledIn: false })

// The last thing asked and the answer it got, so the two go together. Nothing else in the chat comes along.
export const lastExchange = ({ messages }: Pick<ChatThread, 'messages'>): { prompt: string; answer: string } | null => {
    const answerAt = messages.findLastIndex((message) => message.role === 'assistant')
    const prompt = messages.slice(0, Math.max(answerAt, 0)).findLast((message) => message.role === 'user')
    return prompt ? { prompt: prompt.content, answer: messages[answerAt].content } : null
}

const NAMES = ['Pip', 'Scout', 'Juno', 'Wren', 'Otis', 'Margot', 'Figaro', 'Mabel', 'Ziggy', 'Clementine', 'Rook', 'Nimbus']

const oneOf = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

const randomLook = () => ({
    // Not Berry's, so a new one starts out as itself.
    palette: oneOf(PALETTES.filter(({ id }) => id !== BERRY.look.palette)).id,
    accessory: oneOf(ACCESSORIES.filter(({ id }) => id !== 'none')).id
})

export const blankMascot = (): MascotFormValues => ({
    id: null,
    name: '',
    ...randomLook(),
    instructions: '',
    onlySomeSites: false,
    sites: [],
    tools: MASCOT_TOOLS.map(({ id }) => id),
    worksInCloud: false
})

// A new look and name, never one someone else in the flock already has.
export const surprise = (values: MascotFormValues, taken: string[]): MascotFormValues => ({
    ...values,
    ...randomLook(),
    name: oneOf(NAMES.filter((name) => name !== values.name && !taken.includes(name))) ?? values.name
})

export const mascotForm = ({ id, name, look, instructions, sites, tools, worksInCloud = false }: MascotProfile): MascotFormValues => ({
    id,
    name,
    ...look,
    instructions,
    onlySomeSites: sites.length > 0,
    sites,
    tools,
    worksInCloud
})

export const suggestedMascot = (draft: MascotDraft, suggestionId: string): MascotFormValues => ({
    ...mascotForm({ ...draft, id: '', deletedAt: null }),
    id: null,
    suggestionId
})

export const sitesFrom = ({ onlySomeSites, sites }: Pick<MascotFormValues, 'onlySomeSites' | 'sites'>): string[] => (onlySomeSites ? sites : [])

export const toMascotDraft = (values: MascotFormValues): MascotDraft => ({
    name: values.name,
    look: { palette: values.palette, accessory: values.accessory },
    instructions: values.instructions,
    sites: sitesFrom(values),
    tools: values.tools
})

// What each part of a mascot is, among the form's values.
const PART_FIELDS = {
    look: ['palette', 'accessory'],
    name: ['name'],
    purpose: ['instructions'],
    limits: ['onlySomeSites', 'sites', 'tools']
} as const satisfies Record<MascotPart, readonly (keyof MascotFormValues)[]>

// The mascot as it is now with one part as it was changed, so a part changed on its own never puts back anything else
// from when it was opened.
export const withPart = (current: MascotFormValues, changed: MascotFormValues, part: MascotPart): MascotFormValues => ({
    ...current,
    ...Object.fromEntries(PART_FIELDS[part].map((field) => [field, changed[field]]))
})

// Who the dock shows when the flock doesn't fit in `room` faces: as many as fit beside a count of the rest. One that's
// asking or working is never among the hidden, so it takes the place of the last one at rest, after the first.
export const dockFaces = <T,>(flock: T[], room: number, busy: (mascot: T) => boolean): { shown: T[]; more: number } => {
    if (flock.length <= room) return { shown: flock, more: 0 }
    const shown = flock.slice(0, Math.max(1, room - 1))
    for (const mascot of flock.slice(shown.length)) {
        if (!busy(mascot)) continue
        let at = shown.length - 1
        while (at > 0 && busy(shown[at])) at--
        if (at > 0) shown[at] = mascot
    }
    return { shown, more: flock.length - shown.length }
}

// The mascots' page at a place. It moves around itself this way too, so where it is lives in its tab's param, which is
// how Back and a restored session find it.
export const openMascots = (place: FlockPlace) => void window.chromeAPI.browser.openPage('flock', { param: flockParam(place) })

// What's being typed on the mascots' page, by tab, for the one place it was typed in. It lasts while the tab is away, so
// going to another tab and back loses nothing, and goes once the page has moved anywhere else, so leaving keeps nothing.
const drafts = new Map<string, { param: string; value: unknown }>()

export const tabDraft = <T,>(tabId: string, param: string, fresh: () => T): T => {
    const kept = drafts.get(tabId)
    return kept?.param === param ? (kept.value as T) : fresh()
}

export const keepTabDraft = (tabId: string, param: string, value: unknown) => {
    drafts.set(tabId, { param, value })
}

export const forgetTabDraftElsewhere = (tabId: string, param: string) => {
    if (drafts.get(tabId)?.param !== param) drafts.delete(tabId)
}

// A new mascot started from elsewhere, such as New mascot in the chooser or a suggestion, with its answers filled in.
// The steps take it when they show, whichever tab they're in.
export const NEW_MASCOT_EVENT = 'blueberry:new-mascot'
let started: MascotFormValues | null = null

export const startMascot = (values: MascotFormValues = blankMascot()) => {
    started = values
    window.dispatchEvent(new Event(NEW_MASCOT_EVENT))
    openMascots({ page: 'new' })
}

export const takeStartedMascot = (): MascotFormValues | null => {
    const values = started
    started = null
    return values
}
