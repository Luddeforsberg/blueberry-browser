import React, { useRef } from 'react'
import type { Rect } from '@shared/ipc'
import { BrowserProvider, useBrowser } from './contexts/BrowserContext'
import { LibraryProvider, useFlock } from './contexts/LibraryContext'
import { InternalPageView } from './pages/InternalPageView'
import { ChatProvider, useChat } from './contexts/ChatContext'
import { ShellProvider, useShell } from './contexts/ShellContext'
import { Sidebar } from './components/Sidebar'
import { TabStrip } from './components/TabStrip'
import { Toolbar } from './components/Toolbar'
import { ChatPanel } from './components/ChatPanel'
import { ResizeHandle } from './components/ResizeHandle'
import { Onboarding } from './components/Onboarding'
import { BerryCompanion } from './components/BerryCompanion'
import { PageTrouble } from './components/PageTrouble'
import { useRecording } from './components/ShowBerry'
import { cn } from '@common/lib/utils'
import { siteAllowed } from '@shared/mascots'

// Regions sit exactly where main's layout puts them, so the tab view lines up with the page card.
const Region: React.FC<{
    rect: Rect
    className?: string
    children?: React.ReactNode
    onMouseEnter?: () => void
    reading?: boolean
}> = ({ rect, className, children, onMouseEnter, reading }) => (
    <div
        className={cn("absolute", className)}
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        onMouseEnter={onMouseEnter}
        data-berry-reading={reading || undefined}
    >
        {children}
    </div>
)

const Shell: React.FC = () => {
    const { layout, theme, settings } = useShell()
    const { activeTab, reload } = useBrowser()
    const recordingState = useRecording()
    const { isLoading, pageAccess, mascotId } = useChat()
    const { find } = useFlock()
    // Follows the user until a reply starts, and then stays on the page that reply was sent from.
    const sentFrom = useRef<string | null>(null)
    if (!isLoading) sentFrom.current = activeTab?.id ?? null

    if (!settings.onboarded) return <Onboarding />
    const { page, floatingSidebar } = layout
    const trouble = activeTab?.trouble ?? activeTab?.loadError
    // Sending a message is what lets Berry read the open page, so the ring only shows while it does.
    // It also shows on any tab Berry is using in the reply it's working on.
    const recording = recordingState.status === 'recording'
    const reading = !!activeTab && !activeTab.page && (activeTab.berryWorking || (isLoading && pageAccess && activeTab.id === sentFrom.current && siteAllowed(activeTab.url, find(mascotId).sites)))

    return (
        <div className={cn("relative h-full", theme.glass ? "bg-frame" : "bg-background")}>
            {/* One card holds the toolbar, bookmarks bar and page, so they read as one surface. */}
            <Region
                rect={{ ...layout.toolbar, height: page.y + page.height - layout.toolbar.y }}
                reading={reading}
                className={cn(
                    "rounded-panel transition-shadow duration-layout",
                    theme.glass ? "bg-canvas/85 backdrop-blur-2xl" : "bg-canvas",
                    recording ? "shadow-recording" : reading ? "shadow-reading" : "shadow-page"
                )}
            />
            {/* Internal pages draw here. For web pages it shows until the tab view paints, or when a page has crashed. */}
            <Region rect={page} className="overflow-hidden rounded-b-panel">
                {activeTab?.page && <InternalPageView tab={activeTab} />}
                {trouble && <PageTrouble trouble={trouble} onReload={() => void reload()} />}
            </Region>
            {layout.sidebarOpen && (
                <Region rect={layout.sidebar}>
                    <Sidebar />
                    <ResizeHandle panel="sidebar" />
                </Region>
            )}
            {floatingSidebar.width > 0 && (
                // The frame gutter left of the page: reaching it brings the collapsed sidebar back.
                <Region
                    rect={{ x: 0, y: page.y, width: page.x, height: page.height }}
                    onMouseEnter={() => void window.chromeAPI.layout.showFloatingSidebar()}
                />
            )}
            {layout.mode === 'horizontal' && (
                <Region rect={layout.tabStrip}>
                    <TabStrip />
                </Region>
            )}
            <Region rect={layout.toolbar}>
                <Toolbar />
            </Region>
            {layout.chatOpen && (
                <Region rect={layout.chat}>
                    <ChatPanel />
                    <ResizeHandle panel="chat" />
                </Region>
            )}
            <BerryCompanion />
        </div>
    )
}

export const ChromeApp: React.FC = () => (
    <ShellProvider>
        <BrowserProvider>
            <LibraryProvider>
                <ChatProvider>
                    <Shell />
                </ChatProvider>
            </LibraryProvider>
        </BrowserProvider>
    </ShellProvider>
)
