import React, { useEffect, useState } from 'react'
import { ChevronRight, Pencil, Plus } from 'lucide-react'
import type { TabInfo } from '@shared/ipc'
import type { Routine, RoutineRun } from '@shared/library'
import { routinesParam, routinesPlace, type RoutinePart } from '@shared/routinePlaces'
import type { Mood } from '@common/components/Mascot'
import { Button } from '@common/components/Button'
import { StatusPill } from '@common/components/StatusPill'
import { cn } from '@common/lib/utils'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { Berry, useAssistantName } from '../components/Berry'
import { ChatError } from '../components/ChatMessage'
import { EmptyPage, LINE_BETWEEN, OFF_ROW_HIDE, ON_ROW, ON_ROW_SHOW, PageFrame, PageHeader, ROW } from '../components/PageFrame'
import { BackButton, SettingsGroup, SettingsLabel } from '../components/SettingsRow'
import { ShowHowButton } from '../components/ShowBerry'
import { RoutineRunRow } from '../components/RoutineRunRow'
import { forgetTabDraftElsewhere } from '../flockView'
import { formFor, groupRoutines, nextInWords, openRoutines, routineLine, scheduleSentence, sentenceText, startRoutine, toDraft, withRoutinePart } from '../routinesView'
import { ChangeRoutinePart, NewRoutine, PART_NAMES } from './RoutineSteps'

// DESIGN.md section 10, Routines: a page in a tab, with the list, each routine's own page, making one in four steps,
// and changing one part. Where it is lives in the tab's param (routinePlaces.ts).

const api = () => window.chromeAPI.routines
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'

const moodFor = (status: Routine['status']): Mood => (status === 'running' ? 'fetching' : status === 'needs-approval' ? 'asking' : 'rest')

const going = (routine: Routine) => routine.status === 'running' || routine.status === 'needs-approval'

const scheduleWords = (routine: Routine) => sentenceText(scheduleSentence(formFor(routine)))

// Run now, or Stop while a run is going. Run now waits its turn when two are already working.
const runOrStop = (routine: Routine) => {
    if (going(routine) && routine.latestRun) void api().stop(routine.latestRun.id)
    else void api().runNow(routine.id)
}

// Opens the run that's waiting on Needs you, as its card.
const answer = (routine: Routine) => {
    const waiting = routine.latestRun?.approval
    void window.chromeAPI.browser.openPage('needs-you', waiting ? { param: waiting.id } : undefined)
}

// One row per routine. The whole row opens its page. At its end is when it's next, and on the row you're on, by pointer
// or keyboard, Run now or Stop takes its place. One waiting for you always shows Answer, and one waiting to start has
// nothing to press.
const RoutineRow: React.FC<{ routine: Routine }> = ({ routine }) => {
    const mascot = useFlock().find(routine.mascotId)
    const { words, last } = routineLine(routine)
    const asking = routine.status === 'needs-approval'
    const queued = routine.status === 'queued'
    const next = routine.status !== 'running' && !routine.paused && routine.nextRunAt !== null ? nextInWords(routine.nextRunAt) : null
    return (
        <li className={cn(ROW, ON_ROW, LINE_BETWEEN, 'before:left-12 min-h-14 py-[9px] flex items-center gap-3 has-[>button:first-child:active]:bg-press')}>
            <button
                type="button"
                aria-label={routine.name}
                onClick={() => openRoutines({ page: 'routine', id: routine.id })}
                className={cn('absolute inset-0 rounded-[inherit]', FOCUS)}
            />
            <span className="contents pointer-events-none">
                <Berry mood={moodFor(routine.status)} size={28} mascot={mascot} />
                <span className="flex-1 min-w-0">
                    <span className="block truncate text-14 font-medium text-ink">{routine.name}</span>
                    <span className="block truncate text-13 text-ink-2">
                        {words}
                        {words && last && ' · '}
                        {last && <span className={last.ask ? 'text-ask' : 'text-ink-3'}>{last.text}</span>}
                    </span>
                </span>
            </span>
            {asking ? (
                <Button size="sm" variant="raised" className="relative" aria-label={`Answer: ${routine.name}`} onClick={() => answer(routine)}>Answer</Button>
            ) : queued ? (
                <span className="shrink-0 text-13 text-ink-3 pointer-events-none">Waiting to start</span>
            ) : (
                <span className="shrink-0 grid justify-items-end items-center [&>*]:[grid-area:1/1]">
                    {next && <span className={cn('font-mono text-11.5 text-ink-3 tabular-nums pointer-events-none', OFF_ROW_HIDE)}>{next}</span>}
                    <span className={cn('relative flex items-center gap-1', ON_ROW_SHOW)}>
                        <Button size="sm" variant="raised" aria-label={`${going(routine) ? 'Stop' : 'Run now'}: ${routine.name}`} onClick={() => runOrStop(routine)}>
                            {going(routine) ? 'Stop' : 'Run now'}
                        </Button>
                        <ChevronRight aria-hidden className="size-3.5 shrink-0 text-faint pointer-events-none" strokeWidth={1.75} />
                    </span>
                </span>
            )}
        </li>
    )
}

