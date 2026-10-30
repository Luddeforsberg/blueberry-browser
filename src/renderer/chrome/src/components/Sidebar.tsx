import React from 'react'
import { Bookmark, MessageCircle, PanelLeft, Plus, RefreshCw, Settings } from 'lucide-react'
import type { InternalPage } from '@shared/ipc'
import { useBrowser } from '../contexts/BrowserContext'
import { useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Tabs } from './Tabs'
import { ToolBarButton } from './ToolBarButton'
import { cn } from '@common/lib/utils'

const SidebarRow: React.FC<{
    icon: React.FC<{ className?: string }>
    label: string
    onClick: () => void
    selected?: boolean
    muted?: boolean
}> = ({ icon: Icon, label, onClick, selected = false, muted = false }) => (
    <li>
        <button
            type="button"
            aria-current={selected ? 'page' : undefined}
            onClick={onClick}
            className={cn(
                "w-full flex items-center gap-2 h-8 px-2 rounded-control text-13 text-left outline-none transition-colors",
                "app-region-no-drag focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "bg-muted font-semibold" : "hover:bg-muted",
                muted && !selected && "text-muted-foreground"
            )}
        >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
        </button>
    </li>
)

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
    <section aria-labelledby={id} className="mt-3">
        <h2 id={id} className="px-2 pb-1 text-11 text-muted-foreground">
            {title}
        </h2>
        {children}
    </section>
)

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
                className="flex items-center justify-end px-2 app-region-drag shrink-0"
                style={{
                    height: layout.toolbar.height,
                    paddingLeft: theme.platform === 'mac' ? layout.controls.width : undefined
                }}
            >
                <ToolBarButton
                    Icon={PanelLeft}
                    label={floating ? "Keep sidebar open" : "Hide sidebar"}
                    onClick={toggleSidebar}
                />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
                {library.pinned.length > 0 && (
                    <ul aria-label="Pinned" className="grid grid-cols-4 gap-1">
                        {library.pinned.map((site) => (
                            <li key={site.id}>
                                <button
                                    type="button"
                                    title={site.title}
                                    aria-label={site.title}
                                    onClick={() => createTab(site.url)}
                                    className={cn(
                                        "w-full h-9 flex items-center justify-center rounded-card bg-muted text-13",
                                        "hover:bg-border outline-none transition-colors app-region-no-drag",
                                        "focus-visible:ring-2 focus-visible:ring-ring"
                                    )}
                                >
                                    {site.title.charAt(0)}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <Section id="sidebar-bookmarks" title="Bookmarks">
                    <ul>
                        {library.bookmarks.map((bookmark) => (
                            <SidebarRow
                                key={bookmark.id}
                                icon={Bookmark}
                                label={bookmark.title}
                                onClick={() => createTab(bookmark.url)}
                            />
                        ))}
                    </ul>
                </Section>

                <Section id="sidebar-chats" title="Chats">
                    <ul>
                        {library.chats.map((chat) => (
                            <SidebarRow
                                key={chat.id}
                                icon={MessageCircle}
                                label={chat.title}
                                selected={isOpen('chat', chat.id)}
                                onClick={() => void browser.openPage('chat', { param: chat.id, title: chat.title })}
                            />
                        ))}
                        <SidebarRow
                            icon={Plus}
                            label="New chat"
                            muted
                            onClick={() => void browser.openPage('chat')}
                        />
                    </ul>
                </Section>

                <Section id="sidebar-tabs" title="Tabs">
                    <Tabs mode="vertical" labelledBy="sidebar-tabs" />
                </Section>
            </div>

            <ul aria-label="Places" className="shrink-0 px-2 pb-2">
                <SidebarRow
                    icon={RefreshCw}
                    label="Routines"
                    selected={isOpen('routines')}
                    onClick={() => void browser.openPage('routines')}
                />
                <SidebarRow
                    icon={Settings}
                    label="Settings"
                    selected={isOpen('settings')}
                    onClick={() => void browser.openPage('settings')}
                />
            </ul>
        </nav>
    )
}
