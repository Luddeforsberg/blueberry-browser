import React, { useState } from 'react'
import type { Appearance, LayoutMode } from '@shared/ipc'
import { useShell } from '../contexts/ShellContext'
import { Berry } from './Berry'
import { Button } from '@common/components/Button'
import { Choice } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { IMPORT_NOTES, SourceChoice, useHistoryImport } from './HistoryImport'

// Short steps on first launch. Every one can be skipped, and no account is asked for. With no browser to bring history
// from, that step isn't there at all.
export const Onboarding: React.FC = () => {
    const { settings, theme, updateSettings } = useShell()
    const [step, setStep] = useState(0)
    const { sources, source, choose, busy, bringIn, message, done } = useHistoryImport()
    const steps = ['meet', 'yours', ...(source ? ['import'] : []), 'see']
    const name = steps[step]
    const finish = () => updateSettings({ onboarded: true })
    const next = () => (step === steps.length - 1 ? finish() : setStep(step + 1))

    return (
        <div
            className={cn(
                "absolute inset-0 flex flex-col items-center app-region-drag",
                theme.glass ? "bg-frame" : "bg-background"
            )}
        >
            <main className="flex-1 flex flex-col items-center justify-center max-w-md text-center app-region-no-drag">
                {name === 'meet' && (
                    <>
                        <Berry mood="asking" size={160} />
                        <h1 className="mt-6 text-34 font-semibold">Hi, I’m Berry.</h1>
                        <p className="mt-3 text-15 text-muted-foreground">
                            Tell me what you’re working on and I’ll go and fetch what you need. I’ll always check with you before anything important.
                        </p>
                        <Button className="mt-8" onClick={next}>Nice to meet you</Button>
                    </>
                )}

                {name === 'yours' && (
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

                {name === 'import' && source && sources && (
                    <>
                        <Berry mood="asking" size={96} />
                        <h1 className="mt-6 text-34 font-semibold">Bring your history along?</h1>
                        <p className="mt-3 text-15 text-muted-foreground">
                            I can read your history from {source.name} to see what you keep doing, and offer to do it for you.
                        </p>
                        {sources.length > 1 && !done && (
                            <div className="mt-6">
                                <SourceChoice sources={sources} source={source} choose={choose} />
                            </div>
                        )}
                        <ul className="mt-4 flex flex-col gap-2 text-13 text-muted-foreground text-left">
                            {IMPORT_NOTES.map((note) => <li key={note}>{note}</li>)}
                        </ul>
                        {message && <p role="status" className="mt-4 text-15">{message}</p>}
                        {done ? (
                            <Button className="mt-8" onClick={next}>Continue</Button>
                        ) : (
                            <>
                                <Button className="mt-8" disabled={busy} onClick={() => void bringIn()}>
                                    {busy ? 'Bringing it in…' : 'Bring it in'}
                                </Button>
                                <Button variant="link" className="mt-2 text-muted-foreground" disabled={busy} onClick={next}>Skip</Button>
                            </>
                        )}
                    </>
                )}

                {name === 'see' && (
                    <>
                        <Berry mood="curious" size={96} />
                        <h1 className="mt-6 text-34 font-semibold">What I can see</h1>
                        <ul className="mt-4 flex flex-col gap-2 text-15 text-muted-foreground text-left">
                            <li>I only read a page when you ask, and the chat always shows which one.</li>
                            <li>I only speak up about work you started.</li>
                            <li>Your history stays on this computer, apart from the summary it takes to suggest something. You can turn that off in Settings.</li>
                        </ul>
                        <Button className="mt-8" onClick={finish}>Start browsing</Button>
                    </>
                )}

                {(name === 'meet' || name === 'yours') && (
                    <Button variant="link" className="mt-2 text-muted-foreground" onClick={finish}>
                        Skip setup
                    </Button>
                )}
            </main>

            <ol aria-label={`Step ${step + 1} of ${steps.length}`} className={cn("mb-6 flex gap-1.5", !sources && "invisible")}>
                {steps.map((_, index) => (
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
