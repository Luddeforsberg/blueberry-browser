import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Plus, X } from 'lucide-react'
import type { GalleryMascot, MascotProfile } from '@shared/library'
import { flockParam, type MascotPart } from '@shared/flockPlaces'
import { ACCESSORIES, BERRY, MASCOT_TOOLS, MAX_MASCOT_INSTRUCTIONS, MAX_MASCOT_NAME, PALETTES, normaliseSite, permissionsInWords } from '@shared/mascots'
import type { Mood } from '@common/components/Mascot'
import { Button } from '@common/components/Button'
import { Choice, Switch } from '@common/components/Controls'
import { BIG_CARD, BIG_SHELL } from '@common/components/cardShell'
import { useStill } from '@common/components/motion'
import { cn } from '@common/lib/utils'
import { useFlock } from '../contexts/LibraryContext'
import { Berry, BerrySpot } from '../components/Berry'
import { ChatError } from '../components/ChatMessage'
import { BETWEEN } from '../components/SettingsRow'
import { blankMascot, keepTabDraft, mascotForm, NEW_MASCOT_EVENT, openMascots, sitesFrom, surprise, tabDraft, takeStartedMascot, toMascotDraft, withPart, type MascotFormValues } from '../flockView'

// DESIGN.md section 10, Your mascots: making one is four questions, one at a time, each a card set into a shell like the
// prompt box, with the mascot being made standing on it. Changing one part later is the same card, alone.

const api = () => window.chromeAPI.mascots
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'
// The card is like the prompt box, so as there, the caret marks focus in a field (DESIGN.md section 8).
const FIELD = 'w-full rounded-sheet bg-sheet-2 text-ink caret-ink outline-none placeholder:text-faint'

const STEPS: MascotPart[] = ['look', 'name', 'purpose', 'limits']

const QUESTIONS: Record<MascotPart, { question: string; hint: string; label: string; mood: Mood }> = {
    look: { question: 'What do I look like?', hint: 'Pick a berry, and something to wear if you like.', label: 'look', mood: 'curious' },
    name: { question: 'What’s my name?', hint: 'It’s what you’ll see in the prompt box and beside my replies.', label: 'name', mood: 'rest' },
    purpose: { question: 'What should I do for you?', hint: 'In your own words, as you’d tell a colleague. I read it before every job.', label: 'what it’s for', mood: 'curious' },
    limits: { question: 'Where can I go, and what can I do there?', hint: 'I can always read the pages I’m allowed on. I still ask before anything risky, and no limit changes that.', label: 'limits', mood: 'rest' }
}

// The mascot as it's being made, to draw.
export const asProfile = (values: MascotFormValues): MascotProfile => ({
    ...BERRY,
    id: values.id ?? 'new',
    name: values.name.trim() || 'New mascot',
    look: { palette: values.palette, accessory: values.accessory },
    instructions: values.instructions,
    sites: sitesFrom(values),
    tools: values.tools
})

// What's wrong with the answer to a step, if anything, so its button says why it's off.
const blocked = (part: MascotPart, values: MascotFormValues): string | null => {
    if (part === 'name' && !values.name.trim()) return 'Give it a name.'
    if (part === 'purpose' && !values.instructions.trim()) return 'Say what it’s for.'
    if (part === 'limits' && values.onlySomeSites && values.sites.length === 0) return 'Name at least one site, or choose Any site.'
    return null
}

// The card in its shell, with the mascot standing on its top edge. `motionKey` changes when the contents do, so they
// slide in from the side they came from, or fade with the motion held still.
export const StepCard: React.FC<{
    mascot: MascotProfile | null
    mood: Mood
    label: string
    action?: React.ReactNode
    question: string
    hint?: string
    motionKey?: string
    from?: 'next' | 'back'
    nav: React.ReactNode
    children: React.ReactNode
}> = ({ mascot, mood, label, action, question, hint, motionKey, from = 'next', nav, children }) => {
    const still = useStill()
    return (
        <section aria-label={question} className="w-[520px] max-w-full mx-auto flex flex-col items-center">
            {mascot && (
                <div className="relative z-[1] -mb-1">
                    <BerrySpot size={72} mascot={mascot} mood={mood} />
                </div>
            )}
            <div className={cn(BIG_SHELL, 'w-full')}>
                <div className={cn(BIG_CARD, 'bg-sheet px-5 pt-4 pb-5 overflow-hidden')}>
                    <div key={motionKey} className={still ? 'animate-step-fade' : from === 'next' ? 'animate-step-next' : 'animate-step-back'}>
                        <div className="h-[26px] flex items-center justify-between font-mono text-11 text-ink-3">
                            <span>{label}</span>
                            {action}
                        </div>
                        <h2 className="mt-0.5 mb-1 text-center text-18 font-medium">{question}</h2>
                        {hint && <p className="mx-auto mb-4 max-w-[380px] text-center text-12 leading-[1.45] text-ink-2">{hint}</p>}
                        {children}
                    </div>
                </div>
                {nav}
            </div>
        </section>
    )
}

