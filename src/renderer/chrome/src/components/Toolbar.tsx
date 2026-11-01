import React from 'react'
import { ChevronLeft, ChevronRight, PanelLeft, PanelRight, Pin, RotateCw, Star, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { NO_SAVED_SITES, useLibrary, useSavedSites } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { AddressBar } from './AddressBar'
import { DownloadsButton } from './DownloadsButton'
import { Favicon, siteIcon } from './Favicon'
import { ToolBarButton } from './ToolBarButton'
import { HandoffNotice, NeedsYouNotice } from './NeedsYou'
import { RoutineNotice } from './RoutineNotice'
import { WorkingNotice } from './WorkingNotice'

// Pinned sites and bookmarks, one row under the address bar. In the vertical layout they're in the sidebar.
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
            className="h-9 shrink-0 flex items-center gap-0.5 px-2 border-b overflow-x-auto [&::-webkit-scrollbar]:hidden"
        >
            {sites.length === 0 && <li className="shrink-0 px-2 text-13 text-muted-foreground">{NO_SAVED_SITES}</li>}
            {sites.map((site) => (
                <li key={site.id} className="shrink-0">
                    <button
                        type="button"
                        onClick={() => createTab(site.url)}
                        onContextMenu={(event) => {
                            event.preventDefault()
                            void window.chromeAPI.library.showBookmarkMenu(site.id)
                        }}
                        className="h-7 px-2 flex items-center gap-2 rounded-control text-13 outline-none transition-colors app-region-no-drag hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Favicon src={siteIcon(site.url)} />
                        {site.title}
                    </button>
                </li>
            ))}
        </ul>
    )
}

// Shows only when the page isn't at 100%. Pressing it goes back there.
export const ZoomButton: React.FC<{ percent: number; onReset: () => void }> = ({ percent, onReset }) => (
    <ToolBarButton label={`Zoom ${percent}%, reset to 100%`} onClick={onReset} className="w-auto px-2 text-12 tabular-nums">
        {percent}%
    </ToolBarButton>
)

export const Toolbar: React.FC = () => {
    const { activeTab, goBack, goForward, reload, stop } = useBrowser()
    const { layout, theme, toggleSidebar, toggleChat } = useShell()
    const { pinned, bookmarks } = useLibrary()
    const bookmarked = bookmarks.some((bookmark) => bookmark.url === activeTab?.url)
    const isPinned = pinned.some((pin) => pin.url === activeTab?.url)
    const canSave = !!activeTab && !activeTab.page && /^https?:\/\//i.test(activeTab.url)

    // With no sidebar, the toolbar is the window's top-left corner, where macOS puts its buttons.
    // In horizontal mode the tab row above takes the window buttons instead.
    const vertical = layout.mode === 'vertical'
    const leftClear = vertical && !layout.sidebarOpen && theme.platform === 'mac' ? layout.controls.width : 8
    const rightClear = vertical && !layout.chatOpen && theme.platform === 'windows' ? layout.controls.width : 8

    return (
        <div className="h-full flex flex-col">
            <div
                className="relative flex-1 min-h-0 flex items-center gap-0.5 app-region-drag"
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

                <div className="flex-1 min-w-0 px-1">
                    <AddressBar />
                </div>

                {activeTab && activeTab.zoomPercent !== 100 && (
                    <ZoomButton percent={activeTab.zoomPercent} onReset={() => void window.chromeAPI.browser.resetZoom(activeTab.id)} />
                )}
                <HandoffNotice />
                {/* The sidebar says this when it's open. */}
                {(!vertical || !layout.sidebarOpen) && <NeedsYouNotice />}
                {(!vertical || !layout.sidebarOpen) && <WorkingNotice />}
                {(!vertical || !layout.sidebarOpen) && <RoutineNotice />}

                <ToolBarButton
                    label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                    active={canSave}
                    toggled={bookmarked}
                    className={bookmarked ? 'bg-transparent hover:bg-transparent' : undefined}
                    onClick={() => void window.chromeAPI.library.toggleBookmark()}
                >
                    <Star className={bookmarked ? 'size-4 fill-current text-bookmark' : 'size-4'} />
                </ToolBarButton>

                <ToolBarButton
                    label={isPinned ? 'Unpin this page' : 'Pin this page'}
                    active={canSave}
                    toggled={isPinned}
                    onClick={() => void window.chromeAPI.library.togglePin()}
                >
                    <Pin className={isPinned ? 'size-4 fill-current' : 'size-4'} />
                </ToolBarButton>

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
