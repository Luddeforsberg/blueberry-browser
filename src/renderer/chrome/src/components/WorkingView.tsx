import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ChatApproval, MascotProfile, WorkOutcome, WorkTab, WorkView } from '@shared/library'
import { cn } from '@common/lib/utils'
import { useBrowser } from '../contexts/BrowserContext'
import { useShell } from '../contexts/ShellContext'
import { Berry, useAssistantName } from './Berry'
import { Favicon } from './Favicon'
import { Pips } from '@common/components/Pips'
import { chipClass } from './ChatMessage'
import { liveFrameLock, useCloudView } from '../cloudView'
import { Tooltip } from '@common/components/Tooltip'

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

// A page in the cloud, from its cloud tab's own live view, locked as it is before taking over, or the local test
// browser's pictures. Nothing of it is captured or kept here.
const CloudPicture: React.FC<{ tab: WorkTab }> = ({ tab }) => {
    const { view, frame } = useCloudView(tab.id)
    if (view?.kind === 'live') {
        const lock = liveFrameLock(false)
        return <iframe aria-label={`Live view of ${tab.title}`} src={view.url} sandbox="allow-same-origin allow-scripts" inert={lock.inert} tabIndex={lock.tabIndex} className={cn('absolute inset-0 size-full border-0', lock.className)} />
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
        return <div className="absolute inset-0 flex items-center justify-center bg-tray p-3 text-center text-14 text-ink-2">{WITHOUT_PICTURE[tab.state](name)}</div>
    }
    if (tab.cloud) return big ? <CloudPicture tab={tab} /> : <div className="absolute inset-0 bg-tray" />
    return picture ? <img src={picture} alt="" decoding="sync" draggable={false} className="absolute inset-0 size-full object-cover object-top" /> : <div className="absolute inset-0 bg-tray" />
}

// The user has this tab, so there's no picture to show.
const isUsers = (tab: WorkTab) => tab.state === 'held' || tab.state === 'yours'

// The tab it's working in, on a sheet with `lift`, with its site along the top. While the user has the tab there's
// nothing to picture, so it's only that row, saying so.
const WorkWindow: React.FC<{ tab: WorkTab; frames: WorkFrames; name: string; aspect: number }> = ({ tab, frames, name, aspect }) => (
    <div className="overflow-hidden rounded-tile bg-sheet shadow-lift">
        <div className="h-[26px] px-2.5 flex items-center gap-[7px] border-b bg-sheet-2 text-11 text-ink-3">
            <Favicon src={tab.favicon} site={tab.site} className="size-3" />
            <span className="truncate">{tab.site}</span>
            {isUsers(tab) && <span className="ml-auto shrink-0 text-ink-2">You have this tab</span>}
        </div>
        {!isUsers(tab) && (
            <div className="relative bg-tray" style={{ aspectRatio: aspect }}>
                <Picture tab={tab} frames={frames} name={name} big />
            </div>
        )}
    </div>
)

// One of the job's tabs, under the picture: the one it's in is a sheet, and one loading has the pips for its icon.
// Any other goes to that tab, to watch, as Go to tab does for the one it's in.
const TabChip: React.FC<{ tab: WorkTab; loading: boolean; onGo: () => void }> = ({ tab, loading, onGo }) => {
    const look = (
        <>
            {loading ? <span className="size-4 shrink-0 flex items-center justify-center"><Pips pattern="think" /></span> : <Favicon src={tab.favicon} site={tab.site} />}
            <span className="truncate">{tab.site}</span>
        </>
    )
    return (
        <li className="min-w-0 max-w-full flex">
            {tab.current ? (
                <span className={cn(chipClass(), 'bg-sheet text-ink shadow-rim pointer-events-none')}>{look}</span>
            ) : (
                <Tooltip words="Go to this tab">
                    <button type="button" onClick={onGo} className={chipClass()}>
                        {look}
                    </button>
                </Tooltip>
            )}
        </li>
    )
}

