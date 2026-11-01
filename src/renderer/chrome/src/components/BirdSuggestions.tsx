import React, { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { MascotProfile, Suggestion } from '@shared/library'
import { BERRY } from '@shared/mascots'
import type { Mood } from '@common/components/Mascot'
import { cn } from '@common/lib/utils'
import { useShell } from '../contexts/ShellContext'
import { FRUIT_CENTRE_Y, FRUIT_RADIUS, fruitTopAt } from './ArtBlueberry'
import { Berry } from './Berry'

const BIRD = 76
// Where the feet are in the standing drawing, as shares of its size.
const FEET_X = 57 / 120
const FEET_Y = 113 / 120
// The fruit's outline is dust at first, so the birds stand a little inside it, on solid fruit.
const FOOTING = 6
const GAP = 24
const MAX_COLUMN = 224
const ALONE_COLUMN = 380
// From a column's outer edge in to the feet of the bird standing over it.
const BIRD_INSET = 44
// Clear of the fruit's outline, so the words are always on the fruit.
const WORDS_BELOW_OUTLINE = 14
// Under this width three columns are too thin to read, so they stack.
const STACK_BELOW = 520

const actionFor = (suggestion: Suggestion) => {
    if (suggestion.kind === 'prompt') return 'Put it in the box'
    if (suggestion.kind === 'routine') return 'Set it up'
    return `Meet ${suggestion.draft.name}`
}

// A new bird has turned up to meet you, in its own colours, and faces you. The other ideas are Berry's.
const speakerOf = (suggestion: Suggestion): { mascot: MascotProfile; mood: Mood } =>
    suggestion.kind === 'mascot'
        ? { mascot: { ...suggestion.draft, id: suggestion.id, deletedAt: null }, mood: 'asking' }
        : { mascot: BERRY, mood: 'rest' }

const StandingBird: React.FC<{ suggestion: Suggestion; near: boolean; x: number; width: number; faceLeft: boolean }> = ({ suggestion, near, x, width, faceLeft }) => {
    const { keepBerryStill } = useShell().settings
    const { mascot, mood } = speakerOf(suggestion)
    return (
        <div className="absolute pointer-events-none" style={{ left: width / 2 + x - BIRD * FEET_X, top: fruitTopAt(x) + FOOTING - BIRD * FEET_Y }}>
            <div style={{ transform: faceLeft ? 'scaleX(-1)' : undefined, transformOrigin: `${FEET_X * 100}% 100%` }}>
                {/* It looks up when you come near, and hops once. Still and reduced motion leave only the look. */}
                <div key={String(near)} className={cn(near && !keepBerryStill && 'motion-safe:animate-berry-hop')} style={{ transformOrigin: `${FEET_X * 100}% ${FEET_Y * 100}%` }}>
                    <Berry mood={near ? 'curious' : mood} size={BIRD} mascot={mascot} />
                </div>
            </div>
        </div>
    )
}

const Idea: React.FC<{
    suggestion: Suggestion
    style?: React.CSSProperties
    // Where the fruit's centre is from this item's top left corner, so its shadow stays on the fruit.
    fruitCentre: { x: number; y: number }
    onNear: (near: boolean) => void
    onUse: () => void
    onDismiss: () => void
}> = ({ suggestion, style, fruitCentre, onNear, onUse, onDismiss }) => (
    <li
        onMouseEnter={() => onNear(true)}
        onMouseLeave={() => onNear(false)}
        onFocus={() => onNear(true)}
        onBlur={() => onNear(false)}
        style={style}
        className="group relative min-w-0"
    >
        {/* The fruit is bright where the light hits it, so the words have a pool of its own shadow to sit in. */}
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ clipPath: `circle(${FRUIT_RADIUS}px at ${fruitCentre.x}px ${fruitCentre.y}px)` }}>
            <div className="absolute -inset-x-5 -inset-y-4 rounded-[40px] bg-berry-fruit-crown/85 blur-xl" />
        </div>
        <p className="relative text-14 text-primary-foreground [overflow-wrap:anywhere]">
            <span className="opacity-90">{suggestion.why}.</span> <span className="font-semibold">{suggestion.title}</span>
        </p>
        <div className="relative mt-1.5 -ml-2 flex flex-wrap items-center gap-x-1 text-13 text-primary-foreground">
            <button
                type="button"
                onClick={onUse}
                className="group/use h-7 px-2 flex items-center gap-1.5 rounded-control font-semibold outline-none transition-colors hover:bg-primary-foreground/15 focus-visible:ring-2 focus-visible:ring-primary-foreground"
            >
                {actionFor(suggestion)}
                <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover/use:translate-x-0.5" />
            </button>
            <button
                type="button"
                aria-label={`Dismiss: ${suggestion.title}`}
                onClick={onDismiss}
                className="h-7 px-2 rounded-control opacity-0 outline-none transition-[opacity,background-color] duration-100 group-hover:opacity-85 group-focus-within:opacity-85 hover:bg-primary-foreground/15 focus-visible:ring-2 focus-visible:ring-primary-foreground"
            >
                Not now
            </button>
        </div>
    </li>
)

