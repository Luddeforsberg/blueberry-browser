import React, { useEffect, useRef } from 'react'
import { Menu } from 'lucide-react'
import type { Rect, ValleyLight } from '@shared/ipc'
import { lightFor } from './valley/light'
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
import { OverScene, ToolBarButton } from './components/ToolBarButton'
import { useRecording } from './components/ShowBerry'
import { cn } from '@common/lib/utils'
import { siteAllowed } from '@shared/mascots'

// Regions sit exactly where main's layout puts them, so the tab view lines up with the page's place.
const Region: React.FC<{
    rect: Rect
    className?: string
    children?: React.ReactNode
    onMouseEnter?: () => void
    reading?: boolean
    light?: ValleyLight
}> = ({ rect, className, children, onMouseEnter, reading, light }) => (
    <div
        data-light={light}
        className={cn("absolute", className)}
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        onMouseEnter={onMouseEnter}
        data-berry-reading={reading || undefined}
    >
        {children}
    </div>
)

const Shell: React.FC = () => {
    const { layout, settings, theme } = useShell()
    const { activeTab, reload } = useBrowser()
    const recordingState = useRecording()
    const { isLoading, pageAccess, mascotId } = useChat()
    const { find } = useFlock()
    // Follows the user until a reply starts, and then stays on the page that reply was sent from.
    const sentFrom = useRef<string | null>(null)
    if (!isLoading) sentFrom.current = activeTab?.id ?? null

    // Sending a message is what lets Berry read the open page, so the ring only shows while it does.
    // It also shows on any tab Berry is using in the reply it's working on.
    const recording = recordingState.status === 'recording'
    const reading = !!activeTab && !activeTab.page && (activeTab.berryWorking || (isLoading && pageAccess && activeTab.id === sentFrom.current && siteAllowed(activeTab.url, find(mascotId).sites)))
    const ring = settings.onboarded && (recording || reading)
    // The ring is drawn here, in the chrome, where no page can reach or cover it, so main insets the page to make room.
    useEffect(() => {
        void window.chromeAPI.layout.setRing(ring)
    }, [ring])

    if (!settings.onboarded) return <Onboarding />
    const { page, pageFrame, floatingSidebar } = layout
    const trouble = activeTab?.trouble ?? activeTab?.loadError
    // The new tab's valley runs up behind the top bar, which then sits on its scrim.
    const behindTopBar = activeTab?.page === 'new-tab'
    const internal = behindTopBar ? { ...page, y: layout.toolbar.y, height: page.y + page.height - layout.toolbar.y } : page
    const corner = layout.pageCorner > 0 ? "rounded-tl-page" : undefined

    return (
        <div className="relative h-full bg-background">
            {ring && (
                <Region
                    rect={pageFrame}
                    reading={reading}
                    className={cn(corner, recording ? "bg-destructive" : "bg-berry-blue")}
                />
            )}
            {/* Internal pages draw here, on `canvas` in the page's place and shape. For web pages it shows until the tab
                view paints, or when a page has crashed. */}
            <Region rect={internal} className={cn("overflow-hidden bg-canvas", corner)}>
                {activeTab?.page && <InternalPageView tab={activeTab} />}
                {trouble && <PageTrouble trouble={trouble} onReload={() => void reload()} />}
            </Region>
            {layout.sidebarOpen && (
                <Region rect={layout.sidebar}>
                    <Sidebar />
                    <ResizeHandle panel="sidebar" />
                </Region>
            )}
            {layout.mode === 'horizontal' && (
                <Region rect={layout.tabStrip}>
                    <TabStrip />
                </Region>
            )}
            <Region rect={layout.toolbar} light={behindTopBar && activeTab ? lightFor(activeTab.id, theme.valleyLight) : undefined}>
                <Toolbar />
            </Region>
            {floatingSidebar.width > 0 && (
                // The window's left edge beside the top bar, over it. Over the page, main watches for the pointer instead.
                <Region
                    rect={{ x: 0, y: 0, width: 4, height: layout.toolbar.y + layout.toolbar.height }}
                    onMouseEnter={() => void window.chromeAPI.layout.showFloatingSidebar()}
                />
            )}
            {layout.chatOpen && (
                <Region rect={layout.chat}>
                    <ChatPanel />
                    <ResizeHandle panel="chat" />
                </Region>
            )}
            {layout.menuButton.width > 0 && (
                // Off a Mac the window has no menu bar, so this opens the same menu.
                <Region rect={layout.menuButton}>
                    {/* White on the new tab's scrim, like the rest of the top bar, but not in the tab row above it. */}
                    <OverScene.Provider value={behindTopBar && layout.mode === 'vertical'}>
                        <ToolBarButton Icon={Menu} label="Menu" onClick={() => void window.chromeAPI.layout.showAppMenu()} />
                    </OverScene.Provider>
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
