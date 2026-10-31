import React from 'react'
import { ChevronLeft, ChevronRight, PanelLeft, PanelRight, RotateCw, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { AddressBar } from './AddressBar'
import { Favicon, siteIcon } from './Favicon'
import { ToolBarButton } from './ToolBarButton'

// Pinned sites and bookmarks, one row under the address bar. In the vertical layout they're in the sidebar.
const BookmarksBar: React.FC = () => {
    const { createTab } = useBrowser()
    const { pinned, bookmarks } = useLibrary()

    return (
        <ul aria-label="Bookmarks" className="h-9 shrink-0 flex items-center gap-0.5 px-2 border-b overflow-hidden">
            {[...pinned, ...bookmarks].map((site) => (
                <li key={site.id} className="shrink-0">
                    <button
                        type="button"
                        onClick={() => createTab(site.url)}
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

export const Toolbar: React.FC = () => {
    const { activeTab, goBack, goForward, reload, stop } = useBrowser()
    const { layout, theme, toggleSidebar, toggleChat } = useShell()

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
