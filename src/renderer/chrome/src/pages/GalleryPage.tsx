import React, { useState } from 'react'
import { Mascot, MOOD_LABELS, type Mood } from '@common/components/Mascot'
import { ApprovalCard } from '@common/components/ApprovalCard'
import { Button } from '@common/components/Button'
import { Choice, Switch } from '@common/components/Controls'

const MOODS = Object.keys(MOOD_LABELS) as Mood[]

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

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-5xl px-12 py-10">
                <h1 className="text-34 font-semibold">Component gallery</h1>

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
                        <li className="text-destructive">Couldn’t finish</li>
                    </ul>
                </Section>
            </div>
        </div>
    )
}
