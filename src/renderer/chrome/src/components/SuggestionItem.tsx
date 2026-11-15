import React from 'react'
import { X } from 'lucide-react'
import type { MascotProfile } from '@shared/library'
import type { Mood } from '@common/components/Mascot'
import { BERRY } from '@shared/mascots'
import { cn } from '@common/lib/utils'
import { useFlock } from '../contexts/LibraryContext'
import { Berry } from './Berry'
import { finishedWhen, limitsInBrief } from '../shortWords'
import type { SuggestionRow } from '../newTabSuggestions'

const nameOf = (mascot: MascotProfile) => (mascot.id === BERRY.id ? BERRY.name : mascot.name)

// What a row shows: whose face, its title, why it's there, and one word for what kind of row it is.
const looksOf = (row: SuggestionRow, find: (id: string | null) => MascotProfile): { mascot: MascotProfile; mood: Mood; title: string; reason: string; word: string } => {
    if (row.kind === 'pick-up') {
        const mascot = find(row.chat.mascotId)
        return { mascot, mood: 'delivered', title: row.chat.title, reason: `${nameOf(mascot)} finished it ${finishedWhen(row.chat.updatedAt)}.`, word: 'pick up' }
    }
    if (row.kind === 'try') {
        return { mascot: row.mascot, mood: 'rest', title: row.prompt, reason: `${nameOf(row.mascot)} · ${limitsInBrief(row.mascot)}`, word: 'try' }
    }
    const { suggestion } = row
    const reason = `${suggestion.why}.`
    if (suggestion.kind === 'prompt') return { mascot: BERRY, mood: 'rest', title: suggestion.title, reason, word: 'you repeat' }
    if (suggestion.kind === 'routine') return { mascot: find(suggestion.draft.mascotId ?? null), mood: 'rest', title: suggestion.title, reason, word: 'routine' }
    return { mascot: { ...suggestion.draft, id: suggestion.id, deletedAt: null }, mood: 'curious', title: suggestion.title, reason, word: 'new mascot' }
}

// DESIGN.md section 10, New tab: one row under the box. The whole row is the button. A suggestion has a × beside it, a
// button of its own, which shows on hover and while the row has the keyboard.
export const SuggestionItem: React.FC<{ row: SuggestionRow; used?: boolean; onPress: () => void; onDismiss?: () => void }> = ({ row, used = false, onPress, onDismiss }) => {
    const { find } = useFlock()
    const { mascot, mood, title, reason, word } = looksOf(row, find)
    return (
        <li className={cn('group flex items-center rounded-row transition-colors', used ? 'bg-sheet shadow-rim' : 'hover:bg-hover')}>
            <button
                type="button"
                onClick={onPress}
                className="flex-1 min-w-0 h-[34px] px-2 flex items-center gap-[11px] rounded-row text-13 text-ink-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
                <span aria-hidden className="flex shrink-0">
                    <Berry mood={mood} size={22} mascot={mascot} still />
                </span>
                <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium text-ink">{title}</span> {reason}
                </span>
                <span className="shrink-0 font-mono text-11.5 text-ink-3">{word}</span>
            </button>
            {onDismiss && (
                <button
                    type="button"
                    aria-label={`Dismiss: ${title}`}
                    title="Dismiss"
                    onClick={onDismiss}
                    className="hidden group-hover:flex group-focus-within:flex size-6 mr-1 shrink-0 items-center justify-center rounded-[7px] text-ink-3 hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                    <X className="size-[13px]" strokeWidth={1.5} />
                </button>
            )}
        </li>
    )
}
