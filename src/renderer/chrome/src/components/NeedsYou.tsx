import React, { useState } from 'react'
import type { NeedsYouItem } from '@shared/library'
import { Button } from '@common/components/Button'
import { ExactWords } from '@common/components/ApprovalCard'
import { BerryDot } from '@common/components/Mascot'
import { cn } from '@common/lib/utils'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { setRoutinesView } from '../routinesView'
import { withSiteNames } from '../siteNames'
import { Berry, useAssistantName } from './Berry'

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

// Everything but the main action, until the row has the pointer or the keyboard. They can still be tabbed to.
const QUIETLY = "opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"

const QuestionBox: React.FC<{ name: string; onAnswer: (words: string) => void }> = ({ name, onAnswer }) => {
    const [answer, setAnswer] = useState('')
    return (
        <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(event) => {
                event.preventDefault()
                if (answer.trim()) onAnswer(answer)
            }}
        >
            <input
                aria-label={`Your answer to ${name}`}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                className="min-w-0 flex-1 h-8 rounded-card border bg-surface px-3 text-13 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button size="sm" type="submit" disabled={!answer.trim()}>Answer</Button>
        </form>
    )
}

// One line of the list: what's being asked, first and in plain words, with who and what for underneath.
export const NeedsYouRow: React.FC<{ item: NeedsYouItem; onAnswered: OnAnswered; highlighted?: boolean }> = ({ item, onAnswered, highlighted = false }) => {
    const mascot = useFlock().find(item.mascotId)
    const name = useAssistantName(mascot)
    const { tabs, switchTab } = useBrowser()
    const browser = window.chromeAPI.browser
    const { id, approval } = item
    const { handoff, question } = approval
    const canGoToTab = item.tabId !== null && tabs.some((tab) => tab.id === item.tabId)
    const onThatTab = !!handoff && tabs.some((tab) => tab.id === handoff.tabId && tab.isActive)
    // Rows name sites. The exact words stay beside them, because that's what is being allowed.
    const shortened = withSiteNames(approval.text)

    const send = (allow: boolean, said: string, words?: string) => {
        onAnswered(said)
        void window.chromeAPI.chat.decide(id, approval.id, allow, words)
    }
    const openJob = () => {
        if (item.routineId) {
            setRoutinesView({ page: 'detail', id: item.routineId })
            void browser.openPage('routines')
        } else {
            void browser.openPage('chat', { param: id, title: item.job })
        }
    }
    const goToTab = () => void switchTab(item.tabId!)
    const done = () => send(true, `${name} has the tab back.`)

    return (
        <li
            ref={(node) => {
                if (node && highlighted) node.scrollIntoView({ block: 'nearest' })
            }}
            aria-label={`${name} is asking`}
            className={cn("group py-3 animate-fade-in", highlighted && "bg-muted -mx-3 px-3 rounded-card")}
        >
            <div className="flex items-start gap-3">
                <Berry mood="asking" size={32} mascot={mascot} className="shrink-0" />
                <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <h2 className="pt-0.5 text-16">{shortened}</h2>
                    {shortened !== approval.text && <ExactWords className="mt-2">{approval.text}</ExactWords>}
                    {question && <QuestionBox name={name} onAnswer={(words) => send(true, `Answered. ${name} carries on.`, words)} />}
                    <div className="mt-1 min-h-7 flex flex-wrap items-center gap-x-1.5 text-12 text-muted-foreground">
                        <span className="min-w-0 truncate">{name} · {item.job}{item.from && ` · from ${item.from}`} · <span className="tabular-nums">{askedAgo(item.askedAt)}</span></span>
                        <span className={cn("ml-auto flex items-center", QUIETLY)}>
                            {!handoff && canGoToTab && <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={goToTab}>Go to the tab</Button>}
                            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={openJob}>{item.routineId ? 'Open the routine' : 'Open the chat'}</Button>
                            {question && <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => send(false, `Skipped. ${name} carries on without it.`)}>Skip</Button>}
                            {handoff && !onThatTab && <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={done}>I’m done</Button>}
                            {handoff && <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => send(false, `${name} carries on without it.`)}>Not now</Button>}
                            {!question && !handoff && <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => send(false, `Not allowed, and ${name} knows.`)}>Don’t allow</Button>}
                        </span>
                    </div>
                </div>
                {!question && !handoff && <Button size="sm" className="shrink-0" onClick={() => send(true, `Allowed. ${name} carries on.`)}>Allow</Button>}
                {handoff && onThatTab && <Button size="sm" className="shrink-0" onClick={done}>I’m done</Button>}
                {handoff && !onThatTab && canGoToTab && <Button size="sm" variant="outline" className="shrink-0" onClick={goToTab}>Go to the tab</Button>}
            </div>
        </li>
    )
}

// The moment after an answer, before the row goes.
export const AnsweredRow: React.FC<{ item: NeedsYouItem; said: string }> = ({ item, said }) => {
    const mascot = useFlock().find(item.mascotId)
    return (
        <li role="status" className="flex items-center gap-2 py-3 text-14 text-muted-foreground motion-safe:animate-answered">
            <Berry mood="fetching" size={24} mascot={mascot} className="shrink-0" />
            {said}
        </li>
    )
}
