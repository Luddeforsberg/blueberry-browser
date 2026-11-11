import React, { useContext } from 'react'
import { ChevronLeft, ChevronRight, MessageSquare, PanelLeft, Pin, RotateCw, Star, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { NO_SAVED_SITES, useLibrary, useSavedSites } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { AddressBar } from './AddressBar'
import { DownloadsButton } from './DownloadsButton'
import { Favicon, siteIcon } from './Favicon'
import { OverScene, ToolBarButton } from './ToolBarButton'
import { cn } from '@common/lib/utils'
import { HandoffNotice, NeedsYouNotice } from './NeedsYou'
import { RoutineNotice } from './RoutineNotice'
import { StopWorkButton, WorkingNotice } from './WorkingNotice'
import { NARROW_PAGE, RecordingNotice, useRecording } from './ShowBerry'

// Pinned sites and bookmarks, one row under the address bar. In the vertical layout they're in the sidebar.
const BookmarksBar: React.FC = () => {
    const { createTab } = useBrowser()
    const sites = useSavedSites()
    const scene = useContext(OverScene)

    return (
        <ul
            aria-label="Bookmarks"
            // Too many still scroll, by trackpad or an ordinary wheel, and the one cut off at the edge says there's more.
            onWheel={(event) => {
                if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY
            }}
            className="h-9 shrink-0 flex items-center gap-0.5 px-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        >
            {sites.length === 0 && <li className={cn("shrink-0 px-2 text-13", scene ? "text-scene-ink/80" : "text-muted-foreground")}>{NO_SAVED_SITES}</li>}
            {sites.map((site) => (
                <li key={site.id} className="shrink-0">
                    <button
                        type="button"
                        onClick={() => createTab(site.url)}
                        onContextMenu={(event) => {
                            event.preventDefault()
                            void window.chromeAPI.library.showBookmarkMenu(site.id)
                        }}
                        className={cn(
                            "h-7 px-2.5 flex items-center gap-2 rounded-full text-13 outline-none transition-colors app-region-no-drag focus-visible:ring-2",
                            scene ? "text-scene-ink hover:bg-scene-ink/15 focus-visible:ring-scene-ink" : "hover:bg-hover focus-visible:ring-ring"
                        )}
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
    // On the new tab the valley runs up behind the top bar, and its icons and words are white on the scene's scrim.
    const scene = activeTab?.page === 'new-tab'
    // Saying it's watching matters more, and these are in the File menu too.
    const giveWay = useRecording().status === 'recording' && layout.page.width < NARROW_PAGE
    const leftClear = vertical && !layout.sidebarOpen && theme.platform === 'mac' ? layout.controls.width : 12
    const rightClear = vertical && !layout.chatOpen && theme.platform !== 'mac' ? layout.controls.width : 12

    // Our own pages can't be saved, so they don't offer to. The star and the pin sit inside the address field's end.
    const saving = !giveWay && !activeTab?.page && (
        <>
            <ToolBarButton
                label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                active={canSave}
                className={cn("size-6", bookmarked && 'hover:bg-transparent')}
                onClick={() => void window.chromeAPI.library.toggleBookmark()}
            >
                <Star className={bookmarked ? 'size-4 fill-current text-bookmark' : 'size-4'} />
            </ToolBarButton>
            <ToolBarButton
                label={isPinned ? 'Unpin this page' : 'Pin this page'}
                active={canSave}
                toggled={isPinned}
                className="size-6"
                onClick={() => void window.chromeAPI.library.togglePin()}
            >
                <Pin className={isPinned ? 'size-3.5 fill-current' : 'size-3.5'} />
            </ToolBarButton>
        </>
    )

    return (
        <OverScene.Provider value={scene}>
            <div className="h-full flex flex-col">
                <div
                    className="relative shrink-0 flex items-center gap-1 app-region-drag"
                    style={{ height: layout.addressRow.height, paddingLeft: leftClear, paddingRight: rightClear }}
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

                    <div className="flex-1 min-w-0 pl-2 pr-1">
                        <AddressBar trailing={saving || undefined} />
                    </div>

                    <RecordingNotice />
                    <StopWorkButton />
                    {activeTab && activeTab.zoomPercent !== 100 && (
                        <ZoomButton percent={activeTab.zoomPercent} onReset={() => void window.chromeAPI.browser.resetZoom(activeTab.id)} />
                    )}
                    <HandoffNotice />
                    {/* The sidebar says this when it's open. */}
                    {(!vertical || !layout.sidebarOpen) && <NeedsYouNotice />}
                    {(!vertical || !layout.sidebarOpen) && <WorkingNotice />}
                    {(!vertical || !layout.sidebarOpen) && <RoutineNotice />}

                    {/* Downloads live in the sidebar's top row, and here only when there's no sidebar to hold them. */}
                    {(!vertical || !layout.sidebarOpen) && <DownloadsButton />}

                    {activeTab?.page !== 'chat' && activeTab?.page !== 'new-tab' && (
                        <ToolBarButton
                            Icon={MessageSquare}
                            label={layout.chatOpen ? 'Hide Berry' : 'Show Berry'}
                            onClick={toggleChat}
                            toggled={layout.chatOpen}
                        />
                    )}
                </div>
                {!vertical && <BookmarksBar />}
            </div>
        </OverScene.Provider>
    )
}
