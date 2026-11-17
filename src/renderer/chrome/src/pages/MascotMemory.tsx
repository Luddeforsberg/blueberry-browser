import React, { useState } from 'react'
import type { MascotProfile, MemoryFact, MemoryOffer } from '@shared/library'
import { MAX_FACT_LENGTH } from '@shared/memory'
import { Button } from '@common/components/Button'
import { CardInShell } from '@common/components/ApprovalCard'
import { cn } from '@common/lib/utils'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { BerrySpot, useAssistantName } from '../components/Berry'
import { ChatError } from '../components/ChatMessage'
import { SettingsGroup, StepInHeader } from '../components/SettingsRow'
import { EmptyPage, LINE_BETWEEN, ROW } from '../components/PageFrame'

// DESIGN.md section 10, Your mascots: what one mascot remembers, one step in from its page. Everything it knows is on
// this page, and nothing else is. An offer waiting for an answer sits on top until it gets one.

const api = () => window.chromeAPI.memory
const ANYWHERE = 'anywhere'

// A row per thing it remembers, with Change and Forget. Change makes the row a field, checked by the same rules as ever.
export const FactRow: React.FC<{ fact: Pick<MemoryFact, 'text'>; onEdit: (text: string) => Promise<string | null>; onForget: () => void }> = ({ fact, onEdit, onForget }) => {
    const [editing, setEditing] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const save = async (event: React.FormEvent) => {
        event.preventDefault()
        const problem = await onEdit(editing ?? '')
        setError(problem)
        if (!problem) setEditing(null)
    }

    if (editing !== null) {
        return (
            <li className={cn(ROW, LINE_BETWEEN, 'before:left-2 py-[9px]')}>
                <form onSubmit={(event) => void save(event)}>
                    <textarea
                        autoFocus
                        aria-label="What it remembers"
                        rows={2}
                        maxLength={MAX_FACT_LENGTH}
                        value={editing}
                        onChange={(event) => setEditing(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') setEditing(null)
                        }}
                        className="block w-full px-3 py-2 rounded-row bg-sheet-2 text-14 leading-[1.45] text-ink outline-none resize-none focus-visible:ring-2 focus-visible:ring-focus"
                    />
                    {error && <div className="mt-1.5"><ChatError message={error} /></div>}
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                        <Button size="sm" type="button" variant="raised" onClick={() => { setEditing(null); setError(null) }}>Cancel</Button>
                        <Button size="sm" type="submit">Save</Button>
                    </div>
                </form>
            </li>
        )
    }
    return (
        <li className={cn(ROW, LINE_BETWEEN, 'before:left-2 min-h-12 py-[9px] flex items-center gap-3')}>
            <p className="flex-1 min-w-0 text-14 leading-[1.45] text-ink [overflow-wrap:anywhere]">{fact.text}</p>
            <Button size="sm" variant="raised" aria-label={`Change: ${fact.text}`} onClick={() => setEditing(fact.text)}>Change</Button>
            <Button size="sm" variant="raised" aria-label={`Forget: ${fact.text}`} onClick={onForget}>Forget</Button>
        </li>
    )
}

// Where an offer came from: the chat it followed, or a routine's run.
const useSourceName = () => {
    const { chats } = useLibrary()
    return (offer: Pick<MemoryOffer, 'sourceId'>) => {
        const chat = chats.find((each) => each.id === offer.sourceId)
        return chat ? `from “${chat.title}”` : 'from a routine'
    }
}

const Offer: React.FC<{ offer: MemoryOffer }> = ({ offer }) => {
    const [error, setError] = useState<string | null>(null)
    const source = useSourceName()
    const answer = async (keep: boolean) => {
        const result = await api().decide(offer.id, keep)
        setError(result.ok ? null : result.error)
    }
    return (
        <CardInShell label="Offer to remember">
            <p className="mb-1.5 text-12 font-medium text-ink-2 [overflow-wrap:anywhere]">{source(offer).replace(/^f/, 'F')} · remember this?</p>
            <p className="text-15 leading-[1.45] text-ink">
                {offer.text}
                {offer.site && <span className="text-14 text-ink-2"> Only on {offer.site}.</span>}
            </p>
            {error && <div className="mt-2"><ChatError message={error} /></div>}
            <div className="mt-3 flex gap-1.5">
                <Button size="sm" onClick={() => void answer(true)}>Remember</Button>
                <Button size="sm" variant="raised" onClick={() => void answer(false)}>Don’t</Button>
            </div>
        </CardInShell>
    )
}

export const MascotMemoryView: React.FC<{ mascot: MascotProfile; facts: MemoryFact[]; offers: MemoryOffer[]; onBack: () => void }> = ({ mascot, facts, offers, onBack }) => {
    const name = useAssistantName(mascot)
    const groups = new Map<string, MemoryFact[]>()
    for (const fact of [...facts].sort((a, b) => a.savedAt - b.savedAt)) {
        const key = fact.site ?? ANYWHERE
        groups.set(key, [...(groups.get(key) ?? []), fact])
    }
    const places = [...groups.keys()].sort((a, b) => (a === ANYWHERE ? -1 : b === ANYWHERE ? 1 : a.localeCompare(b)))
    return (
        <section aria-label={`What ${name} remembers`} className="flex-1 flex flex-col">
            <StepInHeader back={name} onBack={onBack} title={`What ${name} remembers`}>
                Only what you’ve said yes to. It’s kept on this computer and goes into a job when it fits.
            </StepInHeader>
            {offers.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                    {offers.map((offer) => <Offer key={offer.id} offer={offer} />)}
                </div>
            )}
            {/* Nothing kept says so, but not under an offer, which is already the news. */}
            {facts.length === 0 ? (
                offers.length === 0 && (
                    <EmptyPage face={<BerrySpot size={40} mascot={mascot} />}>
                        Nothing yet. After a job it may ask to remember how you like something done, and it’s kept only if you say yes.
                    </EmptyPage>
                )
            ) : (
                <>
                    {places.map((place) => (
                        <SettingsGroup key={place} label={place === ANYWHERE ? 'Anywhere' : `On ${place}`}>
                            <ul>
                                {(groups.get(place) ?? []).map((fact) => (
                                    <FactRow
                                        key={fact.id}
                                        fact={fact}
                                        onEdit={async (text) => {
                                            const result = await api().edit(fact.id, text)
                                            return result.ok ? null : result.error
                                        }}
                                        onForget={() => void api().forget(fact.id)}
                                    />
                                ))}
                            </ul>
                        </SettingsGroup>
                    ))}
                    <Button size="sm" variant="ghost" className="self-start mt-5 text-ask hover:text-ask" onClick={() => void api().clear(mascot.id)}>Forget everything</Button>
                </>
            )}
        </section>
    )
}

export const MascotMemory: React.FC<{ mascotId: string; onBack: () => void }> = ({ mascotId, onBack }) => {
    const { find } = useFlock()
    const { facts, offers } = useLibrary().memory
    return (
        <MascotMemoryView
            mascot={find(mascotId)}
            facts={facts.filter((fact) => fact.mascotId === mascotId)}
            offers={offers.filter((offer) => offer.mascotId === mascotId)}
            onBack={onBack}
        />
    )
}
