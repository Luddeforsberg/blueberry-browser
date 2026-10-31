import React, { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { Routine, RoutineRun } from '@shared/library'
import type { Mood } from '@common/components/Mascot'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { Berry, useAssistantName } from '../components/Berry'
import { RoutineForm } from '../components/RoutineForm'
import { formatTime, RoutineApprovals, RoutineRunCard, RoutineStatusLabel } from '../components/RoutineRunCard'
import { blankForm, formFor, routinesView, setRoutinesView, type RoutinesView } from '../routinesView'

const api = () => window.chromeAPI.routines

const moodFor = (status: Routine['status']): Mood => {
    switch (status) {
        case 'running':
            return 'fetching'
        case 'needs-approval':
            return 'asking'
        case 'finished':
            return 'delivered'
        case 'failed':
        case 'interrupted':
            return 'oops'
        default:
            return 'rest'
    }
}

const List: React.FC<{ onNew: () => void; onOpen: (id: string) => void }> = ({ onNew, onOpen }) => {
    const { routines } = useLibrary()
    const isBerry = useAssistantName() === 'Berry'
    const { find } = useFlock()

    return (
        <>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-20 font-semibold">Routines</h1>
                    <p className="mt-1 text-14 text-muted-foreground">Work done for you on a schedule, in tabs of its own.</p>
                </div>
                <Button onClick={onNew}>New routine</Button>
            </div>

            <div className="mt-6 empty:hidden">
                <RoutineApprovals />
            </div>

            {routines.length === 0 ? (
                <div className="mt-16 flex flex-col items-center gap-3 text-center">
                    <Berry mood="rest" size={88} />
                    <p className="text-14 text-muted-foreground">
                        {isBerry ? 'Nothing here yet. I looked under everything.' : 'No routines yet.'}
                    </p>
                </div>
            ) : (
                <ul aria-label="Routines" className="mt-6 rounded-panel border bg-surface divide-y overflow-hidden">
                    {routines.map((routine) => (
                        <li key={routine.id}>
                            <button
                                type="button"
                                onClick={() => onOpen(routine.id)}
                                className="w-full grid grid-cols-[1.4fr_1fr_1.4fr_130px] items-center gap-4 min-h-14 px-5 py-2 text-14 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                                <span className="min-w-0 flex items-center gap-2.5">
                                    {routine.mascotId && <Berry mood={moodFor(routine.status)} size={24} mascot={find(routine.mascotId)} />}
                                    <span className={cn("truncate", routine.status === 'running' && "font-semibold")}>{routine.name}</span>
                                </span>
                                <span className="min-w-0 text-muted-foreground">{routine.schedule}</span>
                                <span className="min-w-0 text-muted-foreground line-clamp-2">{routine.lastResult}</span>
                                <span className="flex justify-end">
                                    <RoutineStatusLabel status={routine.status} />
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </>
    )
}

const Detail: React.FC<{ routine: Routine; onBack: () => void; onEdit: () => void }> = ({ routine, onBack, onEdit }) => {
    const library = useLibrary()
    const mascot = useFlock().find(routine.mascotId)
    const [runs, setRuns] = useState<RoutineRun[]>([])
    const open = routine.status === 'running' || routine.status === 'needs-approval'
    const waiting = routine.status === 'queued'

    // The library changes whenever a run takes a step.
    useEffect(() => {
        void api().getRuns(routine.id).then(setRuns)
    }, [routine.id, library])

    const remove = async () => {
        if (await api().delete(routine.id)) onBack()
    }

    return (
        <>
            <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
                <ChevronLeft />
                Routines
            </Button>
            <div className="mt-2 flex items-start justify-between gap-6">
                <div className="min-w-0">
                    <h1 className="text-20 font-semibold [overflow-wrap:anywhere]">{routine.name}</h1>
                    <p className="mt-1 text-14 text-muted-foreground">
                        {routine.schedule}
                        {routine.nextRunAt !== null && !routine.paused && ` · next ${formatTime(routine.nextRunAt)}`}
                        {routine.mascotId && ` · runs as ${mascot.name}`}
                    </p>
                </div>
                <Berry mood={moodFor(routine.status)} size={64} mascot={mascot} className="shrink-0" />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                    disabled={open || waiting}
                    title={open ? 'It’s running now' : waiting ? 'It’s waiting to start' : undefined}
                    onClick={() => void api().runNow(routine.id)}
                >
                    Run now
                </Button>
                <Button variant="outline" onClick={() => void api().setPaused(routine.id, !routine.paused)}>
                    {routine.paused ? 'Resume' : 'Pause'}
                </Button>
                <Button variant="outline" onClick={onEdit}>Edit</Button>
                <Button variant="ghost" className="text-destructive" onClick={() => void remove()}>Delete</Button>
            </div>

            <section aria-labelledby="routine-instructions" className="mt-8">
                <h2 id="routine-instructions" className="text-14 font-semibold">What it does</h2>
                <p className="mt-2 text-14 text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">{routine.instructions}</p>
            </section>

            <section aria-labelledby="routine-history" className="mt-8">
                <h2 id="routine-history" className="text-14 font-semibold">Run history</h2>
                {runs.length === 0 ? (
                    <p className="mt-2 text-14 text-muted-foreground">It hasn’t run yet.</p>
                ) : (
                    <ol className="mt-3 flex flex-col gap-3">
                        {runs.map((run) => (
                            <RoutineRunCard
                                key={run.id}
                                run={run}
                                onStop={() => void api().stop(run.id)}
                                onRunAgain={open || waiting ? undefined : () => void api().runNow(routine.id)}
                            />
                        ))}
                    </ol>
                )}
            </section>
        </>
    )
}

export const RoutinesPage: React.FC = () => {
    const { routines } = useLibrary()
    const [view, setViewState] = useState<RoutinesView>(routinesView)

    const setView = (next: RoutinesView) => {
        setRoutinesView(next)
        setViewState(next)
    }

    // Being here is seeing them, so the dots elsewhere clear.
    const unseen = routines.some((routine) => routine.unseen)
    useEffect(() => {
        if (unseen) void api().markSeen()
    }, [unseen])

    const opened = view.page === 'detail' ? routines.find((routine) => routine.id === view.id) : undefined

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10">
                {view.page === 'form' ? (
                    <RoutineForm
                        values={view.values}
                        onChange={(values) => setView({ page: 'form', values })}
                        onCancel={() => setView(view.values.id ? { page: 'detail', id: view.values.id } : { page: 'list' })}
                        onSaved={(id) => setView({ page: 'detail', id })}
                    />
                ) : opened ? (
                    <Detail
                        routine={opened}
                        onBack={() => setView({ page: 'list' })}
                        onEdit={() => setView({ page: 'form', values: formFor(opened) })}
                    />
                ) : (
                    <List onNew={() => setView({ page: 'form', values: blankForm() })} onOpen={(id) => setView({ page: 'detail', id })} />
                )}
            </div>
        </div>
    )
}
