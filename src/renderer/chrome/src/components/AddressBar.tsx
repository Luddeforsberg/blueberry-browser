import React, { useEffect, useRef, useState } from 'react'
import type { InternalPage, TabInfo } from '@shared/ipc'
import type { ChatThread, NeedsYouItem } from '@shared/library'
import { Lock, Star } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { Mascot } from '@common/components/Mascot'
import { cn } from '@common/lib/utils'
import { toUrl } from '@common/lib/url'
import { useAssistantName } from './Berry'
import { TabIcon } from './TabIcon'
import { useAddressSuggestions } from './useAddressSuggestions'
import { setRoutinesView } from '../routinesView'
import { BERRY_ID } from '@shared/mascots'

// DESIGN.md section 10, Toolbar and the address field. The field is also where a mascot's status is, for the tab in
// front: at rest, a mascot working here, waiting for you, your turn, and the address being edited.

const splitUrl = (url: string) => {
    try {
        const parsed = new URL(url)
        return { secure: parsed.protocol === 'https:', site: parsed.hostname.replace(/^www\./, ''), path: parsed.pathname.replace(/\/$/, '') + parsed.search + parsed.hash }
    } catch {
        return { secure: false, site: url, path: '' }
    }
}

const PAGE_LABELS: Record<InternalPage, string | null> = {
    'new-tab': null,
    chat: 'Chat',
    routines: 'Routines',
    settings: 'Settings',
    downloads: 'Downloads',
    gallery: 'Component gallery',
    history: 'History',
    flock: 'Your mascots',
    'mascot-gallery': 'Gallery',
    'needs-you': 'Needs you',
    recording: 'What I watched',
    cloud: 'Cloud tab'
}

// Internal pages have no address worth editing, so the field starts empty there.
const editableUrl = (tab: TabInfo | null) => (tab && !tab.page ? tab.url : '')

const FIELD = 'w-full min-w-0 h-8 flex items-center rounded-row app-region-no-drag'
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'
// The two buttons inside the field while a mascot works there. Filled is `ground` on the field's `ink`.
const IN_FIELD = cn('h-6 px-[9px] shrink-0 rounded-[7px] text-12 transition-[background-color,transform] duration-fast active:scale-[.96]', FOCUS)
const FILLED_IN_FIELD = cn(IN_FIELD, 'bg-ground text-ink font-medium hover:bg-ground/90')
const OUTLINED_IN_FIELD = cn(IN_FIELD, 'shadow-[inset_0_0_0_1px_rgb(var(--ground)/0.28)] text-ground hover:bg-ground/10')

// What the job working in a tab says it's doing, in its own words, while it has them.
const useWorkWords = (chatId: string | null): string | null => {
    const [thread, setThread] = useState<ChatThread | null>(null)
    useEffect(() => {
        setThread(null)
        if (!chatId) return
        let live = true
        void window.chromeAPI.library.getChat(chatId).then((found) => live && setThread(found))
        const off = window.chromeAPI.chat.onChatUpdated((updated) => {
            if (updated.id === chatId) setThread(updated)
        })
        return () => {
            live = false
            off()
        }
    }, [chatId])
    // Status is present tense and ends in two dots while it's happening. Steps are past tense, so they aren't status.
    if (!thread?.statusLine) return null
    return /\.$/.test(thread.statusLine) ? thread.statusLine : `${thread.statusLine}..`
}

// The job working in the tab in front, if any: who, which chat, and whether it's waiting on an answer here.
const useJobHere = (tab: TabInfo | null) => {
    const { chats, needsYou } = useLibrary()
    const { find } = useFlock()
    const working = !!tab?.berryWorking
    // A job's own tab names its chat. On one of the user's tabs, it's the one running chat of that mascot, if there's one.
    const running = chats.filter((chat) => chat.running && (chat.mascotId ?? BERRY_ID) === (tab?.workingMascotId ?? BERRY_ID))
    const chatId = tab?.jobChatId ?? (working && running.length === 1 ? running[0].id : null)
    const asking = needsYou.find((item) => !item.approval.handoff && (item.id === chatId || (item.tabId !== null && item.tabId === tab?.id))) ?? null
    const turn = needsYou.find((item) => !!tab && item.approval.handoff?.tabId === tab.id) ?? null
    return { working, mascot: find(tab?.workingMascotId ?? turn?.mascotId ?? null), chatId, asking, turn, ownTab: !!tab?.jobChatId }
}