// Under the card, in the shell: a round Back on the left, where the steps are in the middle, and the button on the right.
const StepNav: React.FC<{ step: number; onBack?: () => void; children: React.ReactNode }> = ({ step, onBack, children }) => (
    <div className="relative h-[46px] px-1.5 flex items-center justify-between">
        <button
            type="button"
            aria-label="Back a step"
            onClick={onBack}
            className={cn('size-[30px] grid place-items-center rounded-full bg-sheet text-ink-2 shadow-rim transition-[background-color,transform] duration-fast hover:text-ink active:scale-[.96]', FOCUS, !onBack && 'invisible')}
        >
            <ChevronLeft aria-hidden className="size-[13px]" strokeWidth={1.5} />
        </button>
        <span aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-[5px]">
            {STEPS.map((part, index) => (
                <i key={part} className={cn('h-1.5 rounded-[3px] transition-[width] duration-fast', index === step ? 'w-[18px] bg-ink' : index < step ? 'w-1.5 bg-ink-3' : 'w-1.5 bg-dot')} />
            ))}
        </span>
        {children}
    </div>
)

// A berry or a thing to wear, with its name under it.
const LookChoice: React.FC<{ label: string; chosen: boolean; onChoose: () => void; children: React.ReactNode }> = ({ label, chosen, onChoose, children }) => (
    <li>
        <button
            type="button"
            aria-pressed={chosen}
            onClick={onChoose}
            className={cn('w-full pt-2.5 pb-2 flex flex-col items-center gap-1.5 rounded-tile text-12 transition-colors', chosen ? 'bg-sheet-2 text-ink font-medium' : 'text-ink-2 hover:bg-hover hover:text-ink', FOCUS)}
        >
            <span aria-hidden>{children}</span>
            {label}
        </button>
    </li>
)

type Set = (patch: Partial<MascotFormValues>) => void

// The berries not chosen are asleep, and the chosen one is awake. The things to wear are drawn on the chosen berry.
const LookAnswer: React.FC<{ values: MascotFormValues; set: Set }> = ({ values, set }) => (
    <>
        <ul aria-label="Berries" className="grid grid-cols-6 gap-1">
            {PALETTES.map(({ id, label }) => (
                <LookChoice key={id} label={label} chosen={values.palette === id} onChoose={() => set({ palette: id })}>
                    <Berry size={36} mood={values.palette === id ? 'rest' : 'off-duty'} mascot={{ ...BERRY, name: label, look: { palette: id, accessory: 'none' } }} still />
                </LookChoice>
            ))}
        </ul>
        <ul aria-label="Things to wear" className="mt-1 grid grid-cols-6 gap-1">
            {ACCESSORIES.map(({ id, label }) => (
                <LookChoice key={id} label={label} chosen={values.accessory === id} onChoose={() => set({ accessory: id })}>
                    <Berry size={36} mascot={{ ...BERRY, name: label, look: { palette: values.palette, accessory: id } }} still />
                </LookChoice>
            ))}
        </ul>
    </>
)

const NameAnswer: React.FC<{ values: MascotFormValues; set: Set; onEnter: () => void }> = ({ values, set, onEnter }) => (
    <input
        autoFocus
        aria-label="Name"
        maxLength={MAX_MASCOT_NAME}
        value={values.name}
        onChange={(event) => set({ name: event.target.value })}
        onKeyDown={(event) => {
            if (event.key === 'Enter') onEnter()
        }}
        className={cn(FIELD, 'h-[60px] px-4 text-center text-30 font-medium')}
    />
)

// Up to three of the bundled starters the user hasn't added. Pressing one fills in its words, never its sites or tools.
const useStarters = (): GalleryMascot[] => {
    const { flock } = useFlock()
    const [entries, setEntries] = useState<GalleryMascot[]>([])
    useEffect(() => {
        let live = true
        void api()
            .gallery()
            .then(({ entries }) => live && setEntries(entries.filter((entry) => entry.publishedAt === undefined)))
            .catch(() => undefined)
        return () => {
            live = false
        }
    }, [])
    return entries.filter((entry) => !flock.some((mascot) => mascot.galleryId === entry.id)).slice(0, 3)
}

