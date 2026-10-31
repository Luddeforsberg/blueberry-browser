import React, { useEffect, useState } from 'react'
import type { NeedsYouItem } from '@shared/library'
import { Button } from '@common/components/Button'
import { BerryDot } from '@common/components/Mascot'
import { cn } from '@common/lib/utils'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { setRoutinesView } from '../routinesView'
import { Berry, useAssistantName } from './Berry'
import { HandoffActions, handoffNote } from './ChatMessage'

// Whatever answers an item says so at once, because the page keeps the row for a moment in those words.
type OnAnswered = (said: string) => void

const askedAgo = (at: number) => {
    const minutes = Math.floor((Date.now() - at) / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} min ago`
    return `${Math.floor(minutes / 60)} h ago`
}

// The count on the sidebar row. It holds nothing at all when nothing is waiting.
export const NeedsYouCount: React.FC = () => {
    const count = useLibrary().needsYou.length
    if (count === 0) return null
    return (
        <span className="flex items-center gap-1.5 text-13 text-foreground">
            <BerryDot />
            {count}
            <span className="sr-only"> waiting for you</span>
        </span>
    )
}

// For when there's no sidebar to say it.
export const NeedsYouNotice: React.FC = () => {
    const { activeTab } = useBrowser()
    const count = useLibrary().needsYou.length
    if (count === 0 || activeTab?.page === 'needs-you') return null
    return (
        <button
            type="button"
            onClick={() => void window.chromeAPI.browser.openPage('needs-you')}
            className="h-7 px-2 shrink-0 flex items-center gap-2 rounded-control text-13 outline-none transition-colors app-region-no-drag hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
            <BerryDot />
            {count === 1 ? '1 thing needs you' : `${count} things need you`}
        </button>
    )
}

// On a tab the user has been handed, in any layout, since that's where they'll be when they finish.
export const HandoffNotice: React.FC = () => {
    const { activeTab } = useBrowser()
    const { find } = useFlock()
    const item = useLibrary().needsYou.find(({ approval }) => !!activeTab && approval.handoff?.tabId === activeTab.id)
    const mascot = item ? find(item.mascotId) : undefined
    const name = useAssistantName(mascot)
    if (!item) return null
    return (
        <div className="h-8 shrink min-w-0 flex items-center gap-2 pl-2 text-13 app-region-no-drag">
            <Berry mood="asking" size={24} mascot={mascot} className="shrink-0" />
            <span className="truncate">{name} can’t see this tab</span>
            <Button size="xs" className="px-3" onClick={() => void window.chromeAPI.chat.decide(item.id, item.approval.id, true)}>I’m done</Button>
        </div>
    )
}

// What an item can be told, wherever it shows. These are the same `chat:decide` as the card in a chat.
const AskControls: React.FC<{ item: NeedsYouItem; onAnswered: OnAnswered }> = ({ item, onAnswered }) => {
    const { id, approval } = item
    const mascot = useFlock().find(item.mascotId)
    const name = useAssistantName(mascot)
    const [answer, setAnswer] = useState('')
    const send = (allow: boolean, said: string, words?: string) => {
        onAnswered(said)
        void window.chromeAPI.chat.decide(id, approval.id, allow, words)
    }

    if (approval.handoff) return <HandoffActions chatId={id} approval={approval} mascot={mascot} onAnswered={onAnswered} />
    if (approval.question) {
        return (
            <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                    event.preventDefault()
                    if (answer.trim()) send(true, `Answered. ${name} carries on.`, answer)
                }}
            >
                <input
                    aria-label={`Your answer to ${name}`}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    className="min-w-0 flex-1 basis-40 h-8 rounded-card border bg-canvas px-3 text-13 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button size="sm" type="submit" disabled={!answer.trim()}>Answer</Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => send(false, `Skipped. ${name} carries on without it.`)}>Skip</Button>
            </form>
        )
    }
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => send(true, `Allowed. ${name} carries on.`)}>Allow</Button>
            <Button size="sm" variant="outline" onClick={() => send(false, `Not allowed, and ${name} knows.`)}>Don’t allow</Button>
        </div>
    )
}

const noteFor = ({ approval }: NeedsYouItem, name: string) => {
    if (approval.handoff) return handoffNote(name)
    return approval.question ? 'Don’t type passwords or codes here.' : 'Nothing happens until you allow it.'
}

// One thing waiting: who, on what, and exactly what it's asking, with the answer right here.
export const NeedsYouRow: React.FC<{ item: NeedsYouItem; onAnswered: OnAnswered; highlighted?: boolean }> = ({ item, onAnswered, highlighted = false }) => {
    const mascot = useFlock().find(item.mascotId)
    const name = useAssistantName(mascot)
    const { tabs, switchTab } = useBrowser()
    const browser = window.chromeAPI.browser
    const { handoff } = item.approval
    const canGoToTab = item.tabId !== null && !handoff && tabs.some((tab) => tab.id === item.tabId)

    const openJob = () => {
        if (item.routineId) {
            setRoutinesView({ page: 'detail', id: item.routineId })
            void browser.openPage('routines')
        } else {
            void browser.openPage('chat', { param: item.id, title: item.job })
        }
    }

    return (
        <li
            ref={(node) => {
                if (node && highlighted) node.scrollIntoView({ block: 'nearest' })
            }}
            aria-label={`${name} is asking`}
            className={cn("flex gap-4 p-4 rounded-panel border bg-surface shadow-card animate-fade-in", highlighted && "ring-2 ring-ring")}
        >
            <Berry mood="asking" size={64} mascot={mascot} className="shrink-0" />
            <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <p className="flex items-baseline gap-2 text-13 text-muted-foreground">
                    <span className="font-semibold text-foreground">{name}</span>
                    <span className="min-w-0 truncate">{item.job}</span>
                    <span className="ml-auto shrink-0 text-12 tabular-nums">{askedAgo(item.askedAt)}</span>
                </p>
                <h2 className="mt-1 text-16">{item.approval.text}</h2>
                <p className="mt-1 text-12 text-muted-foreground">
                    {noteFor(item, name)}
                    {item.lastStep && !handoff && ` Last step: ${item.lastStep.toLowerCase()}.`}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <AskControls item={item} onAnswered={onAnswered} />
                    <span className="flex items-center gap-1">
                        {canGoToTab && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void switchTab(item.tabId!)}>Go to the tab</Button>}
                        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={openJob}>{item.routineId ? 'Open the routine' : 'Open the chat'}</Button>
                    </span>
                </div>
            </div>
        </li>
    )
}

// The moment after an answer, before the row goes.
export const AnsweredRow: React.FC<{ item: NeedsYouItem; said: string }> = ({ item, said }) => {
    const mascot = useFlock().find(item.mascotId)
    return (
        <li role="status" className="flex items-center gap-3 px-4 py-3 rounded-panel border bg-surface text-14 text-muted-foreground motion-safe:animate-answered">
            <Berry mood="fetching" size={32} mascot={mascot} className="shrink-0" />
            {said}
        </li>
    )
}

const useClock = () => {
    const [now, setNow] = useState(() => new Date())
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30_000)
        return () => clearInterval(timer)
    }, [])
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// A picture of what a phone notification could be, clearly labelled. There is no phone app, but its buttons really answer.
export const PhonePreview: React.FC<{ item: NeedsYouItem | null; onAnswered: OnAnswered }> = ({ item, onAnswered }) => {
    const { find } = useFlock()
    const mascot = item ? find(item.mascotId) : undefined
    const name = useAssistantName(mascot)
    const clock = useClock()

    return (
        <aside aria-label="Coming to your phone: a preview" className="w-[248px] shrink-0">
            <div className="p-1.5 rounded-[40px] bg-foreground dark:bg-border shadow-float">
                <div className="relative h-[460px] rounded-[34px] overflow-hidden bg-frame">
                    <div aria-hidden className="absolute top-2.5 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-foreground dark:bg-border" />
                    <p aria-hidden className="pt-14 text-center text-[44px] leading-none font-semibold tabular-nums tracking-tight">{clock}</p>
                    <div className="absolute inset-x-2 bottom-3">
                        {item ? (
                            <section key={item.approval.id} aria-label="Preview notification" className="p-3 rounded-panel bg-surface shadow-float animate-fade-in [overflow-wrap:anywhere]">
                                <p className="flex items-center gap-1.5 text-11 text-muted-foreground">
                                    <BerryDot />
                                    Blueberry
                                    <span className="ml-auto">now</span>
                                </p>
                                <div className="mt-2 flex gap-2">
                                    <Berry mood="asking" size={40} mascot={mascot} className="shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-13 font-semibold">{name}</p>
                                        <p className="text-12 line-clamp-5">{item.approval.text}</p>
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <AskControls item={item} onAnswered={onAnswered} />
                                </div>
                            </section>
                        ) : (
                            <p role="status" className="pb-6 text-center text-13 text-muted-foreground">Nothing waiting</p>
                        )}
                    </div>
                </div>
            </div>
            <p className="mt-3 text-13 font-semibold text-center">Coming to your phone</p>
            <p className="mt-1 text-12 text-muted-foreground text-center">A preview. There’s no phone app yet, but these buttons really answer.</p>
        </aside>
    )
}
