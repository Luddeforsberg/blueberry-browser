import React, { useState } from 'react'
import type { Appearance, LayoutMode } from '@shared/ipc'
import { useShell } from '../contexts/ShellContext'
import { cn } from '@common/lib/utils'

const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; labelledBy: string }> = ({
    checked,
    onChange,
    labelledBy
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelledBy}
        onClick={() => onChange(!checked)}
        className={cn(
            "relative w-9 h-5 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            checked ? "bg-primary" : "bg-border"
        )}
    >
        <span
            className={cn(
                "absolute top-0.5 left-0.5 size-4 rounded-full bg-surface transition-transform",
                checked && "translate-x-4"
            )}
        />
    </button>
)

const Choice = <T extends string>({
    label,
    value,
    options,
    onChange
}: {
    label: string
    value: T
    options: { value: T; label: string }[]
    onChange: (value: T) => void
}) => (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-card bg-muted">
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={value === option.value}
                onClick={() => onChange(option.value)}
                className={cn(
                    "h-7 px-3 rounded-control text-13 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    value === option.value ? "bg-surface font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
            >
                {option.label}
            </button>
        ))}
    </div>
)

const Row: React.FC<{ id: string; title: string; description?: string; children?: React.ReactNode }> = ({
    id,
    title,
    description,
    children
}) => (
    <div className="flex items-center gap-6 py-3 border-b last:border-b-0">
        <div className="flex-1">
            <h3 id={id} className="text-13 font-semibold">{title}</h3>
            {description && <p className="mt-0.5 text-12 text-muted-foreground">{description}</p>}
        </div>
        {children}
    </div>
)

const SECTIONS = ['Layout', 'Appearance', 'Berry', 'Data and privacy', 'Account'] as const
type Section = typeof SECTIONS[number]

export const SettingsPage: React.FC = () => {
    const { settings, updateSettings } = useShell()
    const [section, setSection] = useState<Section>('Layout')

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-4xl px-12 py-10">
                <h1 className="text-34 font-semibold">Settings</h1>
                <div className="mt-8 grid grid-cols-[180px_1fr] gap-10">
                    <nav aria-label="Settings sections">
                        <ul className="flex flex-col gap-0.5">
                            {SECTIONS.map((name) => (
                                <li key={name}>
                                    <button
                                        type="button"
                                        aria-current={section === name ? 'page' : undefined}
                                        onClick={() => setSection(name)}
                                        className={cn(
                                            "w-full h-8 px-2 rounded-control text-13 text-left outline-none transition-colors",
                                            "focus-visible:ring-2 focus-visible:ring-ring",
                                            section === name ? "bg-muted font-semibold" : "hover:bg-muted"
                                        )}
                                    >
                                        {name}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <section aria-label={section}>
                        <h2 className="text-20 font-semibold mb-2">{section}</h2>

                        {section === 'Layout' && (
                            <Row id="setting-tabs" title="Tabs" description="Vertical tabs live in the sidebar. Horizontal tabs sit in a row above the address bar.">
                                <Choice<LayoutMode>
                                    label="Tabs"
                                    value={settings.layoutMode}
                                    onChange={(layoutMode) => updateSettings({ layoutMode })}
                                    options={[
                                        { value: 'vertical', label: 'Vertical' },
                                        { value: 'horizontal', label: 'Horizontal' }
                                    ]}
                                />
                            </Row>
                        )}

                        {section === 'Appearance' && (
                            <Row id="setting-appearance" title="Appearance" description="System follows your computer's light or dark setting.">
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
                            </Row>
                        )}

                        {section === 'Berry' && (
                            <>
                                <Row id="setting-show-berry" title="Show Berry" description="Turn this off for a plain icon and neutral wording. Everything keeps working.">
                                    <Switch
                                        labelledBy="setting-show-berry"
                                        checked={settings.showBerry}
                                        onChange={(showBerry) => updateSettings({ showBerry })}
                                    />
                                </Row>
                                <Row id="setting-still-berry" title="Keep Berry still" description="Keeps the bird and stops all its animation. This is automatic with Reduce Motion.">
                                    <Switch
                                        labelledBy="setting-still-berry"
                                        checked={settings.keepBerryStill}
                                        onChange={(keepBerryStill) => updateSettings({ keepBerryStill })}
                                    />
                                </Row>
                                <Row id="setting-berry-sees" title="What Berry can see" description="Berry only reads a page when you ask, and only speaks up about work you started. Your history and memory stay on this device." />
                            </>
                        )}

                        {section === 'Data and privacy' && (
                            <>
                                <Row id="setting-local" title="Stays on this device" description="History, open tabs and settings are kept on this computer. Nothing is synced." />
                                <Row id="setting-pages" title="Pages Berry reads" description="Messages in the Berry panel include the open page's text and a screenshot, which go to the AI service to answer them." />
                            </>
                        )}

                        {section === 'Account' && (
                            <Row id="setting-account" title="No account" description="Browsing, tabs and bookmarks never need one. Berry will ask you to sign in the first time you use it." />
                        )}
                    </section>
                </div>
            </div>
        </div>
    )
}
