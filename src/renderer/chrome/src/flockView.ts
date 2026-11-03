import type { ChatThread, MascotAccessory, MascotDraft, MascotPalette, MascotProfile, MascotTool } from '@shared/library'
import { ACCESSORIES, MASCOT_TOOLS, PALETTES } from '@shared/mascots'

export interface MascotFormValues {
    // Null for a new mascot.
    id: string | null
    name: string
    palette: MascotPalette
    accessory: MascotAccessory
    instructions: string
    onlySomeSites: boolean
    sitesText: string
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

export type FlockView =
    | { page: 'list'; landed?: string }
    | { page: 'form'; values: MascotFormValues }
    | { page: 'publish'; mascotId: string; values: PublishValues }
    // `returnTo` is a form left to look at this, with whatever had been changed in it.
    | { page: 'memory'; mascotId: string; returnTo?: MascotFormValues }

const NAMES = ['Pip', 'Scout', 'Juno', 'Wren', 'Otis', 'Margot', 'Figaro', 'Mabel', 'Ziggy', 'Clementine', 'Rook', 'Nimbus']

const oneOf = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

const randomLook = () => ({
    // Not the jackdaw, which is Berry's, so a new one starts out as itself.
    palette: oneOf(PALETTES.filter(({ id }) => id !== 'jackdaw')).id,
    accessory: oneOf(ACCESSORIES.filter(({ id }) => id !== 'none')).id
})

export const blankMascot = (): MascotFormValues => ({
    id: null,
    name: '',
    ...randomLook(),
    instructions: '',
    onlySomeSites: false,
    sitesText: '',
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
    sitesText: sites.join(', '),
    tools,
    worksInCloud
})

export const suggestedMascot = (draft: MascotDraft, suggestionId: string): MascotFormValues => ({
    ...mascotForm({ ...draft, id: '', deletedAt: null }),
    id: null,
    suggestionId
})

export const sitesFrom = ({ onlySomeSites, sitesText }: Pick<MascotFormValues, 'onlySomeSites' | 'sitesText'>): string[] =>
    onlySomeSites ? sitesText.split(/[\s,]+/).filter(Boolean) : []

export const toMascotDraft = (values: MascotFormValues): MascotDraft => ({
    name: values.name,
    look: { palette: values.palette, accessory: values.accessory },
    instructions: values.instructions,
    sites: sitesFrom(values),
    tools: values.tools
})

export const FLOCK_VIEW_EVENT = 'blueberry:flock-view'

// Lasts while the page isn't showing, so going to another tab doesn't lose what's been typed.
let current: FlockView = { page: 'list' }
// The Flock tab it belongs to, so a Flock tab opened again starts on the list. Null when it was set from elsewhere with
// no Flock page showing, which is for the Flock tab about to show.
let owner: string | null = null
let showing = false

export const flockView = () => current

// What the Flock page in `tabId` shows: the list, unless it's that tab's own view or one just set for it.
export const flockViewFor = (tabId: string): FlockView => {
    if (owner !== null && owner !== tabId) current = { page: 'list' }
    owner = tabId
    return current
}

// Whether a Flock page is on screen, so a view set meanwhile is its own.
export const setFlockShowing = (on: boolean) => {
    showing = on
}

export const setFlockView = (view: FlockView) => {
    current = view
    if (!showing) owner = null
    window.dispatchEvent(new Event(FLOCK_VIEW_EVENT))
}
