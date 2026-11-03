import React, { useEffect, useState } from 'react'
import type { PublishedMascot } from '@shared/library'
import { Button } from '@common/components/Button'
import { AccountForm } from '../components/AccountForm'
import { CopyLink } from '../components/CopyLink'
import { SettingsRow } from '../components/SettingsRow'
import { useLibrary } from '../contexts/LibraryContext'
import { useAccount } from '../useAccount'

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
    if (list === null) return <SettingsRow id="setting-published" title="What you’ve published" description="Couldn’t reach the Gallery to see." />
    if (list.length === 0) return <SettingsRow id="setting-published" title="What you’ve published" description="Nothing yet. A mascot’s card in your flock has Publish." />
    return (
        <div className="py-4">
            <h3 className="text-14 font-semibold">What you’ve published</h3>
            <ul aria-label="What you’ve published" className="mt-2 divide-y">
                {list.map((mascot) => (
                    <li key={mascot.id} className="flex items-center gap-3 py-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-14 [overflow-wrap:anywhere]">{mascot.name}</p>
                            <p className="text-12 text-muted-foreground [overflow-wrap:anywhere] tabular-nums">
                                By {mascot.author} · {mascot.addCount === 1 ? '1 add' : `${mascot.addCount} adds`}
                                {mascot.hidden && ' · Taken out of the Gallery by Blueberry'}
                            </p>
                        </div>
                        {mascot.link && <CopyLink link={mascot.link} label={`Copy the link to ${mascot.name}`} />}
                        <Button variant="outline" size="sm" aria-label={`Unpublish ${mascot.name}`} onClick={() => void unpublish(mascot.id)}>Unpublish</Button>
                    </li>
                ))}
            </ul>
            {problem && <p role="alert" className="mt-2 text-13 text-destructive">{problem}</p>}
        </div>
    )
}

export const AccountSettings: React.FC = () => {
    const [account, setAccount] = useAccount()
    if (account.status === 'not-set-up') {
        return <SettingsRow id="setting-account" title="No account" description={`This copy of Blueberry isn’t set up for accounts, which only ${NEEDED_FOR} need.`} />
    }
    if (account.status === 'signed-out') {
        return (
            <>
                <SettingsRow id="setting-account" title="Not signed in" description={`Browsing, chatting and the Gallery never need one: it’s only for ${NEEDED_FOR}.`} />
                <div className="py-4">
                    <AccountForm problem={account.problem} onResult={setAccount} />
                </div>
            </>
        )
    }
    return (
        <>
            <SettingsRow id="setting-account" title={`Signed in as ${account.email}`} description="Only you see this address. It’s never published, and it’s kept encrypted on this computer.">
                <Button variant="outline" onClick={() => void window.chromeAPI.account.signOut().then(setAccount)}>Sign out</Button>
            </SettingsRow>
            {account.problem && <p role="alert" className="py-4 text-13 text-warning">{account.problem}</p>}
            <PublishedList />
        </>
    )
}
