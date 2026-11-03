import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

// How far the pointer travels before a press on a tab becomes a drag.
const DRAG_THRESHOLD = 4
// Matches the default transition, so the tab settles into its slot before the list reorders.
const SETTLE_MS = 100

// Where each tab is along the list when a drag starts. Tabs can differ in size: in the row, the active one is wider.
export interface Slot {
    start: number
    size: number
}

// The dragged tab stays between the first tab's start and the last tab's end.
export const clampOffset = (offset: number, from: number, slots: readonly Slot[]): number => {
    const own = slots[from]
    const last = slots[slots.length - 1]
    return Math.min(Math.max(offset, slots[0].start - own.start), last.start + last.size - own.start - own.size)
}

// Once the dragged tab covers half of another tab, it takes that tab's place.
export const dropIndex = (offset: number, from: number, slots: readonly Slot[]): number => {
    const own = slots[from]
    const start = own.start + clampOffset(offset, from, slots)
    const end = start + own.size
    const middleOf = (index: number) => slots[index].start + slots[index].size / 2
    let to = from
    while (to < slots.length - 1 && end >= middleOf(to + 1)) to++
    if (to === from) while (to > 0 && start <= middleOf(to - 1)) to--
    return to
}

// How far the dragged tab moves to sit in its new place: the others keep their sizes, so going later its end lands
// where that slot's end was, and going earlier its start lands where that slot's start was.
export const settledOffset = (from: number, to: number, slots: readonly Slot[]): number =>
    to > from ? slots[to].start + slots[to].size - slots[from].start - slots[from].size : slots[to].start - slots[from].start

interface Drag {
    tabId: string
    // The order this drag started from. A different order means it no longer applies.
    order: string
    from: number
    to: number
    offset: number
    slots: Slot[]
    // How far a tab it passes moves to make room: the dragged tab's size and the gap after it.
    room: number
    settling: boolean
}

// Dragging a tab along its list: it follows the pointer, the others make room, and the new order
// goes to main on release.
// Where Alt+arrow moves a tab to, counting only the tabs shown, as an index among all of them. Null at either end.
export const nudgeTarget = (all: readonly string[], shown: readonly string[], tabId: string, delta: number): number | null => {
    const neighbour = shown[shown.indexOf(tabId) + delta]
    return shown.includes(tabId) && neighbour !== undefined ? all.indexOf(neighbour) : null
}

export const useTabDrag = (
    tabIds: string[],
    axis: 'x' | 'y',
    onMove: (tabId: string, toIndex: number) => Promise<void>
) => {
    const order = tabIds.join()
    const [stored, setStored] = useState<Drag | null>(null)
    const drag = stored?.order === order ? stored : null
    const stopListening = useRef<() => void>(undefined)

    useEffect(() => () => stopListening.current?.(), [])

    const start = (event: ReactPointerEvent<HTMLElement>, tabId: string) => {
        const item = event.currentTarget
        const list = item.parentElement
        const from = tabIds.indexOf(tabId)
        if (!list || tabIds.length < 2 || from === -1) return

        const coordinate = (e: { clientX: number; clientY: number }) => (axis === 'x' ? e.clientX : e.clientY)
        const slotOf = (element: Element): Slot => {
            const rect = element.getBoundingClientRect()
            return axis === 'x' ? { start: rect.left, size: rect.width } : { start: rect.top, size: rect.height }
        }
        const { pointerId } = event
        const startAt = coordinate(event)
        let current: Drag | null = null

        const onPointerMove = (e: PointerEvent) => {
            if (e.buttons === 0) return
            const delta = coordinate(e) - startAt
            if (!current) {
                if (Math.abs(delta) < DRAG_THRESHOLD) return
                item.setPointerCapture(pointerId)
                const slots = [...list.children].map(slotOf)
                const gap = slots[1].start - slots[0].start - slots[0].size
                current = { tabId, order, from, to: from, offset: 0, slots, room: slots[from].size + gap, settling: false }
            }
            current = {
                ...current,
                offset: clampOffset(delta, from, current.slots),
                to: dropIndex(delta, from, current.slots)
            }
            setStored(current)
        }

        const finish = (drop: boolean) => {
            stopListening.current?.()
            if (!current) return
            const { to, slots } = current
            if (!drop) {
                setStored(null)
                return
            }
            setStored({ ...current, offset: settledOffset(from, to, slots), settling: true })
            window.setTimeout(() => {
                if (to === from) setStored(null)
                else void onMove(tabId, to).finally(() => setStored(null))
            }, SETTLE_MS)
        }
        const onPointerUp = () => finish(true)
        const onPointerCancel = () => finish(false)

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointercancel', onPointerCancel)
        stopListening.current = () => {
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            window.removeEventListener('pointercancel', onPointerCancel)
        }
    }

    const offsetOf = (index: number): number => {
        if (!drag) return 0
        if (index === drag.from) return drag.offset
        if (index > drag.from && index <= drag.to) return -drag.room
        if (index < drag.from && index >= drag.to) return drag.room
        return 0
    }

    const itemProps = (tabId: string, index: number) => {
        const offset = offsetOf(index)
        const dragged = drag?.tabId === tabId
        return {
            dragged,
            // The dragged tab tracks the pointer exactly, and only eases when it settles.
            shifting: drag !== null && (!dragged || drag.settling),
            style: drag ? { transform: axis === 'x' ? `translateX(${offset}px)` : `translateY(${offset}px)` } : undefined
        }
    }

    return { start, itemProps }
}
