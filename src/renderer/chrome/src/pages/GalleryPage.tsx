import React, { useState } from 'react'
import { Star } from 'lucide-react'
import { ToolBarButton } from '../components/ToolBarButton'
import { BerryDot, Mascot, MOOD_LABELS, WalkingBird, type Mood } from '@common/components/Mascot'
import { ApprovalCard } from '@common/components/ApprovalCard'
import { Button } from '@common/components/Button'
import { Choice, Switch } from '@common/components/Controls'
import { AssistantMessage, ChatError, StepTrail, ThinkingMessage, UserMessage } from '../components/ChatMessage'
import { ArtBlueberry } from '../components/ArtBlueberry'
import { ChatComposer } from '../components/Composer'
import { PageCard } from '../components/PageCard'
import { ChatRow } from '../components/Sidebar'
import { FindBarCard } from '../components/FindBarCard'
import { ZoomButton } from '../components/Toolbar'
import { RoutineForm } from '../components/RoutineForm'
import { RoutineRunCard } from '../components/RoutineRunCard'
import { blankForm } from '../routinesView'
import type { RoutineRun } from '@shared/library'
import { useShell } from '../contexts/ShellContext'

const MOODS = Object.keys(MOOD_LABELS) as Mood[]

const SAMPLE_STEPS = [
    { text: 'Opened norrskenair.com', done: true },
    { text: 'Read norrskenair.com', done: true }
]

const SAMPLE_RUN: RoutineRun = {
    id: 'gallery-run',
    routineId: 'gallery',
    status: 'finished',
    startedAt: Date.now(),
    endedAt: Date.now(),
    lateFor: null,
    steps: SAMPLE_STEPS,
    result: 'Found three flights under €200.',
    error: null,
    approval: null,
    tokens: 4210,
    seen: true
}

const SAMPLE_APPROVAL = { id: 'gallery-approval', text: 'Click the button “Delete” on https://example.com/' }

const SAMPLE_RUNS: RoutineRun[] = [
    { ...SAMPLE_RUN, id: 'run-1', status: 'running', steps: [SAMPLE_STEPS[0], { text: 'Reading norrskenair.com', done: false }], result: null, tokens: null },
    { ...SAMPLE_RUN, id: 'run-2', status: 'needs-approval', approval: SAMPLE_APPROVAL, result: null, tokens: null },
    { ...SAMPLE_RUN, id: 'run-3', lateFor: Date.now() - 3_600_000 },
    { ...SAMPLE_RUN, id: 'run-4', status: 'failed', result: null, error: 'The model is rate limited right now. Try again in a moment.' },
    { ...SAMPLE_RUN, id: 'run-5', status: 'stopped', result: null },
    { ...SAMPLE_RUN, id: 'run-6', status: 'interrupted', approval: SAMPLE_APPROVAL, result: null, tokens: null }
]

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mt-10">
        <h2 className="text-20 font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
    </section>
)

