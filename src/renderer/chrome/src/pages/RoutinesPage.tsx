import React, { useEffect, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import type { TabInfo } from '@shared/ipc'
import type { Routine, RoutineRun } from '@shared/library'
import { routinesParam, routinesPlace, type RoutinePart } from '@shared/routinePlaces'
import type { Mood } from '@common/components/Mascot'
import { Button } from '@common/components/Button'
import { StatusPill, type PillTone } from '@common/components/StatusPill'
import { cn } from '@common/lib/utils'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { Berry, useAssistantName } from '../components/Berry'
import { EmptySheet, PageFrame, PageHeader } from '../components/PageFrame'
import { BackButton, BETWEEN, SettingsGroup, SettingsLink } from '../components/SettingsRow'
import { ShowHowButton } from '../components/ShowBerry'
import { RoutineRunRow } from '../components/RoutineRunRow'
import { forgetTabDraftElsewhere } from '../flockView'
import { formFor, nextInWords, openRoutines, scheduleSentence, sentenceText, startRoutine } from '../routinesView'
import { ChangeRoutinePart, NewRoutine, PART_NAMES } from './RoutineSteps'

// DESIGN.md section 10, Routines: a page in a tab, with the list, each routine's own page, making one in four steps,
// and changing one part. Where it is lives in the tab's param (routinePlaces.ts).

const api = () => window.chromeAPI.routines
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'

const moodFor = (status: Routine['status']): Mood => (status === 'running' ? 'fetching' : status === 'needs-approval' ? 'asking' : 'rest')

const going = (routine: Routine) => routine.status === 'running' || routine.status === 'needs-approval'

// Its state as a pill: going, waiting for you, paused, gone wrong, or when it's next.
const stateOf = (routine: Routine): { words: string; tone?: PillTone } => {
    switch (routine.status) {
        case 'running':
            return { words: 'Running', tone: 'on' }
        case 'needs-approval':
            return { words: 'Needs you', tone: 'ask' }
        case 'queued':
            return { words: 'Waiting to start' }
        case 'paused':
            return { words: 'Paused' }
        case 'failed':
            return { words: 'Failed', tone: 'ask' }
        case 'interrupted':
            return { words: 'Interrupted', tone: 'ask' }
        default:
            if (routine.scheduleSpec.kind === 'manual') return { words: 'Only when you ask' }
            return routine.nextRunAt !== null ? { words: `Scheduled · ${nextInWords(routine.nextRunAt)}` } : { words: 'Not scheduled' }
    }
}

const scheduleWords = (routine: Routine) => sentenceText(scheduleSentence(formFor(routine)))

// Run now, or Stop while a run is going. Run now waits its turn when two are already working.
const runOrStop = (routine: Routine) => {
    if (going(routine) && routine.latestRun) void api().stop(routine.latestRun.id)
    else void api().runNow(routine.id)
}

// One row per routine. The whole row opens its page, and Run now or Stop shows on the row you're on, by pointer or
// keyboard, in place of its state.
const RoutineRow: React.FC<{ routine: Routine }> = ({ routine }) => {
    const mascot = useFlock().find(routine.mascotId)
    const state = stateOf(routine)
    const queued = routine.status === 'queued'
    return (
        <li className={cn(BETWEEN, 'group before:left-[66px] relative min-h-16 py-[13px] pl-4 pr-3.5 flex items-center gap-3.5 transition-colors hover:bg-sheet-2/50 focus-within:bg-sheet-2/50 first:rounded-t-sheet last:rounded-b-sheet')}>
            <Berry mood={moodFor(routine.status)} size={36} mascot={mascot} />
            <div className="flex-1 min-w-0">
                <button
                    type="button"
                    onClick={() => openRoutines({ page: 'routine', id: routine.id })}
                    className={cn("block max-w-full truncate text-left text-14 font-medium text-ink before:content-[''] before:absolute before:inset-0 before:rounded-[inherit]", FOCUS, 'focus-visible:ring-0 focus-visible:before:ring-2 focus-visible:before:ring-focus')}
                >
                    {routine.name}
                </button>
                <p className="mt-0.5 truncate text-13 text-ink-2">{[scheduleWords(routine), routine.cloudNote ?? routine.lastResult].join(' · ')}</p>
            </div>
            <span className="shrink-0 grid justify-items-end items-center [&>*]:[grid-area:1/1]">
                <StatusPill tone={state.tone} className={cn('transition-opacity', !queued && 'group-hover:opacity-0 group-focus-within:opacity-0')}>{state.words}</StatusPill>
                {!queued && (
                    <Button size="sm" variant="raised" className="relative opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" aria-label={`${going(routine) ? 'Stop' : 'Run now'}: ${routine.name}`} onClick={() => runOrStop(routine)}>
                        {going(routine) ? 'Stop' : 'Run now'}
                    </Button>
                )}
            </span>
            <ChevronRight aria-hidden className="size-3.5 shrink-0 -ml-1 text-faint" strokeWidth={1.75} />
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
                <EmptySheet face={<Berry mood="rest" size={56} />}>
                    {isBerry
                        ? 'A routine is a job I do again by myself, when you say. Tell me what to do, or show me once.'
                        : 'A routine is a job done again by itself, when you say. Say what to do, or show it once.'}
                </EmptySheet>
            ) : (
                <ul aria-label="Routines" className="rounded-sheet bg-sheet shadow-up">
                    {routines.map((routine) => <RoutineRow key={routine.id} routine={routine} />)}
                </ul>
            )}
        </>
    )
}

