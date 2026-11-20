import React, { useId, useState } from 'react'
import type { RoutineRun, RoutineRunStatus } from '@shared/library'
import { Pips } from '@common/components/Pips'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { ChatApprovalCard, Markdown, StatusLine, StepTrail } from './ChatMessage'
import { MemoryOffers, RememberedLine } from './MemoryInChat'

// How it went, in words, so colour is never the only signal.
const WENT: Record<RoutineRunStatus, string> = {
    running: 'Running',
    'needs-approval': 'Needs you',
    finished: 'Finished',
    failed: 'Went wrong',
    stopped: 'Stopped',
    interrupted: 'Interrupted'
}

export const formatTime = (at: number) =>
    new Date(at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// How long a run took, in a few words. A run still going has no length yet.
export const tookWords = ({ startedAt, endedAt }: Pick<RoutineRun, 'startedAt' | 'endedAt'>): string | null => {
    if (endedAt === null) return null
    const seconds = Math.max(0, Math.round((endedAt - startedAt) / 1000))
    if (seconds < 60) return `${seconds} s`
    const minutes = Math.round(seconds / 60)
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

// Why one that went wrong, was stopped or was interrupted ended, in one line.
const whyItEnded = (run: RoutineRun): string => {
    if (run.status === 'stopped') return 'You stopped it.'
    if (run.status === 'interrupted') {
        return run.approval
            ? `The app closed while this was waiting for your OK, so it wasn’t done: “${run.approval.text}”`
            : 'The app closed before this finished, so it stopped there.'
    }
    return run.error ?? 'It couldn’t finish.'
}

// Its mark on the thread: the pips while it's going, filled `ink` for the one that's open, `ask` for one that went
// wrong, was stopped or was interrupted, and a ring for the rest.
const Mark: React.FC<{ run: RoutineRun; open: boolean; ended: boolean }> = ({ run, open, ended }) => {
    if (run.status === 'running') return <Pips pattern="think" className="text-ink" />
    if (run.status === 'needs-approval') return <Pips pattern="waiting" className="text-ask" />
    return <i className={cn('block size-[9px] rounded-full', ended ? 'bg-ask' : open ? 'bg-ink' : 'bg-sheet shadow-[inset_0_0_0_1.5px_rgb(var(--faint))]')} />
}

// One run on a routine's thread: when it started, how it went and how long it took. It opens in place to show its report
// and its steps, folded as a finished reply's are. A run that's going has Stop, and one that went wrong, was stopped or
// was interrupted says why in one line and has Run again.
export const RoutineRunRow: React.FC<{
    run: RoutineRun
    open?: boolean
    onStop: () => void
    onRunAgain?: () => void
}> = ({ run, open: openAtFirst = false, onStop, onRunAgain }) => {
    const { routines } = useLibrary()
    const { find } = useFlock()
    const id = useId()
    const mascot = find(routines.find((routine) => routine.id === run.routineId)?.mascotId ?? null)
    const going = run.status === 'running' || run.status === 'needs-approval'
    const ended = run.status === 'failed' || run.status === 'stopped' || run.status === 'interrupted'
    // One waiting for you stays open, so its card is never hidden.
    const [opened, setOpen] = useState(openAtFirst)
    const open = opened || run.status === 'needs-approval'
    const took = tookWords(run)

    return (
        <li
            aria-label={`Run from ${formatTime(run.startedAt)}`}
            className="relative pb-4 flex gap-3.5 before:content-[''] before:absolute before:left-1 before:top-3 before:-bottom-1.5 before:w-px before:bg-line last:before:hidden"
        >
            <span className="relative z-[1] w-[9px] h-5 shrink-0 grid place-items-center bg-sheet">
                <Mark run={run} open={open} ended={ended} />
            </span>
            <div className="flex-1 min-w-0">
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={open ? id : undefined}
                    aria-label={`Run from ${formatTime(run.startedAt)}, ${WENT[run.status]}`}
                    onClick={() => setOpen(!opened)}
                    className="group/run w-full min-h-5 flex items-baseline gap-[9px] rounded-row text-left outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-sheet"
                >
                    <span className="text-14 font-medium text-ink tabular-nums group-hover/run:underline decoration-line underline-offset-[3px]">{formatTime(run.startedAt)}</span>
                    <span className={cn('flex-1 min-w-0 truncate text-13', ended ? 'text-ask' : 'text-ink-2')}>
                        {[WENT[run.status], run.lateFor !== null && 'ran late'].filter(Boolean).join(', ')}
                    </span>
                    {took && <span className="shrink-0 font-mono text-11.5 text-ink-3 tabular-nums">{took}</span>}
                </button>
                {ended && <p className="mt-1.5 text-14 text-ink-2 [overflow-wrap:anywhere]">{whyItEnded(run)}</p>}
                {open && (
                    <div id={id} className="mt-2 flex flex-col items-start gap-3">
                        {run.lateFor !== null && (
                            <p className="text-14 text-ink-2">
                                This ran late. It was due {formatTime(run.lateFor)}, when the app was closed or the computer was asleep.
                            </p>
                        )}
                        {(run.memoryIds?.length ?? 0) > 0 && <RememberedLine ids={run.memoryIds} />}
                        {going && run.statusLine && <StatusLine text={run.statusLine} />}
                        {run.steps.length > 0 && <StepTrail steps={run.steps} running={going} cutShort={ended} />}
                        {run.status === 'needs-approval' && run.approval && <div className="self-stretch"><ChatApprovalCard chatId={run.id} approval={run.approval} mascot={mascot} /></div>}
                        {run.result && <Markdown content={run.result} className="text-15" />}
                        {run.status === 'finished' && <div className="self-stretch empty:hidden"><MemoryOffers sourceId={run.id} mascot={mascot} /></div>}
                        {run.status === 'finished' && !run.result && <p className="text-14 text-ink-2">It finished with nothing to report.</p>}
                        {run.status === 'running' && run.steps.length === 0 && !run.statusLine && <p className="text-14 text-ink-2">It’s starting.</p>}
                    </div>
                )}
                {going && <Button size="sm" variant="raised" className="mt-2.5" onClick={onStop}>Stop</Button>}
                {ended && onRunAgain && <Button size="sm" variant="raised" className="mt-2.5" onClick={onRunAgain}>Run again</Button>}
            </div>
        </li>
    )
}
