import React, { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { MascotProfile, MemoryFact } from '@shared/library'
import { MAX_FACT_LENGTH } from '@shared/memory'
import { Button } from '@common/components/Button'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { Berry, useAssistantName } from '../components/Berry'
import { ChatError } from '../components/ChatMessage'

const api = () => window.chromeAPI.memory
const ANYWHERE = 'Anywhere'

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
            <li className="py-3">
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
                        className="w-full py-2 px-3 rounded-card border bg-surface text-14 outline-none resize-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {error && <div className="mt-1"><ChatError message={error} /></div>}
                    <div className="mt-2 flex items-center gap-1">
                        <Button size="sm" type="submit">Save</Button>
                        <Button size="sm" type="button" variant="ghost" className="text-muted-foreground" onClick={() => { setEditing(null); setError(null) }}>Cancel</Button>
                    </div>
                </form>
            </li>
        )
    }
    return (
        <li className="py-3 flex items-start gap-4">
            <p className="flex-1 min-w-0 text-16 [overflow-wrap:anywhere]">{fact.text}</p>
            <div className="shrink-0 flex items-center">
                <Button size="xs" variant="ghost" className="text-muted-foreground" aria-label={`Edit: ${fact.text}`} onClick={() => setEditing(fact.text)}>Edit</Button>
                <Button size="xs" variant="ghost" className="text-muted-foreground" aria-label={`Forget: ${fact.text}`} onClick={onForget}>Forget</Button>
            </div>
        </li>
    )
}

// What one bird remembers, as a list of lines under each site. Everything it knows is on this page, and nothing else is.
export const MascotMemoryView: React.FC<{ mascot: MascotProfile; facts: MemoryFact[]; onBack: () => void }> = ({ mascot, facts, onBack }) => {
    const name = useAssistantName(mascot)
    const groups = new Map<string, MemoryFact[]>()
    for (const fact of [...facts].sort((a, b) => a.savedAt - b.savedAt)) {
        const key = fact.site ?? ANYWHERE
        groups.set(key, [...(groups.get(key) ?? []), fact])
    }
    const places = [...groups.keys()].sort((a, b) => (a === ANYWHERE ? -1 : b === ANYWHERE ? 1 : a.localeCompare(b)))
    return (
        <div className="max-w-[672px] mx-auto">
            <Button size="xs" variant="ghost" className="-ml-2.5 text-muted-foreground" onClick={onBack}>
                <ArrowLeft />
                Your flock
            </Button>
            <div className="mt-2 flex items-end justify-between gap-6 border-b">
                <div className="min-w-0 pb-4">
                    <h1 className="text-20 font-semibold">What {name} remembers</h1>
                    <p className="mt-1 text-14 text-muted-foreground">
                        Only what you said yes to, word for word. It goes into {name}’s jobs as your preferences, and limits and approvals work the same with or without it. No other bird has it, and it never goes with a copy or anything published.
                    </p>
                </div>
                <Berry mood={facts.length > 0 ? 'curious' : 'rest'} size={88} mascot={mascot} className="shrink-0 -mb-px" />
            </div>
            {facts.length === 0 ? (
                <p className="mt-4 text-14 text-muted-foreground">Nothing yet. After a job, {name} may ask to remember how you like something done, and it’s kept only if you say yes.</p>
            ) : (
                <>
                    {places.map((place) => (
                        <section key={place} aria-label={place === ANYWHERE ? 'Anywhere' : `On ${place}`} className="mt-5">
                            <h2 className="text-13 font-semibold text-muted-foreground">{place === ANYWHERE ? 'Anywhere' : `On ${place}`}</h2>
                            <ul className="mt-1 divide-y">
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
                        </section>
                    ))}
                    <div className="mt-6 pt-3 border-t">
                        <Button size="sm" variant="ghost" className="-ml-3 text-destructive" onClick={() => void api().clear(mascot.id)}>Forget everything</Button>
                    </div>
                </>
            )}
        </div>
    )
}

export const MascotMemory: React.FC<{ mascotId: string; onBack: () => void }> = ({ mascotId, onBack }) => {
    const { find } = useFlock()
    const { facts } = useLibrary().memory
    return <MascotMemoryView mascot={find(mascotId)} facts={facts.filter((fact) => fact.mascotId === mascotId)} onBack={onBack} />
}
