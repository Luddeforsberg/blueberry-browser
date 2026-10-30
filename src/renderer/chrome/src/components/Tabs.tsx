import React from 'react'
import { Plus, X } from 'lucide-react'
import type { LayoutMode, TabInfo } from '@shared/ipc'
import { useBrowser } from '../contexts/BrowserContext'
import { TabIcon } from './TabIcon'
import { cn } from '@common/lib/utils'

const TabItem: React.FC<{
    tab: TabInfo
    mode: LayoutMode
    onActivate: () => void
    onClose: () => void
}> = ({ tab, mode, onActivate, onClose }) => (
    <li
        className={cn(
            "group/tab flex items-center h-8 pl-2 pr-1 gap-2 rounded-control transition-colors app-region-no-drag",
            mode === 'horizontal' && "flex-1 min-w-12 max-w-56",
            tab.isActive ? "bg-muted font-semibold" : "hover:bg-muted"
        )}
    >
        <button
            type="button"
            aria-current={tab.isActive ? 'page' : undefined}
            onClick={onActivate}
            className="flex flex-1 min-w-0 items-center gap-2 h-full text-left outline-none rounded-control focus-visible:ring-2 focus-visible:ring-ring"
        >
            <TabIcon tab={tab} />
            <span className="text-13 truncate">{tab.title || 'New Tab'}</span>
        </button>
        <button
            type="button"
            aria-label={`Close ${tab.title || 'tab'}`}
            onClick={onClose}
            className={cn(
                "size-6 shrink-0 flex items-center justify-center rounded-control outline-none transition-opacity",
                "hover:bg-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100",
                "opacity-0 group-hover/tab:opacity-100",
                tab.isActive && "opacity-100"
            )}
        >
            <X className="size-3" />
        </button>
    </li>
)

// One tab list for both layouts: a column in the sidebar, a row in the horizontal tab strip.
export const Tabs: React.FC<{ mode: LayoutMode; labelledBy?: string; label?: string }> = ({
    mode,
    labelledBy,
    label
}) => {
    const { tabs, createTab, closeTab, switchTab } = useBrowser()
    const vertical = mode === 'vertical'

    return (
        <>
            <ul
                aria-labelledby={labelledBy}
                aria-label={label}
                className={cn("flex gap-0.5", vertical ? "flex-col" : "flex-1 min-w-0 items-center")}
            >
                {tabs.map(tab => (
                    <TabItem
                        key={tab.id}
                        tab={tab}
                        mode={mode}
                        onActivate={() => !tab.isActive && switchTab(tab.id)}
                        onClose={() => closeTab(tab.id)}
                    />
                ))}
            </ul>
            <button
                type="button"
                aria-label="New tab"
                onClick={() => createTab()}
                className={cn(
                    "flex items-center gap-2 h-8 rounded-control text-13 text-muted-foreground app-region-no-drag",
                    "hover:bg-muted outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    vertical ? "w-full px-2 mt-0.5" : "w-8 shrink-0 justify-center"
                )}
            >
                <Plus className="size-4" />
                {vertical && 'New tab'}
            </button>
        </>
    )
}