const PurposeAnswer: React.FC<{ values: MascotFormValues; set: Set; offerStarters: boolean }> = ({ values, set, offerStarters }) => {
    const starters = useStarters()
    return (
        <>
            <textarea
                autoFocus
                aria-label="What it’s for"
                rows={3}
                maxLength={MAX_MASCOT_INSTRUCTIONS}
                value={values.instructions}
                placeholder="Keep an eye on my pull requests and tell me what needs me. Be brief."
                onChange={(event) => set({ instructions: event.target.value })}
                className={cn(FIELD, 'block min-h-[76px] px-4 py-[13px] resize-none text-15 leading-[1.5]')}
            />
            {offerStarters && starters.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-11 text-ink-3">
                    <span id="start-from">or start from</span>
                    {starters.map((entry) => (
                        <Button key={entry.id} type="button" variant="outline" size="sm" className="font-sans" aria-describedby="start-from" onClick={() => set({ instructions: entry.draft.instructions })}>
                            {entry.draft.name}
                        </Button>
                    ))}
                </div>
            )}
        </>
    )
}

// A site as a chip with its ×, and Add a site, which becomes a field. One that isn't a site stays in the field and is
// said under the chips.
const SitesAnswer: React.FC<{ values: MascotFormValues; set: Set }> = ({ values, set }) => {
    const [adding, setAdding] = useState<string | null>(null)
    const [bad, setBad] = useState<string | null>(null)
    const add = (text: string): boolean => {
        if (!text.trim()) {
            setAdding(null)
            setBad(null)
            return true
        }
        const site = normaliseSite(text)
        if (!site) {
            setBad(text.trim())
            return false
        }
        if (!values.sites.includes(site)) set({ sites: [...values.sites, site] })
        setAdding(null)
        setBad(null)
        return true
    }
    const problem = bad ? `“${bad}” doesn’t look like a site. Try something like example.com.` : blocked('limits', values)
    return (
        <>
            <ul aria-label="Sites it may use" className="flex flex-wrap justify-center items-center gap-1.5">
                {values.sites.map((site) => (
                    <li key={site} className="h-[26px] pl-[9px] pr-[3px] inline-flex items-center gap-1 rounded-row bg-sheet-2 font-mono text-11.5 text-ink">
                        {site}
                        <button type="button" aria-label={`Remove ${site}`} onClick={() => set({ sites: values.sites.filter((each) => each !== site) })} className={cn('size-5 grid place-items-center rounded-[6px] text-ink-3 hover:bg-hover hover:text-ink', FOCUS)}>
                            <X aria-hidden className="size-[11px]" strokeWidth={1.5} />
                        </button>
                    </li>
                ))}
                <li>
                    {adding === null ? (
                        <button type="button" onClick={() => setAdding('')} className={cn('h-[26px] pl-[9px] pr-3 inline-flex items-center gap-1.5 rounded-row shadow-[inset_0_0_0_1px_var(--line)] text-12 text-ink-2 hover:bg-hover hover:text-ink', FOCUS)}>
                            <Plus aria-hidden className="size-[11px]" strokeWidth={1.5} />
                            Add a site
                        </button>
                    ) : (
                        <input
                            autoFocus
                            aria-label="Add a site"
                            aria-invalid={!!bad}
                            value={adding}
                            spellCheck={false}
                            placeholder="example.com"
                            onChange={(event) => {
                                setAdding(event.target.value)
                                setBad(null)
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ',') {
                                    event.preventDefault()
                                    if (add(adding) && event.key === ',') setAdding('')
                                } else if (event.key === 'Escape') {
                                    setAdding(null)
                                    setBad(null)
                                }
                            }}
                            onBlur={() => add(adding)}
                            className="h-[26px] w-40 px-[9px] rounded-row bg-sheet-2 font-mono text-11.5 text-ink caret-ink outline-none placeholder:text-faint"
                        />
                    )}
                </li>
            </ul>
            {problem && <p role="alert" className="mt-2 text-center text-12 text-ask">{problem}</p>}
        </>
    )
}

