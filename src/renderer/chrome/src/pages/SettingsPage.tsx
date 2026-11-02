import React, { useEffect, useState } from 'react'
import type { ActionApproval, Appearance, LayoutMode, StartupChoice, TabInfo } from '@shared/ipc'
import { useShell } from '../contexts/ShellContext'
import { cn } from '@common/lib/utils'
import { Choice, Switch } from '@common/components/Controls'
import { SettingsRow } from '../components/SettingsRow'
import { DownloadSettings, SitePermissionsSettings } from './SiteSettings'
import { HistoryImportSettings } from '../components/HistoryImport'
import { PhoneSettings } from './PhoneSettings'
import { McpSettings } from './McpSettings'
import { CloudSettings } from './CloudSettings'
import { AccountSettings } from './AccountSettings'
import { Button } from '@common/components/Button'

const APPROVAL_DESCRIPTIONS: Record<ActionApproval, string> = {
    risky: 'Berry asks before anything that could delete, send, buy or change text. Opening pages and searching happen without asking.',
    always: 'Berry asks before every click, every typed word and every new page.',
    never: "Berry doesn't ask, so it can delete, send or buy without checking with you, including if a page tricks it. That includes routines, which run when you aren't watching."
}

const STARTUP_DESCRIPTIONS: Record<StartupChoice, string> = {
    restore: 'Blueberry opens the tabs you had open, each loading when you first go to it. They are saved on this computer until you close them.',
    fresh: 'Blueberry opens a new tab, and doesn’t save your open tabs.'
}

const DESKTOP_SHORTCUT = /Mac/.test(navigator.platform) ? '⌥Space' : 'Alt+Space'

const SECTIONS = ['Layout', 'Appearance', 'Berry', 'Phone', 'Claude', 'Cloud', 'Downloads', 'Site permissions', 'Data and privacy', 'Account'] as const
type Section = typeof SECTIONS[number]

export const SettingsPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { settings, updateSettings } = useShell()
    const [section, setSection] = useState<Section>('Layout')
    const [shortcutTaken, setShortcutTaken] = useState(false)

    useEffect(() => {
        void window.chromeAPI.desktop.shortcutTaken().then(setShortcutTaken)
    }, [settings.desktopBerry])

    // Another page can open Settings at a section.
    useEffect(() => {
        const asked = SECTIONS.find((name) => name === tab.pageParam)
        if (asked) setSection(asked)
    }, [tab.pageParam])

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
                                    id="setting-desktop-berry"
                                    title="Berry on your desktop"
                                    description={
                                        shortcutTaken
                                            ? `Another app already uses ${DESKTOP_SHORTCUT}, so press the bird to give it a job instead. It can't see your screen or other apps, and jobs ask just as a chat does.`
                                            : `When you leave Blueberry, the bird tucks in behind the edge of your screen, and ${DESKTOP_SHORTCUT} gives it a job from any app. Drag it to any edge. It can't see your screen or other apps, and jobs ask just as a chat does. Closing Blueberry's window takes it away and stops what's running.`
                                    }
                                >
                                    <Switch
                                        labelledBy="setting-desktop-berry"
                                        checked={settings.desktopBerry}
                                        onChange={(desktopBerry) => updateSettings({ desktopBerry })}
                                    />
                                </SettingsRow>
                                <SettingsRow id="setting-bird-on-pages" title="Show the bird on pages" description="While a mascot works in the page you're looking at, it's drawn there doing it. Turn this off if a site reacts badly. Mascots work the same either way.">
                                    <Switch
                                        labelledBy="setting-bird-on-pages"
                                        checked={settings.birdOnPages}
                                        onChange={(birdOnPages) => updateSettings({ birdOnPages })}
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
                                <SettingsRow id="setting-berry-sees" title="What Berry can see" description="Berry only reads a page when you ask, and only speaks up about work you started. Your history and memory stay on this device, apart from what Suggestions sends, if it's on." />
                            </>
                        )}

                        {section === 'Phone' && <PhoneSettings />}

                        {section === 'Claude' && <McpSettings />}

                        {section === 'Cloud' && <CloudSettings />}

                        {section === 'Downloads' && <DownloadSettings />}

                        {section === 'Site permissions' && <SitePermissionsSettings />}

                        {section === 'Data and privacy' && (
                            <>
                                <SettingsRow id="setting-local" title="Stays on this device" description="History, chats, bookmarks and settings are kept on this computer, and so are your open tabs unless you start fresh. Nothing is synced. Only a mascot you choose to publish goes public, and you see exactly what goes first." />
                                <SettingsRow id="setting-history" title="History" description="Every web page you visit is saved until you delete it or clear your history.">
                                    <Button variant="outline" onClick={() => void window.chromeAPI.browser.openPage('history')}>Open history</Button>
                                </SettingsRow>
                                <HistoryImportSettings />
                                <SettingsRow id="setting-startup" title="When Blueberry opens" description={STARTUP_DESCRIPTIONS[settings.onStartup]}>
                                    <Choice<StartupChoice>
                                        label="When Blueberry opens"
                                        value={settings.onStartup}
                                        onChange={(onStartup) => updateSettings({ onStartup })}
                                        options={[
                                            { value: 'restore', label: 'Restore tabs' },
                                            { value: 'fresh', label: 'Start fresh' }
                                        ]}
                                    />
                                </SettingsRow>
                                <SettingsRow
                                    id="setting-suggestions"
                                    title="Suggestions"
                                    description="The new tab page offers to take over what you repeat. Finding it happens on this computer. To word the cards, site names, page titles, chat titles, and how often and when you visit go to the AI service, never page text or full addresses. Local addresses, addresses with tokens, and sites it recognises as banks or mail are left out. Off means nothing is sent."
                                >
                                    <Switch
                                        labelledBy="setting-suggestions"
                                        checked={settings.suggestions}
                                        onChange={(suggestions) => updateSettings({ suggestions })}
                                    />
                                </SettingsRow>
                                <SettingsRow
                                    id="setting-memory-offers"
                                    title="Offers to remember"
                                    description="After a job, a bird may offer to remember how you like something done. To word the offer, what you typed in that chat or routine and the names of the sites it used go to the AI service, never page text or the reply. Nothing is kept unless you press Remember, and each bird’s page in Flock shows all it has. Off means no more offers, and what’s kept stays in use until you forget it there."
                                >
                                    <Switch
                                        labelledBy="setting-memory-offers"
                                        checked={settings.memoryOffers}
                                        onChange={(memoryOffers) => updateSettings({ memoryOffers })}
                                    />
                                </SettingsRow>
                                <SettingsRow id="setting-pages" title="Pages Berry reads" description="Messages in the Berry panel include the open page's text and a screenshot, which go to the AI service to answer them." />
                            </>
                        )}

                        {section === 'Account' && <AccountSettings />}
                        </div>
                    </section>
            </div>
        </div>
    )
}
