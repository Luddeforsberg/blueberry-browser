import React from 'react'
import type { RoutineRun, RoutineStatus } from '@shared/library'
import { BerryDot } from '@common/components/Mascot'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { ChatApprovalCard, ChatError, Markdown, StepTrail } from './ChatMessage'
import { MemoryOffers, RememberedLine } from './MemoryInChat'

// Status colours always come with words, so colour is never the only signal.
const STATUS: Record<RoutineStatus, { label: string; className: string }> = {
    running: { label: 'Running now', className: 'text-accent-ink' },
    finished: { label: 'Finished', className: 'text-success' },
    'needs-approval': { label: 'Needs your OK', className: 'text-warning' },
    failed: { label: 'Failed', className: 'text-destructive' },
    stopped: { label: 'Stopped', className: 'text-muted-foreground' },
    interrupted: { label: 'Interrupted', className: 'text-warning' },
    queued: { label: 'Waiting to start', className: 'text-muted-foreground' },
    paused: { label: 'Paused', className: 'text-muted-foreground' },
    idle: { label: 'Scheduled', className: 'text-muted-foreground' }
}

export const RoutineStatusLabel: React.FC<{ status: RoutineStatus }> = ({ status }) => (
    <span className={cn("flex items-center gap-2", STATUS[status].className)}>
        {status === 'running' && <BerryDot working />}
        {STATUS[status].label}
    </span>
)

export const formatTime = (at: number) =>
    new Date(at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// One run: what Berry did at each step, what it reported and how it ended.
export const RoutineRunCard: React.FC<{
    run: RoutineRun
    onStop: () => void
    onRunAgain?: () => void
}> = ({ run, onStop, onRunAgain }) => {
    const { routines } = useLibrary()
    const { find } = useFlock()
    const mascot = find(routines.find((routine) => routine.id === run.routineId)?.mascotId ?? null)
    const open = run.status === 'running' || run.status === 'needs-approval'
    const ended = run.status === 'failed' || run.status === 'stopped' || run.status === 'interrupted'

    return (
        <li aria-label={`Run from ${formatTime(run.startedAt)}`} className="p-4 rounded-panel border bg-surface">
            <div className="flex items-center justify-between gap-4 text-13">
                <span className="text-muted-foreground tabular-nums">{formatTime(run.startedAt)}</span>
                <RoutineStatusLabel status={run.status} />
            </div>
            {run.lateFor !== null && (
                <p className="mt-2 text-13 text-warning">
                    This ran late. It was due {formatTime(run.lateFor)}, when the app was closed or the computer was asleep.
                </p>
            )}
            {(run.memoryIds?.length ?? 0) > 0 && (
                <div className="mt-3">
                    <RememberedLine ids={run.memoryIds} />
                </div>
            )}
            {run.steps.length > 0 && (
                <div className="mt-3">
                    <StepTrail steps={run.steps} running={open} cutShort={ended} />
                </div>
            )}
            {run.status === 'needs-approval' && run.approval && (
                <div className="mt-3">
                    <ChatApprovalCard chatId={run.id} approval={run.approval} mascot={mascot} />
                </div>
            )}
            {run.result && (
                <div className="mt-3">
                    <Markdown content={run.result} />
                </div>
            )}
            {run.status === 'finished' && (
                <div className="mt-3 empty:hidden">
                    <MemoryOffers sourceId={run.id} mascot={mascot} />
                </div>
            )}
            {run.status === 'finished' && !run.result && (
                <p className="mt-3 text-14 text-muted-foreground">It finished with nothing to report.</p>
            )}
            {run.error && (
                <div className="mt-3">
                    <ChatError message={run.error} />
                </div>
            )}
            {run.status === 'interrupted' && (
                <p className="mt-3 text-14">
                    {run.approval
                        ? `The app closed while this was waiting for your OK, so it wasn’t done: “${run.approval.text}”`
                        : 'The app closed before this finished, so it stopped there.'}
                </p>
            )}
            {(open || (ended && onRunAgain)) && (
                <div className="mt-3 flex items-center gap-3">
                    {open && <Button size="sm" variant="outline" onClick={onStop}>Stop</Button>}
                    {ended && onRunAgain && <Button size="sm" variant="outline" onClick={onRunAgain}>Run again</Button>}
                </div>
            )}
        </li>
    )
}

// Every decision routines are waiting on. The same card and the same words as in a chat.
export const RoutineApprovals: React.FC = () => {
    const { routines } = useLibrary()
    const { find } = useFlock()
    const waiting = routines.filter((routine) => routine.latestRun?.status === 'needs-approval' && routine.latestRun.approval)
    if (waiting.length === 0) return null

    return (
        <ul aria-label="Routines waiting for your OK" className="flex flex-col gap-2">
            {waiting.map(({ id, name, latestRun, mascotId }) => (
                <li key={id}>
                    <p className="px-1 pb-1 text-12 text-muted-foreground truncate">{name}</p>
                    <ChatApprovalCard chatId={latestRun!.id} approval={latestRun!.approval!} mascot={find(mascotId)} />
                </li>
            ))}
        </ul>
    )
}
