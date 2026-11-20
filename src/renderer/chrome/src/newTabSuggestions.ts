import type { ChatThreadSummary, MascotProfile, Suggestion } from '@shared/library'

// DESIGN.md section 10, New tab: one list under the box, of at most four rows, each from something real.
export const MOST_SUGGESTIONS = 4

export type SuggestionRow =
    | { kind: 'pick-up'; key: string; chat: ChatThreadSummary }
    | { kind: 'suggestion'; key: string; suggestion: Suggestion }
    | { kind: 'try'; key: string; mascot: MascotProfile; prompt: string }

interface Sources {
    chats: readonly ChatThreadSummary[]
    // Chats waiting for an answer, which are above the list already.
    asking: ReadonlySet<string>
    suggestions: readonly Suggestion[]
    flock: readonly MascotProfile[]
    // A starter's example prompt, by its Gallery id. Only real runs are there.
    examples: Readonly<Record<string, string>>
    // Who was chosen when the page opened. Try rows from others come first, and choosing one later doesn't reorder them.
    chosenAtOpen: string
}

// The newest finished chat to pick up, then the suggestions as they come, then mascots to try with a real example.
export const suggestionRows = ({ chats, asking, suggestions, flock, examples, chosenAtOpen }: Sources): SuggestionRow[] => {
    const finished = chats
        .filter((chat) => !chat.running && !asking.has(chat.id) && !chat.from)
        .reduce<ChatThreadSummary | null>((newest, chat) => (!newest || chat.updatedAt > newest.updatedAt ? chat : newest), null)
    const pickUp: SuggestionRow[] = finished ? [{ kind: 'pick-up', key: `chat-${finished.id}`, chat: finished }] : []
    const ideas: SuggestionRow[] = suggestions.map((suggestion) => ({ kind: 'suggestion', key: `suggestion-${suggestion.id}`, suggestion }))
    const withExamples = flock.flatMap((mascot): SuggestionRow[] => {
        const prompt = mascot.deletedAt === null && mascot.galleryId ? examples[mascot.galleryId] : undefined
        return prompt ? [{ kind: 'try', key: `try-${mascot.id}`, mascot, prompt }] : []
    })
    const others = (row: SuggestionRow) => row.kind === 'try' && row.mascot.id !== chosenAtOpen
    const tries = [...withExamples.filter(others), ...withExamples.filter((row) => !others(row))]
    return [...pickUp, ...ideas, ...tries].slice(0, MOST_SUGGESTIONS)
}
