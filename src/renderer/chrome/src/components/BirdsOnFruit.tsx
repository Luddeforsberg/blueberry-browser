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

// One thing a bird on the fruit is saying, with one clear way to take it up.
export interface FruitIdea {
    id: string
    mascot: MascotProfile
    mood: Mood
    words: React.ReactNode
    action: string
    // What the action is called to assistive technology and in a tooltip, when its words need the idea to make sense.
    actionLabel?: string
    onUse: () => void
    // A way to wave it off, shown when you come near.
    dismiss?: { label: string; onDismiss: () => void }
}

const StandingBird: React.FC<{ idea: FruitIdea; near: boolean; x: number; width: number; faceLeft: boolean }> = ({ idea, near, x, width, faceLeft }) => {
    const { keepBerryStill } = useShell().settings
    const { mascot, mood } = idea
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

const IdeaWords: React.FC<{
    idea: FruitIdea
    style?: React.CSSProperties
    // Where the fruit's centre is from this item's top left corner, so its shadow stays on the fruit.
    fruitCentre: { x: number; y: number }
    onNear: (near: boolean) => void
}> = ({ idea, style, fruitCentre, onNear }) => (
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
        <div className="relative text-14 text-primary-foreground [overflow-wrap:anywhere]">{idea.words}</div>
        <div className="relative mt-1.5 -ml-2 flex flex-wrap items-center gap-x-1 text-13 text-primary-foreground">
            <button
                type="button"
                aria-label={idea.actionLabel}
                onClick={idea.onUse}
                className="group/use h-7 px-2 flex items-center gap-1.5 rounded-control font-semibold outline-none transition-colors hover:bg-primary-foreground/15 focus-visible:ring-2 focus-visible:ring-primary-foreground"
            >
                {idea.action}
                <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover/use:translate-x-0.5" />
            </button>
            {idea.dismiss && (
                <button
                    type="button"
                    aria-label={idea.dismiss.label}
                    onClick={idea.dismiss.onDismiss}
                    className="h-7 px-2 rounded-control opacity-0 outline-none transition-[opacity,background-color] duration-100 group-hover:opacity-85 group-focus-within:opacity-85 hover:bg-primary-foreground/15 focus-visible:ring-2 focus-visible:ring-primary-foreground"
                >
                    Not now
                </button>
            )}
        </div>
    </li>
)

// Birds standing on the curve of the art blueberry, each saying one thing. The list starts at the top of the art, so a
// bird can be placed by the art's own outline.
export const BirdsOnFruit: React.FC<{ ideas: FruitIdea[] }> = ({ ideas }) => {
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

    const count = ideas.length
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
                {ideas.map((idea, index) => {
                    const top = clearOfOutline(centreOf(index) - column / 2, centreOf(index) + column / 2)
                    return (
                        <IdeaWords
                            key={idea.id}
                            idea={idea}
                            style={stacked ? undefined : { width: column, flexShrink: 0, marginTop: top }}
                            fruitCentre={fruitCentreFor(index, stacked ? stackTop : top)}
                            onNear={(near) => setNearId(near ? idea.id : null)}
                        />
                    )
                })}
            </ul>
            {showBerry && ideas.map((idea, index) => (
                <StandingBird key={idea.id} idea={idea} near={nearId === idea.id} x={birdAt(index)} width={width} faceLeft={count > 1 && index === count - 1} />
            ))}
        </div>
    )
}

// A new bird has turned up to meet you, in its own colours, and faces you. The other ideas are Berry's.
const suggestionIdea = (suggestion: Suggestion, onUse: (suggestion: Suggestion) => void, onDismiss: (id: string) => void): FruitIdea => ({
    id: suggestion.id,
    ...(suggestion.kind === 'mascot'
        ? { mascot: { ...suggestion.draft, id: suggestion.id, deletedAt: null }, mood: 'asking' as const, action: `Meet ${suggestion.draft.name}` }
        : { mascot: BERRY, mood: 'rest' as const, action: suggestion.kind === 'prompt' ? 'Put it in the box' : 'Set it up' }),
    words: (
        <p>
            <span className="opacity-90">{suggestion.why}.</span> <span className="font-semibold">{suggestion.title}</span>
        </p>
    ),
    onUse: () => onUse(suggestion),
    dismiss: { label: `Dismiss: ${suggestion.title}`, onDismiss: () => onDismiss(suggestion.id) },
})

// What Blueberry noticed. Taking one up only fills something in, for the user to send or save.
export const BirdSuggestions: React.FC<{
    suggestions: Suggestion[]
    onUse: (suggestion: Suggestion) => void
    onDismiss: (id: string) => void
}> = ({ suggestions, onUse, onDismiss }) => <BirdsOnFruit ideas={suggestions.map((suggestion) => suggestionIdea(suggestion, onUse, onDismiss))} />
