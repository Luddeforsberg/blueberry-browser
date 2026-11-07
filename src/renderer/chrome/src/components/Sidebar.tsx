import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bird, ChevronDown, Cloud, Ellipsis, GitFork, Hand, MessageCircle, PanelLeft, Plus, RefreshCw, Search, Settings, X } from 'lucide-react'
import { Favicon, siteIcon } from './Favicon'
import type { InternalPage, TabInfo } from '@shared/ipc'
import type { ChatThreadSummary, NestSummary } from '@shared/library'
import { useBrowser } from '../contexts/BrowserContext'
import { NO_SAVED_SITES, useFlock, useLibrary, useSavedSites } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Tabs } from './Tabs'
import { LEADING_SLOT } from './TabIcon'
import { FOCUS_ADDRESS_EVENT } from './AddressBar'
import { NeedsYouCount } from './NeedsYou'
import { RoutineDot } from './RoutineNotice'
import { ToolBarButton } from './ToolBarButton'
import { cn } from '@common/lib/utils'
import { BerryDot } from '@common/components/Mascot'
import { Berry } from './Berry'

const ROW = cn(
    "w-full flex items-center gap-3 h-[34px] px-3 rounded-card text-14 text-left outline-none transition-colors",
    "app-region-no-drag focus-visible:ring-2 focus-visible:ring-ring"
)

const SidebarRow: React.FC<{
    leading: React.ReactNode
    label: string
    trailing?: React.ReactNode
    onClick: () => void
    // Its page is the active tab. The tab under Tabs carries the highlight, so this row only stops being muted.
    open?: boolean
    muted?: boolean
}> = ({ leading, label, trailing, onClick, open = false, muted = false }) => (
    <li>
        <button
            type="button"
            onClick={onClick}
            className={cn(ROW, "hover:bg-foreground/5", muted && !open && "text-muted-foreground")}
        >
            <span className={LEADING_SLOT}>{leading}</span>
            <span className="flex-1 truncate">{label}</span>
            {trailing && <span className="shrink-0 text-12 text-muted-foreground tabular-nums">{trailing}</span>}
        </button>
    </li>
)

const Section: React.FC<{
    id: string
    title: string
    collapsible?: boolean
    // What stays showing while it's collapsed.
    whenClosed?: React.ReactNode
    // A button at the end of the heading, such as one that makes a new item.
    action?: React.ReactNode
    children: React.ReactNode
}> = ({ id, title, collapsible = false, whenClosed, action, children }) => {
    const [open, setOpen] = useState(true)

    return (
        <section aria-labelledby={id} className="mt-3">
            <h2 id={id} className="flex items-center h-8 px-3 text-14 text-muted-foreground">
                {collapsible ? (
                    <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpen(!open)}
                        className="flex items-center gap-1 rounded-control outline-none app-region-no-drag focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {title}
                        <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
                    </button>
                ) : (
                    title
                )}
                {action && <span className="ml-auto -mr-2 flex">{action}</span>}
            </h2>
            {open ? children : whenClosed}
        </section>
    )
}

// Rows of four and three take turns, offset like a bunch of fruit, on a grid where each site takes two columns.
const CLUSTER_PERIOD = 7
const CLUSTER_OFFSET_AT = 4
const clusterColumn = (index: number) => {
    const place = index % CLUSTER_PERIOD
    return place === 0 ? 1 : place === CLUSTER_OFFSET_AT ? 2 : undefined
}

// Pinned sites and bookmarks, grown together in a round cluster at the top of the sidebar.
const Cluster: React.FC = () => {
    const { createTab } = useBrowser()
    const { theme } = useShell()
    const sites = useSavedSites()

    return (
        <ul aria-label="Bookmarks" className="grid grid-cols-8 gap-y-1.5 px-1 pb-3">
            {sites.length === 0 && <li className="col-span-8 px-2 py-1 text-13 text-muted-foreground">{NO_SAVED_SITES}</li>}
            {sites.map((site, index) => (
                <li key={site.id} className="col-span-2 flex justify-center" style={{ gridColumnStart: clusterColumn(index) }}>
                    <button
                        type="button"
                        aria-label={site.title}
                        title={site.title}
                        onClick={() => createTab(site.url)}
                        onContextMenu={(event) => {
                            event.preventDefault()
                            void window.chromeAPI.library.showBookmarkMenu(site.id)
                        }}
                        className={cn(
                            "size-11 flex items-center justify-center rounded-full text-14 font-semibold text-muted-foreground shadow-selected outline-none transition-colors app-region-no-drag",
                            "hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring",
                            theme.glass ? "bg-surface/60" : "bg-surface"
                        )}
                    >
                        <Favicon src={site.favicon ?? siteIcon(site.url)} fallback={site.title.charAt(0)} />
                    </button>
                </li>
            ))}
        </ul>
    )
}

