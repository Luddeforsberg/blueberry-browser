import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, CircleStop } from 'lucide-react'
import type { ChatApproval, MascotProfile, WorkOutcome, WorkTab, WorkView } from '@shared/library'
import { cn } from '@common/lib/utils'
import { useBrowser } from '../contexts/BrowserContext'
import { useShell } from '../contexts/ShellContext'
import { Berry, useAssistantName } from './Berry'
import { Favicon } from './Favicon'
import { SHIMMER_TEXT } from './ChatMessage'
import { liveFrameLock, useCloudView } from '../cloudView'

const PERCH_SIZE = 48
// The drawing's feet are this far up from the bottom of its box.
const PERCH_FEET = 0.05
const MOST_SITES_NAMED = 3

// Pictures arrive many times a second, so they go straight to the picture showing them, and nothing else draws again.
export interface WorkFrames {
    get: (tabId: string) => string | undefined
    subscribe: (listener: () => void) => () => void
}

// The working view for the chat on screen. `pictureWidth` of 0 means words only, and then nothing is captured at all.
export const useWorkView = (chatId: string | null, pictureWidth: number): { view: WorkView | null; frames: WorkFrames } => {
    const [view, setView] = useState<WorkView | null>(null)
    const pictures = useRef(new Map<string, string>())
    const listeners = useRef(new Set<() => void>())
    const frames = useMemo<WorkFrames>(() => ({
        get: (tabId) => pictures.current.get(tabId),
        subscribe: (listener) => {
            listeners.current.add(listener)
            return () => listeners.current.delete(listener)
        },
    }), [])

    useEffect(() => {
        const { work } = window.chromeAPI
        const tell = () => listeners.current.forEach((listener) => listener())
        const offUpdated = work.onUpdated((next) => {
            setView(next)
            // Nothing of a tab that's stopped being pictured stays here, not even out of sight.
            const allowed = new Set(next?.tabs.filter(({ state }) => state === 'picture').map(({ id }) => id))
            pictures.current.forEach((_, tabId) => {
                if (!allowed.has(tabId)) pictures.current.delete(tabId)
            })
            tell()
        })
        const offFrame = work.onFrame(({ chatId: id, tabId, picture }) => {
            if (id !== chatId) return
            pictures.current.set(tabId, picture)
            tell()
        })
        return () => {
            offUpdated()
            offFrame()
            pictures.current.clear()
        }
    }, [chatId])

    useEffect(() => {
        void window.chromeAPI.work.watch(chatId, pictureWidth)
    }, [chatId, pictureWidth])
    // Only leaving the chat ends the watch: a new width on the same chat keeps what it's seen, or a finished job's view would go.
    useEffect(() => () => void window.chromeAPI.work.watch(null, 0), [chatId])

    return { view: view?.chatId === chatId ? view : null, frames }
}

const useElapsed = ({ startedAt, endedAt }: Pick<WorkView, 'startedAt' | 'endedAt'>): string => {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (endedAt !== null) return undefined
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [endedAt])
    const seconds = Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000))
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const OUTCOME: Record<WorkOutcome, string> = { done: 'Done', stopped: 'Stopped here', failed: 'It didn’t finish' }

const askingWords = (approval: ChatApproval): string =>
    approval.handoff ? 'Waiting for you' : approval.question ? 'Has a question for you' : 'Waiting for your OK'

const WITHOUT_PICTURE: Record<Exclude<WorkTab['state'], 'picture'>, (name: string) => string> = {
    held: () => 'You have this tab',
    yours: () => 'You have this tab',
    'off-limits': (name) => `${name} isn’t allowed on this site`,
    'no-access': (name) => `${name} can’t see this page`,
    none: () => 'No picture of this page',
}

