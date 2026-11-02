import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

// How far the pointer travels before a press on a tab becomes a drag.
const DRAG_THRESHOLD = 4
// Matches the default transition, so the tab settles into its slot before the list reorders.
const SETTLE_MS = 100

export const clampOffset = (offset: number, from: number, step: number, count: number): number =>
    Math.min(Math.max(offset, -from * step), (count - 1 - from) * step)

export const dropIndex = (offset: number, from: number, step: number, count: number): number =>
    step === 0 ? from : from + Math.round(clampOffset(offset, from, step, count) / step)

interface Drag {
    tabId: string
    // The order this drag started from. A different order means it no longer applies.
    order: string
    from: number
    to: number
    offset: number
    step: number
    settling: boolean
}

// Dragging a tab along its list: it follows the pointer, the others make room, and the new order
// goes to main on release. Tabs must be the same size, which they are in both layouts.
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
        const edge = (element: Element) => {
            const rect = element.getBoundingClientRect()
            return axis === 'x' ? rect.left : rect.top
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
                const step = Math.abs(edge(list.children[1]) - edge(list.children[0]))
                current = { tabId, order, from, to: from, offset: 0, step, settling: false }
            }
            current = {
                ...current,
                offset: clampOffset(delta, from, current.step, tabIds.length),
                to: dropIndex(delta, from, current.step, tabIds.length)
            }
            setStored(current)
        }

        const finish = (drop: boolean) => {
            stopListening.current?.()
            if (!current) return
            const { to, step } = current
            if (!drop) {
                setStored(null)
                return
            }
            setStored({ ...current, offset: (to - from) * step, settling: true })
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
        if (index > drag.from && index <= drag.to) return -drag.step
        if (index < drag.from && index >= drag.to) return drag.step
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
