import React from 'react'
import type { RoutineStatus } from '@shared/library'
import { useLibrary } from '../contexts/LibraryContext'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'

// Status colours always come with words, so colour is never the only signal.
const STATUS: Record<RoutineStatus, { label: string; className: string }> = {
    running: { label: 'Running now', className: 'text-accent-ink' },
    finished: { label: 'Finished', className: 'text-success' },
    'needs-approval': { label: 'Needs your OK', className: 'text-warning' }
}

export const RoutinesPage: React.FC = () => {
    const { routines, todaysRun } = useLibrary()

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-4xl px-12 py-10">
                <div className="flex items-center justify-between">
                    <h1 className="text-34 font-semibold">Routines</h1>
                    <Button disabled title="Creating routines arrives with the backend">
                        New routine
                    </Button>
                </div>

                <ul aria-label="Routines" className="mt-6">
                    {routines.map((routine) => (
                        <li
                            key={routine.id}
                            className={cn(
                                "grid grid-cols-[1.4fr_1fr_1.4fr_120px] items-center gap-4 h-12 px-2 rounded-card text-13",
                                routine.status === 'running' && "bg-muted"
                            )}
                        >
                            <span className={cn(routine.status === 'running' && "font-semibold")}>{routine.name}</span>
                            <span className="text-muted-foreground">{routine.schedule}</span>
                            <span className="text-muted-foreground">{routine.lastResult}</span>
                            <span className={cn("text-right", STATUS[routine.status].className)}>
                                {STATUS[routine.status].label}
                            </span>
                        </li>
                    ))}
                </ul>

                {todaysRun.length > 0 && (
                    <section aria-labelledby="todays-run" className="mt-10">
                        <h2 id="todays-run" className="text-20 font-semibold">{"Today's run"}</h2>
                        <ol className="mt-3 flex flex-col gap-2">
                            {todaysRun.map((step) => (
                                <li key={step.time} className="flex gap-6 text-13">
                                    <span className="w-12 text-muted-foreground tabular-nums">{step.time}</span>
                                    <span className={cn(step.isCurrent && "font-semibold")}>{step.text}</span>
                                </li>
                            ))}
                        </ol>
                    </section>
                )}
            </div>
        </div>
    )
}
