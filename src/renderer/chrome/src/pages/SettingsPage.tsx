import React, { useEffect, useState } from 'react'
import { Cloud, Plug, Smartphone } from 'lucide-react'
import type { ActionApproval, Appearance, ImportSource, LayoutMode, StartupChoice, TabInfo } from '@shared/ipc'
import { SETTINGS_SECTIONS, settingsPlace, type SettingsPage as StepInPage, type SettingsSection } from '@shared/settingsPlaces'
import { shortcutWords, SHORTCUTS } from '@shared/shortcuts'
import { Choice, Switch } from '@common/components/Controls'
import { useShell } from '../contexts/ShellContext'
import { More, RowTile, SettingsGroup, SettingsLink, SettingsRow, StepInHeader } from '../components/SettingsRow'
import { SegmentSwitch } from '../components/SegmentSwitch'
import { PageFrame, PageHeader } from '../components/PageFrame'
import { WindowPicture } from '../components/WindowPicture'
import { BringInHistory } from '../components/HistoryImport'
import { openSettings } from '../openSettings'
import { usePhone } from '../usePhone'
import { useCloud } from '../useCloud'
import { DownloadSettings, SitePermissionsSettings, useSitePermissions } from './SiteSettings'
import { PhoneSettings } from './PhoneSettings'
import { McpSettings, useMcp } from './McpSettings'
import { CloudSettings } from './CloudSettings'
import { AccountSettings } from './AccountSettings'
import { WhatLeaves } from './WhatLeaves'

// DESIGN.md section 10, Settings: one column on the well, five sections along the top, and pages one step in. Where it
// is lives in the tab's param, so the toolbar's Back steps out of a page and another page can open it anywhere.

const SECTION_NAMES: Record<SettingsSection, string> = {
    general: 'General',
    mascots: 'Mascots',
    privacy: 'Privacy',
    connections: 'Connections',
    account: 'Account'
}

const PAGE_TITLES: Record<StepInPage, string> = {
    'what-leaves': 'What leaves this computer',
    'site-permissions': 'Site permissions',
    'bring-in-history': 'Bring in history',
    phone: 'Phone',
    claude: 'Claude and other apps',
    cloud: 'Cloud'
}

// The default follows `needsCard` and `isRisky` in browserTools.ts.
const APPROVAL_DESCRIPTIONS: Record<ActionApproval, { description: string; more?: string }> = {
    risky: {
        description: 'Berry asks before anything that could delete, send, buy or change text, and before going to a site you didn’t name.',
        more: 'Short searches, an address you gave it yourself, and plain pages on sites you named or it has already been on go ahead without asking. Any other address that could carry your data asks first.'
    },
    always: { description: 'Berry asks before every click, every typed word and every new page.' },
    never: { description: "Berry never asks, so it can delete, send or buy without checking with you, even in routines or when a page tricks it." }
}

const STARTUP_DESCRIPTIONS: Record<StartupChoice, { description: string; more?: string }> = {
    restore: { description: 'Blueberry opens the tabs you had open, each loading when you first go to it.', more: 'They’re saved on this computer until you close them.' },
    fresh: { description: 'Blueberry opens a new tab, and doesn’t save your open tabs.' }
}

// Moving, Still and Hidden are the two saved settings Show Berry and Keep Berry still, as one choice.
type Look = 'moving' | 'still' | 'hidden'
const LOOK_DESCRIPTIONS: Record<Look, string> = {
    moving: 'Still stops all their animation, as Reduce Motion does. Hidden gives plain icons and neutral words.',
    still: 'Keeps the mascots and stops all their animation. This is automatic with Reduce Motion.',
    hidden: 'Plain icons and neutral words, and everything keeps working.'
}
const LOOK_SETTINGS: Record<Look, { showBerry: boolean; keepBerryStill?: boolean }> = {
    moving: { showBerry: true, keepBerryStill: false },
    still: { showBerry: true, keepBerryStill: true },
    hidden: { showBerry: false }
}

const General: React.FC = () => {
    const { settings, updateSettings } = useShell()
    return (
        <>
            <SettingsGroup label="Look">
                <SettingsRow id="setting-appearance" title="Theme" top>
                    <Choice<Appearance>
                        label="Theme"
                        value={settings.appearance}
                        onChange={(appearance) => updateSettings({ appearance })}
                        options={[
                            { value: 'light', label: 'Light', picture: <WindowPicture mode="light" /> },
                            { value: 'dark', label: 'Dark', picture: <WindowPicture mode="dark" /> },
                            { value: 'system', label: 'System', picture: <WindowPicture mode="system" /> }
                        ]}
                    />
                </SettingsRow>
                <SettingsRow id="setting-tabs" title="Tabs" top>
                    <Choice<LayoutMode>
                        label="Tabs"
                        value={settings.layoutMode}
                        onChange={(layoutMode) => updateSettings({ layoutMode })}
                        options={[
                            { value: 'vertical', label: 'On the side', picture: <WindowPicture tabs="side" /> },
                            { value: 'horizontal', label: 'On top', picture: <WindowPicture tabs="top" /> }
                        ]}
                    />
                </SettingsRow>
            </SettingsGroup>
            <SettingsGroup label="Browsing">
                <SettingsRow id="setting-startup" title="When Blueberry opens" {...STARTUP_DESCRIPTIONS[settings.onStartup]}>
                    <Choice<StartupChoice>
                        label="When Blueberry opens"
                        value={settings.onStartup}
                        onChange={(onStartup) => updateSettings({ onStartup })}
                        options={[
                            { value: 'restore', label: 'Your tabs' },
                            { value: 'fresh', label: 'A new tab' }
                        ]}
                    />
                </SettingsRow>
                <DownloadSettings />
            </SettingsGroup>
        </>
    )
}

