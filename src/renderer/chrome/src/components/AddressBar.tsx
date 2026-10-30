import React, { useState, useEffect } from 'react'
import { useBrowser } from '../contexts/BrowserContext'
import { Favicon } from '../components/Favicon'
import { cn } from '@common/lib/utils'

const toUrl = (input: string): string => {
    if (input.startsWith('http://') || input.startsWith('https://')) return input
    if (input.includes('.') && !input.includes(' ')) return `https://${input}`
    return `https://www.google.com/search?q=${encodeURIComponent(input)}`
}

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

export const AddressBar: React.FC = () => {
    const { activeTab, navigateToUrl } = useBrowser()
    const [url, setUrl] = useState('')
    const [isFocused, setIsFocused] = useState(false)

    useEffect(() => {
        if (activeTab && !isFocused) {
            setUrl(activeTab.url || '')
        }
    }, [activeTab, isFocused])

    useEffect(() => window.chromeAPI.browser.onFocusAddress(() => setIsFocused(true)), [])

    const cancel = () => {
        setIsFocused(false)
        if (activeTab) setUrl(activeTab.url || '')
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!url.trim()) return
        navigateToUrl(toUrl(url.trim()))
        setIsFocused(false)
    }

    if (isFocused) {
        return (
            <form onSubmit={handleSubmit} className="flex-1 min-w-0 app-region-no-drag">
                <input
                    type="text"
                    aria-label="Address"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={cancel}
                    onKeyDown={(e) => e.key === 'Escape' && cancel()}
                    className={cn(
                        "w-full h-8 px-3 rounded-card bg-surface text-13 text-foreground",
                        "outline-none ring-2 ring-ring placeholder:text-muted-foreground"
                    )}
                    placeholder={activeTab ? "Search or enter address" : "No active tab"}
                    disabled={!activeTab}
                    spellCheck={false}
                    autoFocus
                />
            </form>
        )
    }

    const { domain, path } = splitUrl(activeTab?.url ?? '')

    return (
        <button
            type="button"
            aria-label="Address"
            onClick={() => setIsFocused(true)}
            className={cn(
                "flex-1 min-w-0 h-8 px-3 flex items-center gap-2 rounded-card cursor-text group/address-bar",
                "bg-muted hover:bg-border text-left app-region-no-drag outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring"
            )}
        >
            <Favicon src={activeTab?.favicon} />
            <span className="text-13 truncate flex-1">
                {activeTab ? (
                    <>
                        <span className="text-foreground">{domain}</span>
                        <span className="group-hover/address-bar:hidden text-muted-foreground">
                            {activeTab.title && ` / ${activeTab.title}`}
                        </span>
                        <span className="group-hover/address-bar:inline hidden text-muted-foreground">
                            {path}
                        </span>
                    </>
                ) : (
                    <span className="text-muted-foreground">No active tab</span>
                )}
            </span>
        </button>
    )
}
