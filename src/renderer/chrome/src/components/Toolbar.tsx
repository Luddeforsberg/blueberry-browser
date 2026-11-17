import React from 'react'
import { ChevronLeft, ChevronRight, PanelLeft, PanelRight, RotateCw, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { useShell } from '../contexts/ShellContext'
import { AddressBar } from './AddressBar'
import { DownloadsButton } from './DownloadsButton'
import { HorizontalToolbar } from './HorizontalToolbar'
import { ToolBarButton } from './ToolBarButton'
import { NeedsYouNotice } from './NeedsYouNotice'
import { RoutineNotice } from './RoutineNotice'
import { WorkingNotice } from './WorkingNotice'
import { RecordingNotice } from './ShowBerry'

// Shows only when the page isn't at 100%. Pressing it goes back there.
export const ZoomButton: React.FC<{ percent: number; onReset: () => void }> = ({ percent, onReset }) => (
    <ToolBarButton label={`Zoom ${percent}%, reset to 100%`} onClick={onReset} className="w-auto px-2 font-mono text-11.5 tabular-nums">
        {percent}%
    </ToolBarButton>
)

// DESIGN.md section 10: back, forward and reload in `ink-3`, the address field, then the chat panel button, on the ground.
// The horizontal layout has a toolbar of its own, from edge to edge.
export const Toolbar: React.FC = () => {
    const { layout } = useShell()
    return layout.mode === 'horizontal' ? <HorizontalToolbar /> : <VerticalToolbar />
}

const VerticalToolbar: React.FC = () => {
    const { activeTab, goBack, goForward, reload, stop } = useBrowser()
    const { layout, theme, toggleSidebar, toggleChat } = useShell()

    // With no sidebar, the toolbar is the window's top-left corner, where macOS puts its buttons. Off a Mac they're at the
    // top right, and the toolbar runs to the window's edge.
    const leftClear = !layout.sidebarOpen && theme.platform === 'mac' ? layout.controls.width : 6
    const rightClear = theme.platform !== 'mac' ? layout.controls.width : 6

    return (
        <div className="h-full flex flex-col">
            <div
                className="relative h-12 shrink-0 flex items-center gap-0.5 app-region-drag"
                style={{ paddingLeft: leftClear, paddingRight: rightClear }}
            >
                {!layout.sidebarOpen && (
                    <ToolBarButton Icon={PanelLeft} label="Show sidebar" onClick={toggleSidebar} />
                )}
                <ToolBarButton Icon={ChevronLeft} label="Back" onClick={goBack} active={activeTab?.canGoBack ?? false} />
                <ToolBarButton Icon={ChevronRight} label="Forward" onClick={goForward} active={activeTab?.canGoForward ?? false} />
                {activeTab?.isLoading ? (
                    <ToolBarButton Icon={X} label="Stop loading" onClick={stop} />
                ) : (
                    <ToolBarButton Icon={RotateCw} label="Reload" onClick={reload} active={activeTab !== null && !activeTab.page} />
                )}

                <div className="flex-1 min-w-0 px-3 flex justify-center">
                    <div className="w-full max-w-[560px]">
                        <AddressBar />
                    </div>
                </div>

                <RecordingNotice />
                {activeTab && activeTab.zoomPercent !== 100 && (
                    <ZoomButton percent={activeTab.zoomPercent} onReset={() => void window.chromeAPI.browser.resetZoom(activeTab.id)} />
                )}
                {/* The sidebar says these when it's open. */}
                {!layout.sidebarOpen && <NeedsYouNotice />}
                {!layout.sidebarOpen && <WorkingNotice />}
                {!layout.sidebarOpen && <RoutineNotice />}

                <DownloadsButton />

                {activeTab?.page !== 'chat' && activeTab?.page !== 'new-tab' && (
                    <ToolBarButton
                        Icon={PanelRight}
                        label={layout.chatOpen ? 'Hide Berry' : 'Show Berry'}
                        onClick={toggleChat}
                        toggled={layout.chatOpen}
                    />
                )}
            </div>
        </div>
    )
}
