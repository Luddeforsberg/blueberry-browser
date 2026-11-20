import React, { useEffect, useMemo, useState } from 'react'
import { Menu } from 'lucide-react'
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
import { FirstRun } from './components/FirstRun'
import { PageTrouble } from './components/PageTrouble'
import { ToolBarButton } from './components/ToolBarButton'
import { useRecording } from './components/ShowBerry'
import { AppIconSender } from './components/AppIconSender'
import { cn } from '@common/lib/utils'
import { TooltipProvider, type TipElsewhere } from '@common/components/Tooltip'

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

    if (!settings.onboarded) return <FirstRun />
    const { page, floatingSidebar } = layout
    const trouble = activeTab?.trouble ?? activeTab?.loadError
    // The new tab has no page yet, so no sheet: it's the well, where a page will go (DESIGN.md section 3). Every other
    // page is a sheet, as a web page is, the ones on `PageFrame` included (A page in a tab).
    const well = activeTab?.page === 'new-tab' && !trouble

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

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

// A tooltip that would hang over a web page, or over what the horizontal toolbar opened, can't be drawn here, since
// those views cover the chrome. It goes to the tooltip view over them instead (DESIGN.md section 2, View stack).
const ChromeTips: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { layout, theme } = useShell()
    const { activeTab } = useBrowser()
    const [popover, setPopover] = useState(false)
    useEffect(() => window.chromeAPI.layout.onPopover(({ shown }) => setPopover(!!shown)), [])
    const page = !!activeTab && !activeTab.page && !activeTab.trouble && !activeTab.loadError
    const covered = popover ? layout.popover : page ? layout.page : null
    const elsewhere = useMemo<TipElsewhere>(
        () => ({
            takes: (box) => !!covered && overlaps(box, covered),
            show: (tip) => void window.chromeAPI.tooltip.show(tip),
            hide: () => void window.chromeAPI.tooltip.hide()
        }),
        [covered]
    )
    return (
        <TooltipProvider mac={theme.platform === 'mac'} elsewhere={elsewhere}>
            {children}
        </TooltipProvider>
    )
}

export const ChromeApp: React.FC = () => (
    <ShellProvider>
        <BrowserProvider>
            <LibraryProvider>
                <ChatProvider>
                    <ChromeTips>
                        <Shell />
                    </ChromeTips>
                    <AppIconSender />
                </ChatProvider>
            </LibraryProvider>
        </BrowserProvider>
    </ShellProvider>
)
