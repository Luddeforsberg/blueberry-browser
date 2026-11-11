import type { ValleyLight } from '@shared/ipc'

// DESIGN.md section 9, hours to tune: dawn from 05:00, day from 08:00, dusk from 17:30, night from 20:30.
const DAWN = 5 * 60
const DAY = 8 * 60
const DUSK = 17 * 60 + 30
const NIGHT = 20 * 60 + 30

export const lightAt = (date: Date): ValleyLight => {
    const minutes = date.getHours() * 60 + date.getMinutes()
    if (minutes >= NIGHT || minutes < DAWN) return 'night'
    if (minutes >= DUSK) return 'dusk'
    if (minutes >= DAY) return 'day'
    return 'dawn'
}

// The light is chosen when a new tab opens and never changes while it's on screen, so each tab keeps the first one it
// got. The top bar and the page read the same one.
const chosen = new Map<string, ValleyLight>()

export const lightFor = (tabId: string, forced: ValleyLight | null, now = new Date()): ValleyLight => {
    if (forced) return forced
    let light = chosen.get(tabId)
    if (!light) {
        light = lightAt(now)
        chosen.set(tabId, light)
    }
    return light
}