// Every shared component in its states. Switch appearance in Settings to check light and dark.
export const GalleryPage: React.FC = () => {
    const [on, setOn] = useState(true)
    const [choice, setChoice] = useState<'one' | 'two'>('one')
    const [still, setStill] = useState(false)
    const [routineForm, setRoutineForm] = useState(() => blankForm('Flight price watch'))
    const { theme } = useShell()

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto px-8 py-10">
                <h1 className="text-20 font-semibold">Component gallery</h1>

                <Section title="Berry">
                    <label className="flex items-center gap-2 text-13">
                        <Switch label="Keep Berry still" checked={still} onChange={setStill} />
                        Keep Berry still
                    </label>
                    <div className="mt-4 grid grid-cols-4 gap-6">
                        {MOODS.map((mood) => (
                            <figure key={mood} className="flex flex-col items-center gap-2 p-4 rounded-card bg-muted">
                                <Mascot mood={mood} size={96} still={still} />
                                <div className="flex items-end gap-3">
                                    <Mascot mood={mood} size={32} still={still} />
                                    <Mascot mood={mood} size={24} still={still} />
                                    <Mascot mood={mood} size={16} still={still} />
                                </div>
                                <figcaption className="text-12 text-muted-foreground">{MOOD_LABELS[mood]}</figcaption>
                            </figure>
                        ))}
                    </div>
                    <div className="mt-4 flex items-center gap-3 text-12 text-muted-foreground">
                        <Mascot size={24} hidden /> Hide Berry replaces it with a plain icon.
                    </div>
                    <div className="mt-4 flex items-end gap-6 text-12 text-muted-foreground">
                        <WalkingBird size={40} foot={1} stepMs={0} />
                        <WalkingBird size={40} foot={0} stepMs={0} pecking />
                        <span>The small birds behind the new tab page, walking and pecking.</span>
                    </div>
                    <div className="mt-4 flex items-center gap-3 text-12 text-muted-foreground">
                        <BerryDot /> <BerryDot working /> The berry as a status marker, at rest and during real work.
                    </div>
                </Section>

                <Section title="Art blueberry">
                    <div className="relative h-72 rounded-panel overflow-hidden">
                        <ArtBlueberry dark={theme.isDark} className="absolute left-1/2 top-0 max-w-none -translate-x-1/2" />
                    </div>
                </Section>

                <Section title="Chat">
                    <div className="max-w-xl flex flex-col gap-5">
                        <UserMessage content="What did the Monday digest find?" />
                        <AssistantMessage content="Two things changed: **flight prices** and the studio invoice." />
                        <ThinkingMessage />
                        <ChatError message="The model is rate limited right now. Try again in a moment." />
                        <StepTrail
                            steps={[
                                { text: 'Looked through your history for Lisbon', done: true },
                                { text: 'Opened norrskenair.com', done: true },
                                { text: 'Comparing three weekends in November', done: false }
                            ]}
                        />
                        <div>
                            <ChatComposer onSend={() => undefined} placeholder="Ask Berry" />
                        </div>
                        <ChatComposer
                            onSend={() => undefined}
                            placeholder="With a page attached"
                            attachment={<PageCard title="Jackdaw" host="en.wikipedia.org" onRemove={() => undefined} />}
                        />
                        <ChatComposer onSend={() => undefined} placeholder="Disabled" disabled />
                        <ChatComposer onSend={() => undefined} onStop={() => undefined} placeholder="While replying" disabled />
                    </div>
                </Section>

                <Section title="Chat in the sidebar">
                    <ul className="max-w-xs">
                        <ChatRow chat={{ id: 'gallery-1', title: 'Long weekend in Lisbon', updatedAt: Date.now() }} selected={false} onOpen={() => undefined} />
                        <ChatRow chat={{ id: 'gallery-2', title: 'The open chat', updatedAt: Date.now() }} selected onOpen={() => undefined} />
                    </ul>
                </Section>

                <Section title="Routine runs">
                    <ol className="max-w-xl flex flex-col gap-3">
                        {SAMPLE_RUNS.map((run) => (
                            <RoutineRunCard key={run.id} run={run} onStop={() => undefined} onRunAgain={() => undefined} />
                        ))}
                    </ol>
                </Section>

                <Section title="Routine form">
                    <div className="max-w-xl">
                        <RoutineForm preview values={routineForm} onChange={setRoutineForm} onCancel={() => undefined} onSaved={() => undefined} />
                    </div>
                </Section>

                <Section title="Approval card">
                    <div className="max-w-sm">
                        <ApprovalCard
                            request={{
                                question: 'This will send the email to Anna. Send it?',
                                details: 'To anna@example.com, from your Gmail. Nothing is sent until you say so.',
                                confirmLabel: 'Send it',
                                reviewLabel: 'See the draft'
                            }}
                            onConfirm={() => undefined}
                            onReview={() => undefined}
                            onCancel={() => undefined}
                        />
                    </div>
                </Section>

                <Section title="Bookmark button">
                    <div className="flex items-center gap-3">
                        <ToolBarButton Icon={Star} label="Bookmark this page" onClick={() => undefined} />
                        <ToolBarButton label="Remove bookmark" toggled className="bg-transparent hover:bg-transparent" onClick={() => undefined}>
                            <Star className="size-4 fill-current text-bookmark" />
                        </ToolBarButton>
                        <ToolBarButton Icon={Star} label="Bookmark this page (unavailable on internal pages)" active={false} />
                    </div>
                </Section>

                <Section title="Zoom level">
                    <ZoomButton percent={125} onReset={() => undefined} />
                </Section>

                <Section title="Find bar">
                    <div className="flex flex-col gap-3 max-w-sm">
                        <FindBarCard glass={false} value="" onChange={() => undefined} result={null} onStep={() => undefined} onClose={() => undefined} />
                        <FindBarCard glass={false} value="berry" onChange={() => undefined} result={{ active: 2, total: 14 }} onStep={() => undefined} onClose={() => undefined} />
                        <FindBarCard glass={false} value="strawberry" onChange={() => undefined} result={{ active: 0, total: 0 }} onStep={() => undefined} onClose={() => undefined} />
                    </div>
                </Section>

                <Section title="Buttons">
                    <div className="flex flex-wrap items-center gap-3">
                        <Button>Primary</Button>
                        <Button variant="outline">Outline</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="link">Link</Button>
                        <Button variant="destructive">Destructive</Button>
                        <Button disabled>Disabled</Button>
                    </div>
                </Section>

                <Section title="Controls">
                    <div className="flex items-center gap-6">
                        <Switch label="Example switch" checked={on} onChange={setOn} />
                        <Choice
                            label="Example choice"
                            value={choice}
                            onChange={setChoice}
                            options={[
                                { value: 'one', label: 'One' },
                                { value: 'two', label: 'Two' }
                            ]}
                        />
                    </div>
                </Section>

                <Section title="Status">
                    <ul className="flex gap-6 text-13">
                        <li className="text-accent-ink">Running now</li>
                        <li className="text-success">Finished</li>
                        <li className="text-warning">Needs your OK</li>
                        <li className="text-destructive">Failed</li>
                    </ul>
                </Section>
            </div>
        </div>
    )
}
