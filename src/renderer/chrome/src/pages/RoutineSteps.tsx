import React, { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { MascotProfile, Routine } from '@shared/library'
import { routinesParam, type RoutinePart } from '@shared/routinePlaces'
import { BERRY_ID } from '@shared/mascots'
import type { Mood } from '@common/components/Mascot'
import { Button } from '@common/components/Button'
import { Choice, Switch } from '@common/components/Controls'
import { BIG_CARD, BIG_SHELL } from '@common/components/cardShell'
import { LABEL, StatusPill } from '@common/components/StatusPill'
import { cn } from '@common/lib/utils'
import { useFlock } from '../contexts/LibraryContext'
import { Berry, BerrySpot, useAssistantName } from '../components/Berry'
import { ChatError } from '../components/ChatMessage'
import { BETWEEN } from '../components/SettingsRow'
import { MarkedSteps } from '../components/MarkedSteps'
import { FIELD, PartNav, SiteChips, StepCard, StepNav } from '../components/StepCard'
import { formatTime } from '../components/RoutineRunRow'
import { narrowerLimits } from '../shortWords'
import { useRunner } from '../useRunner'
import { keepTabDraft, tabDraft } from '../flockView'
import {
    blankForm,
    formFor,
    howOften,
    NEW_ROUTINE_EVENT,
    openRoutines,
    readBack,
    scheduleSentence,
    takeStartedRoutine,
    TIME_CHIPS,
    toDraft,
    withHowOften,
    withRoutinePart,
    type HowOften,
    type RoutineFormValues
} from '../routinesView'

// DESIGN.md section 10, Routines: making one is four questions, one at a time, in the voice of the mascot that will do
// it, on the same card as making a mascot. The name is never asked for: main names it from what it does. Changing one
// part later is the same card, alone.

const api = () => window.chromeAPI.routines
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'

const STEPS: RoutinePart[] = ['does', 'when', 'who', 'where']

export const PART_NAMES: Record<RoutinePart, string> = { name: 'Name', does: 'What it does', when: 'When', who: 'Who does it', where: 'Where it may go' }

const QUESTIONS: Record<RoutinePart, { question: string; hint?: string; mood: Mood }> = {
    does: { question: 'What should I do?', hint: 'In your own words, as in a chat. I work in tabs of my own, and ask before acting just as a chat does.', mood: 'curious' },
    when: { question: 'When?', mood: 'rest' },
    who: { question: 'Who does it?', hint: 'Whoever does it keeps to its own instructions and limits.', mood: 'rest' },
    where: { question: 'Where may I go?', hint: 'I can only go where I’m let. I still ask before anything risky, and no limit changes that.', mood: 'rest' },
    name: { question: 'What’s it called?', hint: 'Call it anything you like. A name you choose is never changed for you.', mood: 'rest' }
}

// While there's a value marked in the steps, the line under the question says what pressing it does.
const hintFor = (part: RoutinePart, values: RoutineFormValues) =>
    part === 'does' && (values.recorded?.length ?? 0) > 0 ? 'In your own words, as in a chat. Press a marked word to choose whether I ask for it each run.' : QUESTIONS[part].hint

const isTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)

// What's wrong with the answer to a step, if anything, so its button says why it's off.
const blocked = (part: RoutinePart, values: RoutineFormValues): string | null => {
    if (part === 'does' && !values.instructions.trim()) return 'Say what it should do.'
    if (part === 'name' && !values.name.trim()) return 'Give it a name.'
    if (part === 'when' && values.kind !== 'manual' && !isTime(values.time)) return 'Choose a time.'
    if (part === 'when' && values.kind === 'weekly' && values.days.length === 0) return 'Choose at least one day.'
    if (part === 'when' && values.kind === 'once' && !values.date) return 'Choose a day.'
    if (part === 'where' && values.onlySomeSites && values.sites.length === 0) return 'Name at least one site, or choose Anywhere.'
    return null
}

type Set = (patch: Partial<RoutineFormValues>) => void

// A choice of one, as a pill: `ink` when chosen, quiet on `sheet-2` otherwise. Times are the machine's words, in mono.
const Pill: React.FC<{ chosen: boolean; onChoose: () => void; mono?: boolean; quiet: string; children: React.ReactNode }> = ({ chosen, onChoose, mono = false, quiet, children }) => (
    <button
        type="button"
        role="radio"
        aria-checked={chosen}
        onClick={onChoose}
        className={cn(
            'h-[30px] px-3 inline-flex items-center transition-colors duration-fast',
            mono ? 'rounded-[10px] font-mono text-11.5' : 'rounded-full text-13',
            chosen ? 'bg-ink text-ground' : cn(quiet, 'text-ink-2 hover:text-ink'),
            FOCUS
        )}
    >
        {children}
    </button>
)

