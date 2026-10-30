import React from 'react'
import type { Rect } from '@shared/ipc'
import { BrowserProvider, useBrowser } from './contexts/BrowserContext'
import { LibraryProvider } from './contexts/LibraryContext'
import { InternalPageView } from './pages/InternalPageView'
import { ChatProvider } from './contexts/ChatContext'
import { ShellProvider, useShell } from './contexts/ShellContext'
import { Sidebar } from './components/Sidebar'
import { TabStrip } from './components/TabStrip'
import { Toolbar } from './components/Toolbar'
import { ChatPanel } from './components/ChatPanel'
import { ResizeHandle } from './components/ResizeHandle'
import { Onboarding } from './components/Onboarding'
import { cn } from '@common/lib/utils'

// Regions sit exactly where main's layout puts them, so the tab view lines up with the page card.
const Region: React.FC<{
    rect: Rect
    className?: string
    children?: React.ReactNode
    onMouseEnter?: () => void
}> = ({ rect, className, children, onMouseEnter }) => (
    <div
        className={cn("absolute", className)}
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        onMouseEnter={onMouseEnter}
    >
        {children}
    </div>
)

const Shell: React.FC = () => {
    const { layout, theme, settings } = useShell()
    const { activeTab } = useBrowser()

    if (!settings.onboarded) return <Onboarding />
    const { page, floatingSidebar } = layout

    return (
        <div className={cn("relative h-full", theme.glass ? "bg-glass-tint" : "bg-background")}>
            {/* Internal pages draw here. For web pages it shows until the tab view paints. */}
            <Region rect={page} className="bg-surface rounded-card overflow-hidden">
                {activeTab?.page && <InternalPageView tab={activeTab} />}
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
