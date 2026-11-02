import React, { useState } from 'react'
import { Button } from '@common/components/Button'
import { Choice, Switch } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { applyRecordedValue, askForRecordedValue, changeRecordedValue, toDraft, type RoutineFormValues } from '../routinesView'
import { ChatError } from './ChatMessage'
import { MascotPerch } from './MascotPerch'
import { BERRY_ID } from '@shared/mascots'
import { useRunner } from '../useRunner'

const INPUT = "w-full h-9 px-3 rounded-card border bg-surface text-14 outline-none focus-visible:ring-2 focus-visible:ring-ring"

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

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
    <label className="block">
        <span className="block text-14 font-semibold">{label}</span>
        {hint && <span className="block mt-0.5 text-13 text-muted-foreground">{hint}</span>}
        <span className="block mt-2">{children}</span>
    </label>
)

export const RoutineForm: React.FC<{
    values: RoutineFormValues
    onChange: (values: RoutineFormValues) => void
    onCancel: () => void
    onSaved: (id: string) => void
    // For the gallery, where Save must not create a routine that really runs.
    preview?: boolean
}> = ({ values, onChange, onCancel, onSaved, preview = false }) => {
    const [error, setError] = useState<string | null>(null)
    const set = (patch: Partial<RoutineFormValues>) => onChange({ ...values, ...patch })
    // Only a routine that has sites gets asked about them, and clearing the box doesn't make the box go away.
    const [hasSites] = useState(values.sites !== '')
    const scheduled = values.kind !== 'manual'
    const [runner] = useRunner()
    // Only with a runner that has accepted, which is what runs it. One already on stays visible, so it can be turned off.
    const canRunInCloud = scheduled && (runner.status === 'linked' || values.inCloud === true)

    const save = async (event: React.FormEvent, runNow = false) => {
        event.preventDefault()
        if (preview) return
        const result = await window.chromeAPI.routines.save(values.id, toDraft(values))
        if (!result.ok) {
            setError(result.error)
            return
        }
        if (runNow) void window.chromeAPI.routines.runNow(result.id)
        if (values.suggestionId) void window.chromeAPI.suggestions.used(values.suggestionId)
        onSaved(result.id)
    }

    const toggleDay = (day: number) =>
        set({ days: values.days.includes(day) ? values.days.filter((other) => other !== day) : [...values.days, day] })

    return (
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-6">
            <h1 className="text-20 font-semibold">{values.id ? 'Edit routine' : 'New routine'}</h1>

            <Field label="Name">
                <input
                    autoFocus
                    maxLength={100}
                    value={values.name}
                    onChange={(event) => set({ name: event.target.value })}
                    className={INPUT}
                />
            </Field>

            <Field
                label="What should it do?"
                hint="Write it in plain words, as you would in a chat. It works in tabs of its own, and asks before acting just as a chat does."
            >
                <textarea
                    rows={5}
                    maxLength={5000}
                    value={values.instructions}
                    onChange={(event) => set({ instructions: event.target.value })}
                    className={cn(INPUT, "h-auto py-2 resize-y")}
                />
            </Field>

            {values.recorded && values.recorded.length > 0 && (
                <div>
                    <span className="block text-14 font-semibold">What might change</span>
                    <span className="block mt-0.5 text-13 text-muted-foreground">These look like they could be different next time. Change one here and it changes above.</span>
                    <ul className="mt-2 divide-y border-y">
                        {values.recorded.map((row, at) => (
                            <li key={at} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                                <label className="flex-1 min-w-64 flex items-center gap-3">
                                    <span className="w-28 shrink-0 text-14 text-muted-foreground">{row.label}</span>
                                    <input
                                        value={row.value}
                                        onChange={(event) => onChange(changeRecordedValue(values, at, event.target.value))}
                                        onBlur={() => onChange(applyRecordedValue(values, at))}
                                        className={INPUT}
                                    />
                                </label>
                                <label className="flex items-center gap-2 text-13 text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={row.ask}
                                        onChange={(event) => onChange(askForRecordedValue(values, at, event.target.checked))}
                                    />
                                    Ask me each run
                                </label>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {hasSites && (
                <Field label="Sites it may use" hint="From what you showed me. A run can’t go anywhere else, and empty means anywhere.">
                    <input value={values.sites} onChange={(event) => set({ sites: event.target.value })} className={INPUT} />
                </Field>
            )}

            <div>
                <span className="block text-14 font-semibold">Who runs it</span>
                <span className="block mt-0.5 text-13 text-muted-foreground">It keeps to that mascot’s instructions and limits.</span>
                <div className="mt-2">
                    <MascotPerch
                        selectedId={values.mascotId ?? BERRY_ID}
                        onChoose={(id) => set({ mascotId: id === BERRY_ID ? null : id })}
                    />
                </div>
            </div>

            <div>
                <span className="block text-14 font-semibold">When</span>
                <div className="mt-2">
                    <Choice
                        label="How often"
                        value={values.kind}
                        onChange={(kind) => set({ kind })}
                        options={[
                            { value: 'manual', label: 'When I ask' },
                            { value: 'once', label: 'Once' },
                            { value: 'daily', label: 'Daily' },
                            { value: 'weekly', label: 'Weekly' },
                            { value: 'monthly', label: 'Monthly' }
                        ]}
                    />
                </div>

                {values.kind === 'weekly' && (
                    <div role="group" aria-label="Days" className="mt-4 flex flex-wrap gap-1">
                        {DAYS.map(({ value, short, name }) => (
                            <button
                                key={value}
                                type="button"
                                aria-label={name}
                                aria-pressed={values.days.includes(value)}
                                onClick={() => toggleDay(value)}
                                className={cn(
                                    "h-8 w-12 rounded-full text-13 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                                    values.days.includes(value) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {short}
                            </button>
                        ))}
                    </div>
                )}

                {scheduled && <div className="mt-4 flex flex-wrap items-start gap-4">
                    {values.kind === 'once' && (
                        <Field label="Date">
                            <input
                                type="date"
                                value={values.date}
                                onChange={(event) => set({ date: event.target.value })}
                                className={cn(INPUT, "w-40")}
                            />
                        </Field>
                    )}
                    {values.kind === 'monthly' && (
                        <Field label="Day of the month">
                            <input
                                type="number"
                                min={1}
                                max={31}
                                value={values.day}
                                onChange={(event) => set({ day: Number(event.target.value) })}
                                className={cn(INPUT, "w-24 tabular-nums")}
                            />
                        </Field>
                    )}
                    <Field label="Time">
                        <input
                            type="time"
                            value={values.time}
                            onChange={(event) => set({ time: event.target.value })}
                            className={cn(INPUT, "w-32 tabular-nums")}
                        />
                    </Field>
                </div>}
                {values.kind === 'monthly' && values.day > 28 && (
                    <p className="mt-2 text-13 text-muted-foreground">In shorter months, it runs on the last day.</p>
                )}
                <p className="mt-2 text-13 text-muted-foreground">
                    {!scheduled
                        ? 'It only runs when you press Run now.'
                        : values.inCloud
                          ? 'It runs in the cloud at this time, even with your Mac off, and its run shows as a chat.'
                          : 'If the app is closed at this time, it runs once when you next open it and says it was late.'}
                </p>
                {canRunInCloud && (
                    <div className="mt-3 flex items-center gap-3">
                        <span id="routine-in-cloud" className="flex-1 text-14">Runs even when your Mac is off</span>
                        <Switch labelledBy="routine-in-cloud" checked={values.inCloud === true} onChange={(on) => set({ inCloud: on })} />
                    </div>
                )}
            </div>

            {error && <ChatError message={error} />}

            <div className="flex items-center gap-3">
                {values.recorded ? (
                    <>
                        <Button type="button" onClick={(event) => void save(event, true)}>Save and run it now</Button>
                        <Button type="submit" variant="outline">Save</Button>
                    </>
                ) : (
                    <Button type="submit">Save</Button>
                )}
                <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            </div>
        </form>
    )
}