// --- Step 1: what it does --------------------------------------------------------------------------------------------

// From Show Berry how, the steps carry their values marked where they stand, and switching one is pressing its mark.
// Chosen when it opens, so editing the last value away doesn't swap the box under the caret.
const DoesAnswer: React.FC<{ values: RoutineFormValues; onChange: (values: RoutineFormValues) => void }> = ({ values, onChange }) => {
    const [marked] = useState(() => (values.recorded?.length ?? 0) > 0)
    if (marked) return <MarkedSteps label="What should I do?" values={values} onChange={onChange} />
    return (
        <textarea
            autoFocus
            aria-label="What should I do?"
            rows={3}
            maxLength={5000}
            value={values.instructions}
            placeholder="Read SVT and sum up the five biggest stories."
            onChange={(event) => onChange({ ...values, instructions: event.target.value })}
            className={cn(FIELD, 'block min-h-[76px] max-h-[260px] px-4 py-[13px] resize-none text-15 leading-[1.5] [field-sizing:content]')}
        />
    )
}

// --- Step 2: when ----------------------------------------------------------------------------------------------------

const HOW_OFTEN: { value: HowOften; label: string }[] = [
    { value: 'once', label: 'Once' },
    { value: 'daily', label: 'Every day' },
    { value: 'weekdays', label: 'Weekdays' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'manual', label: 'Only when you ask' }
]

// Monday first, with the numbers the schedule counts by, from Sunday.
const DAYS = [
    { value: 1, short: 'Mon', name: 'Monday' },
    { value: 2, short: 'Tue', name: 'Tuesday' },
    { value: 3, short: 'Wed', name: 'Wednesday' },
    { value: 4, short: 'Thu', name: 'Thursday' },
    { value: 5, short: 'Fri', name: 'Friday' },
    { value: 6, short: 'Sat', name: 'Saturday' },
    { value: 0, short: 'Sun', name: 'Sunday' }
]

// The schedule read back, with the parts that were chosen on `sheet-2`.
export const ScheduleSentence: React.FC<{ values: RoutineFormValues; className?: string }> = ({ values, className }) => (
    <p className={cn('text-15 text-ink-2', className)}>
        {scheduleSentence(values).map(({ text, chosen }, at) =>
            chosen ? <b key={at} className="px-[7px] py-0.5 rounded-[7px] bg-sheet-2 font-medium text-ink">{text}</b> : <span key={at}>{text}</span>
        )}
    </p>
)