const age = (time: number) => {
    const minutes = Math.floor((Date.now() - time) / 60000)
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
    return `${Math.floor(minutes / 1440)}d`
}

const ICON = "size-4 shrink-0"

// A chat row's own buttons, over its right end, until the row has the pointer or the keyboard.
const ROW_ACTION = cn(
    "absolute top-1 size-[26px] flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors app-region-no-drag",
    "opacity-0 group-hover/chat:opacity-100 focus-visible:opacity-100 hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
)

// A page the chat's running job opened, under the chat rather than with the user's tabs. It closes when the job ends,
// unless the user takes it over or the reply sends them there.
const JobTabRow: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { switchTab } = useBrowser()
    return (
        <li>
            <button
                type="button"
                aria-current={tab.isActive ? 'page' : undefined}
                onClick={() => !tab.isActive && void switchTab(tab.id)}
                className={cn(ROW, "h-[30px] pl-9 gap-2.5 text-13 text-muted-foreground", tab.isActive ? "bg-selected shadow-selected text-foreground" : "hover:bg-foreground/5 hover:text-foreground")}
            >
                <Favicon src={tab.favicon} site={tab.url} className="size-3.5" />
                <span className="flex-1 truncate">{tab.title || 'New tab'}</span>
            </button>
        </li>
    )
}

// Editing a row's name in place. Enter or leaving it saves, Escape leaves the name as it was.
const RowRename: React.FC<{ label: string; name: string; onDone: (name: string | null) => void }> = ({ label, name, onDone }) => {
    // Enter and Escape end editing before the input's blur arrives, and that blur mustn't save again.
    const finished = useRef(false)
    const finish = (value: string | null) => {
        if (finished.current) return
        finished.current = true
        onDone(value !== null && value.trim() !== name ? value : null)
    }
    return (
        <li>
            <input
                aria-label={label}
                defaultValue={name}
                maxLength={100}
                autoFocus
                onFocus={(event) => event.target.select()}
                onBlur={(event) => finish(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') finish(event.currentTarget.value)
                    if (event.key === 'Escape') finish(null)
                }}
                className={cn(ROW, "bg-surface shadow-selected")}
            />
        </li>
    )
}

