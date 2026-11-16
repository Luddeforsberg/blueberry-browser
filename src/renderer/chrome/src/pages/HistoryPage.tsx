import React, { useCallback, useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { HistoryCursor, HistoryEntry } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { Berry, useAssistantName } from '../components/Berry'
import { Favicon } from '../components/Favicon'
import { EmptySheet, PageFrame, PageHeader, SearchField } from '../components/PageFrame'
import { BETWEEN, SettingsGroup } from '../components/SettingsRow'
import { foldVisits, groupByDay, siteOf, type VisitRun } from './historyDays'

// DESIGN.md section 10, History: a page in a tab, with a group for each day, newest first.

const SEARCH_DELAY_MS = 150
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus'
// A row is 40px. The hairline between rows starts where the words do, after the time and the icon.
const ROW = cn(BETWEEN, 'group/visit relative before:left-[90px]')

const timeOf = (visitedAt: number) =>
    new Date(visitedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

// One visit: the time in mono, the site's icon, the title and the site. Pressing it opens the page in a new tab, and
// Remove shows on the row you're on.
export const HistoryRow: React.FC<{
    entry: HistoryEntry
    onOpen: () => void
    onDelete: () => void
    // Inside a folded group, the site is said once already.
    inGroup?: boolean
}> = ({ entry, onOpen, onDelete, inGroup = false }) => (
    <li className={ROW}>
        <button
            type="button"
            onClick={onOpen}
            className={cn('w-full h-10 pl-4 pr-3.5 flex items-center gap-3 text-left transition-colors hover:bg-hover active:bg-press', FOCUS)}
        >
            <span className="w-[38px] shrink-0 font-mono text-11.5 text-ink-3 tabular-nums">{timeOf(entry.visitedAt)}</span>
            <Favicon src={entry.favicon} site={entry.url} />
            <span className="min-w-0 truncate text-14 font-medium text-ink">{entry.title || siteOf(entry.url)}</span>
            {!inGroup && <span className="min-w-0 shrink-[2] truncate text-13 text-ink-2">{siteOf(entry.url)}</span>}
            <span className="flex-1" />
        </button>
        <span className="absolute right-3 top-1.5 opacity-0 transition-opacity group-hover/visit:opacity-100 group-focus-within/visit:opacity-100">
            <Button size="sm" variant="raised" aria-label={`Remove ${entry.title || siteOf(entry.url)} from history`} onClick={onDelete}>Remove</Button>
        </span>
    </li>
)

// Visits in a row to the same site, as one row with the site and how many, which opens in place to show them.
const VisitGroup: React.FC<{ run: VisitRun; onOpen: (entry: HistoryEntry) => void; onDelete: (entry: HistoryEntry) => void }> = ({ run, onOpen, onDelete }) => {
    const [open, setOpen] = useState(false)
    const newest = run.entries[0]
    return (
        <li className={cn(BETWEEN, 'before:left-[90px]')}>
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className={cn('w-full h-10 pl-4 pr-3.5 flex items-center gap-3 text-left transition-colors hover:bg-hover active:bg-press', FOCUS)}
            >
                <span className="w-[38px] shrink-0 font-mono text-11.5 text-ink-3 tabular-nums">{timeOf(newest.visitedAt)}</span>
                <Favicon src={newest.favicon} site={newest.url} />
                <span className="min-w-0 truncate text-14 font-medium text-ink">{run.site}</span>
                <span className="shrink-0 font-mono text-11.5 text-ink-2 tabular-nums">{run.entries.length} visits</span>
                <span className="flex-1" />
                <ChevronDown aria-hidden className={cn('size-3.5 shrink-0 text-faint transition-transform duration-fast', open && 'rotate-180')} strokeWidth={1.75} />
            </button>
            {open && (
                <ul aria-label={`Visits to ${run.site}`} className="pl-6">
                    {run.entries.map((entry) => (
                        <HistoryRow key={entry.id} entry={entry} inGroup onOpen={() => onOpen(entry)} onDelete={() => onDelete(entry)} />
                    ))}
                </ul>
            )}
        </li>
    )
}

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

    const open = (entry: HistoryEntry) => void browser.createTab(entry.url)
    const searching = query.trim() !== ''

    return (
        <PageFrame>
            <PageHeader title="History" actions={<Button variant="raised" disabled={!entries?.length && !query} onClick={() => void clear()}>Clear…</Button>}>
                Pages you’ve visited, kept on this computer.
            </PageHeader>
            <SearchField label="Search history" value={query} onChange={setQuery} autoFocus />

            {failed && (
                <p role="alert" className="mt-5 mx-3 text-14 text-ask">
                    Your history couldn’t be read. Close this tab and try again.
                </p>
            )}

            {entries?.length === 0 && !failed && (
                <EmptySheet className="mt-5" face={searching ? undefined : <Berry mood="rest" size={56} />}>
                    {searching
                        ? `No pages match “${query.trim()}”.`
                        : isBerry ? 'Nothing here yet. Pages you visit are kept here, on this computer, until you clear them.' : 'Nothing here yet.'}
                </EmptySheet>
            )}

            {groupByDay(entries ?? []).map((day) => (
                <SettingsGroup key={day.key} label={day.label}>
                    <ul aria-label={day.label} className="rounded-sheet overflow-hidden">
                        {/* A search shows every match, so nothing it found is folded away. */}
                        {(searching ? day.entries.map((entry): VisitRun => ({ key: String(entry.id), site: '', entries: [entry] })) : foldVisits(day.entries)).map((run) =>
                            run.entries.length === 1 ? (
                                <HistoryRow key={run.key} entry={run.entries[0]} onOpen={() => open(run.entries[0])} onDelete={() => void remove(run.entries[0].id)} />
                            ) : (
                                <VisitGroup key={run.key} run={run} onOpen={open} onDelete={(entry) => void remove(entry.id)} />
                            )
                        )}
                    </ul>
                </SettingsGroup>
            ))}

            {next && (
                <div className="mt-5 flex justify-center">
                    <Button variant="raised" onClick={() => void load(query, next)}>Show more</Button>
                </div>
            )}
        </PageFrame>
    )
}