// How often as pills, the time as chips with Other…, and what each needs besides. `often` limits the pills, as the card
// under a chat offers only the ones that repeat. `centred` is for the step card, and `onCard` for a card in a chat,
// whose quiet fill is `card-2`.
export const WhenAnswer: React.FC<{ values: RoutineFormValues; set: Set; often?: HowOften[]; centred?: boolean; cloud?: boolean; onCard?: boolean }> = ({ values, set, often, centred = true, cloud = true, onCard = false }) => {
    const quiet = onCard ? 'bg-card-2' : 'bg-sheet-2'
    const [runner] = useRunner()
    const [other, setOther] = useState(() => !TIME_CHIPS.includes(values.time))
    const scheduled = values.kind !== 'manual'
    // Only with a runner that has accepted, which is what runs it. One already on stays, so it can be turned off.
    const canRunInCloud = cloud && scheduled && (runner.status === 'linked' || values.inCloud === true)
    const row = cn('flex flex-wrap gap-1.5', centred && 'justify-center')
    const toggleDay = (day: number) => set({ days: values.days.includes(day) ? values.days.filter((each) => each !== day) : [...values.days, day] })
    return (
        <div className="flex flex-col gap-2">
            <div role="radiogroup" aria-label="How often" className={row}>
                {HOW_OFTEN.filter(({ value }) => !often || often.includes(value)).map(({ value, label }) => (
                    <Pill key={value} quiet={quiet} chosen={howOften(values) === value} onChoose={() => set(withHowOften(values, value))}>{label}</Pill>
                ))}
            </div>
            {values.kind === 'weekly' && howOften(values) === 'weekly' && (
                <div role="group" aria-label="Days" className={row}>
                    {DAYS.map(({ value, short, name }) => (
                        <button
                            key={value}
                            type="button"
                            aria-label={name}
                            aria-pressed={values.days.includes(value)}
                            onClick={() => toggleDay(value)}
                            className={cn('h-[30px] w-12 rounded-full text-13 transition-colors duration-fast', values.days.includes(value) ? 'bg-ink text-ground' : cn(quiet, 'text-ink-2 hover:text-ink'), FOCUS)}
                        >
                            {short}
                        </button>
                    ))}
                </div>
            )}
            {(values.kind === 'monthly' || values.kind === 'once') && (
                <div className={row}>
                    {values.kind === 'monthly' ? (
                        <label className={cn('h-[30px] pl-3 pr-1 inline-flex items-center gap-2 rounded-full text-13 text-ink-2', quiet)}>
                            On day
                            <input
                                type="number"
                                min={1}
                                max={31}
                                aria-label="Day of the month"
                                value={values.day}
                                onChange={(event) => set({ day: Math.min(31, Math.max(1, Number(event.target.value) || 1)) })}
                                className="w-14 h-6 px-2 rounded-full bg-sheet text-ink font-mono text-11.5 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            />
                        </label>
                    ) : (
                        <input
                            type="date"
                            aria-label="Date"
                            value={values.date}
                            onChange={(event) => set({ date: event.target.value })}
                            className={cn('h-[30px] px-3 rounded-[10px] text-ink font-mono text-11.5 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-focus', quiet)}
                        />
                    )}
                </div>
            )}
            {scheduled && (
                <div role="radiogroup" aria-label="Time" className={row}>
                    {TIME_CHIPS.map((time) => (
                        <Pill key={time} quiet={quiet} mono chosen={!other && values.time === time} onChoose={() => { setOther(false); set({ time }) }}>{time}</Pill>
                    ))}
                    {other ? (
                        <input
                            type="time"
                            autoFocus={!TIME_CHIPS.includes(values.time)}
                            aria-label="Other time"
                            value={values.time}
                            onChange={(event) => set({ time: event.target.value })}
                            className="h-[30px] px-3 rounded-[10px] bg-ink text-ground font-mono text-11.5 tabular-nums outline-none [color-scheme:dark] dark:[color-scheme:light] focus-visible:ring-2 focus-visible:ring-focus"
                        />
                    ) : (
                        <Pill quiet={quiet} chosen={false} onChoose={() => setOther(true)}>Other…</Pill>
                    )}
                </div>
            )}
            <p className={cn('mt-1 text-13 text-ink-2', centred && 'text-center')}>
                {!scheduled
                    ? 'It only runs when you press Run now.'
                    : values.inCloud
                      ? 'It runs in the cloud at this time, even with your computer off, and its run shows as a chat.'
                      : values.kind === 'monthly' && values.day > 28
                        ? 'In shorter months, it runs on the last day. If Blueberry is closed then, it runs once when you next open it.'
                        : 'If Blueberry is closed at this time, it runs once when you next open it and says it was late.'}
            </p>
            {canRunInCloud && (
                <div className={cn('flex items-center gap-3', centred && 'justify-center')}>
                    <span id="routine-in-cloud" className="text-14 text-ink">Runs even when your computer is off</span>
                    <Switch labelledBy="routine-in-cloud" checked={values.inCloud === true} onChange={(on) => set({ inCloud: on })} />
                </div>
            )}
        </div>
    )
}

// --- Step 3: who does it ---------------------------------------------------------------------------------------------

const WhoAnswer: React.FC<{ values: RoutineFormValues; set: Set }> = ({ values, set }) => {
    const { flock } = useFlock()
    const chosen = values.mascotId ?? BERRY_ID
    return (
        <ul role="radiogroup" aria-label="Who does it" className="max-h-[300px] overflow-y-auto rounded-sheet shadow-[inset_0_0_0_1px_var(--line)]">
            {flock.map((mascot) => {
                const limits = narrowerLimits(mascot)
                const on = chosen === mascot.id
                return (
                    <li key={mascot.id} className={cn(BETWEEN, 'before:left-[52px]')}>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => set({ mascotId: mascot.id === BERRY_ID ? null : mascot.id })}
                            className={cn('w-full min-h-12 py-2 pl-3 pr-3 flex items-center gap-3 text-left transition-colors hover:bg-hover', FOCUS)}
                        >
                            <Berry size={28} mascot={mascot} still />
                            <MascotName mascot={mascot} />
                            {limits && <StatusPill>{limits}</StatusPill>}
                            <span aria-hidden className={cn('size-5 shrink-0 grid place-items-center rounded-full', on ? 'bg-ink text-ground' : 'shadow-[inset_0_0_0_1.5px_var(--faint)]')}>
                                {on && <Check className="size-3" strokeWidth={2.5} />}
                            </span>
                        </button>
                    </li>
                )
            })}
        </ul>
    )
}

