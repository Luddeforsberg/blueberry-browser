import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Bookmark, SavedSiteList } from '@shared/library'
import { DRAG_THRESHOLD } from './useTabDrag'

export interface Box {
    left: number
    top: number
    right: number
    bottom: number
}

// Where a drop lands among the others, as the place it ends up. Tiles read in rows, so it goes before the first tile
// the point is above, or level with and left of the middle of. Rows go one under another, so it goes before the first
// row whose middle is below the point.
export const placeAmong = (x: number, y: number, boxes: readonly Box[], layout: 'tiles' | 'rows'): number => {
    const at = boxes.findIndex((box) =>
        layout === 'rows' ? y < (box.top + box.bottom) / 2 : y < box.top || (y <= box.bottom && x < (box.left + box.right) / 2)
    )
    return at === -1 ? boxes.length : at
}

// The line that shows where it lands: upright before a tile or after the last, level above a row or under the last.
export const markAt = (index: number, boxes: readonly Box[], layout: 'tiles' | 'rows', zone: Box): Box => {
    const box = boxes[Math.min(index, boxes.length - 1)]
    if (!box) return { left: zone.left, top: zone.top, right: zone.right, bottom: zone.top + 2 }
    const after = index >= boxes.length
    if (layout === 'rows') {
        const y = after ? box.bottom : box.top
        return { left: box.left, top: y - 1, right: box.right, bottom: y + 1 }
    }
    const x = after ? box.right + 3 : box.left - 3
    return { left: x - 1, top: box.top, right: x + 1, bottom: box.bottom }
}

const ZONE_MARGIN = 8

export interface SiteDrag {
    site: Bookmark
    from: SavedSiteList
    x: number
    y: number
    // Where it would land, and the line that shows it. Nowhere, it goes back.
    over: { list: SavedSiteList; index: number; mark: Box } | null
}

// How each list lays its sites out: in the sidebar the tiles read in rows and the bookmarks go one under another; in the
// horizontal bookmarks bar both run along one row.
export type SiteLayouts = Record<SavedSiteList, 'tiles' | 'rows'>
const SIDEBAR_LAYOUTS: SiteLayouts = { favourites: 'tiles', bookmarks: 'rows' }

// Dragging saved sites between the tiles on top and the bookmarks, and along either. Each list marks itself with
// `zone`, and each site in it with `data-saved-site`. On release the site goes to main at its new place.
export const useSiteDrag = (onPlace: (id: string, list: SavedSiteList, index: number) => void, layouts: SiteLayouts = SIDEBAR_LAYOUTS) => {
    const zones = useRef<Partial<Record<SavedSiteList, HTMLElement | null>>>({})
    const [drag, setDrag] = useState<SiteDrag | null>(null)
    const stopListening = useRef<() => void>(undefined)

    useEffect(() => () => stopListening.current?.(), [])

    const overAt = (x: number, y: number, id: string): SiteDrag['over'] => {
        for (const list of ['favourites', 'bookmarks'] as const) {
            const zone = zones.current[list]
            if (!zone) continue
            const area = zone.getBoundingClientRect()
            if (x < area.left - ZONE_MARGIN || x > area.right + ZONE_MARGIN || y < area.top - ZONE_MARGIN || y > area.bottom + ZONE_MARGIN) continue
            const layout = layouts[list]
            const boxes = [...zone.querySelectorAll<HTMLElement>('[data-saved-site]')]
                .filter((element) => element.dataset.savedSite !== id)
                .map((element) => element.getBoundingClientRect())
            const index = placeAmong(x, y, boxes, layout)
            return { list, index, mark: markAt(index, boxes, layout, area) }
        }
        return null
    }

    const start = (event: ReactPointerEvent<HTMLElement>, site: Bookmark, from: SavedSiteList) => {
        if (event.button !== 0) return
        const item = event.currentTarget
        const { pointerId, clientX: startX, clientY: startY } = event
        let current: SiteDrag | null = null

        const onPointerMove = (e: PointerEvent) => {
            if (e.buttons === 0) return
            if (!current) {
                if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return
                item.setPointerCapture(pointerId)
            }
            current = { site, from, x: e.clientX, y: e.clientY, over: overAt(e.clientX, e.clientY, site.id) }
            setDrag(current)
        }
        const finish = (drop: boolean) => {
            stopListening.current?.()
            stopListening.current = undefined
            if (!current) return
            setDrag(null)
            // The press ends on the site it started on, which would open it.
            const swallow = (e: MouseEvent) => e.stopPropagation()
            window.addEventListener('click', swallow, { capture: true, once: true })
            window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
            const over = drop && current.over
            if (!over) return
            const ownIndex = [...(zones.current[over.list]?.querySelectorAll<HTMLElement>('[data-saved-site]') ?? [])].findIndex((element) => element.dataset.savedSite === site.id)
            if (over.list === from && over.index === ownIndex) return
            onPlace(site.id, over.list, over.index)
        }
        const onPointerUp = () => finish(true)
        const onPointerCancel = () => finish(false)
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || !current) return
            e.preventDefault()
            finish(false)
        }

        stopListening.current?.()
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointercancel', onPointerCancel)
        window.addEventListener('keydown', onKeyDown)
        stopListening.current = () => {
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            window.removeEventListener('pointercancel', onPointerCancel)
            window.removeEventListener('keydown', onKeyDown)
        }
    }

    const zone = (list: SavedSiteList) => (element: HTMLElement | null) => {
        zones.current[list] = element
    }

    return { drag, start, zone }
}
