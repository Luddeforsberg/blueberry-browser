import React, { useState } from 'react'
import type { TabInfo } from '@shared/ipc'
import type { NeedsYouItem } from '@shared/library'
import { cn } from '@common/lib/utils'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Berry, useAssistantName } from '../components/Berry'
import { AnsweredRow, NeedsYouRow, PhonePreview } from '../components/NeedsYou'

const ANSWERED_MS = 1600
// Past this the phone goes under the rows rather than beside them.
const PHONE_BESIDE_WIDTH = 860

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

// Everything the flock is waiting on, from every chat and routine, answered right here.
export const NeedsYouPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { needsYou } = useLibrary()
    const { layout } = useShell()
    const [answered, setAnswered] = useState<{ item: NeedsYouItem; said: string }[]>([])
    const beside = layout.page.width >= PHONE_BESIDE_WIDTH

    const onAnswered = (item: NeedsYouItem) => (said: string) => {
        setAnswered((list) => [...list, { item, said }])
        setTimeout(() => setAnswered((list) => list.filter((entry) => entry.item.approval.id !== item.approval.id)), ANSWERED_MS)
    }

    const waiting = needsYou.filter((item) => !answered.some((entry) => entry.item.approval.id === item.approval.id))
    // A phone is for a tap, so the phone shows the first plain yes or no it can.
    const onPhone = waiting.find(({ approval }) => !approval.question && !approval.handoff) ?? waiting[0] ?? null
    const rows = [
        ...waiting.map((item) => ({ item, said: null as string | null })),
        ...answered
    ].sort((a, b) => a.item.askedAt - b.item.askedAt)

    return (
        <div className="h-full overflow-y-auto">
            <div className={cn("mx-auto px-8 py-10", rows.length > 0 && beside ? "max-w-5xl" : "max-w-3xl")}>
                <h1 className="text-20 font-semibold">Needs you</h1>
                <p className="mt-1 text-14 text-muted-foreground">What your flock can’t finish without you. Everything else keeps going.</p>

                {rows.length === 0 ? (
                    <AllClear />
                ) : (
                    <div className={cn("mt-6 flex gap-8", beside ? "items-start" : "flex-col items-center")}>
                        <ul aria-label="Waiting for you" className="min-w-0 w-full flex-1 flex flex-col gap-3">
                            {rows.map(({ item, said }) =>
                                said === null ? (
                                    <NeedsYouRow key={item.approval.id} item={item} onAnswered={onAnswered(item)} highlighted={tab.pageParam === item.approval.id} />
                                ) : (
                                    <AnsweredRow key={item.approval.id} item={item} said={said} />
                                )
                            )}
                        </ul>
                        <PhonePreview item={onPhone} onAnswered={onPhone ? onAnswered(onPhone) : () => undefined} />
                    </div>
                )}
            </div>
        </div>
    )
}