const MascotName: React.FC<{ mascot: MascotProfile }> = ({ mascot }) => (
    <span className="flex-1 min-w-0 truncate text-14 font-medium text-ink">{useAssistantName(mascot)}</span>
)

// --- Step 4: where it may go -----------------------------------------------------------------------------------------

const WhereAnswer: React.FC<{ values: RoutineFormValues; set: Set }> = ({ values, set }) => {
    const mascot = useFlock().find(values.mascotId)
    const name = useAssistantName(mascot)
    return (
        <>
            <div className="mb-2.5 flex justify-center">
                <Choice
                    label="Where it may go"
                    value={values.onlySomeSites ? 'some' : 'any'}
                    onChange={(choice) => set({ onlySomeSites: choice === 'some' })}
                    options={[
                        { value: 'any', label: 'Anywhere' },
                        { value: 'some', label: 'Only these sites' }
                    ]}
                />
            </div>
            {values.onlySomeSites && <SiteChips sites={values.sites} onChange={(sites) => set({ sites })} problem={blocked('where', values)} />}
            {mascot.sites.length > 0 && (
                <p className="mt-3 text-center text-13 text-ink-2">
                    {name} keeps to {mascot.sites.join(', ')} anyway. This can only narrow that.
                </p>
            )}
        </>
    )
}

const NameAnswer: React.FC<{ values: RoutineFormValues; set: Set; onEnter: () => void }> = ({ values, set, onEnter }) => (
    <input
        autoFocus
        aria-label="Name"
        maxLength={100}
        value={values.name}
        onChange={(event) => set({ name: event.target.value })}
        onKeyDown={(event) => {
            if (event.key === 'Enter') onEnter()
        }}
        className={cn(FIELD, 'h-[52px] px-4 text-center text-20 font-medium')}
    />
)

const Answer: React.FC<{ part: RoutinePart; values: RoutineFormValues; onChange: (values: RoutineFormValues) => void; onEnter: () => void }> = ({ part, values, onChange, onEnter }) => {
    const set: Set = (patch) => onChange({ ...values, ...patch })
    switch (part) {
        case 'does':
            return <DoesAnswer values={values} onChange={onChange} />
        case 'when':
            return (
                <>
                    <ScheduleSentence values={values} className="mb-4 text-center" />
                    <WhenAnswer values={values} set={set} />
                </>
            )
        case 'who':
            return <WhoAnswer values={values} set={set} />
        case 'where':
            return <WhereAnswer values={values} set={set} />
        case 'name':
            return <NameAnswer values={values} set={set} onEnter={onEnter} />
    }
}

// --- Making one ------------------------------------------------------------------------------------------------------

type Making = { values: RoutineFormValues; step: number; from: 'next' | 'back'; savedId: string | null }

const fresh = (values: RoutineFormValues = blankForm()): Making => ({ values, step: 0, from: 'next', savedId: null })

// It ends here: the mascot looking pleased, and the routine read back as one sentence.
const SavedCard: React.FC<{ routine: Routine | null; values: RoutineFormValues; id: string }> = ({ routine, values, id }) => {
    const mascot = useFlock().find(routine?.mascotId ?? values.mascotId)
    const name = useAssistantName(mascot)
    const shown = routine ? formFor(routine) : values
    return (
        <section aria-label="Saved as a routine" className="w-[520px] max-w-full mx-auto">
            <div className={BIG_SHELL}>
                <div className={cn(BIG_CARD, 'bg-sheet px-7 pt-[30px] pb-[26px] text-center animate-fade-in')}>
                    <div className="mb-3 flex justify-center"><BerrySpot size={72} mascot={mascot} mood="delivered" /></div>
                    <p className={LABEL}>Saved as a routine</p>
                    <h2 className="mt-1.5 mb-2 text-20 font-medium line-clamp-3 [overflow-wrap:anywhere]">{readBack(shown, name)}</h2>
                    {routine?.nextRunAt && <p className="font-mono text-11.5 text-ink-3">next {formatTime(routine.nextRunAt)}</p>}
                    <div className="mt-[22px] flex justify-center gap-2">
                        <Button
                            onClick={() => {
                                void api().runNow(id)
                                openRoutines({ page: 'routine', id })
                            }}
                        >
                            Run it now
                        </Button>
                        <Button variant="raised" onClick={() => openRoutines({ page: 'routine', id })}>Done</Button>
                    </div>
                </div>
            </div>
        </section>
    )
}

