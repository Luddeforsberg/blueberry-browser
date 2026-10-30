import React, { useState } from 'react'
import { ChevronDown, MessageCircle, PanelLeft, Plus, RefreshCw, Search, Settings } from 'lucide-react'
import type { InternalPage } from '@shared/ipc'
import { useBrowser } from '../contexts/BrowserContext'
import { useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Tabs } from './Tabs'
import { FOCUS_ADDRESS_EVENT } from './AddressBar'
import { Berry } from './Berry'
import { ToolBarButton } from './ToolBarButton'
import { cn } from '@common/lib/utils'

const ROW = cn(
    "w-full flex items-center gap-3 h-[34px] px-3 rounded-card text-14 text-left outline-none transition-colors",
    "app-region-no-drag focus-visible:ring-2 focus-visible:ring-ring"
)

const SidebarRow: React.FC<{
    leading?: React.ReactNode
    label: string
    trailing?: string
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

const age = (time: number) => {
    const minutes = Math.floor((Date.now() - time) / 60000)
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
    return `${Math.floor(minutes / 1440)}d`
}

const ICON = "size-4 shrink-0"

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
                {floating ? (
                    <ToolBarButton Icon={PanelLeft} label="Keep sidebar open" onClick={toggleSidebar} />
                ) : (
                    <ToolBarButton
                        Icon={Search}
                        label="Search"
                        onClick={() => window.dispatchEvent(new Event(FOCUS_ADDRESS_EVENT))}
                    />
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-2 pb-2">
                <ul aria-label="Places">
                    <SidebarRow leading={<Plus className={ICON} />} label="New Tab" onClick={() => createTab()} />
                    <SidebarRow
                        muted
                        leading={<MessageCircle className={ICON} />}
                        label="New chat"
                        onClick={() => void browser.openPage('chat')}
                    />
                    <SidebarRow
                        muted
                        leading={<RefreshCw className={ICON} />}
                        label="Routines"
                        selected={isOpen('routines')}
                        onClick={() => void browser.openPage('routines')}
                    />
                    <SidebarRow
                        muted
                        leading={<Settings className={ICON} />}
                        label="Settings"
                        selected={isOpen('settings')}
                        onClick={() => void browser.openPage('settings')}
                    />
                </ul>

                {library.chats.length > 0 && (
                    <Section id="sidebar-chats" title="Chats" collapsible>
                        <ul>
                            {library.chats.map((chat) => (
                                <SidebarRow
                                    key={chat.id}
                                    leading={<Berry mood="rest" size={18} />}
                                    label={chat.title}
                                    trailing={isOpen('chat', chat.id) ? undefined : age(chat.updatedAt)}
                                    selected={isOpen('chat', chat.id)}
                                    onClick={() => void browser.openPage('chat', { param: chat.id, title: chat.title })}
                                />
                            ))}
                        </ul>
                    </Section>
                )}

                <Section id="sidebar-tabs" title="Tabs">
                    <Tabs mode="vertical" labelledBy="sidebar-tabs" showNew={false} />
                </Section>
            </div>
        </nav>
    )
}