const LimitsAnswer: React.FC<{ values: MascotFormValues; set: Set }> = ({ values, set }) => (
    <>
        <div className="mb-2.5 flex justify-center">
            <Choice
                label="Where it can go"
                value={values.onlySomeSites ? 'some' : 'any'}
                onChange={(choice) => set({ onlySomeSites: choice === 'some' })}
                options={[
                    { value: 'any', label: 'Any site' },
                    { value: 'some', label: 'Only these sites' }
                ]}
            />
        </div>
        {values.onlySomeSites && <div className="mb-3.5"><SitesAnswer values={values} set={set} /></div>}
        <ul aria-label="What it can do" className="rounded-sheet shadow-[inset_0_0_0_1px_var(--line)]">
            {MASCOT_TOOLS.map(({ id, label, hint }) => (
                <li key={id} className={cn(BETWEEN, 'before:left-3.5 min-h-11 py-2 pl-3.5 pr-3 flex items-center gap-3')}>
                    <div className="flex-1 min-w-0">
                        <p id={`mascot-tool-${id}`} className="text-13 text-ink">{label}</p>
                        <p className="mt-0.5 text-12 leading-[1.4] text-ink-2">{hint}</p>
                    </div>
                    <Switch labelledBy={`mascot-tool-${id}`} checked={values.tools.includes(id)} onChange={(on) => set({ tools: on ? [...values.tools, id] : values.tools.filter((tool) => tool !== id) })} />
                </li>
            ))}
        </ul>
    </>
)

const Answer: React.FC<{ part: MascotPart; values: MascotFormValues; set: Set; onEnter: () => void; making: boolean }> = ({ part, values, set, onEnter, making }) => {
    switch (part) {
        case 'look':
            return <LookAnswer values={values} set={set} />
        case 'name':
            return <NameAnswer values={values} set={set} onEnter={onEnter} />
        case 'purpose':
            return <PurposeAnswer values={values} set={set} offerStarters={making} />
        case 'limits':
            return <LimitsAnswer values={values} set={set} />
    }
}

// The whole draft, saved through the same check as ever. A part changed on its own still saves everything else as it was.
const save = async (values: MascotFormValues): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
    const result = await api().save(values.id, { ...toMascotDraft(values), worksInCloud: values.worksInCloud })
    return result.ok ? { ok: true, id: result.id } : { ok: false, error: result.error }
}

type Making = { values: MascotFormValues; step: number; from: 'next' | 'back'; madeId: string | null }

const fresh = (values: MascotFormValues = blankMascot()): Making => ({ values, step: 0, from: 'next', madeId: null })

// It ends here: the mascot looking pleased, read back to you.
const MadeCard: React.FC<{ mascot: MascotProfile }> = ({ mascot }) => {
    const { choose } = useFlock()
    return (
        <section aria-label={`${mascot.name} is added`} className="w-[520px] max-w-full mx-auto">
            <div className={BIG_SHELL}>
                <div className={cn(BIG_CARD, 'bg-sheet px-7 pt-[30px] pb-[26px] text-center animate-fade-in')}>
                    <div className="mb-3 flex justify-center"><BerrySpot size={72} mascot={mascot} mood="delivered" /></div>
                    <p className="font-mono text-11 text-ink-3">added to your mascots</p>
                    <h2 className="mt-1 mb-2 text-30 font-medium [overflow-wrap:anywhere]">{mascot.name}</h2>
                    <p className="mx-auto max-w-[360px] text-13 leading-[1.5] text-ink-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{mascot.instructions}</p>
                    <LimitTags mascot={mascot} className="mt-3.5 justify-center" />
                    <div className="mt-[22px] flex justify-center gap-2">
                        <Button
                            onClick={() => {
                                choose(mascot.id)
                                void window.chromeAPI.browser.createTab()
                            }}
                        >
                            Give it a job
                        </Button>
                        <Button variant="outline" onClick={() => openMascots({ page: 'mascot', id: mascot.id })}>Done</Button>
                    </div>
                </div>
            </div>
        </section>
    )
}

// What it may do, as mono tags, in the words the Gallery uses.
export const LimitTags: React.FC<{ mascot: Pick<MascotProfile, 'sites' | 'tools'>; className?: string }> = ({ mascot, className }) => (
    <ul aria-label="What it may do" className={cn('flex flex-wrap gap-1.5', className)}>
        {permissionsInWords(mascot).map(({ text }) => (
            <li key={text} className="min-h-[22px] px-2 py-[3px] inline-flex items-center rounded-[7px] bg-sheet-2 font-mono text-11 text-ink-2">{text}</li>
        ))}
    </ul>
)

