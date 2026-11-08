import React, { useEffect, useRef, useState } from 'react'
import type { NestCard, NestLine } from '@shared/library'
import { knowsWords, lineCut } from '@shared/nestKnows'
import { eachWords, lineWords } from '@shared/nestTable'
import { capitalized, named, whose, type CardName } from '@shared/nestNames'
import { useShell } from '../contexts/ShellContext'

// What a card knows from other cards, over its top edge on the right, away from its bird, while the pointer is on the
// card or the keyboard is in it. Counts only, as main counted them. Nothing while a line is pulled or the card is open,
// and nothing on a card no line goes into that got nothing, which would only say so on every card.
const knowsNothing = (knows: NonNullable<NestCard['knows']>) =>
    knows.cards + knows.pages + knows.files + knows.notes + knows.leftOutCards + knows.leftOutFiles === 0

export const KnowsLine: React.FC<{ card: NestCard; hidden: boolean; inputs: number }> = ({ card, hidden, inputs }) =>
    card.knows && !hidden && !(inputs === 0 && knowsNothing(card.knows)) ? (
        <p data-nest-knows className="pointer-events-none absolute right-3 bottom-full mb-1.5 max-w-[calc(100%-96px)] truncate rounded-control bg-canvas/80 px-1 text-12 text-muted-foreground">
            {knowsWords(card.knows, !!card.each || !!card.plan?.each)}
        </p>
    ) : null

// What goes through a line, in words: its card's part, or with For each row what each run gets from it. Plain text.
const throughWords = (crosses: NestLine['crosses'], from: CardName, forEach: boolean): string => {
    if (!crosses) return `Nothing yet: ${named(from)} hasn’t answered.`
    if (crosses.stale) return `${capitalized(whose(from, 'rows'))} have changed, so nothing goes until you pick them again.`
    const words = forEach
        ? [crosses.each ? eachWords(crosses.each) : null, lineWords({ whole: crosses.each ? null : (crosses.shared ?? null), files: crosses.files }, from)]
              .filter(Boolean)
              .join(', with ')
        : lineWords(crosses, from)
    return words ? capitalized(words) : `Nothing yet: ${named(from)} hasn’t answered.`
}

// Under a line the user pressed: where it comes from, about how much goes through it, and whether any of it is cut.
export const LinePopover: React.FC<{ from: CardName; crosses: NestLine['crosses']; fresh: boolean; forEach: boolean; x: number; y: number }> = ({ from, crosses, fresh, forEach, x, y }) => (
    <div
        role="status"
        className="nodrag nopan pointer-events-auto absolute w-64 rounded-control border bg-surface px-3 py-2 text-foreground shadow-raised cursor-default select-text"
        // Over the cards it crosses, and under the dim and an open card.
        style={{ zIndex: 4, transform: `translate(-50%, 0) translate(${x}px, ${y + 18}px)` }}
        onClick={(event) => event.stopPropagation()}
    >
        <p className="text-13 font-semibold truncate">From {named(from)}</p>
        <p className="text-13 mt-0.5">{throughWords(crosses, from, forEach)}</p>
        {crosses && !crosses.stale && (crosses.whole || crosses.each || crosses.shared || crosses.files) && (
            <p className="text-12 text-muted-foreground mt-1">{lineCut(crosses, forEach) ? 'Some of it is cut to fit' : 'Nothing cut'}</p>
        )}
        {fresh && <p className="text-12 text-muted-foreground mt-1">Goes from your next message</p>}
    </div>
)

const PULSE_MS = 900

// A light running along a line as the card it goes into sends, once for each message `at` names, never for one that was
// sent before the line was drawn. With Keep Berry still or reduced motion, the line only brightens for a moment.
export const useLinePulse = (at: number | undefined): { at: number; still: boolean } | null => {
    const { keepBerryStill } = useShell().settings
    const seen = useRef(at)
    const [pulse, setPulse] = useState<number | null>(null)
    useEffect(() => {
        if (at === undefined || at === seen.current) return
        seen.current = at
        setPulse(at)
        const timer = setTimeout(() => setPulse(null), PULSE_MS)
        return () => clearTimeout(timer)
    }, [at])
    if (pulse === null) return null
    return { at: pulse, still: keepBerryStill || window.matchMedia('(prefers-reduced-motion: reduce)').matches }
}

// The pulse drawn over a line's path, started again by each message.
export const LinePulse: React.FC<{ path: string; pulse: { at: number; still: boolean }; width: number }> = ({ path, pulse, width }) =>
    pulse.still ? (
        <path key={pulse.at} d={path} fill="none" strokeWidth={width} className="pointer-events-none stroke-accent-ink animate-nest-glow" />
    ) : (
        <path key={pulse.at} d={path} fill="none" pathLength={100} strokeDasharray="14 200" strokeLinecap="round" strokeWidth={width} className="pointer-events-none stroke-accent-ink animate-nest-pulse" />
    )
