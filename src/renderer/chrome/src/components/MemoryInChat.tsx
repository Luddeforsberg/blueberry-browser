import React, { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { MascotProfile, MemoryFact, MemoryOffer } from '@shared/library'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { setFlockView } from '../flockView'
import { useAssistantName } from './Berry'

const MAX_SHOWN = 2

const openMemory = (mascotId: string) => {
    setFlockView({ page: 'memory', mascotId })
    void window.chromeAPI.browser.openPage('flock')
}

const ChangeIt: React.FC<{ mascotId: string; children: React.ReactNode }> = ({ mascotId, children }) => (
    <button type="button" onClick={() => openMemory(mascotId)} className="rounded-control text-accent-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
        {children}
    </button>
)

// What this reply went in knowing. It says what the model was given, so it's "keeping in mind" and never a claim that it
// made a difference. Words about a difference are the reply's own. Up to two show, and more fold into one quiet line.
// Change goes to the bird that holds the facts, which an old routine run's current bird may not be.
export const RememberedFacts: React.FC<{ used: MemoryFact[] }> = ({ used }) => {
    const [open, setOpen] = useState(false)
    const line = (fact: MemoryFact) => <>{fact.text}{fact.site && <span className="whitespace-nowrap"> ({fact.site})</span>}</>
    if (used.length <= MAX_SHOWN) {
        return (
            <div aria-label="What it’s keeping in mind" className="text-13 text-muted-foreground [overflow-wrap:anywhere]">
                {used.map((fact, index) => (
                    <p key={fact.id}>
                        {index === 0 && 'Keeping in mind: '}{line(fact)}{index === used.length - 1 && <> <ChangeIt mascotId={fact.mascotId}>Change</ChangeIt></>}
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
                    <ChangeIt mascotId={used[0].mascotId}>Change</ChangeIt>
                </>
            )}
        </div>
    )
}

export const RememberedLine: React.FC<{ ids?: string[] }> = ({ ids = [] }) => {
    const { facts } = useLibrary().memory
    const used = ids.flatMap((id) => facts.filter((fact) => fact.id === id))
    return used.length > 0 ? <RememberedFacts used={used} /> : null
}

// A fact a bird could keep, word for word, opened from the quiet line. As quiet as the line itself.
const MemoryOfferRow: React.FC<{ offer: Pick<MemoryOffer, 'text' | 'site'>; error?: string; onAnswer: (keep: boolean) => void }> = ({ offer, error, onAnswer }) => (
    <li aria-label="Offer to remember">
        <p>{offer.text}{offer.site && <span className="text-12"> Only on {offer.site}</span>}</p>
        <div className="-ml-2.5 flex items-center">
            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => onAnswer(true)}>Remember</Button>
            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => onAnswer(false)}>No thanks</Button>
        </div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
    </li>
)

// One line, folded however many there are. Nothing about it waits, counts or asks, so leaving it alone is as good as No thanks.
export const MemoryOffersLine: React.FC<{ offers: Pick<MemoryOffer, 'id' | 'text' | 'site'>[]; mascot: MascotProfile; kept: boolean; keptBy?: string; errors?: Record<string, string>; startOpen?: boolean; onAnswer: (id: string, keep: boolean) => void }> = ({ offers, mascot, kept, keptBy, errors = {}, startOpen = false, onAnswer }) => {
    const { showBerry } = useShell().settings
    const name = useAssistantName(mascot)
    const [open, setOpen] = useState(startOpen)
    return (
        <div className="flex flex-col items-start gap-1.5 text-13 text-muted-foreground [overflow-wrap:anywhere] animate-fade-in">
            {offers.length > 0 && (
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                    className="-mx-1.5 px-1.5 h-6 flex items-center gap-1.5 rounded-control outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ChevronRight aria-hidden className={cn("size-3.5 transition-transform duration-100", open && "rotate-90")} />
                    {showBerry ? 'Something I could remember for next time' : `Something ${name} could remember for next time`}
                </button>
            )}
            {open && offers.length > 0 && (
                <ul className="pl-5 flex flex-col gap-1.5">
                    {offers.map((offer) => <MemoryOfferRow key={offer.id} offer={offer} error={errors[offer.id]} onAnswer={(keep) => onAnswer(offer.id, keep)} />)}
                </ul>
            )}
            {kept && <p role="status">Noted. <ChangeIt mascotId={keptBy ?? mascot.id}>See what {showBerry ? 'I remember' : 'it remembers'}</ChangeIt></p>}
        </div>
    )
}

// What a finished job's bird could keep, under its reply or run. Nothing is kept until Remember is pressed, and it only ever
// sits here, so a job nobody was watching says nothing about it until they look, and then only this.
export const MemoryOffers: React.FC<{ sourceId: string | null; mascot: MascotProfile }> = ({ sourceId, mascot }) => {
    const { memory: { offers } } = useLibrary()
    // Whose it went to, which an old routine run's current bird may not be.
    const [keptBy, setKeptBy] = useState<string | null>(null)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const waiting = offers.filter((offer) => offer.sourceId === sourceId)

    const answer = async (id: string, keep: boolean) => {
        const owner = waiting.find((offer) => offer.id === id)?.mascotId
        const result = await window.chromeAPI.memory.decide(id, keep)
        if (!result.ok) setErrors({ ...errors, [id]: result.error })
        else if (keep && owner) setKeptBy(owner)
    }

    if (waiting.length === 0 && !keptBy) return null
    return <MemoryOffersLine offers={waiting} mascot={mascot} kept={!!keptBy} keptBy={keptBy ?? undefined} errors={errors} onAnswer={(id, keep) => void answer(id, keep)} />
}
