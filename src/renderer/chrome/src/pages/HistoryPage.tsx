import React, { useCallback, useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { HistoryCursor, HistoryEntry } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { useAssistantName } from '../components/Berry'
import { Favicon } from '../components/Favicon'
import { groupByDay } from './historyDays'

const SEARCH_DELAY_MS = 150

const timeOf = (visitedAt: number) =>
    new Date(visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const hostOf = (url: string) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return url
    }
}

export const HistoryRow: React.FC<{
    entry: HistoryEntry
    onOpen: () => void
    onDelete: () => void
}> = ({ entry, onOpen, onDelete }) => (
    <li className="group/visit relative">
        <button
            type="button"
            onClick={onOpen}
            className={cn(
                "w-full h-9 pl-2 pr-9 flex items-center gap-3 rounded-control text-14 text-left outline-none transition-colors",
                "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            )}
        >
            <span className="w-12 shrink-0 text-12 text-muted-foreground tabular-nums">{timeOf(entry.visitedAt)}</span>
            <Favicon src={entry.favicon} site={entry.url} />
            <span className="min-w-0 truncate">{entry.title}</span>
            <span className="min-w-0 shrink-[2] truncate text-12 text-muted-foreground">{hostOf(entry.url)}</span>
        </button>
        <button
            type="button"
            aria-label={`Delete ${entry.title} from history`}
            onClick={onDelete}
            className={cn(
                "absolute right-1.5 top-1.5 size-6 flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors",
                "opacity-0 group-hover/visit:opacity-100 focus-visible:opacity-100 hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            )}
        >
            <X className="size-3" />
        </button>
    </li>
)

// Every page visited, by day, newest first. It's only here, on this computer.
export const HistoryPage: React.FC = () => {
    const browser = window.chromeAPI.browser
    const isBerry = useAssistantName() === 'Berry'
    const [query, setQuery] = useState('')
    const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
    const [next, setNext] = useState<HistoryCursor | null>(null)
    const [failed, setFailed] = useState(false)

    const load = useCallback(async (text: string, before: HistoryCursor | null) => {
        try {
            const page = await browser.searchHistory({ query: text, before: before ?? undefined })
            setEntries((shown) => (before ? [...(shown ?? []), ...page.entries] : page.entries))
            setNext(page.next)
            setFailed(false)
        } catch (error) {
            console.error('Failed to load history:', error)
            setFailed(true)
        }
    }, [browser])

    useEffect(() => {
        const timer = setTimeout(() => void load(query, null), query ? SEARCH_DELAY_MS : 0)
        return () => clearTimeout(timer)
    }, [load, query])

    const remove = async (id: number) => {
        await browser.deleteHistoryEntry(id)
        setEntries((shown) => shown?.filter((entry) => entry.id !== id) ?? null)
    }

    const clear = async () => {
        if (await browser.clearHistory()) await load(query, null)
    }

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-20 font-semibold">History</h1>
                        <p className="mt-1 text-14 text-muted-foreground">Pages you’ve visited, kept on this computer.</p>
                    </div>
                    <Button variant="outline" disabled={!entries?.length && !query} onClick={() => void clear()}>
                        Clear history
                    </Button>
                </div>

                <div className="relative mt-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                        type="search"
                        aria-label="Search history"
                        placeholder="Search history"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        spellCheck={false}
                        autoFocus
                        className="w-full h-9 pl-9 pr-3 rounded-card border bg-surface text-14 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    />
                </div>

                {failed && (
                    <p role="alert" className="mt-6 text-14 text-destructive">
                        Your history couldn’t be read. Close this tab and try again.
                    </p>
                )}

                {entries?.length === 0 && !failed && (
                    <p className="mt-10 text-center text-14 text-muted-foreground">
                        {query.trim()
                            ? `No pages match “${query.trim()}”.`
                            : isBerry ? 'Nothing here yet. I looked under everything.' : 'Nothing here yet.'}
                    </p>
                )}

                {groupByDay(entries ?? []).map((day) => (
                    <section key={day.key} aria-label={day.label} className="mt-6">
                        <h2 className="px-4 pb-1 text-14 font-semibold">{day.label}</h2>
                        <ul className="rounded-panel border bg-surface p-2">
                            {day.entries.map((entry) => (
                                <HistoryRow
                                    key={entry.id}
                                    entry={entry}
                                    onOpen={() => void browser.createTab(entry.url)}
                                    onDelete={() => void remove(entry.id)}
                                />
                            ))}
                        </ul>
                    </section>
                ))}

                {next && (
                    <div className="mt-6 flex justify-center">
                        <Button variant="outline" onClick={() => void load(query, next)}>Show more</Button>
                    </div>
                )}
            </div>
        </div>
    )
}
