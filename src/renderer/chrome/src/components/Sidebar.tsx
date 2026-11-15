import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Cloud, Ellipsis, PanelLeft, Plus, SlidersHorizontal } from 'lucide-react'
import { Favicon, siteIcon } from './Favicon'
import type { Bookmark, ChatThreadSummary, MascotProfile, Routine } from '@shared/library'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Tabs } from './Tabs'
import { ToolBarButton } from './ToolBarButton'
import { Pips } from '@common/components/Pips'
import { cn } from '@common/lib/utils'
import { Berry, useAssistantName } from './Berry'
import { limitsInBrief, shortAge, shortWhen } from '../shortWords'
import { setRoutinesView } from '../routinesView'
import { BERRY_ID } from '@shared/mascots'

// DESIGN.md section 10, Sidebar: straight on the ground, with two faces and the dock under both.

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'
const ROW = cn('w-full h-[30px] px-2 flex items-center gap-[9px] rounded-row text-13 text-ink-2 text-left transition-colors app-region-no-drag', FOCUS)
// A row's own slot for its icon or face, so titles line up whatever starts the row.
const LEAD = 'size-5 shrink-0 flex items-center justify-center'
const ICON = 'size-4 shrink-0'
const EARLIER_SHOWN = 8

// Section labels: 11px mono, lower case, in ink-3. `trailing` sits at the right, such as a count or an arrow.
const Label: React.FC<{ id?: string; ask?: boolean; trailing?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ id, ask, trailing, className, children }) => (
    <h2 id={id} className={cn('h-[18px] mt-3 mb-1 mx-2 flex items-center gap-1.5 font-mono text-11 lowercase', ask ? 'text-ask' : 'text-ink-3', className)}>
        {children}
        {trailing && <span className="ml-auto flex items-center gap-2">{trailing}</span>}
    </h2>
)

// A small icon button in a label, such as the new tab plus or the arrow that opens a page.
const LabelButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cn('size-5 -mr-1 flex items-center justify-center rounded-[6px] text-ink-3 hover:bg-hover hover:text-ink app-region-no-drag', FOCUS)}>
        {children}
    </button>
)

const Rule: React.FC = () => <div aria-hidden className="h-px mx-1.5 mt-2.5 bg-line" />

// A minute's tick, for rows that say how long something has been going.
const useMinute = () => {
    const [, setNow] = useState(0)
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30_000)
        return () => window.clearInterval(timer)
    }, [])
}

// --- Tabs -----------------------------------------------------------------------------------------------------------

const sameSite = (a: string, b: string) => {
    try {
        return new URL(a).hostname === new URL(b).hostname
    } catch {
        return false
    }
}

const savedSiteMenu = (event: React.MouseEvent, site: Bookmark) => {
    event.preventDefault()
    void window.chromeAPI.library.showBookmarkMenu(site.id)
}

// Pinned sites as tiles, four to a row. A dot under one says it's open, and pressing it goes there. The last is a plus
// that pins the page in front.
const Favourites: React.FC = () => {
    const { pinned } = useLibrary()
    const { activeTab, tabs, createTab, switchTab } = useBrowser()
    const canPin = !!activeTab && !activeTab.page && /^https?:\/\//i.test(activeTab.url) && !pinned.some((pin) => pin.url === activeTab.url)
    const plusLabel = canPin ? 'Pin this page' : activeTab && !activeTab.page && pinned.some((pin) => pin.url === activeTab.url) ? 'This page is pinned' : 'Open a web page to pin it here'

    return (
        <ul aria-label="Favourites" className="grid grid-cols-4 gap-1.5 mb-1.5">
            {pinned.map((site) => {
                const open = tabs.find((tab) => !tab.page && sameSite(tab.url, site.url))
                return (
                    <li key={site.id}>
                        <button
                            type="button"
                            aria-label={open ? `${site.title}, open` : site.title}
                            title={site.title}
                            onClick={() => (open ? void switchTab(open.id) : createTab(site.url))}
                            onContextMenu={(event) => savedSiteMenu(event, site)}
                            className={cn('relative w-full h-10 flex items-center justify-center rounded-tile bg-tray transition-colors hover:bg-press app-region-no-drag', FOCUS)}
                        >
                            <Favicon src={site.favicon ?? siteIcon(site.url)} site={site.url} className="size-5 rounded-[6px]" />
                            {open && <span aria-hidden className="absolute bottom-[3px] size-1 rounded-full bg-ink-3" />}
                        </button>
                    </li>
                )
            })}
            <li>
                <button
                    type="button"
                    aria-label={plusLabel}
                    title={plusLabel}
                    disabled={!canPin}
                    onClick={() => void window.chromeAPI.library.togglePin()}
                    className={cn('w-full h-10 flex items-center justify-center rounded-tile shadow-[inset_0_0_0_1px_var(--line)] text-ink-3 transition-colors hover:bg-hover hover:text-ink disabled:text-faint disabled:hover:bg-transparent app-region-no-drag', FOCUS)}
                >
                    <Plus className={ICON} strokeWidth={1.5} />
                </button>
            </li>
        </ul>
    )
}

