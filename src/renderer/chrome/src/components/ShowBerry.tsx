import React, { useEffect, useState } from 'react'
import { Lock, Square } from 'lucide-react'
import type { RecordingState, TrailStep } from '@shared/library'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { useShell } from '../contexts/ShellContext'
import { Berry, useAssistantName } from './Berry'
import { StepFootprint } from './ChatMessage'

const IDLE: RecordingState = { status: 'idle', startedAt: null, steps: [], cut: null, error: null }

export const useRecording = (): RecordingState => {
    const [state, setState] = useState(IDLE)
    useEffect(() => {
        const { state: read, onUpdated } = window.chromeAPI.recording
        void read().then(setState)
        return onUpdated(setState)
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
    return <span aria-hidden className="tabular-nums">{clock(now - since)}</span>
}

// In the toolbar, on every tab in both layouts, and it stays there until Stop. It's in the chrome, so no page can reach,
// cover or imitate it from where it is, and Stop goes straight to main.
export const RecordingNotice: React.FC<{ state?: RecordingState }> = ({ state }) => {
    const live = useRecording()
    const { status, startedAt, steps } = state ?? live
    const { settings, layout } = useShell()
    const { showBerry } = settings
    const name = useAssistantName()
    if (status !== 'recording' || startedAt === null) return null
    // Beside the chat panel, the page and its toolbar can be as narrow as they go.
    const narrow = layout.page.width < NARROW_PAGE

    return (
        <div role="status" className="h-8 shrink-0 flex items-center gap-2 pl-2 pr-1 mx-1 rounded-full bg-muted text-13 app-region-no-drag">
            <span aria-hidden className="size-2 rounded-full bg-destructive motion-safe:animate-pulse" />
            {showBerry && !narrow && <Berry mood="curious" size={24} />}
            <span className="font-semibold">{!showBerry ? 'Recording' : narrow ? 'Watching' : `${name}’s watching`}</span>
            {!narrow && <Elapsed since={startedAt} />}
            {layout.page.width >= ROOM_FOR_COUNT && (
                <span aria-hidden className="text-muted-foreground tabular-nums">
                    {steps.length === 1 ? '1 note' : `${steps.length} notes`}
                </span>
            )}
            <Button size="sm" variant="destructive" className="h-6 px-2.5 text-13" onClick={() => void window.chromeAPI.recording.stop()}>
                <Square className="size-3 fill-current" aria-hidden />
                Stop
            </Button>
        </div>
    )
}

// Starts it from wherever this is. What it says stays the same everywhere, so it's one thing to learn.
export const ShowHowButton: React.FC<{ className?: string; variant?: 'outline' | 'ghost'; size?: 'default' | 'sm' }> = ({ className, variant = 'ghost', size }) => {
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
            <span aria-hidden className="size-2 rounded-full bg-destructive" />
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
            <span className="font-semibold">{step.value}</span>
            {step.text.slice(at + step.value.length)}
        </>
    )
}

// Notes rather than a list of cards: a footprint for each thing it saw, under the site it saw it on, with a thin line
// between sites. Everything's plain text, so a label from a page is only ever words.
export const TrailNotes: React.FC<{ steps: TrailStep[]; onRemove?: (id: string) => void }> = ({ steps, onRemove }) => {
    const groups: Array<{ site: string; steps: Array<{ step: TrailStep; at: number }> }> = []
    steps.forEach((step, at) => {
        const last = groups.at(-1)
        if (last && (last.site === step.site || !step.site)) last.steps.push({ step, at })
        else groups.push({ site: step.site, steps: [{ step, at }] })
    })

    return (
        <div className="divide-y">
            {groups.map(({ site, steps: notes }, group) => (
                <section key={group} aria-label={`On ${site}`} className="py-5">
                    <h2 className="text-13 font-semibold text-muted-foreground">{site}</h2>
                    <ol className="mt-2 flex flex-col">
                        {notes.map(({ step, at }) => (
                            <li key={step.id} className="group flex items-start gap-3 py-1.5">
                                <span className={cn('mt-1 size-4 shrink-0 flex items-center justify-center', step.kind === 'secret' ? 'text-muted-foreground' : 'text-primary')}>
                                    {step.kind === 'secret' ? <Lock className="size-3.5" aria-hidden /> : <StepFootprint index={at} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-16 [overflow-wrap:anywhere]">
                                        <NoteWords step={step} />
                                    </span>
                                    {step.path && step.path !== site && (
                                        <span className="block text-12 text-muted-foreground truncate">{step.path}</span>
                                    )}
                                </span>
                                {onRemove && (
                                    <button
                                        type="button"
                                        aria-label={`Leave out: ${step.text}`}
                                        onClick={() => onRemove(step.id)}
                                        className="shrink-0 h-6 px-2 rounded-control text-13 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        Leave out
                                    </button>
                                )}
                            </li>
                        ))}
                    </ol>
                </section>
            ))}
        </div>
    )
}
