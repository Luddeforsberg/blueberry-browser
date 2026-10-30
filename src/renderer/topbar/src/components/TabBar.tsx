import React from 'react'
import { Plus, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { Favicon } from '../components/Favicon'
import { TabBarButton } from '../components/TabBarButton'
import { cn } from '@common/lib/utils'

interface TabItemProps {
    id: string
    title: string
    favicon?: string | null
    isActive: boolean
    isPinned?: boolean
    onClose: () => void
    onActivate: () => void
}

const TabItem: React.FC<TabItemProps> = ({
    title,
    favicon,
    isActive,
    isPinned = false,
    onClose,
    onActivate
}) => {
    const baseClassName = cn(
        "relative flex items-center h-8 pl-2 pr-1.5 select-none rounded-control",
        "text-foreground group/tab transition-colors cursor-pointer",
        "app-region-no-drag", // Make tabs clickable
        isActive
            ? "bg-muted font-semibold"
            : "hover:bg-muted",
        isPinned ? "w-8 !px-0 justify-center" : ""
    )

    return (
        <div className="py-1 px-0.5">
            <div
                className={baseClassName}
                onClick={() => !isActive && onActivate()}
            >
                {/* Favicon */}
                <div className={cn(!isPinned && "mr-2")}>
                    <Favicon src={favicon} />
                </div>

                {/* Title (hide for pinned tabs) */}
                {!isPinned && (
                    <span className="text-13 truncate max-w-[200px] flex-1">
                        {title || 'New Tab'}
                    </span>
                )}

                {/* Close button (shows on hover) */}
                {!isPinned && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation()
                            onClose()
                        }}
                        className={cn(
                            "flex-shrink-0 p-1 rounded-control transition-opacity",
                            "hover:bg-border",
                            "opacity-0 group-hover/tab:opacity-100",
                            isActive && "opacity-100"
                        )}
                    >
                        <X className="size-3" />
                    </div>
                )}
            </div>
        </div>
    )
}

export const TabBar: React.FC = () => {
    const { tabs, createTab, closeTab, switchTab } = useBrowser()

    const handleCreateTab = () => {
        createTab('https://www.google.com')
    }

    return (
        <div className="flex-1 overflow-x-hidden flex items-center">
            {/* macOS traffic lights spacing */}
            <div className="pl-20" />

            {/* Tabs */}
            <div className="flex-1 overflow-x-auto flex">
                {tabs.map(tab => (
                    <TabItem
                        key={tab.id}
                        id={tab.id}
                        title={tab.title}
                        favicon={tab.favicon}
                        isActive={tab.isActive}
                        onClose={() => closeTab(tab.id)}
                        onActivate={() => switchTab(tab.id)}
                    />
                ))}
            </div>

            {/* Add Tab Button */}
            <div className="pl-1 pr-2">
                <TabBarButton
                    Icon={Plus}
                    onClick={handleCreateTab}
                />
            </div>
        </div>
    )
}

