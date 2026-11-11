import React, { useState } from 'react'
import { ChevronDown, Lightbulb, MessageCircle, RefreshCw, X } from 'lucide-react'
import type { Visit } from '@shared/ipc'
import type { Suggestion } from '@shared/library'
import { cn } from '@common/lib/utils'
import { Berry } from './Berry'

// The tray's one line when there are no suggestions: a chat or routine to pick up, or one idea for a real feature.
export interface TrayLine {
    kind: 'chat' | 'routine' | 'idea'
    words: string
    action: string
    actionLabel?: string
    onUse: () => void
}

const OUTLINE = cn(
    "h-7 px-3 shrink-0 flex items-center gap-1.5 rounded-full text-13 text-foreground outline-none transition-colors",
    "shadow-[inset_0_0_0_1px_rgb(var(--outline))] dark:shadow-none dark:bg-control-fill",
    "hover:bg-hover active:bg-pressed focus-visible:shadow-[inset_0_0_0_2px_rgb(var(--ring))]"
)
const QUIET = cn(
    "h-7 pl-2.5 pr-2 shrink-0 flex items-center gap-1 rounded-full text-13 outline-none transition-colors",
    "hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
)

// What taking a suggestion up is called. A new bird is met in its own colours.
export const suggestionAction = (suggestion: Suggestion) =>
    suggestion.kind === 'prompt' ? 'Fill in' : suggestion.kind === 'routine' ? 'Set it up' : `Meet ${suggestion.draft.name}`

const SuggestionAction: React.FC<{ suggestion: Suggestion; onUse: (suggestion: Suggestion) => void }> = ({ suggestion, onUse }) => (
    <button type="button" onClick={() => onUse(suggestion)} className={OUTLINE}>
        {suggestion.kind === 'mascot' && (
            <span aria-hidden className="-ml-1.5 flex">
                <Berry size={18} mascot={{ ...suggestion.draft, id: suggestion.id, deletedAt: null }} />
            </span>
        )}
        {suggestionAction(suggestion)}
    </button>
)

const siteOf = (url: string) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return url
    }
}

// Attached under the new tab's box, on `tray`: the most useful thing to do next, and two quiet buttons that open the
// tray downwards into every idea or the recent pages. Nothing in it moves, asks or waits.
export const NewTabTray: React.FC<{
    suggestions: Suggestion[]
    // With no suggestions, what the line says instead.
    fallback: TrayLine
    recent: Visit[]
    // While the box has text in it the line steps back, and nothing in the tray changes.
    typing: boolean
    onUse: (suggestion: Suggestion) => void
    onDismiss: (id: string) => void
    onOpenRecent: (visit: Visit) => void
}> = ({ suggestions, fallback, recent, typing, onUse, onDismiss, onOpenRecent }) => {
    const [open, setOpen] = useState<'ideas' | 'recent' | null>(null)
    const [top] = suggestions
    const more = suggestions.length - 1
    const shown = open === 'ideas' && more < 1 ? null : open === 'recent' && recent.length === 0 ? null : open
    const LineIcon = top ? Lightbulb : fallback.kind === 'chat' ? MessageCircle : fallback.kind === 'routine' ? RefreshCw : Lightbulb

    return (
        <div className="relative -mt-[26px] mx-1 pt-[34px] pb-2 pl-5 pr-2.5 rounded-b-list bg-tray text-13 text-muted-foreground">
            <div className="flex items-center gap-1.5 min-h-8">
                <p className={cn("flex-1 min-w-0 flex items-center gap-2 transition-colors", typing ? "text-muted-foreground" : "text-foreground")}>
                    <LineIcon aria-hidden className="size-[15px] shrink-0 text-muted-foreground" />
                    <span className="truncate">{top ? top.title : fallback.words}</span>
                </p>
                {top ? (
                    <SuggestionAction suggestion={top} onUse={onUse} />
                ) : (
                    <button type="button" aria-label={fallback.actionLabel} onClick={fallback.onUse} className={OUTLINE}>
                        {fallback.action}
                    </button>
                )}
                {more > 0 && (
                    <button
                        type="button"
                        aria-expanded={shown === 'ideas'}
                        onClick={() => setOpen(shown === 'ideas' ? null : 'ideas')}
                        className={cn(QUIET, "ml-1", shown === 'ideas' && "bg-pressed text-foreground hover:bg-pressed")}
                    >
                        {shown === 'ideas' ? 'Fewer' : `${more} more ${more === 1 ? 'idea' : 'ideas'}`}
                        <ChevronDown aria-hidden className={cn("size-3", shown === 'ideas' && "rotate-180")} />
                    </button>
                )}
                {recent.length > 0 && (
                    <button
                        type="button"
                        aria-expanded={shown === 'recent'}
                        onClick={() => setOpen(shown === 'recent' ? null : 'recent')}
                        className={cn(QUIET, shown === 'recent' && "bg-pressed text-foreground hover:bg-pressed")}
                    >
                        Recent pages
                        <ChevronDown aria-hidden className={cn("size-3", shown === 'recent' && "rotate-180")} />
                    </button>
                )}
            </div>

            {shown === 'ideas' && (
                <ul aria-label="Ideas" className="mt-2 mb-0.5 -ml-3.5 -mr-1 p-1.5 rounded-panel bg-surface">
                    {suggestions.map((suggestion) => (
                        <li key={suggestion.id} className="min-h-[60px] pl-3 pr-1 py-2 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-14 text-foreground truncate">{suggestion.title}</p>
                                <p className="text-13 text-muted-foreground line-clamp-2">{suggestion.why}</p>
                            </div>
                            <SuggestionAction suggestion={suggestion} onUse={onUse} />
                            <button
                                type="button"
                                aria-label={`Not now: ${suggestion.title}`}
                                title="Not now"
                                onClick={() => onDismiss(suggestion.id)}
                                className="size-7 shrink-0 flex items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <X aria-hidden className="size-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {shown === 'recent' && (
                <ul aria-label="Recent pages" className="mt-2 mb-0.5 -ml-3.5 -mr-1 p-1.5 rounded-panel bg-surface">
                    {recent.map((visit) => (
                        <li key={visit.url}>
                            <button
                                type="button"
                                onClick={() => onOpenRecent(visit)}
                                className="w-full h-9 px-3 flex items-baseline gap-3 rounded-full text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="min-w-0 truncate text-14 text-foreground">{visit.title || siteOf(visit.url)}</span>
                                <span className="shrink-0 text-13 text-muted-foreground">{siteOf(visit.url)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
