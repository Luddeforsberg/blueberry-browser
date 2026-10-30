import React, { useLayoutEffect, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import type { LayoutMode, TabInfo } from '@shared/ipc'
import { useBrowser } from '../contexts/BrowserContext'
import { TabIcon } from './TabIcon'
import { useTabDrag } from './useTabDrag'
import { cn } from '@common/lib/utils'

const TabItem: React.FC<{
    tab: TabInfo
    mode: LayoutMode
    onActivate: () => void
    onClose: () => void
    onPress: (event: React.PointerEvent<HTMLLIElement>) => void
    onNudge: (delta: number, button: HTMLElement) => void
    dragged: boolean
    shifting: boolean
    style?: React.CSSProperties
}> = ({ tab, mode, onActivate, onClose, onPress, onNudge, dragged, shifting, style }) => (
    <li
        onPointerDown={onPress}
        onDragStart={(e) => e.preventDefault()}
        style={style}
        className={cn(
            "group/tab flex items-center h-[34px] pl-3 pr-1.5 gap-2 rounded-card transition-colors app-region-no-drag",
            mode === 'horizontal' && "flex-1 min-w-12 max-w-56",
            tab.isActive ? "bg-selected shadow-selected" : "hover:bg-foreground/5",
            shifting && "transition-transform",
            dragged && "relative z-10 shadow-float"
        )}
    >
        <button
            type="button"
            aria-current={tab.isActive ? 'page' : undefined}
            onClick={onActivate}
            onKeyDown={(e) => {
                if (!e.altKey) return
                const [back, forward] = mode === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
                if (e.key !== back && e.key !== forward) return
                e.preventDefault()
                onNudge(e.key === back ? -1 : 1, e.currentTarget)
            }}
            className="flex flex-1 min-w-0 items-center gap-3 h-full text-left outline-none rounded-control focus-visible:ring-2 focus-visible:ring-ring"
        >
            <TabIcon tab={tab} />
            <span className="text-14 truncate">{tab.title || 'New Tab'}</span>
        </button>
        <button
            type="button"
            aria-label={`Close ${tab.title || 'tab'}`}
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
                "size-6 shrink-0 flex items-center justify-center rounded-control outline-none transition-opacity",
                "hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100",
                "opacity-0 group-hover/tab:opacity-100",
                tab.isActive && "opacity-100"
            )}
        >
            <X className="size-3" />
        </button>
    </li>
)

// One tab list for both layouts: a column in the sidebar, a row in the horizontal tab strip.
// The sidebar puts its new tab button in the section heading, so it passes showNew={false}.
export const Tabs: React.FC<{ mode: LayoutMode; labelledBy?: string; label?: string; showNew?: boolean }> = ({
    mode,
    labelledBy,
    label,
    showNew = true
}) => {
    const { tabs, createTab, closeTab, switchTab, moveTab, moveTabBy } = useBrowser()
    const vertical = mode === 'vertical'
    const { start, itemProps } = useTabDrag(tabs.map(tab => tab.id), vertical ? 'y' : 'x', moveTab)
    const order = tabs.map(tab => tab.id).join()
    const nudged = useRef<HTMLElement | null>(null)

    // Moving a node in the DOM can drop its focus, which would end a run of Alt+arrow presses.
    // At the end of the list nothing moves, so only take focus back if it really was dropped.
    useLayoutEffect(() => {
        if (document.activeElement === document.body) nudged.current?.focus()
        nudged.current = null
    }, [order])

    return (
        <>
            <ul
                aria-labelledby={labelledBy}
                aria-label={label}
                className={cn("flex gap-0.5", vertical ? "flex-col" : "flex-1 min-w-0 items-center")}
            >
                {tabs.map((tab, index) => (
                    <TabItem
                        key={tab.id}
                        tab={tab}
                        mode={mode}
                        onActivate={() => !tab.isActive && switchTab(tab.id)}
                        onClose={() => closeTab(tab.id)}
                        onPress={(event) => {
                            if (event.button !== 0) return
                            // Like other browsers, a press selects the tab, so a drag moves the page you see.
                            if (!tab.isActive) void switchTab(tab.id)
                            start(event, tab.id)
                        }}
                        onNudge={(delta, button) => {
                            nudged.current = button
                            void moveTabBy(tab.id, delta)
                        }}
                        {...itemProps(tab.id, index)}
                    />
                ))}
            </ul>
            {showNew && (
                <button
                    type="button"
                    aria-label="New tab"
                    onClick={() => createTab()}
                    className={cn(
                        "flex items-center gap-2 h-8 rounded-control text-14 text-muted-foreground app-region-no-drag",
                        "hover:bg-muted outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        vertical ? "w-full px-2 mt-0.5" : "w-8 shrink-0 justify-center"
                    )}
                >
                    <Plus className="size-4" />
                    {vertical && 'New tab'}
                </button>
            )}
        </>
    )
}
