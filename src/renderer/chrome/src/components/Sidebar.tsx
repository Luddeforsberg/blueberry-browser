import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, CircleAlert, Cloud, Ellipsis, MessageCircle, PanelLeft, Plus, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import { Favicon, siteIcon } from './Favicon'
import type { InternalPage, TabInfo } from '@shared/ipc'
import type { ChatThreadSummary } from '@shared/library'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock, useLibrary, useSavedSites } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { usePanelChatId } from '../contexts/ChatContext'
import { DownloadsButton } from './DownloadsButton'
import { BERRY_ID } from '@shared/mascots'
import { Tabs } from './Tabs'
import { LEADING_SLOT } from './TabIcon'
import { FOCUS_ADDRESS_EVENT } from './AddressBar'
import { NeedsYouCount } from './NeedsYou'
import { RoutineDot } from './RoutineNotice'
import { ToolBarButton } from './ToolBarButton'
import { cn } from '@common/lib/utils'
import { BerryDot } from '@common/components/Mascot'
import { Berry } from './Berry'
import { FlockIcon } from './icons'

// Every row is a full pill, 34px tall, and starts with a 20px slot so all their text starts at one straight edge.
const ROW = cn(
    "w-full flex items-center gap-2.5 h-[34px] px-2.5 rounded-full text-14 text-left outline-none transition-colors",
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
            className={cn(ROW, "hover:bg-hover", muted && !open && "text-muted-foreground")}
        >
            <span className={LEADING_SLOT}>{leading}</span>
            <span className="flex-1 truncate">{label}</span>
            {trailing && <span className="shrink-0 flex items-center text-12 text-muted-foreground tabular-nums">{trailing}</span>}
        </button>
    </li>
)

const Section: React.FC<{
    id: string
    title: string
    collapsible?: boolean
    // What stays showing while it's collapsed.
    whenClosed?: React.ReactNode
    children: React.ReactNode
}> = ({ id, title, collapsible = false, whenClosed, children }) => {
    const [open, setOpen] = useState(true)

    return (
        <section aria-labelledby={id} className="mt-4">
            <h2 id={id} className="flex items-center h-8 px-2.5 text-13 text-muted-foreground">
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
            </h2>
            {open ? children : whenClosed}
        </section>
    )
}

// Below this window height only the first row of tiles shows, and the last tile says how many more.
const SHORT_WINDOW = 760
const TILES_PER_ROW = 4

// Pinned sites and bookmarks as each site's own icon on a 28px tile, in rows of four, with nothing round them.
const PinnedTiles: React.FC = () => {
    const { createTab } = useBrowser()
    const sites = useSavedSites()
    const [showAll, setShowAll] = useState(false)
    const [short, setShort] = useState(() => window.innerHeight < SHORT_WINDOW)
    useEffect(() => {
        const update = () => setShort(window.innerHeight < SHORT_WINDOW)
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])
    const cut = short && !showAll && sites.length > TILES_PER_ROW
    const shown = cut ? sites.slice(0, TILES_PER_ROW - 1) : sites
    const tile = "size-7 flex items-center justify-center rounded-control outline-none app-region-no-drag focus-visible:ring-2 focus-visible:ring-ring"

    if (sites.length === 0) return null
    return (
        <ul aria-label="Bookmarks" className="grid grid-cols-4 justify-items-center gap-y-2.5 pt-1.5 pb-3">
            {shown.map((site) => (
                <li key={site.id} className="size-8 flex items-center justify-center">
                    <button
                        type="button"
                        aria-label={site.title}
                        title={site.title}
                        onClick={() => createTab(site.url)}
                        onContextMenu={(event) => {
                            event.preventDefault()
                            void window.chromeAPI.library.showBookmarkMenu(site.id)
                        }}
                        className={cn(tile, "overflow-hidden")}
                    >
                        <Favicon src={site.favicon ?? siteIcon(site.url)} site={site.url} tile className="size-7 rounded-control" />
                    </button>
                </li>
            ))}
            {cut && (
                <li className="size-8 flex items-center justify-center">
                    <button
                        type="button"
                        aria-label={`Show ${sites.length - shown.length} more`}
                        onClick={() => setShowAll(true)}
                        className={cn(tile, "text-12 text-muted-foreground shadow-[inset_0_0_0_1px_rgb(var(--outline))] hover:bg-hover hover:text-foreground")}
                    >
                        +{sites.length - shown.length}
                    </button>
                </li>
            )}
        </ul>
    )
}

const ICON = "size-4 shrink-0"
// The shortcut that opens a new tab, as it's pressed on this computer.
const NEW_TAB_KEYS = { mac: '⌘T', windows: 'Ctrl T', other: 'Ctrl T' }

// A chat row's own buttons, over its right end, until the row has the pointer or the keyboard.
const ROW_ACTION = cn(
    "absolute top-1 size-[26px] flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors app-region-no-drag",
    "opacity-0 group-hover/chat:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
                className={cn(ROW, "h-7 pl-[42px] gap-2 text-13", tab.isActive ? "text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground")}
            >
                <Favicon src={tab.favicon} site={tab.url} className="size-3.5" />
                <span className="flex-1 truncate">{tab.title || 'New tab'}</span>
            </button>
        </li>
    )
}

