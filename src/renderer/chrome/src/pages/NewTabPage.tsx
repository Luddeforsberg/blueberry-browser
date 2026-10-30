import React, { useEffect, useState } from 'react'
import { ArrowRight, Lightbulb, MessageCircle, RefreshCw, SlidersHorizontal } from 'lucide-react'
import type { TabInfo, Visit } from '@shared/ipc'
import { Favicon } from '../components/Favicon'
import { BerryHero, useAssistantName } from '../components/Berry'
import { Composer } from '../components/Composer'
import { Backdrop } from '../components/Backdrop'
import { looksLikeUrl, toUrl } from '@common/lib/url'
import { cn } from '@common/lib/utils'

const TRAY_BUTTON = cn(
    "flex items-center gap-2 h-8 px-2.5 rounded-control text-14 text-muted-foreground outline-none transition-colors",
    "hover:text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
)

const timeOf = (visitedAt: number) =>
    new Date(visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// A heading, one smart input and recent work. Recent only lists pages really visited.
export const NewTabPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const [text, setText] = useState('')
    const [recent, setRecent] = useState<Visit[]>([])
    const browser = window.chromeAPI.browser

    useEffect(() => {
        browser.getRecent().then(setRecent).catch(() => setRecent([]))
    }, [browser])

    const askBerry = async (message: string) => {
        const chat = await window.chromeAPI.library.sendChat(null, message)
        if (!chat) return
        await browser.openPage('chat', { param: chat.id, title: chat.title })
        await browser.closeTab(tab.id)
    }

    const ask = () => {
        if (text.trim()) void askBerry(text.trim())
    }

    // Plain Enter opens an address and asks Berry anything else. ⌘Enter always asks.
    const submit = (alwaysAsk: boolean) => {
        if (!text.trim()) return
        if (alwaysAsk || !looksLikeUrl(text)) ask()
        else void browser.navigateTab(tab.id, toUrl(text))
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        submit(e.metaKey || e.ctrlKey)
    }

    const name = useAssistantName()
    const isBerry = name === 'Berry'

    const TRAY = [
        { label: 'Routines', Icon: RefreshCw, onClick: () => browser.openPage('routines') },
        { label: 'New chat', Icon: MessageCircle, onClick: () => browser.openPage('chat') }
    ]

    const IDEAS = [
        {
            Icon: RefreshCw,
            title: 'Put something on a schedule',
            text: isBerry ? 'Hand Berry a task that repeats, and it reports back when it’s done.' : 'Set up a task that repeats, with results waiting for you.',
            action: 'See routines',
            onClick: () => browser.openPage('routines')
        },
        {
            Icon: SlidersHorizontal,
            title: 'Make the browser yours',
            text: 'Choose your tab layout and theme, and what stays on this computer.',
            action: 'Open settings',
            onClick: () => browser.openPage('settings')
        }
    ]

    return (
        <div className="relative h-full overflow-y-auto">
            <Backdrop />
            <div className="relative max-w-[640px] mx-auto px-6 pt-[13vh] pb-12">
                <BerryHero title="Where shall we start today?" />

                <div className="rounded-composer bg-tray">
                    <Composer
                        label={`Search, enter a URL, or ask ${isBerry ? 'Berry' : 'a question'}`}
                        placeholder={isBerry ? 'Ask Berry anything, or enter a URL…' : 'Ask anything, or enter a URL…'}
                        value={text}
                        onChange={setText}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        autoFocus
                        canSend={text.trim().length > 0}
                        onSend={() => submit(false)}
                    />
                    <div className="flex items-center gap-1 h-11 px-3">
                        {TRAY.map(({ label, Icon, onClick }) => (
                            <button key={label} type="button" onClick={() => void onClick()} className={TRAY_BUTTON}>
                                <Icon className="size-4" />
                                {label}
                            </button>
                        ))}
                        <div className="flex-1" />
                        <button type="button" onClick={() => void browser.openPage('settings')} className={TRAY_BUTTON}>
                            <SlidersHorizontal className="size-4" />
                            Settings
                        </button>
                    </div>
                </div>

                <section aria-labelledby="ideas-heading" className="mt-6">
                    <h2 id="ideas-heading" className="flex items-center gap-2 px-1 pb-2.5 text-14 text-muted-foreground">
                        <Lightbulb className="size-4" />
                        Some ideas
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        {IDEAS.map(({ Icon, title, text: body, action, onClick }) => (
                            <button
                                key={title}
                                type="button"
                                onClick={() => void onClick()}
                                className={cn(
                                    "group/idea p-4 rounded-panel bg-card border border-transparent dark:border-border text-left outline-none",
                                    "hover:border-border transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                                )}
                            >
                                <Icon className="size-5 text-muted-foreground" />
                                <span className="mt-2.5 block text-14 font-semibold">{title}</span>
                                <span className="mt-1 block text-13 text-muted-foreground">{body}</span>
                                <span className="mt-2.5 flex items-center gap-1.5 text-13">
                                    {action}
                                    <ArrowRight className="size-3.5 transition-transform group-hover/idea:translate-x-0.5" />
                                </span>
                            </button>
                        ))}
                    </div>
                </section>

                {recent.length > 0 && (
                    <section aria-labelledby="recent-heading" className="mt-6">
                        <h2 id="recent-heading" className="px-1 pb-1.5 text-14 text-muted-foreground">
                            Recent
                        </h2>
                        <ul>
                            {recent.slice(0, 5).map((visit) => (
                                <li key={visit.url}>
                                    <button
                                        type="button"
                                        onClick={() => void browser.navigateTab(tab.id, visit.url)}
                                        className={cn(
                                            "w-full h-9 px-2 flex items-center gap-3 rounded-control text-14 text-left",
                                            "hover:bg-muted outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                                        )}
                                    >
                                        <Favicon src={visit.favicon} />
                                        <span className="flex-1 truncate">{visit.title}</span>
                                        <span className="text-12 text-muted-foreground tabular-nums">
                                            {timeOf(visit.visitedAt)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    )
}
