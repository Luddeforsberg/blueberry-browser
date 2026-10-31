import React, { useRef, useState } from 'react'
import { Bird, ChevronDown, Ellipsis, Hand, MessageCircle, PanelLeft, Plus, RefreshCw, Search, Settings } from 'lucide-react'
import { Favicon, siteIcon } from './Favicon'
import type { InternalPage } from '@shared/ipc'
import type { ChatThreadSummary } from '@shared/library'
import { useBrowser } from '../contexts/BrowserContext'
import { NO_SAVED_SITES, useFlock, useLibrary, useSavedSites } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Tabs } from './Tabs'
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
    leading?: React.ReactNode
    label: string
    trailing?: React.ReactNode
    onClick: () => void
    selected?: boolean
    muted?: boolean
}> = ({ leading, label, trailing, onClick, selected = false, muted = false }) => (
    <li>
        <button
            type="button"
            aria-current={selected ? 'page' : undefined}
            onClick={onClick}
            className={cn(ROW, selected ? "bg-selected shadow-selected" : "hover:bg-foreground/5", muted && !selected && "text-muted-foreground")}
        >
            {leading}
            <span className="flex-1 truncate">{label}</span>
            {trailing && <span className="shrink-0 text-12 text-muted-foreground tabular-nums">{trailing}</span>}
        </button>
    </li>
)

const Section: React.FC<{
    id: string
    title: string
    collapsible?: boolean
    children: React.ReactNode
}> = ({ id, title, collapsible = false, children }) => {
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
            </h2>
            {open && children}
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
                        <Favicon src={siteIcon(site.url)} fallback={site.title.charAt(0)} />
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

// A chat in the sidebar. Hover or keyboard focus swaps its age for a button with Rename and Delete.
export const ChatRow: React.FC<{
    chat: ChatThreadSummary
    selected: boolean
    onOpen: () => void
}> = ({ chat, selected, onOpen }) => {
    const [editing, setEditing] = useState(false)
    // Enter and Escape end editing before the input's blur arrives, and that blur mustn't save again.
    const finished = useRef(false)
    const api = window.chromeAPI.chat
    const { find } = useFlock()
    const mascot = find(chat.mascotId)

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
                className={cn(ROW, "pr-9", selected ? "bg-selected shadow-selected" : "hover:bg-foreground/5")}
            >
                {/* Berry's own chats stay plain until it's working, so a list of them stays quiet. */}
                {(chat.mascotId || chat.running) && <Berry mood={chat.running ? 'fetching' : 'rest'} size={20} mascot={mascot} className="-ml-0.5" />}
                <span className="flex-1 truncate">{chat.title}</span>
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
                className={cn(
                    "absolute right-1 top-1 size-[26px] flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors app-region-no-drag",
                    "opacity-0 group-hover/chat:opacity-100 focus-visible:opacity-100 hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                )}
            >
                <Ellipsis className={ICON} />
            </button>
        </li>
    )
}

// `floating` is the collapsed sidebar shown over the page, where the button pins it open again.
export const Sidebar: React.FC<{ floating?: boolean }> = ({ floating = false }) => {
    const { layout, theme, toggleSidebar } = useShell()
    const { activeTab, createTab } = useBrowser()
    const library = useLibrary()
    const browser = window.chromeAPI.browser

    const isOpen = (page: InternalPage, param: string | null = null) =>
        activeTab?.page === page && (param === null || activeTab.pageParam === param)

    return (
        <nav aria-label="Sidebar" className="h-full flex flex-col">
            <div
                className="flex items-center justify-end gap-0.5 px-2.5 app-region-drag shrink-0"
                style={{
                    height: layout.controls.height,
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

            <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-2 pb-2">
                <Cluster />
                <ul aria-label="Places">
                    <SidebarRow leading={<Plus className={ICON} />} label="New Tab" onClick={() => createTab()} />
                    <SidebarRow
                        muted
                        leading={<MessageCircle className={ICON} />}
                        label="New chat"
                        onClick={() => void browser.openPage('chat')}
                    />
                    <SidebarRow
                        muted={library.needsYou.length === 0}
                        leading={<Hand className={ICON} />}
                        label="Needs you"
                        trailing={<NeedsYouCount />}
                        selected={isOpen('needs-you')}
                        onClick={() => void browser.openPage('needs-you')}
                    />
                    <SidebarRow
                        muted
                        leading={<RefreshCw className={ICON} />}
                        label="Routines"
                        trailing={<RoutineDot />}
                        selected={isOpen('routines')}
                        onClick={() => void browser.openPage('routines')}
                    />
                    <SidebarRow
                        muted
                        leading={<Bird className={ICON} />}
                        label="Flock"
                        selected={isOpen('flock')}
                        onClick={() => void browser.openPage('flock')}
                    />
                </ul>

                {library.chats.length > 0 && (
                    <Section id="sidebar-chats" title="Chats" collapsible>
                        <ul>
                            {library.chats.map((chat) => (
                                <ChatRow
                                    key={chat.id}
                                    chat={chat}
                                    selected={isOpen('chat', chat.id)}
                                    onOpen={() => void browser.openPage('chat', { param: chat.id, title: chat.title })}
                                />
                            ))}
                        </ul>
                    </Section>
                )}

                <Section id="sidebar-tabs" title="Tabs">
                    <Tabs mode="vertical" labelledBy="sidebar-tabs" showNew={false} />
                </Section>
            </div>

            <ul className="shrink-0 p-2">
                <SidebarRow
                    muted
                    leading={<Settings className={ICON} />}
                    label="Settings"
                    selected={isOpen('settings')}
                    onClick={() => void browser.openPage('settings')}
                />
            </ul>
        </nav>
    )
}