const List: React.FC<{ routines: Routine[] }> = ({ routines }) => {
    const isBerry = useAssistantName() === 'Berry'
    return (
        <>
            <PageHeader
                title="Routines"
                actions={
                    <>
                        <ShowHowButton variant="raised" />
                        <Button onClick={() => startRoutine()}>
                            <Plus strokeWidth={1.75} />
                            New routine
                        </Button>
                    </>
                }
            >
                Work done for you on a schedule, in tabs of its own.
            </PageHeader>
            {routines.length === 0 ? (
                <EmptyPage face={<Berry mood="rest" size={56} />}>
                    {isBerry
                        ? 'A routine is a job I do again by myself, when you say. Tell me what to do, or show me once.'
                        : 'A routine is a job done again by itself, when you say. Say what to do, or show it once.'}
                </EmptyPage>
            ) : (
                groupRoutines(routines).map((group) => (
                    <SettingsGroup list key={group.key} label={group.label} count={group.key === 'needs-you' ? undefined : group.routines.length} tone={group.key === 'needs-you' ? 'ask' : undefined}>
                        <ul aria-label={group.label}>
                            {group.routines.map((routine) => <RoutineRow key={routine.id} routine={routine} />)}
                        </ul>
                    </SettingsGroup>
                ))
            )}
        </>
    )
}

// The name, which becomes a field when it's pressed. That's how a routine is renamed, and a name chosen this way is
// never replaced.
const RoutineName: React.FC<{ routine: Routine }> = ({ routine }) => {
    const [typed, setTyped] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const save = async () => {
        const name = typed?.trim() ?? ''
        if (!name || name === routine.name) {
            setTyped(null)
            setError(null)
            return
        }
        const result = await api().save(routine.id, toDraft(withRoutinePart(formFor(routine), { ...formFor(routine), name }, 'name')))
        if (result.ok) setTyped(null)
        setError(result.ok ? null : result.error)
    }
    if (typed === null) {
        return (
            <h1 className="text-20 font-semibold">
                <button
                    type="button"
                    title="Rename"
                    onClick={() => setTyped(routine.name)}
                    className={cn('-mx-1 px-1 rounded-row text-left [overflow-wrap:anywhere] hover:bg-hover', FOCUS)}
                >
                    {routine.name}
                </button>
            </h1>
        )
    }
    return (
        <form
            onSubmit={(event) => {
                event.preventDefault()
                void save()
            }}
        >
            <input
                autoFocus
                aria-label="Name"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onBlur={() => void save()}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        setTyped(null)
                        setError(null)
                    }
                }}
                className="w-full -mx-1 px-1 h-[30px] rounded-row bg-sheet-2 text-20 font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
            {error && <div className="mt-1"><ChatError message={error} /></div>}
        </form>
    )
}

// One of the three facts: its label over what it is now. Pressing it opens the same card as its step.
const Fact: React.FC<{ label: string; onOpen: () => void; children: React.ReactNode }> = ({ label, onOpen, children }) => (
    <button
        type="button"
        onClick={onOpen}
        className={cn('min-w-0 px-3.5 py-[11px] flex flex-col gap-0.5 text-left border-l border-line first:border-l-0 first:pl-2 transition-colors hover:bg-hover active:bg-press', FOCUS, 'focus-visible:ring-inset')}
    >
        <span className="text-12 text-ink-3">{label}</span>
        <span className="min-w-0 flex items-center gap-1.5 text-14 font-medium text-ink [&>:last-child]:truncate">{children}</span>
    </button>
)

