import React, { useState, useEffect, useContext } from 'react'
import type { InternalPage, TabInfo } from '@shared/ipc'
import { Lock, Search } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { cn } from '@common/lib/utils'
import { toUrl } from '@common/lib/url'
import { OverScene } from './ToolBarButton'

export const FOCUS_ADDRESS_EVENT = 'blueberry:focus-address'

const splitUrl = (url: string) => {
    try {
        const parsed = new URL(url)
        return {
            secure: parsed.protocol === 'https:',
            domain: parsed.hostname.replace(/^www\./, ''),
            path: parsed.pathname === '/' && !parsed.search && !parsed.hash ? '' : parsed.pathname + parsed.search + parsed.hash
        }
    } catch {
        return { secure: false, domain: url, path: '' }
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
    flock: 'Flock',
    'mascot-gallery': 'Gallery',
    'needs-you': 'Needs you',
    recording: 'What I watched',
    cloud: 'Cloud tab'
}

const PLACEHOLDER = 'Go to an address'

// Internal pages have no address worth editing, so the field starts empty there.
const editableUrl = (tab: TabInfo | null) => (tab && !tab.page ? tab.url : '')

// A solid pill on every page. On a web page it's `surface` with an `outline` edge. Over the new tab's valley it takes
// the scene's field. `trailing` sits inside its right end, such as the bookmark star and the pin.
export const AddressBar: React.FC<{ trailing?: React.ReactNode }> = ({ trailing }) => {
    const { activeTab, navigateToUrl } = useBrowser()
    const scene = useContext(OverScene)
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

    // On the scene the pill is the scene's own field. Focus is a 2px ring in place of the edge, so it keeps its size.
    const pill = cn(
        "w-full min-w-0 h-8 flex items-center gap-2 rounded-full app-region-no-drag",
        scene ? "bg-scene-field text-scene-ink" : "bg-surface shadow-[inset_0_0_0_1px_rgb(var(--outline))] dark:shadow-none"
    )

    if (isFocused) {
        return (
            <form onSubmit={handleSubmit} className={cn(pill, "pl-3.5 pr-3 ring-2", scene ? "ring-scene-ink" : "ring-ring")}>
                <Search aria-hidden className={cn("size-3.5 shrink-0", scene ? "text-scene-ink/80" : "text-muted-foreground")} />
                <input
                    type="text"
                    aria-label="Address"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={cancel}
                    onKeyDown={(e) => e.key === 'Escape' && cancel()}
                    className={cn(
                        "flex-1 min-w-0 h-full bg-transparent text-14 outline-none",
                        scene ? "text-scene-ink placeholder:text-scene-ink/80" : "text-foreground placeholder:text-muted-foreground"
                    )}
                    placeholder={PLACEHOLDER}
                    disabled={!activeTab}
                    spellCheck={false}
                    autoFocus
                />
            </form>
        )
    }

    const { secure, domain, path } = splitUrl(activeTab?.url ?? '')
    const pageLabel = activeTab?.page ? PAGE_LABELS[activeTab.page] : null
    const web = !!activeTab?.url && !activeTab.page

    return (
        <div className={cn(pill, "pr-1.5")}>
            <button
                type="button"
                aria-label="Address"
                onClick={() => setIsFocused(true)}
                className={cn(
                    "flex-1 min-w-0 h-full pl-3.5 flex items-center gap-2 rounded-full cursor-text text-left outline-none",
                    "focus-visible:ring-2",
                    scene ? "focus-visible:ring-scene-ink" : "focus-visible:ring-ring"
                )}
            >
                {web && secure ? (
                    <Lock aria-label="Secure connection" className="size-3.5 shrink-0 text-muted-foreground" />
                ) : !web && !pageLabel ? (
                    <Search aria-hidden className={cn("size-3.5 shrink-0", scene ? "text-scene-ink/80" : "text-muted-foreground")} />
                ) : null}
                <span className="min-w-0 truncate text-14">
                    {pageLabel ? (
                        <>
                            <span className="text-foreground">{pageLabel}</span>
                            {activeTab?.page === 'chat' && activeTab.pageParam && (
                                <span className="text-muted-foreground">{` / ${activeTab.title}`}</span>
                            )}
                        </>
                    ) : web ? (
                        <>
                            <span className="text-foreground">{domain}</span>
                            <span className="text-muted-foreground">{path}</span>
                        </>
                    ) : (
                        <span className={scene ? "text-scene-ink/80" : "text-muted-foreground"}>{PLACEHOLDER}</span>
                    )}
                </span>
            </button>
            {trailing}
        </div>
    )
}