// A chat in the sidebar. Hover or keyboard focus shows a button with Rename and Delete.
export const ChatRow: React.FC<{
    chat: ChatThreadSummary
    selected: boolean
    onOpen: () => void
    // The tabs its running job opened.
    jobTabs?: TabInfo[]
    // Closes its tab, when it has one open, and keeps the chat, as closing any tab does.
    onClose?: () => void
    // The chat panel shows it beside a page: the one semibold row, and not raised.
    inPanel?: boolean
}> = ({ chat, selected, onOpen, jobTabs = [], onClose, inPanel = false }) => {
    const [editing, setEditing] = useState(false)
    // Enter and Escape end editing before the input's blur arrives, and that blur mustn't save again.
    const finished = useRef(false)
    const api = window.chromeAPI.chat
    const { find } = useFlock()
    const mascot = find(chat.mascotId)
    const { showBerry } = useShell().settings

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
                    className={cn(ROW, "bg-surface shadow-selected")}
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
                className={cn(
                    ROW,
                    onClose ? "pr-[60px]" : "pr-9",
                    selected ? "bg-selected shadow-selected" : "hover:bg-hover",
                    inPanel && !selected && "font-semibold"
                )}
            >
                {/* A chat's slot is empty, so its title starts on the same edge as every other row's. */}
                <span aria-hidden className={LEADING_SLOT} />
                <span className="min-w-0 truncate">{chat.title}</span>
                {/* Another bird shows straight after the title. Berry's own chats stay plain. */}
                {showBerry && chat.mascotId && chat.mascotId !== BERRY_ID && (
                    <span className="shrink-0 -ml-1 flex"><Berry size={16} mascot={mascot} /></span>
                )}
                <span className="flex-1" />
                {chat.cloud && (
                    <span className="shrink-0 text-muted-foreground" title="In the cloud">
                        <Cloud role="img" aria-label="In the cloud" className="size-3.5" />
                    </span>
                )}
                {chat.running && (
                    <span className="shrink-0 -mr-6 flex group-hover/chat:invisible group-focus-within/chat:invisible">
                        {showBerry ? <BerryDot working /> : <MessageCircle className="size-3.5 text-muted-foreground" />}
                        <span className="sr-only">{mascot.name} is working</span>
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

// Off a Mac the window has no menu bar, so More opens the same menu, under itself.
const MoreButton: React.FC = () => {
    const anchor = useRef<HTMLSpanElement>(null)
    const open = () => {
        const rect = anchor.current?.getBoundingClientRect()
        void window.chromeAPI.layout.showAppMenu(rect && { x: rect.left, y: rect.bottom })
    }
    return (
        <span ref={anchor} className="flex">
            <ToolBarButton Icon={Ellipsis} label="More" onClick={open} />
        </span>
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
    const panelChatId = usePanelChatId()
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
                inPanel={layout.chatOpen && panelChatId === chat.id}
                onOpen={() => void browser.openPage('chat', { param: chat.id, title: chat.title })}
                onClose={tab && (() => void closeTab(tab.id))}
            />
        )
    }
    const openChat = library.chats.find((chat) => isOpen('chat', chat.id))

    // The buttons on top sit on the top bar's line, wherever this sidebar starts: the floating one is inset in its view.
    const nav = useRef<HTMLElement>(null)
    const [top, setTop] = useState(0)
    useLayoutEffect(() => setTop(nav.current?.getBoundingClientRect().top ?? 0), [])
    const above = layout.addressRow.y - (floating ? layout.floatingSidebar.y : layout.sidebar.y) - top
    const { list, moreBelow, check } = useMoreBelow()

    return (
        <nav ref={nav} aria-label="Sidebar" className="h-full flex flex-col">
            {/* Window buttons on a Mac, then collapse, search and downloads on one row. Downloads are only ever here, or
                at the end of the address row when there's no sidebar. */}
            <div
                className="flex items-center gap-1 px-2.5 box-content app-region-drag shrink-0"
                style={{
                    // Padding, so the space above can still drag the window.
                    paddingTop: Math.max(above, 0),
                    marginTop: Math.min(above, 0),
                    height: layout.addressRow.height,
                    paddingLeft: theme.platform === 'mac' ? layout.controls.width : undefined
                }}
            >
                <ToolBarButton
                    Icon={PanelLeft}
                    label={floating ? 'Keep sidebar open' : 'Hide sidebar'}
                    onClick={toggleSidebar}
                />
                {!floating && (
                    <ToolBarButton Icon={Search} label="Search" onClick={() => window.dispatchEvent(new Event(FOCUS_ADDRESS_EVENT))} />
                )}
                <div className="flex-1" />
                <DownloadsButton />
                {theme.platform !== 'mac' && <MoreButton />}
            </div>

            {/* While rows go on below, the cut one fades out, so none looks as if it's under Settings. */}
            <div
                ref={list}
                onScroll={check}
                className={cn(
                    "flex-1 min-h-0 overflow-y-auto px-2.5 pt-1 pb-2",
                    moreBelow && "[mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent)]"
                )}
            >
                <div>
                    <PinnedTiles />
                    <ul aria-label="Places">
                        <SidebarRow
                            leading={<Plus className={ICON} />}
                            label="New tab"
                            trailing={<kbd className="font-mono text-11 text-muted-foreground">{NEW_TAB_KEYS[theme.platform]}</kbd>}
                            onClick={() => createTab()}
                        />
                        <SidebarRow
                            muted={library.needsYou.length === 0}
                            leading={<CircleAlert className={ICON} />}
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
                            leading={<FlockIcon className={ICON} />}
                            label="Flock"
                            open={isOpen('flock')}
                            onClick={() => void browser.openPage('flock')}
                        />
                    </ul>

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

            <ul className="shrink-0 mx-2.5 mb-2.5 pt-1.5 border-t">
                <SidebarRow
                    muted
                    leading={<SlidersHorizontal className={ICON} />}
                    label="Settings"
                    open={isOpen('settings')}
                    onClick={() => void browser.openPage('settings')}
                />
            </ul>
        </nav>
    )
}
