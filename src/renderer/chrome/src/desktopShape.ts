import type { DesktopDropSays, DesktopEdge, Point } from '@shared/ipc'
import { DESKTOP_ASKING, DESKTOP_BOX, DESKTOP_DROP, DESKTOP_FILLET, DESKTOP_POINTED } from '@shared/desktopSizes'
import motion from '@common/motion.json'

// The drop's shape in its window (DESIGN.md, On your desktop). Words in it always run across, so its width is how long it
// is and its height how thick, on any edge. At rest it's 28 out of the edge and 32 along it.

// Its size changes over 200ms with the usual easing, with no overshoot, and what's in it fades over 120ms.
export const SIZE_MS = 200
export const EASE = motion.ease
// What's in it fading in, as a class, since Tailwind only sees whole class names.
export const FADES_IN = 'animate-[mascot-fade_120ms_ease-out]'

export const sideEdge = (edge: DesktopEdge): boolean => edge === 'left' || edge === 'right'

// At rest, as wide and as tall as the edge it's on makes it.
export const restingSize = (edge: DesktopEdge): { width: number; height: number } =>
    sideEdge(edge) ? { width: DESKTOP_DROP.out, height: DESKTOP_DROP.along } : { width: DESKTOP_DROP.along, height: DESKTOP_DROP.out }

// How thick it is for what it says: at rest and working alone as at rest, pointed at a little more, and asking more.
export const thickness = (says: DesktopDropSays['kind'], edge: DesktopEdge): number =>
    says === 'rest' ? restingSize(edge).height : says === 'asking' || says === 'finished' ? DESKTOP_ASKING : DESKTOP_POINTED

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), Math.max(low, high))

// Where its top left goes in a window `room` big, for its middle on the edge at `anchor`: against the edge, centred on
// that point along it, and never so near the window's end that a fillet is cut off.
export const dropAt = (edge: DesktopEdge, anchor: Point, size: { width: number; height: number }, room: { width: number; height: number }): Point => {
    if (sideEdge(edge)) {
        return {
            x: edge === 'right' ? anchor.x - size.width : anchor.x,
            y: Math.round(clamp(anchor.y - size.height / 2, DESKTOP_FILLET, room.height - DESKTOP_FILLET - size.height))
        }
    }
    return {
        x: Math.round(clamp(anchor.x - size.width / 2, DESKTOP_FILLET, room.width - DESKTOP_FILLET - size.width)),
        y: edge === 'bottom' ? anchor.y - size.height : anchor.y
    }
}

// Round where it faces the screen and flat against the edge. Taller than the box, with more lines, its corners stay the
// box's, rather than its end swelling into a half circle.
export const dropRadius = (edge: DesktopEdge, height: number): string => {
    const r = `${Math.min(height, DESKTOP_BOX.thick) / 2}px`
    if (edge === 'right') return `${r} 0 0 ${r}`
    if (edge === 'left') return `0 ${r} ${r} 0`
    if (edge === 'bottom') return `${r} ${r} 0 0`
    return `0 0 ${r} ${r}`
}

// Where it grows from as it pours out of the edge, and how it's flattened back into it.
export const intoEdge = (edge: DesktopEdge): { origin: string; flat: string } =>
    ({
        right: { origin: 'right center', flat: 'scaleX(0)' },
        left: { origin: 'left center', flat: 'scaleX(0)' },
        bottom: { origin: 'center bottom', flat: 'scaleY(0)' },
        top: { origin: 'center top', flat: 'scaleY(0)' }
    })[edge]

// How long a job has been going, in mono: "0:42", "2:02", "1:05:09".
export const elapsed = (since: number, now: number): string => {
    const seconds = Math.max(Math.floor((now - since) / 1000), 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}` : `${minutes}:${pad(seconds % 60)}`
}

// When something finished, by the clock: "14:09".
export const clockTime = (at: number): string => {
    const date = new Date(at)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
