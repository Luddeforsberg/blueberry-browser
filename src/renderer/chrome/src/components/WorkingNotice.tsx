import React from 'react'
import { CircleStop } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock } from '../contexts/LibraryContext'
import { useAssistantName } from './Berry'
import { TabIcon } from './TabIcon'

// For when there's no sidebar to say it: work going on in another tab, and one press to go and see it.
export const WorkingNotice: React.FC = () => {
    const { tabs, switchTab } = useBrowser()
    const { find } = useFlock()
    const elsewhere = tabs.filter((tab) => tab.berryWorking && !tab.isActive)
    const first = elsewhere.at(0)
    const name = useAssistantName(first ? find(first.workingMascotId) : undefined)
    if (!first) return null

    return (
        <button
            type="button"
            onClick={() => void switchTab(first.id)}
            className="h-7 px-2 shrink-0 flex items-center gap-2 rounded-control text-13 outline-none transition-colors app-region-no-drag hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
            <TabIcon tab={first} />
            {name} is working{elsewhere.length > 1 ? ` in ${elsewhere.length} tabs` : ''}
        </button>
    )
}

// Stops whoever is working in the tab being looked at. The bird on the page only ever shows words, because anything a page
// can see, it can fake, so this lives up here where no page can reach. It does what Stop in the chat does.
export const StopWorkButton: React.FC = () => {
    const { activeTab } = useBrowser()
    const { find } = useFlock()
    const name = useAssistantName(activeTab?.berryWorking ? find(activeTab.workingMascotId) : undefined)
    if (!activeTab?.berryWorking) return null

    return (
        <button
            type="button"
            onClick={() => void window.chromeAPI.browser.stopWork(activeTab.id)}
            aria-label={`Stop ${name} working on this page`}
            className="h-7 px-2 shrink-0 flex items-center gap-1.5 rounded-control text-13 outline-none transition-colors app-region-no-drag hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
            <CircleStop className="size-4" aria-hidden />
            Stop {name}
        </button>
    )
}