// A routine's own page: who and what on top, what it does in full, three facts, its runs on a thread, and Delete.
const RoutineView: React.FC<{ routine: Routine }> = ({ routine }) => {
    const library = useLibrary()
    const mascot = useFlock().find(routine.mascotId)
    const who = useAssistantName(mascot)
    const [runs, setRuns] = useState<RoutineRun[]>([])
    const queued = routine.status === 'queued'
    const part = (which: RoutinePart) => () => openRoutines({ page: 'part', id: routine.id, part: which })
    const next = routine.paused ? 'paused' : routine.nextRunAt !== null ? `next ${nextInWords(routine.nextRunAt)}` : null

    // The library changes whenever a run takes a step.
    useEffect(() => {
        void api().getRuns(routine.id).then(setRuns)
    }, [routine.id, library])

    const remove = async () => {
        if (await api().delete(routine.id)) openRoutines({ page: 'list' })
    }

    return (
        <>
            <BackButton back="Routines" onBack={() => openRoutines({ page: 'list' })} />
            <section aria-label={routine.name} className="flex items-start gap-3.5">
                <Berry mood={moodFor(routine.status)} size={44} mascot={mascot} />
                <div className="flex-1 min-w-0">
                    <RoutineName key={routine.id} routine={routine} />
                    <p className="mt-0.5 text-14 text-ink-2">
                        {scheduleWords(routine)}
                        {next && <> · <span className="font-mono text-11.5 text-ink-3 tabular-nums">{next}</span></>}
                    </p>
                    {routine.cloudNote && <p className="mt-0.5 text-13 text-ink-2">{routine.cloudNote}</p>}
                    {routine.status === 'needs-approval' && <StatusPill tone="ask" className="mt-2">Needs you</StatusPill>}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                    {routine.scheduleSpec.kind !== 'manual' && (
                        <Button variant="raised" onClick={() => void api().setPaused(routine.id, !routine.paused)}>{routine.paused ? 'Resume' : 'Pause'}</Button>
                    )}
                    <Button disabled={queued} title={queued ? 'It’s waiting to start' : undefined} onClick={() => runOrStop(routine)}>
                        {going(routine) ? 'Stop' : 'Run now'}
                    </Button>
                </div>
            </section>

            <SettingsLabel
                list
                trailing={
                    <Button size="sm" variant="ghost" aria-label="Edit what it does" onClick={part('does')}>
                        <Pencil className="size-3.5" strokeWidth={1.75} />
                        Edit
                    </Button>
                }
            >
                {PART_NAMES.does}
            </SettingsLabel>
            <p className="px-2 max-w-[540px] text-15 leading-[1.55] text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{routine.instructions}</p>

            <div className="mt-5 grid grid-cols-[1.25fr_1fr_1fr] border-y border-line">
                <Fact label={PART_NAMES.when} onOpen={part('when')}><span>{scheduleWords(routine)}</span></Fact>
                <Fact label={PART_NAMES.who} onOpen={part('who')}><Berry size={16} mascot={mascot} still /><span>{who}</span></Fact>
                <Fact label={PART_NAMES.where} onOpen={part('where')}><span>{routine.sites.length > 0 ? routine.sites.join(', ') : 'Anywhere'}</span></Fact>
            </div>

            <SettingsLabel list>Runs</SettingsLabel>
            {runs.length === 0 ? (
                <p className="px-2 text-14 text-ink-2">It hasn’t run yet.</p>
            ) : (
                <ol aria-label="Runs" className="px-2 pt-1">
                    {runs.map((run, at) => (
                        <RoutineRunRow
                            key={run.id}
                            run={run}
                            open={at === 0}
                            onStop={() => void api().stop(run.id)}
                            onRunAgain={going(routine) || queued ? undefined : () => void api().runNow(routine.id)}
                        />
                    ))}
                </ol>
            )}

            <Button size="sm" variant="ghost" className="self-start mt-4 text-ask hover:text-ask" onClick={() => void remove()}>
                Delete {routine.name}
            </Button>
        </>
    )
}

// A routine the page was left on that has since been deleted, or a place a restored session names that isn't there.
const Gone: React.FC = () => (
    <>
        <BackButton back="Routines" onBack={() => openRoutines({ page: 'list' })} />
        <EmptyPage>This routine isn’t here any more.</EmptyPage>
    </>
)

export const RoutinesPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { routines } = useLibrary()
    const place = routinesPlace(tab.pageParam)
    const param = routinesParam(place)

    // Leaving part way keeps nothing: what was typed belongs to the place it was typed in.
    useEffect(() => forgetTabDraftElsewhere(tab.id, param), [tab.id, param])

    // Being here is seeing them, so the dots elsewhere clear.
    const unseen = routines.some((routine) => routine.unseen)
    useEffect(() => {
        if (unseen) void api().markSeen()
    }, [unseen])

    const routine = place.page === 'routine' || place.page === 'part' ? routines.find((each) => each.id === place.id) ?? null : null

    return (
        <PageFrame>
            {place.page === 'new' ? (
                <>
                    <BackButton back="Routines" onBack={() => openRoutines({ page: 'list' })} />
                    <div className="mt-14">
                        <NewRoutine tabId={tab.id} routines={routines} />
                    </div>
                </>
            ) : place.page !== 'list' && !routine ? (
                <Gone />
            ) : place.page === 'part' && routine ? (
                <>
                    <BackButton back={routine.name} onBack={() => openRoutines({ page: 'routine', id: routine.id })} />
                    <div className="mt-14">
                        <ChangeRoutinePart key={param} tabId={tab.id} routine={routine} part={place.part} />
                    </div>
                </>
            ) : routine ? (
                <RoutineView key={routine.id} routine={routine} />
            ) : (
                <List routines={routines} />
            )}
        </PageFrame>
    )
}
