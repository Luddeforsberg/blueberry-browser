import React, { useEffect, useState } from 'react'
import { ArrowRight, Bird, Hand, RefreshCw, SlidersHorizontal } from 'lucide-react'
import type { TabInfo, Visit } from '@shared/ipc'
import type { Suggestion } from '@shared/library'
import { BerryDot } from '@common/components/Mascot'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Favicon } from '../components/Favicon'
import { useAssistantName } from '../components/Berry'
import { Composer } from '../components/Composer'
import { ArtBlueberry } from '../components/ArtBlueberry'
import { Backdrop } from '../components/Backdrop'
import { BirdSuggestions } from '../components/BirdSuggestions'
import { setFlockView, suggestedMascot } from '../flockView'
import { setRoutinesView, suggestedForm } from '../routinesView'
import { looksLikeUrl, toUrl } from '@common/lib/url'
import { cn } from '@common/lib/utils'

const TRAY_BUTTON = cn(
    "flex items-center gap-2 h-8 px-2.5 rounded-control text-14 text-muted-foreground outline-none transition-colors",
    "hover:text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
)

const WORK_CARDS = 3

const timeOf = (visitedAt: number) =>
    new Date(visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// A heading, one smart input and recent work. Recent only lists pages really visited.
export const NewTabPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const [text, setText] = useState('')
    const [recent, setRecent] = useState<Visit[]>([])
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    // A prompt put in the composer: moves the keyboard there, and goes away once it's been sent.
    const [filled, setFilled] = useState<{ id: string; times: number } | null>(null)
    const browser = window.chromeAPI.browser
    const library = useLibrary()
    const { layout, theme } = useShell()
    const { chosen, choose } = useFlock()

    useEffect(() => {
        browser.getRecent().then(setRecent).catch(() => setRecent([]))
    }, [browser])

    // Saved cards, at once. New ones arrive when they're written, and the page never waits for them.
    useEffect(() => {
        const { list, onUpdated } = window.chromeAPI.suggestions
        void list().then(setSuggestions)
        return onUpdated(setSuggestions)
    }, [])

    const takeUp = (suggestion: Suggestion) => {
        if (suggestion.kind === 'prompt') {
            setText(suggestion.prompt)
            setFilled({ id: suggestion.id, times: (filled?.times ?? 0) + 1 })
        } else if (suggestion.kind === 'routine') {
            setRoutinesView({ page: 'form', values: suggestedForm(suggestion.draft, suggestion.id) })
            void browser.openPage('routines')
        } else {
            setFlockView({ page: 'form', values: suggestedMascot(suggestion.draft, suggestion.id) })
            void browser.openPage('flock')
        }
    }

    const dismiss = (id: string) => void window.chromeAPI.suggestions.dismiss(id).then(setSuggestions)

    const askBerry = async (message: string) => {
        if (filled) void window.chromeAPI.suggestions.dismiss(filled.id)
        const chat = await window.chromeAPI.chat.send(null, message, { seePage: false, mascotId: chosen.id })
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

    const name = useAssistantName(chosen)
    const isBerry = name !== 'Assistant'

    const TRAY = [
        { label: 'Needs you', Icon: Hand, onClick: () => browser.openPage('needs-you') },
        { label: 'Routines', Icon: RefreshCw, onClick: () => browser.openPage('routines') },
        { label: 'Flock', Icon: Bird, onClick: () => browser.openPage('flock') }
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

    // Real work only: chats and routines from the library. With none, the ideas take their place.
    const work = [
        ...library.chats.map((chat) => ({
            id: chat.id,
            meta: 'Chat',
            title: chat.title,
            detail: null as string | null,
            running: false,
            onClick: () => browser.openPage('chat', { param: chat.id, title: chat.title })
        })),
        ...library.routines.map((routine) => ({
            id: routine.id,
            meta: routine.schedule,
            title: routine.name,
            detail: routine.lastResult,
            running: routine.status === 'running',
            onClick: () => browser.openPage('routines')
        }))
    ].slice(0, WORK_CARDS)

    const glass = theme.glass ? "bg-surface/90 backdrop-blur-xl" : "bg-surface"
    const cardClass = cn(
        "flex flex-col p-4 rounded-panel shadow-card text-left outline-none transition-colors",
        "hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring",
        glass
    )

    return (
        <div className="relative h-full overflow-y-auto">
            <div className="relative min-h-full overflow-hidden">
                <Backdrop quiet={suggestions.length > 0} />
                <div className="relative max-w-[800px] mx-auto px-6 pt-[22vh] pb-12">
                    <h1 className="sr-only">Where shall we start today?</h1>
                    {/* Room for Berry, who stands on the composer's top edge. */}
                    {isBerry && <div className="h-[84px]" />}

                    <div data-berry-home className="relative z-10 rounded-composer">
                        <Composer
                            label={`Search, enter a URL, or ask ${isBerry ? name : 'a question'}`}
                            placeholder={isBerry ? `Ask ${name} anything, or enter a URL…` : 'Ask anything, or enter a URL…'}
                            value={text}
                            onChange={(next) => {
                                setText(next)
                                // Emptied, it's no longer that prompt being sent.
                                if (!next.trim()) setFilled(null)
                            }}
                            onKeyDown={handleKeyDown}
                            spellCheck={false}
                            autoFocus
                            focusKey={filled?.times}
                            canSend={text.trim().length > 0}
                            onSend={() => submit(false)}
                            mascot={chosen}
                            onChooseMascot={choose}
                        />
                    </div>
                    {/* The sidebar holds these when it's open. Frosted, so a bird walking behind the page can't cross a label. */}
                    {!layout.sidebarOpen && (
                        <div className={cn("relative z-10 flex items-center gap-1 h-11 px-2 mt-1 rounded-card", theme.glass ? "bg-canvas/70 backdrop-blur-xl" : "bg-canvas")}>
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
                    )}

                    {/* Suggestions sit nearer the composer, so they're in view on an ordinary window. It stays where it is. */}
                    <div className={cn("relative", suggestions.length > 0 ? "mt-8" : "mt-12 pt-[210px]")}>
                        <ArtBlueberry dark={theme.isDark} className="absolute left-1/2 top-0 max-w-none -translate-x-1/2 pointer-events-none" />

                        {suggestions.length > 0 ? (
                            <section aria-labelledby="suggestions-heading" className="relative">
                                <h2 id="suggestions-heading" className="sr-only">Things you repeat</h2>
                                <BirdSuggestions suggestions={suggestions} onUse={takeUp} onDismiss={dismiss} />
                            </section>
                        ) : work.length > 0 ? (
                            <section aria-labelledby="work-heading" className="relative">
                                <h2 id="work-heading" className="sr-only">Your work</h2>
                                <div className="grid grid-cols-3 gap-3">
                                    {work.map(({ id, meta, title, detail, running, onClick }) => (
                                        <button key={id} type="button" onClick={() => void onClick()} className={cardClass}>
                                            <span className="flex items-center justify-between gap-2 text-12 text-muted-foreground">
                                                <span className="truncate">{meta}</span>
                                                {running && <BerryDot working />}
                                            </span>
                                            <span className="mt-1 block text-14 font-semibold truncate">{title}</span>
                                            {running && <span className="sr-only">Running now</span>}
                                            {detail && <span className="mt-1 block text-13 text-muted-foreground line-clamp-2">{detail}</span>}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ) : (
                            <section aria-labelledby="ideas-heading" className="relative">
                                <h2 id="ideas-heading" className="sr-only">Some ideas</h2>
                                <div className="grid grid-cols-2 gap-3">
                                    {IDEAS.map(({ Icon, title, text: body, action, onClick }) => (
                                        <button key={title} type="button" onClick={() => void onClick()} className={cn("group/idea", cardClass)}>
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
                        )}

                {recent.length > 0 && (
                    <section aria-labelledby="recent-heading" className={cn("relative p-2 rounded-panel shadow-card", suggestions.length > 0 ? "mt-8" : "mt-3", glass)}>
                        <h2 id="recent-heading" className="px-2 py-1 text-14 text-muted-foreground">
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
            </div>
        </div>
    )
}