const Mascots: React.FC = () => {
    const { settings, updateSettings, theme } = useShell()
    const [shortcutTaken, setShortcutTaken] = useState(false)
    const shortcut = shortcutWords(SHORTCUTS.desktop, theme.platform === 'mac')
    const look: Look = !settings.showBerry ? 'hidden' : settings.keepBerryStill ? 'still' : 'moving'

    useEffect(() => {
        void window.chromeAPI.desktop.shortcutTaken().then(setShortcutTaken)
    }, [settings.desktopBerry])

    return (
        <>
            <SettingsGroup label="At work">
                <SettingsRow id="setting-action-approval" title="Ask before acting" {...APPROVAL_DESCRIPTIONS[settings.actionApproval]}>
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
                <SettingsRow
                    id="setting-bird-on-pages"
                    title="On the page they work in"
                    description="While a mascot works in the page you’re looking at, it’s drawn there doing it."
                    more="Turn this off if a site reacts badly. Mascots work the same either way."
                >
                    <Switch labelledBy="setting-bird-on-pages" checked={settings.birdOnPages} onChange={(birdOnPages) => updateSettings({ birdOnPages })} />
                </SettingsRow>
                <SettingsRow
                    id="setting-desktop-berry"
                    title="On your desktop"
                    description={
                        shortcutTaken
                            ? `Another app already uses ${shortcut}, so press the mascot to give it a job instead.`
                            : `When you leave Blueberry, the mascot waits at the edge of your screen, and ${shortcut} gives it a job from any app.`
                    }
                    more={`${shortcutTaken ? '' : 'Drag it to any edge. '}It can’t see your screen or other apps, and jobs ask just as a chat does. Closing Blueberry’s window takes it away and stops what’s running.`}
                >
                    <Switch labelledBy="setting-desktop-berry" checked={settings.desktopBerry} onChange={(desktopBerry) => updateSettings({ desktopBerry })} />
                </SettingsRow>
            </SettingsGroup>
            <SettingsGroup label="How they look">
                <SettingsRow id="setting-mascots-look" title="Mascots" description={LOOK_DESCRIPTIONS[look]}>
                    <Choice<Look>
                        label="Mascots"
                        value={look}
                        onChange={(next) => updateSettings(LOOK_SETTINGS[next])}
                        options={[
                            { value: 'moving', label: 'Moving' },
                            { value: 'still', label: 'Still' },
                            { value: 'hidden', label: 'Hidden' }
                        ]}
                    />
                </SettingsRow>
            </SettingsGroup>
            <SettingsGroup label="What they offer">
                <SettingsRow id="setting-suggestions" title="Suggestions" description="The new tab offers to take over what you keep doing, from a summary of your last two weeks sent to the AI service.">
                    <Switch labelledBy="setting-suggestions" checked={settings.suggestions} onChange={(suggestions) => updateSettings({ suggestions })} />
                </SettingsRow>
                <SettingsRow id="setting-memory-offers" title="Offers to remember" description="After a job, a mascot may offer to remember how you like something done.">
                    <Switch labelledBy="setting-memory-offers" checked={settings.memoryOffers} onChange={(memoryOffers) => updateSettings({ memoryOffers })} />
                </SettingsRow>
            </SettingsGroup>
        </>
    )
}

const Privacy: React.FC = () => {
    const sites = new Set(useSitePermissions().map(({ origin }) => origin)).size
    const [sources, setSources] = useState<ImportSource[] | null>(null)
    useEffect(() => {
        void window.chromeAPI.browser.importSources().then(setSources)
    }, [])
    return (
        <>
            <SettingsGroup>
                <SettingsLink title="What leaves this computer" description="Everything stays here unless it’s on this list." onOpen={() => openSettings('what-leaves')} />
                <SettingsLink
                    title="Site permissions"
                    description="Camera, location and the like, by site."
                    value={sites === 0 ? 'None yet' : `${sites} ${sites === 1 ? 'site' : 'sites'}`}
                    onOpen={() => openSettings('site-permissions')}
                />
            </SettingsGroup>
            <SettingsGroup label="History">
                <SettingsLink
                    title="History"
                    description="Every web page you visit is saved until you delete it or clear your history."
                    value="Open"
                    onOpen={() => void window.chromeAPI.browser.openPage('history')}
                />
                {/* Only with a browser to bring from, so it never offers something it can't do. */}
                {sources && sources.length > 0 && <SettingsLink title="Bring it in from another browser" onOpen={() => openSettings('bring-in-history')} />}
            </SettingsGroup>
        </>
    )
}