// What Blueberry noticed, said by the birds standing on the curve of the art blueberry. The list starts at the top of
// the art, so a bird can be placed by the art's own outline. Taking one up only fills something in, for the user to send or save.
export const BirdSuggestions: React.FC<{
    suggestions: Suggestion[]
    onUse: (suggestion: Suggestion) => void
    onDismiss: (id: string) => void
}> = ({ suggestions, onUse, onDismiss }) => {
    const { showBerry } = useShell().settings
    const list = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(752)
    const [nearId, setNearId] = useState<string | null>(null)
    useEffect(() => {
        const node = list.current
        if (!node) return
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    const count = suggestions.length
    const stacked = count > 1 && width < STACK_BELOW
    const column = count === 1 ? Math.min(width, ALONE_COLUMN) : Math.min(MAX_COLUMN, (width - GAP * (count - 1)) / count)
    const centreOf = (index: number) => (index - (count - 1) / 2) * (column + GAP)
    // Outer columns have their bird at the outer end, where the curve is nearest their words, and it faces inwards.
    const birdAt = (index: number) => {
        if (stacked) return ((index - (count - 1) / 2) * width) / (count + 0.5)
        return index === count - 1 && count > 1 ? centreOf(index) + column / 2 - BIRD_INSET : centreOf(index) - column / 2 + BIRD_INSET
    }
    const clearOfOutline = (left: number, right: number) => Math.max(fruitTopAt(left), fruitTopAt(right)) + WORDS_BELOW_OUTLINE
    const stackTop = clearOfOutline(-width / 2, width / 2)
    const fruitCentreFor = (index: number, top: number) => ({ x: stacked ? width / 2 : -centreOf(index) + column / 2, y: FRUIT_CENTRE_Y - top })

    return (
        <div ref={list} className="relative">
            <ul
                className={stacked ? 'flex flex-col gap-5' : 'flex items-start justify-center'}
                style={stacked ? { paddingTop: stackTop } : { gap: GAP }}
            >
                {suggestions.map((suggestion, index) => {
                    const top = clearOfOutline(centreOf(index) - column / 2, centreOf(index) + column / 2)
                    return <Idea
                        key={suggestion.id}
                        suggestion={suggestion}
                        style={stacked ? undefined : { width: column, flexShrink: 0, marginTop: top }}
                        fruitCentre={fruitCentreFor(index, stacked ? stackTop : top)}
                        onNear={(near) => setNearId(near ? suggestion.id : null)}
                        onUse={() => onUse(suggestion)}
                        onDismiss={() => onDismiss(suggestion.id)}
                    />
                })}
            </ul>
            {showBerry && suggestions.map((suggestion, index) => (
                <StandingBird key={suggestion.id} suggestion={suggestion} near={nearId === suggestion.id} x={birdAt(index)} width={width} faceLeft={count > 1 && index === count - 1} />
            ))}
        </div>
    )
}
