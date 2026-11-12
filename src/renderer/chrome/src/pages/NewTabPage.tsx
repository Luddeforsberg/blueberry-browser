import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CircleAlert, RefreshCw, SlidersHorizontal } from 'lucide-react'
import type { TabInfo, Visit } from '@shared/ipc'
import type { MascotProfile, Suggestion } from '@shared/library'
import { BERRY_ID } from '@shared/mascots'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Berry, useAssistantName } from '../components/Berry'
import { Composer } from '../components/Composer'
import { NewTabTray, type TrayLine } from '../components/NewTabTray'
import { FlockIcon } from '../components/icons'
import { useCloud } from '../useCloud'
import { useRunner } from '../useRunner'
import { blankMascot, setFlockView, suggestedMascot } from '../flockView'
import { setRoutinesView, suggestedForm } from '../routinesView'
import { Valley } from '../valley/Valley'
import { lightFor } from '../valley/light'
import type { ValleyBanks, ValleyBox } from '../valley/painter'
import { looksLikeUrl, toUrl } from '@common/lib/url'
import { cn } from '@common/lib/utils'

const RECENT_PAGES = 5
// The perched bird, smaller in a small window. The resting birds are two thirds and half of it.
const PERCH = { large: 76, small: 56 }
const SMALL_BELOW = 760
// Where the feet are in a standing drawing, as shares of its size.
const FEET_X = 57 / 120
const FEET_Y = 113 / 120

// Saved suggestions at once, and new ones when they're written. A list that arrives after an update, or after the page
// has gone, is dropped, and so is an answer to Not now that an update has overtaken.
const useSuggestions = () => {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const version = useRef(0)
    const alive = useRef(true)
    useEffect(() => {
        alive.current = true
        const { list, onUpdated } = window.chromeAPI.suggestions
        const asked = version.current
        const off = onUpdated((next) => {
            version.current++
            if (alive.current) setSuggestions(next)
        })
        void list().then((first) => {
            if (alive.current && version.current === asked) setSuggestions(first)
        })
        return () => {
            alive.current = false
            off()
        }
    }, [])
    const dismiss = (id: string) => {
        setSuggestions((current) => current.filter((suggestion) => suggestion.id !== id))
        const asked = ++version.current
        void window.chromeAPI.suggestions.dismiss(id).then((next) => {
            if (alive.current && version.current === asked) setSuggestions(next)
        })
    }
    return { suggestions, dismiss }
}

// Real pages only, asked once when the page opens.
const useRecent = () => {
    const [recent, setRecent] = useState<Visit[]>([])
    useEffect(() => {
        let alive = true
        window.chromeAPI.browser
            .getRecent()
            .then((visits) => alive && setRecent(visits.slice(0, RECENT_PAGES)))
            .catch(() => alive && setRecent([]))
        return () => {
            alive = false
        }
    }, [])
    return recent
}

// The birds you aren't talking to, the one used last first. Any past the two banks are in the picker and on Flock.
const restingBirds = (flock: MascotProfile[], chosenId: string, chats: { mascotId: string | null; updatedAt: number }[]) => {
    const lastUsed = (id: string) =>
        Math.max(0, ...chats.filter((chat) => (chat.mascotId ?? BERRY_ID) === id).map((chat) => chat.updatedAt))
    return flock
        .filter((mascot) => mascot.id !== chosenId)
        .map((mascot, index) => ({ mascot, used: lastUsed(mascot.id), index }))
        .sort((a, b) => b.used - a.used || a.index - b.index)
        .slice(0, 2)
        .map(({ mascot }) => mascot)
}

