import React, { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { RoutineRun, RoutineStatus } from '@shared/library'
import { Pips } from '@common/components/Pips'
import { Button } from '@common/components/Button'
import { StatusPill, type PillTone } from '@common/components/StatusPill'
import { cn } from '@common/lib/utils'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { ChatApprovalCard, ChatError, Markdown, StatusLine, StepTrail } from './ChatMessage'
import { MemoryOffers, RememberedLine } from './MemoryInChat'
import { BETWEEN } from './SettingsRow'

// A state is a pill, and its colour always comes with words, so colour is never the only signal.
const STATUS: Record<RoutineStatus, { label: string; tone: PillTone }> = {
    running: { label: 'Running now', tone: 'on' },
    finished: { label: 'Finished', tone: 'off' },
    'needs-approval': { label: 'Needs you', tone: 'ask' },
    failed: { label: 'Failed', tone: 'ask' },
    stopped: { label: 'Stopped', tone: 'off' },
    interrupted: { label: 'Interrupted', tone: 'ask' },
    queued: { label: 'Waiting to start', tone: 'off' },
    paused: { label: 'Paused', tone: 'off' },
    idle: { label: 'Scheduled', tone: 'off' }
}

export const RoutineStatusLabel: React.FC<{ status: RoutineStatus }> = ({ status }) => (
    <StatusPill tone={STATUS[status].tone} lead={status === 'running' ? <Pips pattern="think" /> : undefined}>
        {STATUS[status].label}
    </StatusPill>
)

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

// One run, as a row in the Runs group: when it started, its state and how long it took. It opens in place to show
// what was done at each step, what it reported and how it ended, as a finished reply's steps do. A run that's going has
// Stop, and one that failed, was stopped or was interrupted has Run again.
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
        <li aria-label={`Run from ${formatTime(run.startedAt)}`} className={cn(BETWEEN, 'before:left-4')}>
            <div className="relative min-h-[52px] py-[11px] pl-4 pr-3.5 flex items-center gap-3 rounded-[inherit] transition-colors hover:bg-hover has-[>button:first-child:active]:bg-press">
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={open ? id : undefined}
                    aria-label={`Run from ${formatTime(run.startedAt)}, ${STATUS[run.status].label}`}
                    onClick={() => setOpen(!opened)}
                    className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                />
                <span className="flex-1 min-w-0 pointer-events-none">
                    <span className="block text-14 font-medium text-ink tabular-nums">{formatTime(run.startedAt)}</span>
                    {(took || run.lateFor !== null) && (
                        <span className="block mt-0.5 text-13 text-ink-2">
                            {[took && `Took ${took}`, run.lateFor !== null && 'Ran late'].filter(Boolean).join(' · ')}
                        </span>
                    )}
                </span>
                <span className="pointer-events-none"><RoutineStatusLabel status={run.status} /></span>
                {going && <Button size="sm" variant="raised" className="relative" onClick={onStop}>Stop</Button>}
                {ended && onRunAgain && <Button size="sm" variant="raised" className="relative" onClick={onRunAgain}>Run again</Button>}
                <ChevronDown aria-hidden className={cn('size-3.5 shrink-0 -ml-1 text-faint transition-transform duration-fast pointer-events-none', open && 'rotate-180')} strokeWidth={1.75} />
            </div>
            {open && (
                <div id={id} className="pl-4 pr-3.5 pb-4 flex flex-col gap-3">
                    {run.lateFor !== null && (
                        <p className="text-14 text-ask">
                            This ran late. It was due {formatTime(run.lateFor)}, when the app was closed or the computer was asleep.
                        </p>
                    )}
                    {(run.memoryIds?.length ?? 0) > 0 && <RememberedLine ids={run.memoryIds} />}
                    {going && run.statusLine && <StatusLine text={run.statusLine} />}
                    {run.steps.length > 0 && <StepTrail steps={run.steps} running={going} cutShort={ended} />}
                    {run.status === 'needs-approval' && run.approval && <ChatApprovalCard chatId={run.id} approval={run.approval} mascot={mascot} />}
                    {run.result && <Markdown content={run.result} />}
                    {run.status === 'finished' && <div className="empty:hidden"><MemoryOffers sourceId={run.id} mascot={mascot} /></div>}
                    {run.status === 'finished' && !run.result && <p className="text-14 text-ink-2">It finished with nothing to report.</p>}
                    {run.error && <ChatError message={run.error} />}
                    {run.status === 'interrupted' && (
                        <p className="text-14">
                            {run.approval
                                ? `The app closed while this was waiting for your OK, so it wasn’t done: “${run.approval.text}”`
                                : 'The app closed before this finished, so it stopped there.'}
                        </p>
                    )}
                    {run.status === 'running' && run.steps.length === 0 && !run.statusLine && <p className="text-14 text-ink-2">It’s starting.</p>}
                </div>
            )}
        </li>
    )
}