const QUIET = 'h-6 px-1.5 rounded-row text-13 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus'

// Beside the main chat while a job uses tabs, in a well: where the mascot is, a picture of the tab it's in, the job's
// tabs, and Go to tab, which only goes there to watch. Everything to answer stays in the chat, which this only points to.
export const WorkingView: React.FC<{
    view: WorkView
    frames: WorkFrames
    mascot: MascotProfile
    approval: ChatApproval | null
    // The page's own shape, so a picture is all of it.
    aspect: number
    onHide: () => void
    onShowAsking: () => void
}> = ({ view, frames, mascot, approval, aspect, onHide, onShowAsking }) => {
    const { tabs, switchTab } = useBrowser()
    const name = useAssistantName(mascot)
    const current = view.tabs.find((tab) => tab.current) ?? view.tabs[0]
    const ended = view.outcome !== null
    const loading = (id: string) => tabs.some((tab) => tab.id === id && tab.isLoading)
    const count = `${view.tabs.length} ${view.tabs.length === 1 ? 'tab' : 'tabs'}`

    return (
        <div className="flex-1 px-[18px] py-4 flex flex-col animate-fade-in">
            <div className="h-[30px] flex items-center gap-3 text-14">
                <h2 role="status" className="min-w-0 truncate font-regular text-ink">
                    {ended ? OUTCOME[view.outcome!] : approval ? askingWords(approval) : `${name} is on ${current.site}`}
                </h2>
                <span className="ml-auto -mr-1.5 flex items-center gap-1 shrink-0">
                    {/* A handoff is answered in the tab itself, which Go to tab goes to. */}
                    {!ended && approval && !approval.handoff && (
                        <button type="button" onClick={onShowAsking} className={cn(QUIET, 'text-ink')}>
                            Answer in the chat
                        </button>
                    )}
                    <button type="button" onClick={onHide} className={cn(QUIET, 'text-ink-3')}>
                        Hide work
                    </button>
                </span>
            </div>

            <div className="mt-4">
                <WorkWindow tab={current} frames={frames} name={name} aspect={aspect} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <ul aria-label="Its tabs" className="contents">
                    {view.tabs.map((tab) => <TabChip key={tab.id} tab={tab} loading={loading(tab.id)} onGo={() => void switchTab(tab.id)} />)}
                </ul>
                <button
                    type="button"
                    onClick={() => void switchTab(current.id)}
                    aria-label={`Go to the tab on ${current.site}`}
                    className={cn(chipClass(true), 'px-2.5')}
                >
                    Go to tab
                </button>
            </div>

            <p className="mt-auto pt-4 flex justify-between gap-3 font-mono text-11.5 text-ink-3">
                <span>{count}, behind yours</span>
                {!ended && <span>closes when done</span>}
            </p>
        </div>
    )
}

// With no room beside the chat: where it is, on one line above the composer, with no picture and nothing captured.
// It holds still, since the live step in the conversation is what moves.
export const WorkingStrip: React.FC<{ view: WorkView; mascot: MascotProfile; approval: ChatApproval | null }> = ({ view, mascot, approval }) => {
    const { switchTab } = useBrowser()
    const { showBerry } = useShell().settings
    const name = useAssistantName(mascot)
    const current = view.tabs.find((tab) => tab.current) ?? view.tabs[0]
    return (
        <button
            type="button"
            onClick={() => void switchTab(current.id)}
            aria-label={`Go to the tab on ${current.site}`}
            className="-mx-2 mb-2 w-[calc(100%+16px)] h-8 px-2 flex items-center gap-2 rounded-row text-14 text-ink-2 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus"
        >
            {showBerry && <Berry mood={approval ? 'asking' : 'rest'} size={20} mascot={mascot} still />}
            <span role="status" className="min-w-0 truncate text-ink">
                {approval ? askingWords(approval) : `${name} is on ${current.site}`}
            </span>
            <span className="ml-auto shrink-0 font-mono text-11.5 text-ink-3">Go to tab</span>
        </button>
    )
}