const openJob = (item: NeedsYouItem) => {
    if (item.routineId) {
        setRoutinesView({ page: 'detail', id: item.routineId })
        void window.chromeAPI.browser.openPage('routines')
    } else {
        void window.chromeAPI.browser.openPage('chat', { param: item.id, title: item.job })
    }
}

export const AddressBar: React.FC = () => {
    const { activeTab, navigateToUrl } = useBrowser()
    const { bookmarks, pinned } = useLibrary()
    const [url, setUrl] = useState('')
    const [isFocused, setIsFocused] = useState(false)
    const job = useJobHere(activeTab)
    const words = useWorkWords(job.working ? job.chatId : null)
    const name = useAssistantName(job.mascot)
    const form = useRef<HTMLFormElement>(null)
    const input = useRef<HTMLInputElement>(null)
    const suggestions = useAddressSuggestions({ editing: isFocused, value: url, setValue: setUrl, field: form, input, onDone: () => setIsFocused(false) })

    useEffect(() => {
        if (!isFocused) setUrl(editableUrl(activeTab))
    }, [activeTab, isFocused])

    useEffect(() => window.chromeAPI.browser.onFocusAddress(() => setIsFocused(true)), [])

    const cancel = () => {
        setIsFocused(false)
        setUrl(editableUrl(activeTab))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (suggestions.submit()) return
        if (!url.trim()) return
        navigateToUrl(toUrl(url))
        setIsFocused(false)
    }

    // You press the field: the address again, on a sheet with the focus ring. A mascot working here stays as a small
    // still chip at its left, and going somewhere takes the tab over, as clicking in the page does.
    if (isFocused) {
        return (
            <form ref={form} onSubmit={handleSubmit} className={cn(FIELD, 'gap-2 pl-[7px] pr-3 bg-sheet ring-2 ring-focus')}>
                {job.working ? <Mascot mood="fetching" size={22} look={job.mascot.look} name={name} still /> : <span className="w-1" />}
                <input
                    ref={input}
                    type="text"
                    aria-label="Address"
                    aria-autocomplete="both"
                    value={url}
                    onChange={suggestions.onChange}
                    onFocus={(e) => e.target.select()}
                    onBlur={cancel}
                    onKeyDown={(e) => !suggestions.onKeyDown(e) && e.key === 'Escape' && cancel()}
                    className="flex-1 min-w-0 h-full bg-transparent text-13 text-ink caret-ink outline-none placeholder:text-faint"
                    placeholder="Search or enter address"
                    disabled={!activeTab}
                    spellCheck={false}
                    autoFocus
                />
                {job.working && job.ownTab && <span className="shrink-0 font-mono text-11.5 text-ink-3">Enter takes this tab over</span>}
            </form>
        )
    }

    // Your turn: a sign-in, a code or a captcha only the user can do. I'm done is the only thing that gives the tab back.
    if (job.turn) {
        const { turn } = job
        return (
            <div role="status" className={cn(FIELD, 'gap-2 pl-3 pr-1 bg-ask-bg text-ask text-13')}>
                <Lock aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
                <span className="flex-1 min-w-0 truncate">Your turn. {name} can’t see this tab</span>
                <button type="button" onClick={() => void window.chromeAPI.chat.decide(turn.id, turn.approval.id, true)} className={cn(IN_FIELD, 'bg-ink text-ground font-medium hover:bg-ink/85')}>
                    I’m done
                </button>
            </div>
        )
    }

    // A mascot working here, or waiting for you: the field turns `ink`, and Stop is only ever here, where no page can reach.
    if (job.working && activeTab) {
        const { asking } = job
        const site = splitUrl(activeTab.url).site
        return (
            <div role="status" className={cn(FIELD, 'gap-[9px] pl-[7px] pr-1 bg-ink text-ground')}>
                <button type="button" aria-label="Edit the address" onClick={() => setIsFocused(true)} className={cn('flex-1 min-w-0 h-full flex items-center gap-[9px] text-left rounded-[7px]', FOCUS)}>
                    <Mascot mood={asking ? 'asking' : 'fetching'} size={22} look={job.mascot.look} name={name} inverted />
                    <span className="min-w-0 truncate font-mono text-11.5">{asking ? 'Waiting for you' : (words ?? 'Thinking..')}</span>
                    {!activeTab.page && <span className="shrink-0 font-mono text-11.5 opacity-55">{site}</span>}
                </button>
                {asking ? (
                    <>
                        <button type="button" onClick={() => void window.chromeAPI.browser.stopWork(activeTab.id)} aria-label={`Stop ${name}`} className={OUTLINED_IN_FIELD}>Stop</button>
                        <button type="button" onClick={() => openJob(asking)} className={FILLED_IN_FIELD}>Answer</button>
                    </>
                ) : (
                    <>
                        {job.ownTab && (
                            <button type="button" onClick={() => void window.chromeAPI.browser.takeOver(activeTab.id)} className={OUTLINED_IN_FIELD}>Take over</button>
                        )}
                        <button type="button" onClick={() => void window.chromeAPI.browser.stopWork(activeTab.id)} aria-label={`Stop ${name}`} className={FILLED_IN_FIELD}>Stop</button>
                    </>
                )}
            </div>
        )
    }

    // At rest: a lock, the real address with its site in `ink`, or the name of one of our own pages.
    const pageLabel = activeTab?.page ? PAGE_LABELS[activeTab.page] : null
    const { secure, site, path } = splitUrl(activeTab?.url ?? '')
    const web = !!activeTab && !activeTab.page && /^https?:\/\//i.test(activeTab.url)
    // A favourite is a bookmark kept on top.
    const bookmarked = web && [...bookmarks, ...pinned].some((bookmark) => bookmark.url === activeTab.url)
    return (
        <div className={cn(FIELD, 'bg-tray text-13 text-ink-3')}>
            <button type="button" aria-label="Address" onClick={() => setIsFocused(true)} className={cn('flex-1 min-w-0 h-full flex items-center gap-2 pl-3 pr-2 text-left cursor-text rounded-row', FOCUS)}>
                {pageLabel ? (
                    <>
                        {activeTab && <span className="shrink-0 [&_svg]:size-3.5"><TabIcon tab={activeTab} /></span>}
                        <span className="truncate text-ink">{activeTab?.page === 'chat' && activeTab.title ? activeTab.title : pageLabel}</span>
                    </>
                ) : activeTab?.url && !activeTab.page ? (
                    <>
                        {secure && <Lock aria-label="Secure" className="size-[13px] shrink-0" strokeWidth={1.5} />}
                        <span className="truncate"><span className="text-ink">{site}</span>{path}</span>
                    </>
                ) : (
                    <span className="truncate text-faint">Search or enter address</span>
                )}
            </button>
            {web && (
                <button
                    type="button"
                    aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                    aria-pressed={bookmarked}
                    title={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                    onClick={() => void window.chromeAPI.library.toggleBookmark()}
                    className={cn('mr-1 size-6 shrink-0 flex items-center justify-center rounded-[7px] hover:bg-hover hover:text-ink', bookmarked && 'text-ink', FOCUS)}
                >
                    <Star className={cn('size-[13px]', bookmarked && 'fill-current')} strokeWidth={1.5} />
                </button>
            )}
        </div>
    )
}