// A resting bird is a button of its own, and pressing it makes it the one on the box. Its name shows on hover and focus.
const RestingBird: React.FC<{ mascot: MascotProfile; size: number; at: { x: number; y: number }; faceLeft: boolean; onChoose: () => void }> = ({ mascot, size, at, faceLeft, onChoose }) => {
    const name = useAssistantName(mascot)
    return (
        <button
            type="button"
            aria-label={`Switch to ${name}`}
            onClick={onChoose}
            className="group absolute outline-none rounded-full focus-visible:ring-2 focus-visible:ring-scene-ink"
            style={{ left: at.x - size * FEET_X, top: at.y + 3 - size * FEET_Y, width: size, height: size }}
        >
            <span aria-hidden className="absolute h-1.5 rounded-full bg-berry-pupil/30 blur-[2px]" style={{ left: size * FEET_X - size * 0.22, width: size * 0.44, top: size * FEET_Y - 2 }} />
            <span className="block" style={{ transform: faceLeft ? 'scaleX(-1)' : undefined }}>
                <Berry size={size} mascot={mascot} grain />
            </span>
            <span
                aria-hidden
                className={cn(
                    "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 h-7 px-3 flex items-center whitespace-nowrap rounded-full bg-surface text-13 text-foreground shadow-float",
                    "opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                )}
            >
                Switch to {name}
            </span>
        </button>
    )
}

// The valley, and in it the box where every job starts, with the chosen bird perched on its top edge.
export const NewTabPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const [text, setText] = useState('')
    // A prompt put in the composer: moves the keyboard there, and goes away once it's been sent.
    const [filled, setFilled] = useState<{ id: string; times: number } | null>(null)
    const browser = window.chromeAPI.browser
    const library = useLibrary()
    const { layout, theme, settings } = useShell()
    const { flock, chosen, choose } = useFlock()
    const { suggestions, dismiss } = useSuggestions()
    const recent = useRecent()
    const [cloudState] = useCloud()
    // Only with a runner linked in Settings > Cloud, which has accepted, so nothing waits in a queue nobody takes from.
    const [runnerState] = useRunner()
    const canUseRunner = runnerState.status === 'linked'
    const canUseCloud = cloudState.status !== 'off'
    // Null follows the bird, which may work in the cloud. Another bird, chosen here or in the chat panel, goes back to
    // following it.
    const [cloudChoice, setCloudChoice] = useState<boolean | null>(null)
    useEffect(() => setCloudChoice(null), [chosen.id])
    const inCloud = (canUseRunner || canUseCloud) && (cloudChoice ?? chosen.worksInCloud === true)
    const light = lightFor(tab.id, theme.valleyLight)

    // The box the valley is composed around, in the page's own pixels.
    const page = useRef<HTMLDivElement>(null)
    const boxRef = useRef<HTMLDivElement>(null)
    const [box, setBox] = useState<ValleyBox | null>(null)
    const [width, setWidth] = useState(0)
    useLayoutEffect(() => {
        const node = page.current
        if (!node) return
        const measure = () => {
            const frame = node.getBoundingClientRect()
            const rect = boxRef.current?.getBoundingClientRect()
            setWidth(frame.width)
            if (rect) setBox({ top: rect.top - frame.top, left: rect.left - frame.left, right: rect.right - frame.left })
        }
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        measure()
        return () => observer.disconnect()
    }, [])
    const perch = width > 0 && width < SMALL_BELOW ? PERCH.small : PERCH.large

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

    const askBerry = async (message: string) => {
        if (filled) void window.chromeAPI.suggestions.used(filled.id)
        const chat = await window.chromeAPI.chat.send(null, message, {
            seePage: false,
            mascotId: chosen.id,
            // The runner keeps going with this computer off, so it's used whenever there is one. The user never picks.
            runner: inCloud && canUseRunner,
            cloud: inCloud && !canUseRunner && canUseCloud
        })
        if (!chat) return
        await browser.openPage('chat', { param: chat.id, title: chat.title })
        await browser.closeTab(tab.id)
    }

    // Plain Enter opens an address and asks the bird anything else. ⌘Enter always asks.
    const submit = (alwaysAsk: boolean) => {
        if (!text.trim()) return
        if (alwaysAsk || !looksLikeUrl(text)) void askBerry(text.trim())
        else void browser.navigateTab(tab.id, toUrl(text))
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        submit(e.metaKey || e.ctrlKey)
    }

    const name = useAssistantName(chosen)
    const hidden = !settings.showBerry
    const prompt = hidden ? 'Ask or search' : `Ask ${name} or search`

    // With no suggestion, a chat or routine to pick up, and with none of those, one idea that links to a real feature.
    const latestChat = [...library.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    const [routine] = library.routines
    const fallback: TrayLine = latestChat
        ? { kind: 'chat', words: latestChat.title, action: 'Open', actionLabel: `Open the chat: ${latestChat.title}`, onUse: () => void browser.openPage('chat', { param: latestChat.id, title: latestChat.title }) }
        : routine
          ? { kind: 'routine', words: `${routine.name} · ${routine.schedule}`, action: 'Open', actionLabel: `Open the routine: ${routine.name}`, onUse: () => void browser.openPage('routines') }
          : flock.length === 1
            ? {
                  kind: 'idea',
                  words: 'Make a bird for a job you repeat',
                  action: 'Set it up',
                  onUse: () => {
                      setFlockView({ page: 'form', values: blankMascot() })
                      void browser.openPage('flock')
                  }
              }
            : { kind: 'idea', words: 'Put a job you repeat on a schedule', action: 'Set it up', onUse: () => void browser.openPage('routines') }

    const LINKS = [
        { label: 'Needs you', Icon: CircleAlert, page: 'needs-you' as const },
        { label: 'Routines', Icon: RefreshCw, page: 'routines' as const },
        { label: 'Flock', Icon: FlockIcon, page: 'flock' as const },
        { label: 'Settings', Icon: SlidersHorizontal, page: 'settings' as const }
    ]
    const resting = hidden ? [] : restingBirds(flock, chosen.id, library.chats)

    const banks = (land: ValleyBanks | null) =>
        land &&
        resting.map((mascot, index) => (
            <RestingBird
                key={mascot.id}
                mascot={mascot}
                size={Math.round(perch * (index === 0 ? 0.66 : 0.5))}
                at={index === 0 ? land.left : land.right}
                faceLeft={index === 1}
                onChoose={() => choose(mascot.id)}
            />
        ))

    return (
        <div ref={page} data-light={light} className="relative h-full overflow-hidden">
            <h1 className="sr-only">Where shall we start today?</h1>
            <Valley light={light} box={box}>
                {banks}
            </Valley>
            {/* The top bar's part over the page sits on this, so its white icons and the window buttons read in every light. */}
            <div aria-hidden className="absolute inset-x-0 top-0 h-[104px] pointer-events-none bg-gradient-to-b from-scene-scrim/95 via-scene-scrim/65 via-45% to-scene-scrim/0" />

            <div className="absolute inset-x-0 top-[38.5%] flex flex-col items-center px-8 pointer-events-none">
                {/* The bird perches on this, outside the shadow the box and its tray share, so they read as one object. */}
                <div data-berry-home data-berry-perch-size={perch} className="relative w-full max-w-[680px] pointer-events-auto">
                    <div className="drop-shadow-lift">
                        <div ref={boxRef} className="relative z-10 rounded-composer shadow-lift">
                            <Composer
                                tall
                                label={prompt}
                                placeholder={prompt}
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
                                split
                                // Only where it's set up. The runner keeps going with the Mac off, and a cloud tab doesn't.
                                cloud={
                                    canUseRunner || canUseCloud
                                        ? {
                                              on: inCloud,
                                              onToggle: () => setCloudChoice(!inCloud),
                                              hint: canUseRunner ? 'Keeps going with your Mac off' : 'In a browser in the cloud, while this app is open'
                                          }
                                        : undefined
                                }
                            />
                        </div>
                        <NewTabTray
                            suggestions={suggestions}
                            fallback={fallback}
                            recent={recent}
                            typing={text.length > 0}
                            onUse={takeUp}
                            onDismiss={dismiss}
                            onOpenRecent={(visit) => void browser.navigateTab(tab.id, visit.url)}
                        />
                    </div>
                </div>

                {/* The sidebar holds these when it's open. */}
                {!layout.sidebarOpen && (
                    <nav aria-label="Places" className="mt-4 flex flex-wrap justify-center gap-2 pointer-events-auto">
                        {LINKS.map(({ label, Icon, page: target }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => void browser.openPage(target)}
                                className="h-[34px] px-3.5 flex items-center gap-2 rounded-full bg-surface text-13 text-foreground shadow-float outline-none transition-colors hover:bg-tray focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Icon aria-hidden className="size-4 text-muted-foreground" />
                                {label}
                            </button>
                        ))}
                    </nav>
                )}
            </div>
        </div>
    )
}