// Each row's state is a pill, and only what's true: a next step is a raised button beside it, and Set up opens the same
// page as the row.
const Connections: React.FC = () => {
    const [phone] = usePhone()
    const [mcp] = useMcp()
    const [cloud, setCloud] = useCloud()
    const setUp = (page: StepInPage) => ({ label: 'Set up', onAct: () => openSettings(page) })
    const cloudSetUp = cloud.provider === 'local' || cloud.configured
    return (
        <SettingsGroup>
            <SettingsLink
                lead={<RowTile><Smartphone strokeWidth={1.75} /></RowTile>}
                title="Phone"
                description="Answer a waiting job from Telegram."
                state={phone.status === 'connected' ? { words: 'Connected', tone: 'on' } : phone.status === 'pairing' ? { words: 'Pairing' } : { words: 'Not set up' }}
                action={phone.status === 'off' ? setUp('phone') : undefined}
                onOpen={() => openSettings('phone')}
            />
            <SettingsLink
                lead={<RowTile><Plug strokeWidth={1.75} /></RowTile>}
                title="Claude and other apps"
                description="Apps on this computer can give your mascots jobs."
                state={!mcp.on ? { words: 'Not set up' } : mcp.url ? { words: 'On', tone: 'on' } : { words: 'Couldn’t start', tone: 'ask' }}
                action={mcp.on ? undefined : setUp('claude')}
                onOpen={() => openSettings('claude')}
            />
            <SettingsLink
                lead={<RowTile><Cloud strokeWidth={1.75} /></RowTile>}
                title="Cloud"
                description="Jobs in a cloud browser, and with this computer off."
                state={
                    cloud.unreleased
                        ? { words: 'Session still open', tone: 'ask' }
                        : !cloudSetUp
                          ? { words: 'Not set up' }
                          : cloud.status === 'running' || cloud.status === 'starting'
                            ? { words: 'Session open', tone: 'on' }
                            : { words: 'Ready', tone: 'on' }
                }
                action={
                    cloud.unreleased
                        ? { label: 'Try again', onAct: () => void window.chromeAPI.cloud.end().then(setCloud) }
                        : !cloudSetUp
                          ? setUp('cloud')
                          : undefined
                }
                onOpen={() => openSettings('cloud')}
            />
        </SettingsGroup>
    )
}

const SECTIONS: Record<SettingsSection, React.FC> = { general: General, mascots: Mascots, privacy: Privacy, connections: Connections, account: AccountSettings }

const STEP_IN: Record<StepInPage, { about?: React.ReactNode; Body: React.FC }> = {
    'what-leaves': { about: 'Everything is kept on this computer unless it’s listed here, and nothing is synced. Berry only reads a page when you ask, and only speaks up about work you started.', Body: WhatLeaves },
    'site-permissions': { about: 'When a site asks for your camera, location or similar, your answer shows up here.', Body: SitePermissionsSettings },
    'bring-in-history': { Body: BringInHistory },
    phone: {
        about: <>When a job needs you and you’re away, your own Telegram bot asks you, and your reply goes straight to the job. <More text="It runs from this computer, so it only works while Blueberry is open." /></>,
        Body: PhoneSettings
    },
    claude: { about: 'Claude Code and Claude Desktop on this computer can give your mascots jobs.', Body: McpSettings },
    cloud: {
        about: <>A mascot can do a job in a browser on Browserbase instead of in your tabs here, signed in only to the sites you bring along. <More text="You watch it live in a cloud tab and can take over there, and it asks you before anything risky, the same as here." /></>,
        Body: CloudSettings
    }
}

export const SettingsPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { section, page } = settingsPlace(tab.pageParam) ?? { section: 'general' as const, page: null }
    const Section = SECTIONS[section]
    const stepIn = page && STEP_IN[page]

    return (
        <PageFrame>
                {page && stepIn ? (
                    <section aria-label={PAGE_TITLES[page]}>
                        <StepInHeader back={SECTION_NAMES[section]} onBack={() => openSettings(section)} title={PAGE_TITLES[page]}>
                            {stepIn.about}
                        </StepInHeader>
                        <stepIn.Body />
                    </section>
                ) : (
                    <>
                        <PageHeader title="Settings" />
                        <SegmentSwitch
                            label="Settings sections"
                            items={SETTINGS_SECTIONS.map((value) => ({ value, label: SECTION_NAMES[value] }))}
                            current={section}
                            onChange={openSettings}
                            className="h-8 rounded-[11px] [&>button]:rounded-[9px] text-13"
                        />
                        <section role="tabpanel" aria-label={SECTION_NAMES[section]}>
                            <Section />
                        </section>
                    </>
                )}
        </PageFrame>
    )
}
