import React, { useState } from 'react'
import type { Appearance, LayoutMode } from '@shared/ipc'
import { useShell } from '../contexts/ShellContext'
import { Berry } from './Berry'
import { Button } from '@common/components/Button'
import { Choice } from '@common/components/Controls'
import { cn } from '@common/lib/utils'

const STEPS = 3

// Three short steps on first launch. Every one can be skipped, and no account is asked for.
export const Onboarding: React.FC = () => {
    const { settings, theme, updateSettings } = useShell()
    const [step, setStep] = useState(0)
    const finish = () => updateSettings({ onboarded: true })
    const next = () => (step === STEPS - 1 ? finish() : setStep(step + 1))

    return (
        <div
            className={cn(
                "absolute inset-0 flex flex-col items-center app-region-drag",
                theme.glass ? "bg-frame" : "bg-background"
            )}
        >
            <main className="flex-1 flex flex-col items-center justify-center max-w-md text-center app-region-no-drag">
                {step === 0 && (
                    <>
                        <Berry mood="asking" size={160} />
                        <h1 className="mt-6 text-34 font-semibold">Hi, I’m Berry.</h1>
                        <p className="mt-3 text-15 text-muted-foreground">
                            Tell me what you’re working on and I’ll go and fetch what you need. I’ll always check with you before anything important.
                        </p>
                        <Button className="mt-8" onClick={next}>Nice to meet you</Button>
                    </>
                )}

                {step === 1 && (
                    <>
                        <h1 className="text-34 font-semibold">Make it yours</h1>
                        <p className="mt-3 text-15 text-muted-foreground">You can change both later in Settings.</p>
                        <div className="mt-8 flex flex-col items-center gap-4">
                            <Choice<LayoutMode>
                                label="Tabs"
                                value={settings.layoutMode}
                                onChange={(layoutMode) => updateSettings({ layoutMode })}
                                options={[
                                    { value: 'vertical', label: 'Tabs in a sidebar' },
                                    { value: 'horizontal', label: 'Tabs along the top' }
                                ]}
                            />
                            <Choice<Appearance>
                                label="Appearance"
                                value={settings.appearance}
                                onChange={(appearance) => updateSettings({ appearance })}
                                options={[
                                    { value: 'system', label: 'System' },
                                    { value: 'light', label: 'Light' },
                                    { value: 'dark', label: 'Dark' }
                                ]}
                            />
                        </div>
                        <Button className="mt-8" onClick={next}>Continue</Button>
                    </>
                )}

                {step === 2 && (
                    <>
                        <Berry mood="curious" size={96} />
                        <h1 className="mt-6 text-34 font-semibold">What I can see</h1>
                        <ul className="mt-4 flex flex-col gap-2 text-15 text-muted-foreground text-left">
                            <li>I only read a page when you ask, and the chat always shows which one.</li>
                            <li>I only speak up about work you started.</li>
                            <li>Your history stays on this computer.</li>
                        </ul>
                        <Button className="mt-8" onClick={finish}>Start browsing</Button>
                    </>
                )}

                {step < STEPS - 1 && (
                    <Button variant="link" className="mt-2 text-muted-foreground" onClick={finish}>
                        Skip setup
                    </Button>
                )}
            </main>

            <ol aria-label={`Step ${step + 1} of ${STEPS}`} className="mb-6 flex gap-1.5">
                {Array.from({ length: STEPS }, (_, index) => (
                    <li
                        key={index}
                        className={cn(
                            "h-1.5 rounded-full transition-all",
                            index === step ? "w-4 bg-primary" : "w-1.5 bg-border"
                        )}
                    />
                ))}
            </ol>
        </div>
    )
}