// Making one, in four steps. What's typed lasts while the tab stays open, and saves nothing until the last step.
export const NewRoutine: React.FC<{ tabId: string; routines: Routine[] }> = ({ tabId, routines }) => {
    const param = routinesParam({ page: 'new' })
    const { find } = useFlock()
    const [making, setMakingState] = useState<Making>(() => {
        const started = takeStartedRoutine()
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

    // Started again from elsewhere while the steps show, with whatever it was given.
    useEffect(() => {
        const restart = () => {
            const started = takeStartedRoutine()
            if (started) {
                latest.current(fresh(started))
                setError(null)
            }
        }
        window.addEventListener(NEW_ROUTINE_EVENT, restart)
        return () => window.removeEventListener(NEW_ROUTINE_EVENT, restart)
    }, [])

    const { values, step, savedId } = making
    if (savedId) return <SavedCard routine={routines.find((routine) => routine.id === savedId) ?? null} values={values} id={savedId} />

    const part = STEPS[step]
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
        const result = await api().save(null, toDraft(values))
        setSaving(false)
        if (!result.ok) {
            setError(result.error)
            return
        }
        if (values.suggestionId) void window.chromeAPI.suggestions.used(values.suggestionId)
        setError(null)
        setMaking({ ...making, savedId: result.id })
    }

    return (
        <StepCard
            mascot={find(values.mascotId)}
            mood={QUESTIONS[part].mood}
            label={`${step + 1} / ${STEPS.length}`}
            question={QUESTIONS[part].question}
            hint={hintFor(part, values)}
            motionKey={part}
            from={making.from}
            nav={
                <StepNav step={step} steps={STEPS.length} onBack={step > 0 ? () => { setError(null); setMaking({ ...making, step: step - 1, from: 'back' }) } : undefined}>
                    <Button disabled={!!off || saving} title={off ?? undefined} onClick={() => void next()}>
                        {last ? 'Save routine' : 'Continue'}
                    </Button>
                </StepNav>
            }
        >
            <Answer part={part} values={values} onChange={(changed) => setMaking({ ...making, values: changed })} onEnter={() => void next()} />
            {error && <div className="mt-3 text-center"><ChatError message={error} /></div>}
        </StepCard>
    )
}

// One part of a routine, alone, with Cancel and Save. It saves the whole routine with only that part changed.
export const ChangeRoutinePart: React.FC<{ tabId: string; routine: Routine; part: RoutinePart }> = ({ tabId, routine, part }) => {
    const param = routinesParam({ page: 'part', id: routine.id, part })
    const { find } = useFlock()
    const [values, setValuesState] = useState<RoutineFormValues>(() => tabDraft(tabId, param, () => formFor(routine)))
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const setValues = (next: RoutineFormValues) => {
        keepTabDraft(tabId, param, next)
        setValuesState(next)
    }
    const off = blocked(part, values)
    const back = () => openRoutines({ page: 'routine', id: routine.id })

    const commit = async () => {
        if (off || saving) return
        setSaving(true)
        const result = await api().save(routine.id, toDraft(withRoutinePart(formFor(routine), values, part)))
        setSaving(false)
        if (!result.ok) setError(result.error)
        else back()
    }

    return (
        <StepCard
            mascot={find(values.mascotId)}
            mood={QUESTIONS[part].mood}
            label={PART_NAMES[part]}
            question={QUESTIONS[part].question}
            hint={hintFor(part, values)}
            nav={<PartNav off={off} saving={saving} onCancel={back} onSave={() => void commit()} />}
        >
            <Answer part={part} values={values} onChange={setValues} onEnter={() => void commit()} />
            {error && <div className="mt-3 text-center"><ChatError message={error} /></div>}
        </StepCard>
    )
}
