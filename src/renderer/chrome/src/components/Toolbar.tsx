import React from 'react'
import { ChevronLeft, ChevronRight, PanelLeft, PanelRight, RotateCw, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { NO_SAVED_SITES, useSavedSites } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { AddressBar } from './AddressBar'
import { DownloadsButton } from './DownloadsButton'
import { Favicon, siteIcon } from './Favicon'
import { ToolBarButton } from './ToolBarButton'
import { NeedsYouNotice } from './NeedsYou'
import { RoutineNotice } from './RoutineNotice'
import { WorkingNotice } from './WorkingNotice'
import { RecordingNotice } from './ShowBerry'

// Pinned sites and bookmarks, one row under the address field. In the vertical layout they're in the sidebar.
const BookmarksBar: React.FC = () => {
    const { createTab } = useBrowser()
    const sites = useSavedSites()

    return (
        <ul
            aria-label="Bookmarks"
            // Too many still scroll, by trackpad or an ordinary wheel, and the one cut off at the edge says there's more.
            onWheel={(event) => {
                if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY
            }}
            className="h-9 shrink-0 flex items-center gap-0.5 px-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        >
            {sites.length === 0 && <li className="shrink-0 px-2 text-12 text-faint">{NO_SAVED_SITES}</li>}
            {sites.map((site) => (
                <li key={site.id} className="shrink-0">
                    <button
                        type="button"
                        onClick={() => createTab(site.url)}
                        onContextMenu={(event) => {
                            event.preventDefault()
                            void window.chromeAPI.library.showBookmarkMenu(site.id)
                        }}
                        className="h-[27px] px-2 flex items-center gap-2 rounded-row text-12 text-ink-2 outline-none transition-colors app-region-no-drag hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <Favicon src={site.favicon ?? siteIcon(site.url)} site={site.url} />
                        {site.title}
                    </button>
                </li>
            ))}
        </ul>
    )
}

// Shows only when the page isn't at 100%. Pressing it goes back there.
export const ZoomButton: React.FC<{ percent: number; onReset: () => void }> = ({ percent, onReset }) => (
    <ToolBarButton label={`Zoom ${percent}%, reset to 100%`} onClick={onReset} className="w-auto px-2 font-mono text-11.5 tabular-nums">
        {percent}%
    </ToolBarButton>
)

// DESIGN.md section 10: back, forward and reload in `ink-3`, the address field, then the chat panel button, on the ground.
export const Toolbar: React.FC = () => {
    const { activeTab, goBack, goForward, reload, stop } = useBrowser()
    const { layout, theme, toggleSidebar, toggleChat } = useShell()

    // With no sidebar, the toolbar is the window's top-left corner, where macOS puts its buttons. Off a Mac they're at the
    // top right, and the toolbar runs to the window's edge. In horizontal mode the tab row above takes them instead.
    const vertical = layout.mode === 'vertical'
    const leftClear = vertical && !layout.sidebarOpen && theme.platform === 'mac' ? layout.controls.width : 6
    const rightClear = vertical && theme.platform !== 'mac' ? layout.controls.width : 6

    return (
        <div className="h-full flex flex-col">
            <div
                className="relative h-12 shrink-0 flex items-center gap-0.5 app-region-drag"
                style={{ paddingLeft: leftClear, paddingRight: rightClear }}
            >
                {vertical && !layout.sidebarOpen && (
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
                {(!vertical || !layout.sidebarOpen) && <NeedsYouNotice />}
                {(!vertical || !layout.sidebarOpen) && <WorkingNotice />}
                {(!vertical || !layout.sidebarOpen) && <RoutineNotice />}

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
            {!vertical && <BookmarksBar />}
        </div>
    )
}
