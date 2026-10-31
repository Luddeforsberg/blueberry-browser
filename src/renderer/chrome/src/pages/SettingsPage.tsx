import React, { useState } from 'react'
import type { ActionApproval, Appearance, LayoutMode } from '@shared/ipc'
import { useShell } from '../contexts/ShellContext'
import { cn } from '@common/lib/utils'
import { Choice, Switch } from '@common/components/Controls'
import { SettingsRow } from '../components/SettingsRow'
import { DownloadSettings, SitePermissionsSettings } from './SiteSettings'

const APPROVAL_DESCRIPTIONS: Record<ActionApproval, string> = {
    risky: 'Berry asks before anything that could delete, send, buy or change text. Opening pages and searching happen without asking.',
    always: 'Berry asks before every click, every typed word and every new page.',
    never: "Berry doesn't ask, so it can delete, send or buy without checking with you, including if a page tricks it. That includes routines, which run when you aren't watching."
}

const SECTIONS = ['Layout', 'Appearance', 'Berry', 'Downloads', 'Site permissions', 'Data and privacy', 'Account'] as const
type Section = typeof SECTIONS[number]

export const SettingsPage: React.FC = () => {
    const { settings, updateSettings } = useShell()
    const [section, setSection] = useState<Section>('Layout')

    return (
        <div className="h-full grid grid-cols-[240px_1fr]">
            <div className="border-r overflow-y-auto px-3 py-6">
                <h1 className="px-3 pb-4 text-20 font-semibold">Settings</h1>
                    <nav aria-label="Settings sections">
                        <ul className="flex flex-col gap-0.5">
                            {SECTIONS.map((name) => (
                                <li key={name}>
                                    <button
                                        type="button"
                                        aria-current={section === name ? 'page' : undefined}
                                        onClick={() => setSection(name)}
                                        className={cn(
                                            "w-full h-9 px-3 rounded-card text-14 text-left outline-none transition-colors",
                                            "focus-visible:ring-2 focus-visible:ring-ring",
                                            section === name ? "bg-muted" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        {name}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </nav>
            </div>
            <div className="overflow-y-auto">
                    <section aria-label={section} className="max-w-[680px] mx-auto px-8 py-8">
                        <h2 className="text-20 font-semibold mb-5">{section}</h2>

                        <div className="rounded-panel border bg-surface px-5">
                        {section === 'Layout' && (
                            <SettingsRow id="setting-tabs" title="Tabs" description="Vertical tabs live in the sidebar. Horizontal tabs sit in a row above the address bar.">
                                <Choice<LayoutMode>
                                    label="Tabs"
                                    value={settings.layoutMode}
                                    onChange={(layoutMode) => updateSettings({ layoutMode })}
                                    options={[
                                        { value: 'vertical', label: 'Vertical' },
                                        { value: 'horizontal', label: 'Horizontal' }
                                    ]}
                                />
                            </SettingsRow>
                        )}

                        {section === 'Appearance' && (
                            <SettingsRow id="setting-appearance" title="Appearance" description="System follows your computer's light or dark setting.">
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
                            </SettingsRow>
                        )}

                        {section === 'Berry' && (
                            <>
                                <SettingsRow id="setting-show-berry" title="Show Berry" description="Turn this off for a plain icon and neutral wording. Everything keeps working.">
                                    <Switch
                                        labelledBy="setting-show-berry"
                                        checked={settings.showBerry}
                                        onChange={(showBerry) => updateSettings({ showBerry })}
                                    />
                                </SettingsRow>
                                <SettingsRow id="setting-still-berry" title="Keep Berry still" description="Keeps the bird and stops all its animation. This is automatic with Reduce Motion.">
                                    <Switch
                                        labelledBy="setting-still-berry"
                                        checked={settings.keepBerryStill}
                                        onChange={(keepBerryStill) => updateSettings({ keepBerryStill })}
                                    />
                                </SettingsRow>
                                <SettingsRow
                                    id="setting-action-approval"
                                    title="Ask before acting"
                                    description={APPROVAL_DESCRIPTIONS[settings.actionApproval]}
                                >
                                    <Choice<ActionApproval>
                                        label="Ask before acting"
                                        value={settings.actionApproval}
                                        onChange={(actionApproval) => updateSettings({ actionApproval })}
                                        options={[
                                            { value: 'risky', label: 'When risky' },
                                            { value: 'always', label: 'Always' },
                                            { value: 'never', label: 'Never' }
                                        ]}
                                    />
                                </SettingsRow>
                                <SettingsRow id="setting-berry-sees" title="What Berry can see" description="Berry only reads a page when you ask, and only speaks up about work you started. Your history and memory stay on this device." />
                            </>
                        )}

                        {section === 'Downloads' && <DownloadSettings />}

                        {section === 'Site permissions' && <SitePermissionsSettings />}

                        {section === 'Data and privacy' && (
                            <>
                                <SettingsRow id="setting-local" title="Stays on this device" description="History, open tabs and settings are kept on this computer. Nothing is synced." />
                                <SettingsRow id="setting-pages" title="Pages Berry reads" description="Messages in the Berry panel include the open page's text and a screenshot, which go to the AI service to answer them." />
                            </>
                        )}

                        {section === 'Account' && (
                            <SettingsRow id="setting-account" title="No account" description="Browsing, tabs and bookmarks never need one. Berry will ask you to sign in the first time you use it." />
                        )}
                        </div>
                    </section>
            </div>
        </div>
    )
}
