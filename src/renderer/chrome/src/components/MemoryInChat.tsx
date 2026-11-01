import React, { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { MascotProfile, MemoryFact, MemoryOffer } from '@shared/library'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { setFlockView } from '../flockView'
import { Berry, useAssistantName } from './Berry'

const MAX_SHOWN = 2

const openMemory = (mascotId: string) => {
    setFlockView({ page: 'memory', mascotId })
    void window.chromeAPI.browser.openPage('flock')
}

const ChangeIt: React.FC<{ mascot: MascotProfile; children: React.ReactNode }> = ({ mascot, children }) => (
    <button type="button" onClick={() => openMemory(mascot.id)} className="rounded-control text-accent-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
        {children}
    </button>
)

// What this reply went in knowing. It says what the model was given, so it's "keeping in mind" and never a claim that it
// made a difference. Words about a difference are the reply's own. Up to two show, and more fold into one quiet line.
export const RememberedFacts: React.FC<{ used: MemoryFact[]; mascot: MascotProfile }> = ({ used, mascot }) => {
    const [open, setOpen] = useState(false)
    const line = (fact: MemoryFact) => <>{fact.text}{fact.site && <span className="whitespace-nowrap"> ({fact.site})</span>}</>
    if (used.length <= MAX_SHOWN) {
        return (
            <div aria-label="What it’s keeping in mind" className="text-13 text-muted-foreground [overflow-wrap:anywhere]">
                {used.map((fact, index) => (
                    <p key={fact.id}>
                        {index === 0 && 'Keeping in mind: '}{line(fact)}{index === used.length - 1 && <> <ChangeIt mascot={mascot}>Change</ChangeIt></>}
                    </p>
                ))}
            </div>
        )
    }
    return (
        <div aria-label="What it’s keeping in mind" className="flex flex-col items-start gap-1.5 text-13 text-muted-foreground [overflow-wrap:anywhere]">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className="-mx-1.5 px-1.5 h-6 flex items-center gap-1.5 rounded-control outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
                <ChevronRight aria-hidden className={cn("size-3.5 transition-transform duration-100", open && "rotate-90")} />
                Keeping in mind {used.length} things you kept
            </button>
            {open && (
                <>
                    <ul className="flex flex-col gap-1">
                        {used.map((fact) => <li key={fact.id}>{line(fact)}</li>)}
                    </ul>
                    <ChangeIt mascot={mascot}>Change</ChangeIt>
                </>
            )}
        </div>
    )
}

export const RememberedLine: React.FC<{ ids?: string[]; mascot: MascotProfile }> = ({ ids = [], mascot }) => {
    const { facts } = useLibrary().memory
    const used = ids.flatMap((id) => facts.filter((fact) => fact.id === id))
    return used.length > 0 ? <RememberedFacts used={used} mascot={mascot} /> : null
}

// The sentence is exactly what would be kept. The bird is already beside the reply, so nothing here needs a box or a face.
export const MemoryOfferRow: React.FC<{ offer: Pick<MemoryOffer, 'text' | 'site'>; question: string; error?: string | null; onAnswer: (keep: boolean) => void }> = ({ offer, question, error, onAnswer }) => (
    <section aria-label="Offer to remember" className="border-t pt-3 [overflow-wrap:anywhere] animate-fade-in">
        <p className="text-13 text-muted-foreground">{question}</p>
        <p className="mt-1 text-16">{offer.text}</p>
        <p className="mt-0.5 text-12 text-muted-foreground">{offer.site ? `Only on ${offer.site}` : 'On any site'}</p>
        <div className="mt-2 flex items-center gap-1 -ml-0.5">
            <Button size="sm" variant="outline" onClick={() => onAnswer(true)}>Remember</Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onAnswer(false)}>No thanks</Button>
        </div>
        {error && <p role="alert" className="mt-2 text-13 text-destructive">{error}</p>}
    </section>
)

// After a finished job, what its bird would like to remember. Nothing is kept until Remember is pressed, and it only ever
// waits here, on the reply or the run it came after, so a job nobody was watching says nothing about it until they look.
export const MemoryOffers: React.FC<{ sourceId: string | null; mascot: MascotProfile }> = ({ sourceId, mascot }) => {
    const { memory: { offers } } = useLibrary()
    const { showBerry, keepBerryStill } = useShell().settings
    const name = useAssistantName(mascot)
    const [keptOne, setKeptOne] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const waiting = offers.filter((offer) => offer.sourceId === sourceId)

    const answer = async (id: string, keep: boolean) => {
        const result = await window.chromeAPI.memory.decide(id, keep)
        if (!result.ok) setErrors({ ...errors, [id]: result.error })
        else if (keep) setKeptOne(true)
    }

    if (waiting.length === 0 && !keptOne) return null
    return (
        <div className="flex flex-col gap-3">
            {waiting.map((offer) => (
                <MemoryOfferRow
                    key={offer.id}
                    offer={offer}
                    question={showBerry ? 'Should I remember this for next time?' : `Should ${name} remember this for next time?`}
                    error={errors[offer.id]}
                    onAnswer={(keep) => void answer(offer.id, keep)}
                />
            ))}
            {keptOne && (
                <p role="status" className="flex items-center gap-2 text-13 text-muted-foreground animate-fade-in">
                    {showBerry && (
                        <span className={cn(!keepBerryStill && "motion-safe:animate-berry-hop")}>
                            <Berry mood="delivered" size={24} mascot={mascot} />
                        </span>
                    )}
                    <span>Noted. No other bird has this. <ChangeIt mascot={mascot}>See what {showBerry ? 'I remember' : 'it remembers'}</ChangeIt></span>
                </p>
            )}
        </div>
    )
}
