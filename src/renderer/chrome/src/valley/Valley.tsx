import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ValleyLight } from '@shared/ipc'
import { cn } from '@common/lib/utils'
import type { ValleyBanks, ValleyBox } from './painter'
import type { PaintRequest } from './valley.worker'

// DESIGN.md section 9. One place, a lake in a valley, in the light the clock gives. Its artwork can be replaced here
// without touching any screen.

interface Painted {
    bitmap: ImageBitmap
    banks: ValleyBanks
}

// Painted once for a light, a size and a box, and kept for as long as the window is open.
const cache = new Map<string, Painted>()
const MAX_KEPT = 8
const keyOf = ({ width, height, box, light }: Omit<PaintRequest, 'id'>) =>
    `${light}:${width}x${height}:${Math.round(box.top)}:${Math.round(box.left)}:${Math.round(box.right)}`

let worker: Worker | null = null
let nextId = 0
const waiting = new Map<number, (painted: Painted) => void>()

const paint = (request: Omit<PaintRequest, 'id'>, done: (painted: Painted) => void) => {
    if (!worker) {
        worker = new Worker(new URL('./valley.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<{ id: number } & Painted>) => {
            const { id, bitmap, banks } = event.data
            waiting.get(id)?.({ bitmap, banks })
            waiting.delete(id)
        }
    }
    const id = ++nextId
    waiting.set(id, done)
    worker.postMessage({ ...request, id })
}

// A resize repaints once the size has settled. The old picture stretches until then.
const SETTLE_MS = 250

export const Valley: React.FC<{
    light: ValleyLight
    // The box the scene is composed around, in the valley's own pixels.
    box: ValleyBox | null
    className?: string
    // What stands on the banks, placed by the painting's own ground.
    children?: (banks: ValleyBanks | null) => React.ReactNode
}> = ({ light, box, className, children }) => {
    const root = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const [size, setSize] = useState<{ width: number; height: number } | null>(null)
    const [shown, setShown] = useState<Painted | null>(null)

    useLayoutEffect(() => {
        const node = root.current
        if (!node) return
        const observer = new ResizeObserver(([entry]) =>
            setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) })
        )
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    // Asks for the painting whenever what it's composed around changes, and only takes the answer to the latest ask,
    // and only while it's still on screen.
    const boxTop = box?.top, boxLeft = box?.left, boxRight = box?.right
    const first = useRef(true)
    useEffect(() => {
        if (!size || size.width < 2 || size.height < 2 || boxTop === undefined || boxLeft === undefined || boxRight === undefined) return
        const request = { ...size, light, box: { top: boxTop, left: boxLeft, right: boxRight } }
        const kept = cache.get(keyOf(request))
        if (kept) {
            setShown(kept)
            return
        }
        let current = true
        const timer = window.setTimeout(() => {
            paint(request, (painted) => {
                cache.set(keyOf(request), painted)
                if (cache.size > MAX_KEPT) {
                    const [oldest] = cache.keys()
                    cache.get(oldest)?.bitmap.close()
                    cache.delete(oldest)
                }
                if (current) setShown(painted)
            })
        }, first.current ? 0 : SETTLE_MS)
        first.current = false
        return () => {
            current = false
            window.clearTimeout(timer)
        }
    }, [size, light, boxTop, boxLeft, boxRight])

    useLayoutEffect(() => {
        const node = canvas.current
        if (!node || !shown) return
        node.width = shown.bitmap.width
        node.height = shown.bitmap.height
        node.getContext('2d')?.drawImage(shown.bitmap, 0, 0)
    }, [shown])

    return (
        <div ref={root} data-light={light} aria-hidden className={cn("absolute inset-0 overflow-hidden", className)}>
            {/* The sky's colour shows at once, and the painting fades in when it's ready. */}
            <div className="absolute inset-0 bg-gradient-to-b from-scene-sky to-scene-horizon" />
            <canvas
                ref={canvas}
                className={cn(
                    "absolute inset-0 size-full [image-rendering:pixelated] transition-opacity duration-layout",
                    shown ? "opacity-100" : "opacity-0"
                )}
            />
            {children?.(shown && size ? scaleBanks(shown.banks, shown.bitmap, size) : null)}
        </div>
    )
}

// A picture painted for another size is stretched over this one, so the banks move with it.
const scaleBanks = (banks: ValleyBanks, bitmap: ImageBitmap, size: { width: number; height: number }): ValleyBanks => {
    const sx = size.width / (bitmap.width * 2)
    const sy = size.height / (bitmap.height * 2)
    return {
        left: { x: banks.left.x * sx, y: banks.left.y * sy },
        right: { x: banks.right.x * sx, y: banks.right.y * sy }
    }
}
