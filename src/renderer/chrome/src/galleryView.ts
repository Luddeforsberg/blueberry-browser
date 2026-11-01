import type { GalleryMascot } from '@shared/library'
// Relative because the unit tests have no alias for it.
import { MAX_MASCOT_NAME, permissionsInWords } from '../../../shared/mascots'

export interface GalleryView {
    query: string
    // Null shows every category.
    category: string | null
    // The entry being reviewed, by id.
    reviewing: string | null
    sort: GallerySort
}

export type GallerySort = 'newest' | 'added'

export const GALLERY_VIEW_EVENT = 'blueberry:gallery-view'

// Lasts while the page isn't showing, so going to another tab doesn't lose your place.
let current: GalleryView = { query: '', category: null, reviewing: null, sort: 'newest' }

export const galleryView = () => current

export const setGalleryView = (patch: Partial<GalleryView>) => {
    current = { ...current, ...patch }
    window.dispatchEvent(new Event(GALLERY_VIEW_EVENT))
}

// Cards use a curly apostrophe, and keyboards type a straight one.
const forSearch = (text: string) => text.toLowerCase().replace(/’/g, "'")

// Every word has to be somewhere on the card or in what it's told to do, so "svt read" narrows rather than widens.
export const filterGallery = (entries: readonly GalleryMascot[], query: string, category: string | null): GalleryMascot[] => {
    const words = forSearch(query).split(/\s+/).filter(Boolean)
    return entries.filter((entry) => {
        if (category !== null && entry.category !== category) return false
        const { name, instructions, sites, tools } = entry.draft
        const text = forSearch([name, entry.description, entry.author, entry.category, instructions, ...sites, ...permissionsInWords({ sites, tools }).map((line) => line.text)].join(' '))
        return words.every((word) => text.includes(word))
    })
}

// What people published comes first, by the sort chosen. Starters have neither a date nor a count, so they keep their
// order after them.
export const sortGallery = (entries: readonly GalleryMascot[], sort: GallerySort): GalleryMascot[] => {
    const newest = (a: GalleryMascot, b: GalleryMascot) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)
    return [...entries].sort((a, b) => (sort === 'added' ? (b.addCount ?? -1) - (a.addCount ?? -1) || newest(a, b) : newest(a, b)))
}

// A name that's free, to start from when the entry's own is taken: Scout, then Scout 2. It stays within the limit.
export const freeName = (name: string, taken: readonly string[]): string => {
    const lower = taken.map((other) => other.toLowerCase())
    if (!lower.includes(name.toLowerCase())) return name
    for (let number = 2; ; number++) {
        const suffix = ` ${number}`
        const next = `${name.slice(0, MAX_MASCOT_NAME - suffix.length).trimEnd()}${suffix}`
        if (!lower.includes(next.toLowerCase())) return next
    }
}