// Bookmarks that aren't pinned, in a section that folds. With nothing saved it keeps its place and says so.
const Bookmarks: React.FC = () => {
    const { pinned, bookmarks } = useLibrary()
    const { createTab } = useBrowser()
    const [open, setOpen] = useState(true)
    const shown = bookmarks.filter((bookmark) => !pinned.some((pin) => pin.url === bookmark.url))

    return (
        <section aria-labelledby="sidebar-bookmarks">
            <Label
                id="sidebar-bookmarks"
                trailing={
                    <LabelButton label={open ? 'Fold bookmarks' : 'Show bookmarks'} onClick={() => setOpen(!open)}>
                        {open ? <ChevronDown className="size-[13px]" strokeWidth={1.5} /> : <ChevronRight className="size-[13px]" strokeWidth={1.5} />}
                    </LabelButton>
                }
            >
                bookmarks
            </Label>
            {open && (shown.length === 0 ? (
                <ul aria-label="Bookmarks">
                    <li className="h-[27px] px-2 flex items-center text-12 text-faint">Bookmark a page to keep it here.</li>
                </ul>
            ) : (
                <ul aria-label="Bookmarks">
                    {shown.map((site) => (
                        <li key={site.id}>
                            <button
                                type="button"
                                onClick={() => createTab(site.url)}
                                onContextMenu={(event) => savedSiteMenu(event, site)}
                                className={cn(ROW, 'h-[27px] text-12 hover:bg-hover hover:text-ink')}
                            >
                                <span className={LEAD}><Favicon src={site.favicon ?? siteIcon(site.url)} site={site.url} /></span>
                                <span className="flex-1 truncate">{site.title}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            ))}
        </section>
    )
}

const TabsFace: React.FC = () => {
    const { tabs, createTab } = useBrowser()
    return (
        <>
            <Favourites />
            <Bookmarks />
            <Rule />
            <section aria-labelledby="sidebar-tabs">
                <Label
                    id="sidebar-tabs"
                    trailing={
                        <>
                            <span className="tabular-nums" aria-label={`${tabs.length} open`}>{tabs.length}</span>
                            <LabelButton label="New tab" onClick={() => createTab()}>
                                <Plus className="size-[13px]" strokeWidth={1.5} />
                            </LabelButton>
                        </>
                    }
                >
                    tabs
                </Label>
                <Tabs mode="vertical" label="Tabs" showNew={false} />
            </section>
        </>
    )
}

// --- Chats ----------------------------------------------------------------------------------------------------------

const openChat = (chat: Pick<ChatThreadSummary, 'id' | 'title'>) => void window.chromeAPI.browser.openPage('chat', { param: chat.id, title: chat.title })
const openRoutine = (routine: Pick<Routine, 'id'>) => {
    setRoutinesView({ page: 'detail', id: routine.id })
    void window.chromeAPI.browser.openPage('routines')
}

// A chat in the sidebar. Its menu, from a right click or the button that shows on hover, renames or deletes it.
export const ChatRow: React.FC<{
    chat: ChatThreadSummary
    selected: boolean
    onOpen: () => void
    // What's said at the right: an age, a time, or nothing.
    trailing?: React.ReactNode
}> = ({ chat, selected, onOpen, trailing }) => {
    const [editing, setEditing] = useState(false)
    // Enter and Escape end editing before the input's blur arrives, and that blur mustn't save again.
    const finished = useRef(false)
    const api = window.chromeAPI.chat
    const { find } = useFlock()
    const mascot = find(chat.mascotId)
    const name = useAssistantName(mascot)

    const showMenu = async () => {
        if ((await api.showMenu(chat.id)) === 'rename') {
            finished.current = false
            setEditing(true)
        }
    }

    const finish = (title: string | null) => {
        if (finished.current) return
        finished.current = true
        setEditing(false)
        if (title !== null && title.trim() !== chat.title) void api.rename(chat.id, title)
    }

    if (editing) {
        return (
            <li>
                <input
                    aria-label="Chat name"
                    defaultValue={chat.title}
                    maxLength={100}
                    autoFocus
                    onFocus={(event) => event.target.select()}
                    onBlur={(event) => finish(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') finish(event.currentTarget.value)
                        if (event.key === 'Escape') finish(null)
                    }}
                    className={cn(ROW, 'bg-sheet text-ink shadow-rim')}
                />
            </li>
        )
    }

    return (
        <li
            className="group/chat relative"
            onContextMenu={(event) => {
                event.preventDefault()
                void showMenu()
            }}
        >
            <button
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={onOpen}
                className={cn(ROW, 'pr-8', selected ? 'bg-sheet text-ink shadow-rim' : 'hover:bg-hover hover:text-ink', chat.running && 'text-ink')}
            >
                {/* The row is named by its chat, so the face is left out of it and the mascot comes after. */}
                <span aria-hidden className={LEAD}>
                    <Berry mood={chat.running ? 'fetching' : 'rest'} size={20} mascot={mascot} />
                </span>
                <span className="flex-1 truncate">{chat.title}</span>
                <span className="sr-only">{chat.running ? `, ${name} is working` : `, with ${name}`}</span>
                {chat.cloud && <Cloud role="img" aria-label="In the cloud" className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.5} />}
                {trailing && (
                    <span className="-mr-6 shrink-0 font-mono text-11 text-ink-3 tabular-nums group-hover/chat:invisible group-focus-within/chat:invisible">{trailing}</span>
                )}
            </button>
            <button
                type="button"
                aria-label={`More options for ${chat.title}`}
                onClick={() => void showMenu()}
                className={cn(
                    'absolute right-1 top-[3px] size-6 flex items-center justify-center rounded-[7px] text-ink-3 transition-opacity app-region-no-drag',
                    'opacity-0 group-hover/chat:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-ink',
                    FOCUS
                )}
            >
                <Ellipsis className={ICON} strokeWidth={1.5} />
            </button>
        </li>
    )
}

const ChatsFace: React.FC = () => {
    const library = useLibrary()
    const { find } = useFlock()
    const { activeTab } = useBrowser()
    const [allEarlier, setAllEarlier] = useState(false)
    useMinute()
    const browser = window.chromeAPI.browser

    const isOpen = (id: string) => activeTab?.page === 'chat' && activeTab.pageParam === id
    const asking = new Set(library.needsYou.map(({ id }) => id))
    const working = library.chats.filter((chat) => chat.running && !asking.has(chat.id))
    const earlier = library.chats.filter((chat) => !chat.running && !asking.has(chat.id))
    // The next three by time: what runs soonest, then any paused.
    const routines = [...library.routines]
        .sort((a, b) => (a.paused ? Infinity : (a.nextRunAt ?? Infinity)) - (b.paused ? Infinity : (b.nextRunAt ?? Infinity)))
        .slice(0, 3)

    return (
        <>
            {library.needsYou.length > 0 && (
                <section aria-labelledby="sidebar-needs-you">
                    <Label
                        id="sidebar-needs-you"
                        ask
                        className="mt-0"
                        trailing={
                            <>
                                <span className="tabular-nums">{library.needsYou.length}</span>
                                <LabelButton label="Open Needs you" onClick={() => void browser.openPage('needs-you')}>
                                    <ChevronRight className="size-[13px]" strokeWidth={1.5} />
                                </LabelButton>
                            </>
                        }
                    >
                        needs you
                    </Label>
                    <ul className="flex flex-col gap-0.5">
                        {library.needsYou.map((item) => {
                            const mascot = find(item.mascotId)
                            return (
                                <li key={item.id}>
                                    <div className={cn(ROW, 'pr-1 bg-sheet text-ink shadow-rim')}>
                                        <span className={LEAD}><Berry mood="asking" size={20} mascot={mascot} /></span>
                                        <span className="flex-1 truncate">{item.job}</span>
                                        <button
                                            type="button"
                                            aria-label={`Review ${item.job}`}
                                            onClick={() => (item.routineId ? openRoutine({ id: item.routineId }) : openChat({ id: item.id, title: item.job }))}
                                            className={cn('h-[22px] px-[9px] shrink-0 inline-flex items-center rounded-full bg-ink text-ground text-11.5 font-medium transition-[background-color,transform] duration-fast hover:bg-ink/85 active:scale-[.96]', FOCUS)}
                                        >
                                            Review
                                        </button>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </section>
            )}

            {working.length > 0 && (
                <section aria-labelledby="sidebar-working">
                    <Label id="sidebar-working" className={library.needsYou.length === 0 ? 'mt-0' : undefined}>working</Label>
                    <ul>
                        {working.map((chat) => (
                            <ChatRow key={chat.id} chat={chat} selected={isOpen(chat.id)} onOpen={() => openChat(chat)} trailing={shortAge(chat.updatedAt)} />
                        ))}
                    </ul>
                </section>
            )}

            {/* Always here, with nothing scheduled too, because its arrow is the sidebar's way to Routines. */}
            <section aria-labelledby="sidebar-routines">
                <Label
                    id="sidebar-routines"
                    className={library.needsYou.length + working.length === 0 ? 'mt-0' : undefined}
                    trailing={
                        <LabelButton label="Open Routines" onClick={() => void browser.openPage('routines')}>
                            <ChevronRight className="size-[13px]" strokeWidth={1.5} />
                        </LabelButton>
                    }
                >
                    routines
                </Label>
                <ul>
                    {routines.map((routine) => (
                        <li key={routine.id}>
                            <button type="button" onClick={() => openRoutine(routine)} className={cn(ROW, 'hover:bg-hover hover:text-ink')}>
                                <span className={LEAD}>
                                    <Berry mood={routine.status === 'running' ? 'fetching' : 'rest'} size={20} mascot={find(routine.mascotId)} />
                                </span>
                                <span className="flex-1 truncate">{routine.name}</span>
                                {/* A run ended since Routines was last opened, which may be one that couldn't finish. */}
                                {routine.unseen ? (
                                    <span className="shrink-0 font-mono text-11 text-ink">news<span className="sr-only">. Has news</span></span>
                                ) : (
                                    <span className="shrink-0 font-mono text-11 text-ink-3 tabular-nums">
                                        {routine.paused ? 'paused' : routine.nextRunAt ? shortWhen(routine.nextRunAt) : ''}
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
                {routines.length === 0 && <p className="h-[30px] px-2 flex items-center text-12 text-faint">Nothing scheduled yet.</p>}
            </section>

            {earlier.length > 0 && (
                <section aria-labelledby="sidebar-earlier">
                    <Rule />
                    <Label id="sidebar-earlier">earlier</Label>
                    <ul>
                        {(allEarlier ? earlier : earlier.slice(0, EARLIER_SHOWN)).map((chat) => (
                            <ChatRow key={chat.id} chat={chat} selected={isOpen(chat.id)} onOpen={() => openChat(chat)} trailing={shortWhen(chat.updatedAt)} />
                        ))}
                    </ul>
                    {!allEarlier && earlier.length > EARLIER_SHOWN && (
                        <button type="button" onClick={() => setAllEarlier(true)} className={cn(ROW, 'text-ink-3 hover:bg-hover hover:text-ink')}>
                            <span className={LEAD} />
                            Show more
                        </button>
                    )}
                </section>
            )}

        </>
    )
}

// --- The dock -------------------------------------------------------------------------------------------------------

// What a mascot's face says in the dock: asking, working, or at rest.
const useMascotState = () => {
    const library = useLibrary()
    return (mascot: MascotProfile) => {
        const ownChats = library.chats.filter((chat) => (chat.mascotId ?? BERRY_ID) === mascot.id)
        const asking = library.needsYou.filter((item) => item.mascotId === mascot.id)
        const running = ownChats.filter((chat) => chat.running && !asking.some((item) => item.id === chat.id))
        const mood = asking.length > 0 ? 'asking' : running.length > 0 ? 'fetching' : 'rest'
        return { mood, asking, running, recent: ownChats.filter((chat) => !chat.running).slice(0, 3) } as const
    }
}

// Pressing a mascot in the dock opens this: who it is, what it may do, what it's doing, and a way to start a chat with
// it. It shows, it doesn't choose.
const MascotCard: React.FC<{ mascot: MascotProfile; onClose: () => void }> = ({ mascot, onClose }) => {
    const stateOf = useMascotState()
    const { mood, asking, running, recent } = stateOf(mascot)
    const name = useAssistantName(mascot)
    const { choose } = useFlock()
    const { createTab } = useBrowser()
    const card = useRef<HTMLDivElement>(null)

    useEffect(() => {
        card.current?.querySelector<HTMLElement>('button')?.focus()
    }, [])

    const line = 'h-[30px] flex items-center gap-[9px] px-1 text-12 text-ink-2 rounded-row text-left w-full'
    return (
        <div
            ref={card}
            role="dialog"
            aria-label={name}
            onKeyDown={(event) => {
                if (event.key === 'Escape') onClose()
            }}
            className="absolute inset-x-0 bottom-[54px] z-20 p-3 rounded-sheet bg-sheet text-ink shadow-lift animate-[fade-in_150ms_cubic-bezier(.2,.8,.2,1)] app-region-no-drag"
        >
            <div className="flex items-center gap-2.5">
                {/* Still, as only the working mascot's own row moves in the sidebar. */}
                <Berry mood={mood} size={36} mascot={mascot} still />
                <span className="min-w-0">
                    <span className="block font-medium truncate">{name}</span>
                    <span className="block font-mono text-11 text-ink-3 truncate">{limitsInBrief(mascot)}</span>
                </span>
            </div>
            <div aria-hidden className="h-px mt-2.5 mb-1 bg-line" />
            <ul>
                {asking.map((item) => (
                    <li key={item.id}>
                        <button type="button" onClick={() => (item.routineId ? openRoutine({ id: item.routineId }) : openChat({ id: item.id, title: item.job }))} className={cn(line, 'text-ink hover:bg-hover', FOCUS)}>
                            <Pips pattern="waiting" className="text-ask" still />
                            <span className="flex-1 truncate">Needs you on {item.job}</span>
                        </button>
                    </li>
                ))}
                {running.map((chat) => (
                    <li key={chat.id}>
                        <button type="button" onClick={() => openChat(chat)} className={cn(line, 'text-ink hover:bg-hover', FOCUS)}>
                            <Pips pattern="think" still />
                            <span className="flex-1 truncate">{chat.title}</span>
                            <span className="font-mono text-11 text-ink-3 tabular-nums">{shortAge(chat.updatedAt)}</span>
                        </button>
                    </li>
                ))}
                {recent.map((chat) => (
                    <li key={chat.id}>
                        <button type="button" onClick={() => openChat(chat)} className={cn(line, 'hover:bg-hover hover:text-ink', FOCUS)}>
                            <Pips pattern="read" />
                            <span className="flex-1 truncate">{chat.title}</span>
                            <span className="font-mono text-11 text-ink-3 tabular-nums">{shortWhen(chat.updatedAt)}</span>
                        </button>
                    </li>
                ))}
                {asking.length + running.length + recent.length === 0 && <li className={cn(line, 'text-faint')}>No chats yet.</li>}
            </ul>
            <button
                type="button"
                onClick={() => {
                    choose(mascot.id)
                    createTab()
                    onClose()
                }}
                className={cn('mt-1.5 w-full h-[30px] rounded-full shadow-[inset_0_0_0_1px_var(--line)] text-12 text-ink-2 transition-[background-color,transform] duration-fast hover:bg-hover hover:text-ink active:scale-[.96]', FOCUS)}
            >
                New chat with {name}
            </button>
            <button
                type="button"
                onClick={() => {
                    void window.chromeAPI.browser.openPage('flock')
                    onClose()
                }}
                className={cn('mt-1 w-full h-7 rounded-full text-12 text-ink-3 hover:text-ink', FOCUS)}
            >
                All your mascots
            </button>
        </div>
    )
}

// Every mascot with its mood for a face, then Settings. It's how you see who is doing what at a glance.
const Dock: React.FC = () => {
    const { flock } = useFlock()
    const stateOf = useMascotState()
    const [open, setOpen] = useState<string | null>(null)
    const dock = useRef<HTMLDivElement>(null)
    const shown = flock.find((mascot) => mascot.id === open)

    useEffect(() => {
        if (!open) return
        const close = (event: PointerEvent) => {
            if (!dock.current?.contains(event.target as Node)) setOpen(null)
        }
        window.addEventListener('pointerdown', close)
        return () => window.removeEventListener('pointerdown', close)
    }, [open])

    const closeCard = () => {
        const id = open
        setOpen(null)
        dock.current?.querySelector<HTMLElement>(`[data-dock-mascot="${id}"]`)?.focus()
    }

    return (
        <div ref={dock} className="relative shrink-0 mx-0.5">
            {shown && <MascotCard key={shown.id} mascot={shown} onClose={closeCard} />}
            <div className="h-[46px] px-[9px] flex items-center gap-[7px] rounded-tile bg-tray">
                <ul aria-label="Your mascots" className="flex-1 min-w-0 -m-1.5 p-1.5 flex items-center gap-[7px] overflow-x-auto [&::-webkit-scrollbar]:hidden">
                    {flock.map((mascot) => (
                        <li key={mascot.id} className="shrink-0">
                            <DockMascot mascot={mascot} mood={stateOf(mascot).mood} open={open === mascot.id} onPress={() => setOpen(open === mascot.id ? null : mascot.id)} />
                        </li>
                    ))}
                </ul>
                <ToolBarButton label="Settings" onClick={() => void window.chromeAPI.browser.openPage('settings')} className="size-7 -mr-1">
                    <SlidersHorizontal className={ICON} strokeWidth={1.5} />
                </ToolBarButton>
            </div>
        </div>
    )
}

const DockMascot: React.FC<{ mascot: MascotProfile; mood: 'asking' | 'fetching' | 'rest'; open: boolean; onPress: () => void }> = ({ mascot, mood, open, onPress }) => {
    const name = useAssistantName(mascot)
    return (
        <button
            type="button"
            data-dock-mascot={mascot.id}
            aria-label={`${name}${mood === 'asking' ? ', needs you' : mood === 'fetching' ? ', working' : ''}`}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={onPress}
            className={cn('size-[30px] flex items-center justify-center rounded-row transition-colors hover:bg-hover app-region-no-drag', open && 'bg-press', FOCUS)}
        >
            {/* The dock's faces stay still: in the sidebar only the working mascot's own row moves. */}
            <Berry mood={mood} size={26} mascot={mascot} still />
        </button>
    )
}

// --- The sidebar ----------------------------------------------------------------------------------------------------

type Face = 'tabs' | 'chats'

// Tabs or Chats. A dot in `ask` on Chats while anything needs you, on either face.
const FaceSwitch: React.FC<{ face: Face; onChange: (face: Face) => void }> = ({ face, onChange }) => {
    const waiting = useLibrary().needsYou.length
    return (
        <div role="tablist" aria-label="Sidebar" className="shrink-0 mx-0.5 mb-3 h-[30px] p-0.5 grid grid-cols-2 rounded-[10px] bg-tray text-12 app-region-no-drag">
            {(['tabs', 'chats'] as const).map((each) => (
                <button
                    key={each}
                    type="button"
                    role="tab"
                    aria-selected={face === each}
                    onClick={() => onChange(each)}
                    className={cn(
                        'flex items-center justify-center gap-1.5 rounded-[8px] transition-colors',
                        face === each ? 'bg-sheet text-ink font-medium shadow-rim' : 'text-ink-2 hover:text-ink',
                        FOCUS
                    )}
                >
                    {each === 'tabs' ? 'Tabs' : 'Chats'}
                    {each === 'chats' && waiting > 0 && (
                        <>
                            <span aria-hidden className="size-1.5 rounded-full bg-ask" />
                            <span className="sr-only">, {waiting} {waiting === 1 ? 'needs' : 'need'} you</span>
                        </>
                    )}
                </button>
            ))}
        </div>
    )
}

// Whether a scrolling list has rows below what shows.
const useMoreBelow = () => {
    const list = useRef<HTMLDivElement>(null)
    const [moreBelow, setMoreBelow] = useState(false)
    const check = () => {
        const element = list.current
        if (element) setMoreBelow(element.scrollTop + element.clientHeight < element.scrollHeight - 1)
    }
    useEffect(() => {
        const element = list.current
        if (!element) return
        const observer = new ResizeObserver(check)
        observer.observe(element)
        // The rows' own wrapper, since adding a tab changes what scrolls but not the list's size.
        if (element.firstElementChild) observer.observe(element.firstElementChild)
        return () => observer.disconnect()
    }, [])
    return { list, moreBelow, check }
}

// `floating` is the collapsed sidebar shown over the page, where the button pins it open again.
export const Sidebar: React.FC<{ floating?: boolean }> = ({ floating = false }) => {
    const { layout, theme, toggleSidebar } = useShell()
    const [face, setFace] = useState<Face>('tabs')

    // The top row lines up with the toolbar, wherever this sidebar starts: the floating one is inset in its view.
    const nav = useRef<HTMLElement>(null)
    const [top, setTop] = useState(0)
    useLayoutEffect(() => setTop(nav.current?.getBoundingClientRect().top ?? 0), [])
    const above = layout.addressRow.y - (floating ? layout.floatingSidebar.y : layout.sidebar.y) - top
    const { list, moreBelow, check } = useMoreBelow()

    return (
        <nav ref={nav} aria-label="Sidebar" className="h-full flex flex-col pl-3 pr-2.5 pb-2.5">
            <div
                className="shrink-0 -ml-1 flex items-center justify-end box-content app-region-drag"
                style={{
                    // Padding, so the space above can still drag the window.
                    paddingTop: Math.max(above, 0),
                    marginTop: Math.min(above, 0),
                    height: layout.addressRow.height,
                    paddingLeft: theme.platform === 'mac' ? layout.controls.width : undefined
                }}
            >
                <ToolBarButton Icon={PanelLeft} label={floating ? 'Keep sidebar open' : 'Hide sidebar'} onClick={toggleSidebar} />
            </div>

            <FaceSwitch face={face} onChange={setFace} />

            {/* While rows go on below, the cut one fades out, so none looks as if it's under the dock. */}
            <div
                ref={list}
                onScroll={check}
                role="tabpanel"
                aria-label={face === 'tabs' ? 'Tabs' : 'Chats'}
                className={cn('flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-2', moreBelow && '[mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent)]')}
            >
                <div>{face === 'tabs' ? <TabsFace /> : <ChatsFace />}</div>
            </div>

            <Dock />
        </nav>
    )
}
