import React, { useEffect, useRef, useState } from 'react'
import type { TabInfo } from '@shared/ipc'
import type { NeedsYouItem } from '@shared/library'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { Berry, useAssistantName } from '../components/Berry'
import { AnsweredRow, NeedsYouRow } from '../components/NeedsYou'
import { usePhone } from '../usePhone'

const ANSWERED_MS = 1600

const MAX_RESTING = 6

// Nothing waiting. Anyone working says so, because "resting" has to be true.
const AllClear: React.FC = () => {
    const { chats, routines } = useLibrary()
    const { flock, find } = useFlock()
    const working = new Set([
        ...chats.filter((chat) => chat.running).map((chat) => find(chat.mascotId).id),
        ...routines.filter((routine) => routine.status === 'running').map((routine) => find(routine.mascotId).id)
    ])
    const anyone = useAssistantName(flock.find((mascot) => working.has(mascot.id)))

    return (
        <div className="mt-20 flex flex-col items-center gap-5 text-center">
            <ul aria-hidden className="flex items-end justify-center gap-3">
                {flock.slice(0, MAX_RESTING).map((mascot) => (
                    <li key={mascot.id}>
                        <Berry mood={working.has(mascot.id) ? 'fetching' : 'off-duty'} size={88} mascot={mascot} />
                    </li>
                ))}
            </ul>
            <div>
                <p className="text-16">Nothing needs you right now.</p>
                <p className="mt-1 text-14 text-muted-foreground">
                    {working.size === 0
                        ? 'The flock is resting. If a job gets stuck, it waits here.'
                        : `${working.size === 1 ? `${anyone} is` : `${working.size} of them are`} working. If a job gets stuck, it waits here.`}
                </p>
            </div>
        </div>
    )
}

// One true line about the phone, or a quiet way to set it up.
const PhoneLine: React.FC = () => {
    const [phone] = usePhone()
    const openSettings = () => void window.chromeAPI.browser.openPage('settings', { param: 'Phone' })
    const link = "text-13 text-muted-foreground rounded-control outline-none underline-offset-2 hover:underline hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    if (phone.status === 'connected' && !phone.problem) return <p className="text-13 text-muted-foreground">Replies from your phone are on</p>
    if (phone.status === 'connected') return <button type="button" onClick={openSettings} className={link}>Replies from your phone are paused</button>
    return <button type="button" onClick={openSettings} className={link}>Answer these from your phone</button>
}

// Everything the flock is waiting on, from every chat and routine, answered right here.
export const NeedsYouPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { needsYou } = useLibrary()
    const [answered, setAnswered] = useState<{ item: NeedsYouItem; said: string }[]>([])

    const onAnswered = (item: NeedsYouItem) => (said: string) => {
        setAnswered((list) => [...list, { item, said }])
        setTimeout(() => setAnswered((list) => list.filter((entry) => entry.item.approval.id !== item.approval.id)), ANSWERED_MS)
    }

    // An answer from the phone may arrive after its row has gone from the list, so rows are remembered for it.
    const seen = useRef(new Map<string, NeedsYouItem>())
    needsYou.forEach((item) => seen.current.set(item.approval.id, item))
    const latestOnAnswered = useRef(onAnswered)
    latestOnAnswered.current = onAnswered
    useEffect(
        () =>
            window.chromeAPI.phone.onAnswered(({ approvalId, said }) => {
                const item = seen.current.get(approvalId)
                if (item) latestOnAnswered.current(item)(said)
            }),
        []
    )

    const waiting = needsYou.filter((item) => !answered.some((entry) => entry.item.approval.id === item.approval.id))
    const rows = [
        ...waiting.map((item) => ({ item, said: null as string | null })),
        ...answered
    ].sort((a, b) => a.item.askedAt - b.item.askedAt)

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-10">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <h1 className="text-20 font-semibold">Needs you</h1>
                    <PhoneLine />
                </div>

                {rows.length === 0 ? (
                    <AllClear />
                ) : (
                    <>
                        <ul aria-label="Waiting for you" className="mt-4 border-y divide-y">
                            {rows.map(({ item, said }) =>
                                said === null ? (
                                    <NeedsYouRow key={item.approval.id} item={item} onAnswered={onAnswered(item)} highlighted={tab.pageParam === item.approval.id} />
                                ) : (
                                    <AnsweredRow key={item.approval.id} item={item} said={said} />
                                )
                            )}
                        </ul>
                        <p className="mt-3 text-12 text-muted-foreground">Passwords and codes go in the page, not through the model.</p>
                    </>
                )}
            </div>
        </div>
    )
}