// A Nest in the sidebar, which opens its board. Like a chat's row, it renames and deletes from its button or a right-click,
// and the pages its cards' jobs opened sit under it.
const NestRow: React.FC<{ nest: NestSummary; selected: boolean; onOpen: () => void; jobTabs: TabInfo[]; onClose?: () => void }> = ({ nest, selected, onOpen, jobTabs, onClose }) => {
    const [editing, setEditing] = useState(false)
    const { find } = useFlock()
    const api = window.chromeAPI.nests
    const working = nest.working.map((id) => find(id).name)

    const showMenu = async () => {
        if ((await api.showMenu(nest.id)) === 'rename') setEditing(true)
    }

    if (editing) {
        return (
            <RowRename
                label="Nest name"
                name={nest.title}
                onDone={(title) => {
                    setEditing(false)
                    if (title !== null) void api.rename(nest.id, title)
                }}
            />
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
                className={cn(ROW, onClose ? "pr-[60px]" : "pr-9", selected ? "bg-selected shadow-selected" : "hover:bg-foreground/5")}
            >
                <span className={LEADING_SLOT}>
                    <GitFork className={cn(ICON, "text-muted-foreground")} />
                </span>
                <span className="flex-1 truncate">{nest.title}</span>
                {working.length > 0 && (
                    <span className="shrink-0 -mr-6 group-hover/chat:invisible group-focus-within/chat:invisible">
                        <BerryDot working />
                        <span className="sr-only">{working.join(', ')} working</span>
                    </span>
                )}
            </button>
            <button
                type="button"
                aria-label={`More options for ${nest.title}`}
                onClick={() => void showMenu()}
                className={cn(ROW_ACTION, onClose ? "right-8" : "right-1")}
            >
                <Ellipsis className={ICON} />
            </button>
            {onClose && (
                <button type="button" aria-label={`Close ${nest.title}`} onClick={onClose} className={cn(ROW_ACTION, "right-1")}>
                    <X className="size-3" />
                </button>
            )}
            {jobTabs.length > 0 && (
                <ul aria-label={`Pages opened in ${nest.title}`} className="mt-0.5 flex flex-col gap-0.5">
                    {jobTabs.map((tab) => <JobTabRow key={tab.id} tab={tab} />)}
                </ul>
            )}
        </li>
    )
}

// A chat in the sidebar. Hover or keyboard focus swaps its age for a button with Rename and Delete.
export const ChatRow: React.FC<{
    chat: ChatThreadSummary
    selected: boolean
    onOpen: () => void
    // The tabs its running job opened.
    jobTabs?: TabInfo[]
    // Closes its tab, when it has one open, and keeps the chat, as closing any tab does.
    onClose?: () => void
}> = ({ chat, selected, onOpen, jobTabs = [], onClose }) => {
    const [editing, setEditing] = useState(false)
    const api = window.chromeAPI.chat
    const { find } = useFlock()
    const mascot = find(chat.mascotId)
    const { showBerry } = useShell().settings

    const showMenu = async () => {
        if ((await api.showMenu(chat.id)) === 'rename') setEditing(true)
    }

    if (editing) {
        return (
            <RowRename
                label="Chat name"
                name={chat.title}
                onDone={(title) => {
                    setEditing(false)
                    if (title !== null) void api.rename(chat.id, title)
                }}
            />
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
                className={cn(ROW, onClose ? "pr-[60px]" : "pr-9", selected ? "bg-selected shadow-selected" : "hover:bg-foreground/5")}
            >
                {/* Only another bird, or one at work, is worth saying, so a Berry chat's name starts with its title. */}
                <span className={LEADING_SLOT} aria-hidden={(!chat.mascotId && !chat.running) || undefined}>
                    {showBerry ? <Berry mood={chat.running ? 'fetching' : 'rest'} size={20} mascot={mascot} /> : <MessageCircle className={cn(ICON, "text-muted-foreground")} />}
                </span>
                <span className="flex-1 truncate">{chat.title}</span>
                {chat.cloud && (
                    <span className="shrink-0 text-muted-foreground" title="In the cloud">
                        <Cloud role="img" aria-label="In the cloud" className="size-3.5" />
                    </span>
                )}
                {chat.running && (
                    <span className="shrink-0 -mr-6 group-hover/chat:invisible group-focus-within/chat:invisible">
                        <BerryDot working />
                        <span className="sr-only">{mascot.name} is working</span>
                    </span>
                )}
                {!selected && !chat.running && (
                    <span className="shrink-0 -mr-6 text-12 text-muted-foreground tabular-nums group-hover/chat:invisible group-focus-within/chat:invisible">
                        {age(chat.updatedAt)}
                    </span>
                )}
            </button>
            <button
                type="button"
                aria-label={`More options for ${chat.title}`}
                onClick={() => void showMenu()}
                className={cn(ROW_ACTION, onClose ? "right-8" : "right-1")}
            >
                <Ellipsis className={ICON} />
            </button>
            {onClose && (
                <button type="button" aria-label={`Close ${chat.title}`} onClick={onClose} className={cn(ROW_ACTION, "right-1")}>
                    <X className="size-3" />
                </button>
            )}
            {jobTabs.length > 0 && (
                <ul aria-label={`Pages ${mascot.name} opened`} className="mt-0.5 flex flex-col gap-0.5">
                    {jobTabs.map((tab) => <JobTabRow key={tab.id} tab={tab} />)}
                </ul>
            )}
        </li>
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
    const { activeTab, closeTab, createTab, tabs } = useBrowser()
    const library = useLibrary()
    const browser = window.chromeAPI.browser

    const isOpen = (page: InternalPage, param: string | null = null) =>
        activeTab?.page === page && (param === null || activeTab.pageParam === param)

    // A chat's tab shows only as its row, so the row closes it too.
    const chatRow = (chat: ChatThreadSummary) => {
        const tab = tabs.find(({ page, pageParam }) => page === 'chat' && pageParam === chat.id)
        return (
            <ChatRow
                key={chat.id}
                chat={chat}
                selected={isOpen('chat', chat.id)}
                jobTabs={tabs.filter((jobTab) => jobTab.jobChatId === chat.id)}
                onOpen={() => void browser.openPage('chat', { param: chat.id, title: chat.title })}
                onClose={tab && (() => void closeTab(tab.id))}
            />
        )
    }
    const openChat = library.chats.find((chat) => isOpen('chat', chat.id))

    // Like a chat, a Nest's tab shows only as its row.
    const nestRow = (nest: NestSummary) => {
        const tab = tabs.find(({ page, pageParam }) => page === 'nest' && pageParam === nest.id)
        return (
            <NestRow
                key={nest.id}
                nest={nest}
                selected={isOpen('nest', nest.id)}
                jobTabs={tabs.filter((jobTab) => jobTab.jobChatId !== null && nest.chatIds.includes(jobTab.jobChatId))}
                onOpen={() => void browser.openPage('nest', { param: nest.id, title: nest.title })}
                onClose={tab && (() => void closeTab(tab.id))}
            />
        )
    }

    // The buttons on top sit on the toolbar's row, wherever this sidebar starts: the floating one is inset in its view.
    const nav = useRef<HTMLElement>(null)
    const [top, setTop] = useState(0)
    useLayoutEffect(() => setTop(nav.current?.getBoundingClientRect().top ?? 0), [])
    const above = layout.addressRow.y - (floating ? layout.floatingSidebar.y : layout.sidebar.y) - top
    const { list, moreBelow, check } = useMoreBelow()

    return (
        <nav ref={nav} aria-label="Sidebar" className="h-full flex flex-col">
            <div
                className="flex items-center justify-end gap-0.5 px-2.5 pb-2 box-content app-region-drag shrink-0"
                style={{
                    // Padding, so the space above can still drag the window.
                    paddingTop: Math.max(above, 0),
                    marginTop: Math.min(above, 0),
                    height: layout.addressRow.height,
                    paddingLeft: theme.platform === 'mac' ? layout.controls.width : undefined
                }}
            >
                {!floating && (
                    <ToolBarButton
                        Icon={Search}
                        label="Search"
                        onClick={() => window.dispatchEvent(new Event(FOCUS_ADDRESS_EVENT))}
                    />
                )}
                <ToolBarButton
                    Icon={PanelLeft}
                    label={floating ? 'Keep sidebar open' : 'Hide sidebar'}
                    onClick={toggleSidebar}
                />
            </div>

            {/* While rows go on below, the cut one fades out, so none looks as if it's under Settings. */}
            <div
                ref={list}
                onScroll={check}
                className={cn(
                    "flex-1 min-h-0 overflow-y-auto px-2 pt-2 pb-2",
                    moreBelow && "[mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent)]"
                )}
            >
                <div>
                    <Cluster />
                    <ul aria-label="Places">
                        <SidebarRow leading={<Plus className={ICON} />} label="New tab" onClick={() => createTab()} />
                        <SidebarRow
                            muted={library.needsYou.length === 0}
                            leading={<Hand className={ICON} />}
                            label="Needs you"
                            trailing={<NeedsYouCount />}
                            open={isOpen('needs-you')}
                            onClick={() => void browser.openPage('needs-you')}
                        />
                        <SidebarRow
                            muted
                            leading={<RefreshCw className={ICON} />}
                            label="Routines"
                            trailing={<RoutineDot />}
                            open={isOpen('routines')}
                            onClick={() => void browser.openPage('routines')}
                        />
                        <SidebarRow
                            muted
                            leading={<Bird className={ICON} />}
                            label="Flock"
                            open={isOpen('flock')}
                            onClick={() => void browser.openPage('flock')}
                        />
                    </ul>

                    <Section
                        id="sidebar-nests"
                        title="Nests"
                        action={
                            <button
                                type="button"
                                aria-label="New nest"
                                title="New nest"
                                onClick={() => void window.chromeAPI.nests.create()}
                                className="size-[26px] flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors app-region-no-drag hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Plus className={ICON} />
                            </button>
                        }
                    >
                        {library.nests.length > 0 && <ul>{library.nests.map(nestRow)}</ul>}
                    </Section>

                    {library.chats.length > 0 && (
                        // Collapsed, the open chat stays, since Tabs doesn't list it.
                        <Section id="sidebar-chats" title="Chats" collapsible whenClosed={openChat && <ul>{chatRow(openChat)}</ul>}>
                            <ul>{library.chats.map(chatRow)}</ul>
                        </Section>
                    )}

                    <Section id="sidebar-tabs" title="Tabs">
                        <Tabs mode="vertical" labelledBy="sidebar-tabs" showNew={false} />
                    </Section>
                </div>
            </div>

            <ul className="shrink-0 p-2">
                <SidebarRow
                    muted
                    leading={<Settings className={ICON} />}
                    label="Settings"
                    open={isOpen('settings')}
                    onClick={() => void browser.openPage('settings')}
                />
            </ul>
        </nav>
    )
}
