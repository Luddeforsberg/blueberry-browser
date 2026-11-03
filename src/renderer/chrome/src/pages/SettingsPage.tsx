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
import { Berry } from '../components/Berry'

// The default follows `needsCard` and `isRisky` in browserTools.ts.
const APPROVAL_DESCRIPTIONS: Record<ActionApproval, { description: string; more?: string }> = {
    risky: {
        description: 'Berry asks before anything that could delete, send, buy or change text, and before going to a site you didn’t name.',
        more: 'Searches, and plain pages on sites you named or it has already been on, go ahead without asking. An address that could carry your data always asks.'
    },
    always: { description: 'Berry asks before every click, every typed word and every new page.' },
    never: { description: "Berry never asks, so it can delete, send or buy without checking with you, even in routines or when a page tricks it." }
}

const STARTUP_DESCRIPTIONS: Record<StartupChoice, { description: string; more?: string }> = {
    restore: { description: 'Blueberry opens the tabs you had open, each loading when you first go to it.', more: 'They’re saved on this computer until you close them.' },
    fresh: { description: 'Blueberry opens a new tab, and doesn’t save your open tabs.' }
}

const DESKTOP_SHORTCUT = /Mac/.test(navigator.platform) ? '⌥Space' : 'Alt+Space'

const SECTIONS = ['Appearance', 'Berry', 'Phone', 'Claude', 'Cloud', 'Downloads', 'Site permissions', 'Data and privacy', 'Account'] as const
type Section = typeof SECTIONS[number]

export const SettingsPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { settings, updateSettings } = useShell()
    const [section, setSection] = useState<Section>('Appearance')
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
                    <section aria-label={section} className="max-w-[680px] px-8 py-8">
                        <div className="mb-5 flex items-end gap-3">
                            <h2 className="text-20 font-semibold">{section}</h2>
                            {section === 'Berry' && <Berry size={40} />}
                        </div>

                        <div className="rounded-panel border bg-surface px-5">
                        {section === 'Appearance' && (
                            <>
                            <SettingsRow id="setting-tabs" title="Tabs" description="In the sidebar, or in a row above the address bar.">
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
                            <SettingsRow id="setting-appearance" title="Light or dark" description="System follows your computer’s setting.">
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
                            </>
                        )}

                        {section === 'Berry' && (
                            <>
                                <SettingsRow id="setting-show-berry" title="Show Berry" description="Off gives a plain icon and neutral wording, and everything keeps working.">
                                    <Switch
                                        labelledBy="setting-show-berry"
                                        checked={settings.showBerry}
                                        onChange={(showBerry) => updateSettings({ showBerry })}
                                    />
                                </SettingsRow>
                                <SettingsRow id="setting-still-berry" title="Keep Berry still" description="Keeps the bird and stops all its animation." more="This is automatic with Reduce Motion.">
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
                                            ? `Another app already uses ${DESKTOP_SHORTCUT}, so press the bird to give it a job instead.`
                                            : `When you leave Blueberry, the bird waits at the edge of your screen, and ${DESKTOP_SHORTCUT} gives it a job from any app.`
                                    }
                                    more={`${shortcutTaken ? '' : 'Drag it to any edge. '}It can’t see your screen or other apps, and jobs ask just as a chat does. Closing Blueberry’s window takes it away and stops what’s running.`}
                                >
                                    <Switch
                                        labelledBy="setting-desktop-berry"
                                        checked={settings.desktopBerry}
                                        onChange={(desktopBerry) => updateSettings({ desktopBerry })}
                                    />
                                </SettingsRow>
                                <SettingsRow id="setting-bird-on-pages" title="Show the bird on pages" description="While a mascot works in the page you’re looking at, it’s drawn there doing it." more="Turn this off if a site reacts badly. Mascots work the same either way.">
                                    <Switch
                                        labelledBy="setting-bird-on-pages"
                                        checked={settings.birdOnPages}
                                        onChange={(birdOnPages) => updateSettings({ birdOnPages })}
                                    />
                                </SettingsRow>
                                <SettingsRow
                                    id="setting-action-approval"
                                    title="Ask before acting"
                                    {...APPROVAL_DESCRIPTIONS[settings.actionApproval]}
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
                                <SettingsRow id="setting-berry-sees" title="What Berry can see" description="Berry only reads a page when you ask, and only speaks up about work you started." more="Your history and memory stay on this device, apart from what Suggestions sends, if it’s on." />
                            </>
                        )}

                        {section === 'Phone' && <PhoneSettings />}

                        {section === 'Claude' && <McpSettings />}

                        {section === 'Cloud' && <CloudSettings openAccount={() => setSection('Account')} />}

                        {section === 'Downloads' && <DownloadSettings />}

                        {section === 'Site permissions' && <SitePermissionsSettings />}

                        {section === 'Data and privacy' && (
                            <>
                                <SettingsRow id="setting-local" title="Stays on this device" description="History, chats, bookmarks and settings are kept on this computer, and nothing is synced." more="So are your open tabs, unless you start fresh. Only a mascot you choose to publish goes public, and you see exactly what goes first." />
                                <SettingsRow id="setting-history" title="History" description="Every web page you visit is saved until you delete it or clear your history.">
                                    <Button variant="outline" onClick={() => void window.chromeAPI.browser.openPage('history')}>Open history</Button>
                                </SettingsRow>
                                <HistoryImportSettings />
                                <SettingsRow id="setting-startup" title="When Blueberry opens" {...STARTUP_DESCRIPTIONS[settings.onStartup]}>
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
                                    description="The new tab page offers to take over what you keep doing, from a summary of the last two weeks sent to the AI service."
                                    more="The summary has site names and page titles in the order you visited them, what you searched for, the titles of your chats and routines and how they went, and which cards you dismissed or used. Never page text or full addresses. Local addresses, addresses with tokens, sites it recognises as banks or mail, and searches about health, money or logins are left out, though it can miss one. Off means nothing is sent."
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
                                    description="After a job, a bird may offer to remember how you like something done."
                                    more="To word the offer, what you typed in that chat or routine and the names of the sites it used go to the AI service, never page text or the reply. Nothing is kept unless you press Remember, and each bird’s page in Flock shows all it has. Off means no more offers, and what’s kept stays in use until you forget it there."
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
