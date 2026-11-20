import React, { useEffect, useState } from 'react'
import type { PublishedMascot } from '@shared/library'
import { ACCOUNT_NAME_MAX } from '@shared/accountName'
import { Button } from '@common/components/Button'
import { AccountForm } from '../components/AccountForm'
import { Avatar } from '../components/AccountMenu'
import { CopyLink } from '../components/CopyLink'
import { cn } from '@common/lib/utils'
import { LINE_BETWEEN, ROW } from '../components/PageFrame'
import { SettingsGroup, SettingsRow } from '../components/SettingsRow'
import { useShell } from '../contexts/ShellContext'
import { useLibrary } from '../contexts/LibraryContext'
import { useAccount } from '../useAccount'

// Settings > Account. The name is the user's own, kept in Settings on this computer: nothing sends, prompts or publishes it.

const NEEDED_FOR = 'publishing a mascot and keeping cloud jobs going with your Mac off'

// Your published mascots, read from the server, so this still works for one whose copy here is gone.
const PublishedList: React.FC = () => {
    const { mascots } = useLibrary()
    const [list, setList] = useState<PublishedMascot[] | null | undefined>(undefined)
    const [problem, setProblem] = useState<string | null>(null)
    const own = mascots.map((mascot) => mascot.publishedId ?? '').join()
    useEffect(() => {
        void window.chromeAPI.mascots.published().then(setList)
    }, [own])

    const unpublish = async (id: string) => {
        const result = await window.chromeAPI.mascots.unpublish(id)
        if (result.ok) setList((current) => current?.filter((mascot) => mascot.id !== id))
        else if (result.error) setProblem(result.error)
    }

    if (list === undefined) return null
    return (
        <SettingsGroup label="Published in the Gallery">
            {list === null && <SettingsRow id="setting-published" title="Couldn’t reach the Gallery to see." />}
            {list?.length === 0 && <SettingsRow id="setting-published" title="Nothing yet" description="A mascot’s card on Your mascots has Publish." />}
            {list && list.length > 0 && (
                <ul aria-label="What you’ve published">
                    {list.map((mascot) => (
                        <li key={mascot.id} className={cn(ROW, LINE_BETWEEN, 'before:left-2 min-h-12 py-[9px] flex items-center gap-3')}>
                            <div className="flex-1 min-w-0">
                                <p className="text-14 [overflow-wrap:anywhere]">{mascot.name}</p>
                                <p className="mt-0.5 text-13 text-ink-2 [overflow-wrap:anywhere] tabular-nums">
                                    By {mascot.author} · {mascot.addCount === 1 ? '1 add' : `${mascot.addCount} adds`}
                                    {mascot.hidden && ' · Taken out of the Gallery by Blueberry'}
                                </p>
                            </div>
                            {mascot.link && <CopyLink link={mascot.link} label={`Copy the link to ${mascot.name}`} />}
                            <Button variant="raised" size="sm" aria-label={`Unpublish ${mascot.name}`} onClick={() => void unpublish(mascot.id)}>Unpublish</Button>
                        </li>
                    ))}
                </ul>
            )}
            {problem && <SettingsRow id="setting-published-problem" title={<span role="alert" className="text-ask">{problem}</span>} />}
        </SettingsGroup>
    )
}

// Name, with Change turning it into a field. Enter or Save keeps it, Escape or Cancel doesn't, and an empty one clears it.
const NameRow: React.FC = () => {
    const { settings, updateSettings } = useShell()
    const [draft, setDraft] = useState<string | null>(null)
    const save = () => {
        if (draft === null) return
        updateSettings({ accountName: draft.trim() || null })
        setDraft(null)
    }

    if (draft !== null) {
        return (
            <SettingsRow id="setting-name" title="Name" description="Only on this computer. It’s never sent anywhere.">
                <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                        event.preventDefault()
                        save()
                    }}
                >
                    <input
                        aria-labelledby="setting-name"
                        autoFocus
                        maxLength={ACCOUNT_NAME_MAX}
                        autoComplete="name"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') setDraft(null)
                        }}
                        className="w-48 h-[26px] rounded-row border bg-sheet px-2.5 text-14 outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
                    <Button type="submit" variant="raised" size="sm">Save</Button>
                </form>
            </SettingsRow>
        )
    }
    return (
        <SettingsRow id="setting-name" title="Name" description="Only on this computer. It’s never sent anywhere.">
            <span className="min-w-0 truncate text-13 text-ink-2">{settings.accountName ?? 'Not set'}</span>
            <Button variant="raised" size="sm" aria-label="Change your name" onClick={() => setDraft(settings.accountName ?? '')}>Change</Button>
        </SettingsRow>
    )
}

export const AccountSettings: React.FC = () => {
    const [account, setAccount] = useAccount()
    const { settings } = useShell()
    if (account.status === 'not-set-up') {
        return (
            <SettingsGroup>
                <SettingsRow id="setting-account" title="No account" description={`This copy of Blueberry isn’t set up for accounts, which only ${NEEDED_FOR} need.`} />
            </SettingsGroup>
        )
    }
    if (account.status === 'signed-out') {
        return (
            <SettingsGroup>
                <SettingsRow
                    id="setting-account"
                    title="Not signed in"
                    description={`Browsing, chatting and the Gallery never need one: it’s only for ${NEEDED_FOR}.`}
                    below={<AccountForm problem={account.problem} onResult={setAccount} />}
                />
            </SettingsGroup>
        )
    }
    return (
        <>
            <SettingsGroup>
                <SettingsRow
                    id="setting-account"
                    lead={<Avatar name={settings.accountName} email={account.email} large />}
                    title={<span className="font-medium">{settings.accountName ?? account.email}</span>}
                    description={settings.accountName ? account.email : undefined}
                >
                    <Button variant="raised" size="sm" onClick={() => void window.chromeAPI.account.signOut().then(setAccount)}>Sign out</Button>
                </SettingsRow>
                {account.problem && <SettingsRow id="setting-account-problem" title={<span role="alert" className="text-ask">{account.problem}</span>} />}
            </SettingsGroup>
            <SettingsGroup label="You">
                <NameRow />
                <SettingsRow id="setting-email" title="Email" description="Only you see it. It’s never published, and it’s kept encrypted on this computer.">
                    <span className="min-w-0 truncate text-13 text-ink-2">{account.email}</span>
                </SettingsRow>
            </SettingsGroup>
            <PublishedList />
        </>
    )
}
