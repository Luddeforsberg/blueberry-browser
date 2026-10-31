import type { MascotAccessory, MascotDraft, MascotPalette, MascotProfile, MascotTool } from '@shared/library'
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
    // The suggestion that filled this in, which goes away once it's saved.
    suggestionId?: string
}

export type FlockView = { page: 'list'; landed?: string } | { page: 'form'; values: MascotFormValues }

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
    tools: MASCOT_TOOLS.map(({ id }) => id)
})

// A new look and name, never one someone else in the flock already has.
export const surprise = (values: MascotFormValues, taken: string[]): MascotFormValues => ({
    ...values,
    ...randomLook(),
    name: oneOf(NAMES.filter((name) => name !== values.name && !taken.includes(name))) ?? values.name
})

export const mascotForm = ({ id, name, look, instructions, sites, tools }: MascotProfile): MascotFormValues => ({
    id,
    name,
    ...look,
    instructions,
    onlySomeSites: sites.length > 0,
    sitesText: sites.join(', '),
    tools
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

export const flockView = () => current

export const setFlockView = (view: FlockView) => {
    current = view
    window.dispatchEvent(new Event(FLOCK_VIEW_EVENT))
}