const sitesInWords = (sites: string[]): string => {
    const named = sites.slice(0, MOST_SITES_NAMED)
    const rest = sites.length - named.length
    if (rest > 0) return `${named.join(', ')} and ${rest} more`
    return named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named.at(-1)}` : named[0]
}

// A page in the cloud, from its cloud tab's own live view, locked as it is before taking over, or the local test
// browser's pictures. Nothing of it is captured or kept here.
const CloudPicture: React.FC<{ tab: WorkTab }> = ({ tab }) => {
    const { view, frame } = useCloudView(tab.id)
    if (view?.kind === 'live') {
        const lock = liveFrameLock(false)
        return <iframe title={`Live view of ${tab.title}`} src={view.url} sandbox="allow-same-origin allow-scripts" inert={lock.inert} tabIndex={lock.tabIndex} className={cn('absolute inset-0 size-full border-0', lock.className)} />
    }
    return view?.kind === 'frames' && frame
        ? <img src={`data:image/jpeg;base64,${frame}`} alt="" draggable={false} className="absolute inset-0 size-full object-contain object-top" />
        : <div className="absolute inset-0 bg-tray" />
}

// What a tab looks like just now. There's no element to hold a picture at all unless this tab may have one. Only the
// big window shows a cloud page, as one cloud tab is watched at a time.
const Picture: React.FC<{ tab: WorkTab; frames: WorkFrames; name: string; big?: boolean }> = ({ tab, frames, name, big = false }) => {
    const picture = useSyncExternalStore(frames.subscribe, () => frames.get(tab.id))
    if (tab.state !== 'picture') {
        return <div className="absolute inset-0 flex items-center justify-center bg-tray p-3 text-center text-13 text-muted-foreground">{WITHOUT_PICTURE[tab.state](name)}</div>
    }
    if (tab.cloud) return big ? <CloudPicture tab={tab} /> : <div className="absolute inset-0 bg-tray" />
    return picture ? <img src={picture} alt="" decoding="sync" draggable={false} className="absolute inset-0 size-full object-cover object-top" /> : <div className="absolute inset-0 bg-tray" />
}

// The user has this tab, so there's no picture to show.
const isUsers = (tab: WorkTab) => tab.state === 'held' || tab.state === 'yours'

// The tab it's working in, as a small window, with its site along the top like the page card's own address row. While
// the user has the tab there's nothing to picture, so it's only that row, saying so.
const WorkWindow: React.FC<{
    tab: WorkTab
    frames: WorkFrames
    name: string
    live: boolean
    aspect: number
    onPress: () => void
    perched: React.ReactNode
}> = ({ tab, frames, name, live, aspect, onPress, perched }) => (
    <div className="relative">
        {perched && (
            <span className="absolute right-5 z-10 pointer-events-none" style={{ bottom: `calc(100% - ${PERCH_SIZE * PERCH_FEET}px)` }}>
                {perched}
            </span>
        )}
        <button
            type="button"
            onClick={onPress}
            aria-label={`Go to the tab on ${tab.site}`}
            className={cn(
                "group block w-full overflow-hidden rounded-card bg-surface text-left outline-none transition-shadow duration-layout focus-visible:ring-2 focus-visible:ring-ring",
                live ? "shadow-reading" : "shadow-page"
            )}
        >
            {isUsers(tab) ? (
                <span className="h-10 px-3 flex items-center gap-2 text-13">
                    <Favicon src={tab.favicon} site={tab.site} />
                    <span className="truncate text-muted-foreground transition-colors group-hover:text-foreground">{tab.site}</span>
                    <span className="ml-auto shrink-0">You have this tab</span>
                </span>
            ) : (
                <>
                    <span className="h-7 px-2.5 flex items-center gap-1.5 border-b text-12 text-muted-foreground transition-colors group-hover:text-foreground">
                        <Favicon src={tab.favicon} site={tab.site} />
                        <span className="truncate">{tab.site}</span>
                    </span>
                    <span className="relative block bg-tray" style={{ aspectRatio: aspect }}>
                        <Picture tab={tab} frames={frames} name={name} big />
                    </span>
                </>
            )}
        </button>
    </div>
)

const SmallWindow: React.FC<{ tab: WorkTab; frames: WorkFrames; name: string; aspect: number; onPress: () => void }> = ({ tab, frames, name, aspect, onPress }) => (
    <button type="button" onClick={onPress} aria-label={`Go to the tab on ${tab.site}`} className="group w-[104px] flex flex-col gap-1 text-left outline-none rounded-control focus-visible:ring-2 focus-visible:ring-ring">
        <span style={{ aspectRatio: aspect }} className="relative block w-full overflow-hidden rounded-control border bg-tray transition-colors group-hover:border-muted-foreground">
            <Picture tab={tab} frames={frames} name={name} />
        </span>
        <span className="truncate text-11 text-muted-foreground transition-colors group-hover:text-foreground">{tab.site}</span>
    </button>
)

// Beside the chat while a job uses tabs: you can watch the bird working in the little window. Only ever words on the
// page and that window, and everything to answer stays in the chat, which this only points to.
export const WorkingView: React.FC<{
    view: WorkView
    frames: WorkFrames
    mascot: MascotProfile
    approval: ChatApproval | null
    // The page's own shape, so a picture is all of it.
    aspect: number
    onStop: () => void
    onShowAsking: () => void
}> = ({ view, frames, mascot, approval, aspect, onStop, onShowAsking }) => {
    const { switchTab } = useBrowser()
    const { showBerry, birdOnPages, keepBerryStill } = useShell().settings
    const name = useAssistantName(mascot)
    const elapsed = useElapsed(view)
    const current = view.tabs.find((tab) => tab.current) ?? view.tabs[0]
    const others = view.tabs.filter((tab) => tab !== current)
    const ended = view.outcome !== null
    // The bird is in the picture while it's working there, and only comes out to the edge when it isn't. There's none
    // drawn in a cloud page.
    const inPicture = !ended && current.state === 'picture' && !current.cloud && birdOnPages && !keepBerryStill
    const perched = showBerry && !inPicture
        ? <Berry mood={ended ? (view.outcome === 'done' ? 'delivered' : 'rest') : approval ? 'asking' : 'rest'} size={PERCH_SIZE} mascot={mascot} />
        : null

    return (
        <div className="flex flex-col animate-fade-in">
            <WorkWindow tab={current} frames={frames} name={name} live={!ended && current.state === 'picture'} aspect={aspect} perched={perched} onPress={() => void switchTab(current.id)} />

            <div role="status" className="mt-4 text-16 text-foreground">
                {ended ? (
                    OUTCOME[view.outcome!]
                ) : approval ? (
                    askingWords(approval)
                ) : (
                    <span className={cn("line-clamp-2", SHIMMER_TEXT)}>{view.doing ?? 'Thinking'}</span>
                )}
            </div>

            {/* A handoff is answered in the tab itself, which the window above goes to. */}
            {!ended && approval && !approval.handoff && (
                <button type="button" onClick={onShowAsking} className="-mx-1.5 mt-1 w-fit h-6 px-1.5 flex items-center gap-1 rounded-control text-13 text-accent-ink outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                    <ArrowLeft aria-hidden className="size-3.5" />
                    Answer in the chat
                </button>
            )}

            <div className="mt-1 min-h-6 flex items-center gap-2 text-13 text-muted-foreground">
                {showBerry && <Berry size={20} mascot={mascot} />}
                <span className="truncate">{name}</span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{elapsed}</span>
                {!ended && (
                    <button type="button" onClick={onStop} className="-mr-1.5 ml-auto h-6 px-1.5 shrink-0 flex items-center gap-1 rounded-control outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                        <CircleStop aria-hidden className="size-3.5" />
                        Stop
                    </button>
                )}
            </div>

            {others.length > 0 && (
                <ul aria-label="Its other tabs" className="mt-4 pt-4 border-t flex flex-wrap gap-3">
                    {others.map((tab) => (
                        <li key={tab.id}>
                            <SmallWindow tab={tab} frames={frames} name={name} aspect={aspect} onPress={() => void switchTab(tab.id)} />
                        </li>
                    ))}
                </ul>
            )}

            {view.sites.length > 1 && (
                <p className="mt-4 pt-4 border-t text-12 text-muted-foreground [overflow-wrap:anywhere]">Been on {sitesInWords(view.sites)}</p>
            )}
        </div>
    )
}

// With no room beside the chat: the same words on one line above the composer, with no picture and nothing captured.
export const WorkingStrip: React.FC<{ view: WorkView; mascot: MascotProfile; approval: ChatApproval | null }> = ({ view, mascot, approval }) => {
    const { switchTab } = useBrowser()
    const { showBerry } = useShell().settings
    const name = useAssistantName(mascot)
    const elapsed = useElapsed(view)
    const current = view.tabs.find((tab) => tab.current) ?? view.tabs[0]
    return (
        <button
            type="button"
            onClick={() => void switchTab(current.id)}
            aria-label={`Go to the tab on ${current.site}`}
            className="-mx-2 mb-2 w-[calc(100%+16px)] h-8 px-2 flex items-center gap-2 rounded-control text-13 text-muted-foreground text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
            {showBerry && <Berry mood={approval ? 'asking' : 'fetching'} size={24} mascot={mascot} />}
            <span role="status" className="min-w-0 truncate text-foreground">
                {approval ? askingWords(approval) : <span className={SHIMMER_TEXT}>{view.doing ?? `${name} is thinking`}</span>}
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">{current.site}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{elapsed}</span>
        </button>
    )
}
