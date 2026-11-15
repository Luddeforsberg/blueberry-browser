import React from 'react'
import { Pips } from '@common/components/Pips'
import { useBrowser } from '../contexts/BrowserContext'
import { useLibrary } from '../contexts/LibraryContext'

// What routines want the user to know, if anything. Berry never speaks up about anything else.
const useRoutineNews = () => {
    const { routines } = useLibrary()
    const runs = routines.flatMap(({ latestRun }) => (latestRun ? [latestRun] : []))
    return {
        asking: runs.filter((run) => run.status === 'needs-approval').length,
        ready: routines.filter((routine) => routine.unseen).length,
        working: runs.some((run) => run.status === 'running')
    }
}

// The dot on the Routines row: something's ready, or being worked on.
export const RoutineDot: React.FC = () => {
    const { asking, ready, working } = useRoutineNews()
    if (asking + ready > 0) {
        return (
            <>
                <span aria-hidden className={asking > 0 ? "size-1.5 shrink-0 rounded-full bg-ask" : "size-1.5 shrink-0 rounded-full bg-ink-3"} />
                <span className="sr-only">{asking > 0 ? 'Needs your OK' : 'Has news'}</span>
            </>
        )
    }
    if (!working) return null
    return (
        <>
            <Pips pattern="think" />
            <span className="sr-only">Running now</span>
        </>
    )
}

// For when there's no sidebar to say it. It waits in the toolbar and never takes focus.
export const RoutineNotice: React.FC = () => {
    const { activeTab } = useBrowser()
    const { ready } = useRoutineNews()
    if (activeTab?.page === 'routines' || ready === 0) return null

    return (
        <button
            type="button"
            onClick={() => void window.chromeAPI.browser.openPage('routines')}
            className="h-7 px-2 shrink-0 flex items-center gap-2 rounded-row text-13 outline-none transition-colors app-region-no-drag hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus"
        >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ink-3" />
            Routine has news
        </button>
    )
}