// Making one, in four steps. What's typed lasts while the tab is away, and leaving keeps nothing.
export const NewMascot: React.FC<{ tabId: string }> = ({ tabId }) => {
    const param = flockParam({ page: 'new' })
    const { flock } = useFlock()
    const [making, setMakingState] = useState<Making>(() => {
        const started = takeStartedMascot()
        return started ? fresh(started) : tabDraft(tabId, param, () => fresh())
    })
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const setMaking = (next: Making) => {
        keepTabDraft(tabId, param, next)
        setMakingState(next)
    }
    const latest = useRef(setMaking)
    latest.current = setMaking

    // New mascot pressed again while the steps show starts them again, with whatever it was given.
    useEffect(() => {
        const restart = () => {
            const started = takeStartedMascot()
            if (started) {
                latest.current(fresh(started))
                setError(null)
            }
        }
        window.addEventListener(NEW_MASCOT_EVENT, restart)
        return () => window.removeEventListener(NEW_MASCOT_EVENT, restart)
    }, [])

    // Until the library has it, it's read back from what was saved.
    if (making.madeId) return <MadeCard mascot={flock.find((mascot) => mascot.id === making.madeId) ?? { ...asProfile(making.values), id: making.madeId }} />

    const { values, step } = making
    const part = STEPS[step]
    const set: Set = (patch) => setMaking({ ...making, values: { ...values, ...patch } })
    const others = flock.map((mascot) => mascot.name)
    const off = blocked(part, values)
    const last = step === STEPS.length - 1

    const next = async () => {
        if (off || saving) return
        if (!last) {
            setError(null)
            setMaking({ ...making, step: step + 1, from: 'next' })
            return
        }
        setSaving(true)
        const result = await save(values)
        setSaving(false)
        if (!result.ok) {
            setError(result.error)
            return
        }
        if (values.suggestionId) void window.chromeAPI.suggestions.used(values.suggestionId)
        setError(null)
        setMaking({ ...making, madeId: result.id })
    }

    return (
        <StepCard
            mascot={asProfile(values)}
            mood={QUESTIONS[part].mood}
            label={`${step + 1} / ${STEPS.length}`}
            action={part === 'look' && <Button type="button" variant="outline" size="sm" className="font-sans" onClick={() => set(surprise(values, others))}>Surprise me</Button>}
            question={QUESTIONS[part].question}
            hint={QUESTIONS[part].hint}
            motionKey={part}
            from={making.from}
            nav={
                <StepNav step={step} onBack={step > 0 ? () => { setError(null); setMaking({ ...making, step: step - 1, from: 'back' }) } : undefined}>
                    <Button disabled={!!off || saving} title={off ?? undefined} onClick={() => void next()}>
                        {last ? `Add ${values.name.trim() || 'mascot'}` : 'Continue'}
                    </Button>
                </StepNav>
            }
        >
            <Answer part={part} values={values} set={set} onEnter={() => void next()} making />
            {error && <div className="mt-3 text-center"><ChatError message={error} /></div>}
        </StepCard>
    )
}

// One part of a mascot, alone, with Cancel and Save. It saves the whole mascot with only that part changed.
export const ChangePart: React.FC<{ tabId: string; mascot: MascotProfile; part: MascotPart }> = ({ tabId, mascot, part }) => {
    const param = flockParam({ page: 'part', id: mascot.id, part })
    const [values, setValuesState] = useState<MascotFormValues>(() => tabDraft(tabId, param, () => mascotForm(mascot)))
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const set: Set = (patch) => {
        const next = { ...values, ...patch }
        keepTabDraft(tabId, param, next)
        setValuesState(next)
    }
    const off = blocked(part, values)
    const back = () => openMascots({ page: 'mascot', id: mascot.id })

    const commit = async () => {
        if (off || saving) return
        setSaving(true)
        const result = await save(withPart(mascotForm(mascot), values, part))
        setSaving(false)
        if (!result.ok) setError(result.error)
        else back()
    }

    return (
        <StepCard
            mascot={asProfile(values)}
            mood={QUESTIONS[part].mood}
            label={QUESTIONS[part].label}
            question={QUESTIONS[part].question}
            hint={QUESTIONS[part].hint}
            nav={
                <div className="h-[46px] px-1.5 flex items-center justify-between">
                    <Button variant="outline" onClick={back}>Cancel</Button>
                    <Button disabled={!!off || saving} title={off ?? undefined} onClick={() => void commit()}>Save</Button>
                </div>
            }
        >
            <Answer part={part} values={values} set={set} onEnter={() => void commit()} making={false} />
            {error && <div className="mt-3 text-center"><ChatError message={error} /></div>}
        </StepCard>
    )
}
