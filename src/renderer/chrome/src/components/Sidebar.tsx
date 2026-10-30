import React from 'react'
import { PanelLeft, Plus, X } from 'lucide-react'
import type { TabInfo } from '@shared/ipc'
import { useBrowser } from '../contexts/BrowserContext'
import { useShell } from '../contexts/ShellContext'
import { Favicon } from './Favicon'
import { ToolBarButton } from './ToolBarButton'
import { cn } from '@common/lib/utils'

const TabItem: React.FC<{
    tab: TabInfo
    onActivate: () => void
    onClose: () => void
}> = ({ tab, onActivate, onClose }) => (
    <li
        className={cn(
            "group/tab flex items-center h-8 pl-2 pr-1 gap-2 rounded-control transition-colors",
            tab.isActive ? "bg-muted font-semibold" : "hover:bg-muted"
        )}
    >
        <button
            type="button"
            aria-current={tab.isActive ? 'page' : undefined}
            onClick={onActivate}
            className="flex flex-1 min-w-0 items-center gap-2 h-full text-left outline-none rounded-control focus-visible:ring-2 focus-visible:ring-ring"
        >
            <Favicon src={tab.favicon} />
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

export const Sidebar: React.FC = () => {
    const { tabs, createTab, closeTab, switchTab } = useBrowser()
    const { layout, theme, toggleSidebar } = useShell()

    return (
        <nav aria-label="Sidebar" className="h-full flex flex-col">
            <div
                className="flex items-center justify-end px-2 app-region-drag shrink-0"
                style={{
                    height: layout.toolbar.height,
                    paddingLeft: theme.platform === 'mac' ? layout.controls.width : undefined
                }}
            >
                <ToolBarButton Icon={PanelLeft} label="Hide sidebar" onClick={toggleSidebar} />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
                <h2 id="sidebar-tabs" className="px-2 pt-2 pb-1 text-11 text-muted-foreground">
                    Tabs
                </h2>
                <ul aria-labelledby="sidebar-tabs" className="flex flex-col gap-0.5">
                    {tabs.map(tab => (
                        <TabItem
                            key={tab.id}
                            tab={tab}
                            onActivate={() => !tab.isActive && switchTab(tab.id)}
                            onClose={() => closeTab(tab.id)}
                        />
                    ))}
                </ul>
                <button
                    type="button"
                    onClick={() => createTab()}
                    className={cn(
                        "w-full flex items-center gap-2 h-8 px-2 mt-0.5 rounded-control text-13 text-muted-foreground",
                        "hover:bg-muted outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                >
                    <Plus className="size-4" />
                    New tab
                </button>
            </div>
        </nav>
    )
}
