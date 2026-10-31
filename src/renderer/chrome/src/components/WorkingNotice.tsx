import React from 'react'
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
