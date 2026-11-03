import React, { useState } from 'react'
import type { Appearance, LayoutMode } from '@shared/ipc'
import { useShell } from '../contexts/ShellContext'
import { Berry } from './Berry'
import { Button } from '@common/components/Button'
import { Choice } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { IMPORT_NOTES, SourceChoice, useHistoryImport } from './HistoryImport'

// A small drawing of the window in each layout: the frame, the page card floating on it, and where the tabs go.
const LayoutDrawing: React.FC<{ mode: LayoutMode }> = ({ mode }) => (
    <svg aria-hidden viewBox="0 0 160 100" className="w-40 h-auto">
        <rect x={0.5} y={0.5} width={159} height={99} rx={10} className="fill-background stroke-border" />
        {[9, 15, 21].map((cx) => <circle key={cx} cx={cx} cy={9} r={2} className="fill-muted-foreground/40" />)}
        {mode === 'vertical' ? (
            <>
                {/* The bookmark cluster, then the tabs, one of them chosen. */}
                {[11, 19, 27, 35].map((cx) => <circle key={cx} cx={cx} cy={22} r={3.2} className="fill-surface dark:fill-muted-foreground/30" />)}
                {[15, 23, 31].map((cx) => <circle key={cx} cx={cx} cy={29} r={3.2} className="fill-surface dark:fill-muted-foreground/30" />)}
                <rect x={5} y={38} width={39} height={9} rx={3} className="fill-selected" />
                {[42, 53, 63, 73].map((y, at) => <rect key={y} x={9} y={y - 1.5} width={[26, 22, 28, 18][at]} height={3} rx={1.5} className="fill-muted-foreground/30" />)}
                <rect x={49} y={6} width={105} height={88} rx={7} className="fill-canvas" />
                <rect x={56} y={12} width={36} height={4} rx={2} className="fill-muted-foreground/30" />
                {[28, 36, 44].map((y, at) => <rect key={y} x={60} y={y} width={[78, 64, 70][at]} height={3} rx={1.5} className="fill-muted-foreground/20" />)}
            </>
        ) : (
            <>
                {/* The tabs along the top, then the bookmarks bar under the address. */}
                <rect x={30} y={4} width={34} height={10} rx={3} className="fill-selected" />
                {[70, 96, 122].map((x) => <rect key={x} x={x} y={7.5} width={20} height={3} rx={1.5} className="fill-muted-foreground/30" />)}
                <rect x={6} y={19} width={148} height={75} rx={7} className="fill-canvas" />
                <rect x={13} y={25} width={36} height={4} rx={2} className="fill-muted-foreground/30" />
                {[13, 27, 41, 55].map((x) => <rect key={x} x={x} y={34} width={10} height={3} rx={1.5} className="fill-muted-foreground/20" />)}
                <rect x={6} y={41} width={148} height={0.75} className="fill-border" />
                {[52, 60, 68].map((y, at) => <rect key={y} x={30} y={y} width={[100, 82, 92][at]} height={3} rx={1.5} className="fill-muted-foreground/20" />)}
            </>
        )}
    </svg>
)

const LAYOUTS: { value: LayoutMode; label: string }[] = [
    { value: 'vertical', label: 'Tabs in a sidebar' },
    { value: 'horizontal', label: 'Tabs along the top' }
]

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
                        <Berry mood="curious" size={96} />
                        <h1 className="mt-6 text-34 font-semibold">Make it yours</h1>
                        <p className="mt-3 text-15 text-muted-foreground">You can change both later in Settings.</p>
                        <div className="mt-8 flex flex-col items-center gap-4">
                            <div role="radiogroup" aria-label="Tabs" className="flex gap-3">
                                {LAYOUTS.map(({ value, label }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={settings.layoutMode === value}
                                        onClick={() => updateSettings({ layoutMode: value })}
                                        className={cn(
                                            "p-3 pb-2 flex flex-col items-center gap-2 rounded-card text-14 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                                            settings.layoutMode === value ? "bg-selected shadow-selected" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                                        )}
                                    >
                                        <LayoutDrawing mode={value} />
                                        {label}
                                    </button>
                                ))}
                            </div>
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
                                <Button variant="ghost" className="mt-2 text-muted-foreground" disabled={busy} onClick={next}>Skip</Button>
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
                    <Button variant="ghost" className="mt-2 text-muted-foreground" onClick={finish}>
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
