import React, { useState, useEffect } from 'react'
import type { InternalPage, TabInfo } from '@shared/ipc'
import { Search } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { cn } from '@common/lib/utils'
import { toUrl } from '@common/lib/url'

export const FOCUS_ADDRESS_EVENT = 'blueberry:focus-address'

const splitUrl = (url: string) => {
    try {
        const parsed = new URL(url)
        return {
            domain: parsed.hostname.replace(/^www\./, ''),
            path: parsed.pathname + parsed.search + parsed.hash
        }
    } catch {
        return { domain: url, path: '' }
    }
}

const PAGE_LABELS: Record<InternalPage, string | null> = {
    'new-tab': null,
    chat: 'Chat',
    routines: 'Routines',
    settings: 'Settings',
    downloads: 'Downloads',
    gallery: 'Component gallery',
    history: 'History',
    flock: 'Your flock',
    'mascot-gallery': 'Mascot gallery',
    'needs-you': 'Needs you',
    recording: 'What I watched'
}

// Internal pages have no address worth editing, so the field starts empty there.
const editableUrl = (tab: TabInfo | null) => (tab && !tab.page ? tab.url : '')

export const AddressBar: React.FC = () => {
    const { activeTab, navigateToUrl } = useBrowser()
    const [url, setUrl] = useState('')
    const [isFocused, setIsFocused] = useState(false)

    useEffect(() => {
        if (!isFocused) setUrl(editableUrl(activeTab))
    }, [activeTab, isFocused])

    useEffect(() => window.chromeAPI.browser.onFocusAddress(() => setIsFocused(true)), [])

    // The sidebar's search button lives in the same renderer.
    useEffect(() => {
        const focus = () => setIsFocused(true)
        window.addEventListener(FOCUS_ADDRESS_EVENT, focus)
        return () => window.removeEventListener(FOCUS_ADDRESS_EVENT, focus)
    }, [])

    const cancel = () => {
        setIsFocused(false)
        setUrl(editableUrl(activeTab))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!url.trim()) return
        navigateToUrl(toUrl(url))
        setIsFocused(false)
    }

    if (isFocused) {
        return (
            <form onSubmit={handleSubmit} className="relative w-full min-w-0 app-region-no-drag">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                    type="text"
                    aria-label="Address"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={cancel}
                    onKeyDown={(e) => e.key === 'Escape' && cancel()}
                    className={cn(
                        "w-full h-8 pl-8 pr-3 rounded-card bg-surface text-14 text-foreground",
                        "outline-none ring-2 ring-ring placeholder:text-muted-foreground"
                    )}
                    placeholder="Search or enter a URL"
                    disabled={!activeTab}
                    spellCheck={false}
                    autoFocus
                />
            </form>
        )
    }

    const { domain, path } = splitUrl(activeTab?.url ?? '')
    const pageLabel = activeTab?.page ? PAGE_LABELS[activeTab.page] : null

    return (
        <button
            type="button"
            aria-label="Address"
            onClick={() => setIsFocused(true)}
            className={cn(
                "w-full min-w-0 h-8 px-2.5 flex items-center gap-2 rounded-card cursor-text group/address-bar",
                "hover:bg-foreground/5 text-left app-region-no-drag outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring"
            )}
        >
            <span className="text-14 truncate">
                {pageLabel ? (
                    <>
                        <span className="text-foreground">{pageLabel}</span>
                        {activeTab?.page === 'chat' && activeTab.pageParam && (
                            <span className="text-muted-foreground">{` / ${activeTab.title}`}</span>
                        )}
                    </>
                ) : activeTab?.url && !activeTab.page ? (
                    <>
                        <span className="text-foreground">{domain}</span>
                        <span className="group-hover/address-bar:hidden text-muted-foreground">
                            {activeTab.title && !activeTab.loadError && ` / ${activeTab.title}`}
                        </span>
                        <span className="group-hover/address-bar:inline hidden text-muted-foreground">
                            {path}
                        </span>
                    </>
                ) : (
                    <span className="text-muted-foreground">Search or enter a URL</span>
                )}
            </span>
        </button>
    )
}
