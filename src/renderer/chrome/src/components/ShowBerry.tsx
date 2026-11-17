import React, { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import type { RecordingState, TrailKind, TrailStep } from '@shared/library'
import { Button } from '@common/components/Button'
import { Pips, type PipMark } from '@common/components/Pips'
import { cn } from '@common/lib/utils'
import { useShell } from '../contexts/ShellContext'
import { useAssistantName } from './Berry'
import { Favicon } from './Favicon'

const IDLE: RecordingState = { status: 'idle', startedAt: null, steps: [], cut: null, error: null }

// The chrome always listens (`ChromeApp`), so a page that opens while it watches, as the new tab does, starts from this.
let lastHeard = IDLE

export const useRecording = (): RecordingState => {
    const [state, setState] = useState(lastHeard)
    useEffect(() => {
        const { state: read, onUpdated } = window.chromeAPI.recording
        const hear = (next: RecordingState) => {
            lastHeard = next
            setState(next)
        }
        void read().then(hear)
        return onUpdated(hear)
    }, [])
    return state
}

export const NARROW_PAGE = 640
const ROOM_FOR_COUNT = 860

const clock = (ms: number) => {
    const seconds = Math.max(0, Math.floor(ms / 1000))
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const Elapsed: React.FC<{ since: number }> = ({ since }) => {
    const [now, setNow] = useState(Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [])
    // A status is read out when it changes, and nobody wants this read out every second.
    return <span aria-hidden className="font-mono text-11.5 text-ink-3 tabular-nums">{clock(now - since)}</span>
}

// The recorder: in the toolbar on every tab in both layouts until Done, and on top of What I watched. The toolbar's is
// in the chrome, so no page can reach, cover or imitate it from where it is, and Done goes straight to main. Its pips
// are the one thing that moves in the toolbar. The page's copy isn't a status, so it's read out once.
export const RecordingNotice: React.FC<{ state?: RecordingState; inPage?: boolean; className?: string }> = ({ state, inPage = false, className }) => {
    const live = useRecording()
    const { status, startedAt, steps } = state ?? live
    const { settings, layout } = useShell()
    if (status !== 'recording' || startedAt === null) return null
    // Beside the chat panel, the page and its toolbar can be as narrow as they go.
    const narrow = layout.page.width < NARROW_PAGE

    return (
        <div role={inPage ? undefined : 'status'} className={cn('h-8 w-max shrink-0 flex items-center gap-2.5 pl-3 pr-1 rounded-full bg-sheet shadow-chip text-13', className)}>
            <Pips pattern="waiting" className="text-ask" />
            <span className={cn('font-medium', narrow && 'sr-only')}>{settings.showBerry ? 'Watching' : 'Recording'}</span>
            {/* Until the first step it says what to do, where the time and the steps will be. Narrow, it's as it was. */}
            {steps.length === 0 && !narrow ? (
                <span className="text-ink-2">Do the job once, then press Done</span>
            ) : (
                <>
                    <Elapsed since={startedAt} />
                    {layout.page.width >= ROOM_FOR_COUNT && <span aria-hidden className="font-mono text-11.5 text-ink-3 tabular-nums">{steps.length === 1 ? '1 step' : `${steps.length} steps`}</span>}
                </>
            )}
            <Button size="xs" onClick={() => void window.chromeAPI.recording.stop()}>Done</Button>
        </div>
    )
}

// The bookmark star gives way to the recorder beside the chat panel on a narrow page.
export const useRecorderNeedsRoom = () => {
    const { layout } = useShell()
    return useRecording().status === 'recording' && layout.page.width < NARROW_PAGE
}

// Starts it from wherever this is. What it says stays the same everywhere, so it's one thing to learn.
export const ShowHowButton: React.FC<{ className?: string; variant?: 'raised' | 'ghost'; size?: 'default' | 'sm' }> = ({ className, variant = 'ghost', size }) => {
    const { status } = useRecording()
    const name = useAssistantName()
    return (
        <Button
            variant={variant}
            size={size}
            className={className}
            disabled={status === 'recording'}
            title={status === 'recording' ? 'It’s already watching' : undefined}
            onClick={() => void window.chromeAPI.recording.start()}
        >
            <span aria-hidden className="size-2 rounded-full bg-ask" />
            {name === 'Assistant' ? 'Record a routine' : `Show ${name} how`}
        </Button>
    )
}

// What the note means, with what the user typed picked out so it can be read at a glance.
const NoteWords: React.FC<{ step: TrailStep }> = ({ step }) => {
    const at = step.value ? step.text.indexOf(step.value) : -1
    if (at < 0) return <>{step.text}</>
    return (
        <>
            {step.text.slice(0, at)}
            <span className="font-medium">{step.value}</span>
            {step.text.slice(at + step.value.length)}
        </>
    )
}

// Each kind of note keeps the still pip mark of the step it's like (DESIGN.md section 6). A secret field has a lock.
const TRAIL_MARKS: Record<Exclude<TrailKind, 'secret'>, PipMark> = {
    went: 'opened',
    switched: 'opened',
    searched: 'read',
    frame: 'read',
    copied: 'read',
    clicked: 'clicked',
    chose: 'clicked',
    ticked: 'clicked',
    file: 'clicked',
    typed: 'typed',
    pressed: 'typed',
    pasted: 'typed'
}

// The steps under the site they were on: its icon and name as a label, then the steps on a thread, a hairline down the
// left from each step's mark to the next. Everything's plain text, so a label from a page is only ever words.
export const TrailNotes: React.FC<{ steps: TrailStep[]; onRemove?: (id: string) => void }> = ({ steps, onRemove }) => {
    const isBerry = useAssistantName() !== 'Assistant'
    const groups: Array<{ site: string; steps: TrailStep[] }> = []
    steps.forEach((step) => {
        const last = groups.at(-1)
        if (last && (last.site === step.site || !step.site)) last.steps.push(step)
        else groups.push({ site: step.site, steps: [step] })
    })

    return (
        <div>
            {groups.map(({ site, steps: notes }, group) => (
                <section key={group} aria-label={`On ${site}`} className="mt-6 first:mt-0">
                    <h2 className="mb-1.5 px-2 flex items-center gap-2 text-13 font-medium">
                        <Favicon site={site} />
                        <span className="min-w-0 truncate">{site}</span>
                    </h2>
                    <ol className="flex flex-col">
                        {notes.map((step) => (
                            <li key={step.id} className="group relative flex items-start gap-3 p-2 rounded-[11px] transition-colors duration-fast hover:bg-hover focus-within:bg-hover after:absolute after:left-[15px] after:top-7 after:-bottom-2 after:w-px after:bg-line last:after:hidden">
                                <span className={cn('w-[15px] h-5 shrink-0 grid place-items-center', step.kind === 'secret' ? 'text-ink-3' : 'text-ink')}>
                                    {step.kind === 'secret' ? <Lock className="size-3.5" aria-hidden strokeWidth={1.75} /> : <Pips pattern={TRAIL_MARKS[step.kind]} still />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-14 leading-5 [overflow-wrap:anywhere]">
                                        <NoteWords step={step} />
                                    </span>
                                    {step.kind === 'secret' ? (
                                        <span className="block text-13 text-ink-3">
                                            {isBerry ? 'Never saved. I’ll hand the page to you here.' : 'Never saved. The page is handed to you here.'}
                                        </span>
                                    ) : (
                                        step.path && step.path !== site && <span className="block text-13 text-ink-3 truncate">{step.path}</span>
                                    )}
                                </span>
                                {onRemove && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        aria-label={`Leave out: ${step.text}`}
                                        onClick={() => onRemove(step.id)}
                                        className="-my-1 text-13 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                    >
                                        Leave out
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ol>
                </section>
            ))}
        </div>
    )
}