// A routine's own page: what it is, a row for each part you can change, its runs, and Delete.
const RoutineView: React.FC<{ routine: Routine }> = ({ routine }) => {
    const library = useLibrary()
    const mascot = useFlock().find(routine.mascotId)
    const who = useAssistantName(mascot)
    const [runs, setRuns] = useState<RoutineRun[]>([])
    const state = stateOf(routine)
    const queued = routine.status === 'queued'
    const part = (which: RoutinePart) => () => openRoutines({ page: 'part', id: routine.id, part: which })

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
            <section aria-label={routine.name} className="rounded-sheet bg-sheet shadow-up pt-5 pr-[18px] pb-5 pl-[22px] flex items-start gap-5">
                <Berry mood={moodFor(routine.status)} size={64} mascot={mascot} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                    <h1 className="mb-1 text-20 font-semibold [overflow-wrap:anywhere]">{routine.name}</h1>
                    <p className="text-14 text-ink-2">{scheduleWords(routine)}</p>
                    {routine.cloudNote && <p className="mt-0.5 text-13 text-ink-2">{routine.cloudNote}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusPill tone={state.tone}>{state.words}</StatusPill>
                    </div>
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

            <SettingsGroup label="Change">
                <SettingsLink title={PART_NAMES.name} value={<span>{routine.name}</span>} onOpen={part('name')} />
                <SettingsLink title={PART_NAMES.does} value={<span>{routine.instructions}</span>} onOpen={part('does')} />
                <SettingsLink title={PART_NAMES.when} value={<span>{scheduleWords(routine)}</span>} onOpen={part('when')} />
                <SettingsLink title={PART_NAMES.who} value={<><Berry size={20} mascot={mascot} still /><span>{who}</span></>} onOpen={part('who')} />
                <SettingsLink title={PART_NAMES.where} value={<span>{routine.sites.length > 0 ? routine.sites.join(', ') : 'Anywhere'}</span>} onOpen={part('where')} />
            </SettingsGroup>

            <SettingsGroup label="Runs">
                {runs.length === 0 ? (
                    <p className="min-h-[52px] px-4 flex items-center text-14 text-ink-2">It hasn’t run yet.</p>
                ) : (
                    <ol aria-label="Runs">
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
            </SettingsGroup>

            <Button size="sm" variant="ghost" className="mt-5 text-ask hover:text-ask" onClick={() => void remove()}>
                Delete {routine.name}
            </Button>
        </>
    )
}

// A routine the page was left on that has since been deleted, or a place a restored session names that isn't there.
const Gone: React.FC = () => (
    <>
        <BackButton back="Routines" onBack={() => openRoutines({ page: 'list' })} />
        <EmptySheet>This routine isn’t here any more.</EmptySheet>
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
