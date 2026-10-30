import React, { useEffect, useState } from 'react'
import type { TabInfo, Visit } from '@shared/ipc'
import { useShell } from '../contexts/ShellContext'
import { Favicon } from '../components/Favicon'
import { Berry, useAssistantName } from '../components/Berry'
import { toUrl } from '@common/lib/url'
import { cn } from '@common/lib/utils'

const timeOf = (visitedAt: number) =>
    new Date(visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// A heading, one smart input and recent work. Recent only lists pages really visited.
export const NewTabPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { theme } = useShell()
    const [text, setText] = useState('')
    const [recent, setRecent] = useState<Visit[]>([])
    const browser = window.chromeAPI.browser

    useEffect(() => {
        browser.getRecent().then(setRecent).catch(() => setRecent([]))
    }, [browser])

    const askBerry = async (message: string) => {
        const chat = await window.chromeAPI.library.sendChat(null, message)
        if (!chat) return
        await browser.openPage('chat', { param: chat.id, title: chat.title })
        await browser.closeTab(tab.id)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || !text.trim()) return
        e.preventDefault()
        if (e.metaKey || e.ctrlKey) void askBerry(text.trim())
        else void browser.navigateTab(tab.id, toUrl(text))
    }

    const askKey = theme.platform === 'mac' ? '⌘↵' : 'Ctrl+↵'
    const name = useAssistantName()

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-xl mx-auto px-6 pt-[18vh] pb-12">
                <h1 className="text-34 font-semibold">Where shall we start today?</h1>
                <div className="relative mt-6">
                    {/* Berry perches on the input's top edge. */}
                    <Berry mood="rest" size={56} className="absolute right-6 -top-[50px]" />
                    <input
                        type="text"
                        aria-label={`Search, enter a URL, or ask ${name === 'Berry' ? 'Berry' : 'a question'}`}
                        placeholder={`Search, enter a URL, or ask ${name === 'Berry' ? 'Berry' : 'a question'}`}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        autoFocus
                        className={cn(
                            "w-full h-12 pl-4 pr-32 rounded-panel bg-surface border text-15",
                            "outline-none placeholder:text-muted-foreground focus:border-transparent focus:ring-2 focus:ring-ring"
                        )}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-12 text-muted-foreground pointer-events-none">
                        {askKey} {name === 'Berry' ? 'Ask Berry' : 'Ask'}
                    </span>
                </div>

                {recent.length > 0 && (
                    <section aria-labelledby="recent-heading" className="mt-8">
                        <h2 id="recent-heading" className="px-2 pb-1 text-12 text-muted-foreground">
                            Recent
                        </h2>
                        <ul>
                            {recent.slice(0, 5).map((visit) => (
                                <li key={visit.url}>
                                    <button
                                        type="button"
                                        onClick={() => void browser.navigateTab(tab.id, visit.url)}
                                        className={cn(
                                            "w-full h-8 px-2 flex items-center gap-3 rounded-control text-13 text-left",
                                            "hover:bg-muted outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                                        )}
                                    >
                                        <Favicon src={visit.favicon} />
                                        <span className="flex-1 truncate">{visit.title}</span>
                                        <span className="text-12 text-muted-foreground tabular-nums">
                                            {timeOf(visit.visitedAt)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    )
}
