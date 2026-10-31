import React, { useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import type { MascotProfile, Suggestion } from '@shared/library'
import { cn } from '@common/lib/utils'
import { Berry } from './Berry'

const WHAT_IT_IS: Record<Suggestion['kind'], { meta: string; action: string }> = {
    prompt: { meta: 'Ready to ask', action: 'Put it in the box' },
    routine: { meta: 'A routine for this', action: 'Set it up' },
    mascot: { meta: 'A new bird for this', action: 'Meet it' }
}

// Something noticed, and why. Pressing it only fills something in, for the user to send or save.
export const SuggestionCard: React.FC<{
    suggestion: Suggestion
    className: string
    onUse: () => void
    onDismiss: () => void
}> = ({ suggestion, className, onUse, onDismiss }) => {
    const [near, setNear] = useState(false)
    const { meta, action } = WHAT_IT_IS[suggestion.kind]
    const bird: MascotProfile | null = suggestion.kind === 'mascot' ? { ...suggestion.draft, id: suggestion.id, deletedAt: null } : null

    return (
        <li
            onMouseEnter={() => setNear(true)}
            onMouseLeave={() => setNear(false)}
            onFocus={() => setNear(true)}
            onBlur={() => setNear(false)}
            className="group/suggestion relative flex"
        >
            {bird && (
                <div className="absolute z-10 right-9 -top-[51px] pointer-events-none">
                    <Berry mood={near ? 'curious' : 'sitting'} size={72} mascot={bird} />
                </div>
            )}
            <button type="button" onClick={onUse} className={cn(className, "group/use w-full")}>
                <span className="block pr-6 text-12 text-muted-foreground truncate">{meta}</span>
                <span className="mt-1 block text-14 font-semibold">{suggestion.title}</span>
                <span className="mt-1 block text-13 text-muted-foreground">{suggestion.why}</span>
                <span className="mt-auto pt-2.5 flex items-center gap-1.5 text-13">
                    {action}
                    <ArrowRight className="size-3.5 transition-transform group-hover/use:translate-x-0.5" />
                </span>
            </button>
            <button
                type="button"
                aria-label={`Dismiss: ${suggestion.title}`}
                onClick={onDismiss}
                className={cn(
                    "absolute top-2 right-2 size-6 flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors",
                    "opacity-0 group-hover/suggestion:opacity-100 focus-visible:opacity-100 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                )}
            >
                <X className="size-3.5" />
            </button>
        </li>
    )
}
