import React from 'react'
import { Menu } from 'lucide-react'
import type { Rect } from '@shared/ipc'
import { flockPlace } from '@shared/flockPlaces'
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
import { PageTrouble } from './components/PageTrouble'
import { ToolBarButton } from './components/ToolBarButton'
import { useRecording } from './components/ShowBerry'
import { cn } from '@common/lib/utils'

// Regions sit exactly where main's layout puts them, so the tab view lines up with the page's sheet.
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
    const { layout, settings } = useShell()
    const { activeTab, reload } = useBrowser()
    const recording = useRecording().status === 'recording'

    if (!settings.onboarded) return <Onboarding />
    const { page, floatingSidebar } = layout
    const trouble = activeTab?.trouble ?? activeTab?.loadError
    // The new tab has no page yet, so no sheet: it's the well, where a page will go (DESIGN.md section 3). Every page
    // built on `PageFrame` is a column of sheets on the well too, apart from publishing a mascot, which isn't redrawn yet.
    const mascots = activeTab?.page === 'flock' && flockPlace(activeTab.pageParam).page !== 'publish'
    const framed = activeTab?.page === 'settings' || activeTab?.page === 'routines' || activeTab?.page === 'history' || activeTab?.page === 'downloads' || mascots
    const well = (activeTab?.page === 'new-tab' || framed) && !trouble

    return (
        <div className="relative h-full bg-ground">
            {/* Internal pages draw here. For web pages it shows until the tab view paints, or when a page has crashed. */}
            <Region
                rect={page}
                className={cn(
                    "overflow-hidden rounded-sheet transition-shadow duration-panel",
                    well ? "bg-well shadow-[inset_0_0_0_1px_var(--line)]" : "bg-sheet",
                    recording ? "shadow-recording" : !well && "shadow-rim"
                )}
            >
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
            {layout.menuButton.width > 0 && (
                // Off a Mac the window has no menu bar, so this opens the same menu.
                <Region rect={layout.menuButton}>
                    <ToolBarButton Icon={Menu} label="Menu" onClick={() => void window.chromeAPI.layout.showAppMenu()} />
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
