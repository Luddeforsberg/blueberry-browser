import React, { useLayoutEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { LayoutMode, TabInfo } from '@shared/ipc'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { LEADING_SLOT, TabIcon } from './TabIcon'
import { SHIMMER_TEXT } from './ChatMessage'
import { nudgeTarget, useTabDrag } from './useTabDrag'
import { cn } from '@common/lib/utils'

// Below this a tab in the row only has room for its icon, so the title goes rather than showing a letter or two.
const ICON_ONLY_WIDTH = 72

// A tab's width comes from the row, never from what's in it, so hiding the title can't change it back.
const useIconOnly = (ref: React.RefObject<HTMLElement | null>, row: boolean): boolean => {
    const [iconOnly, setIconOnly] = useState(false)
    useLayoutEffect(() => {
        const item = ref.current
        if (!row || !item) return setIconOnly(false)
        const observer = new ResizeObserver(([entry]) => setIconOnly(entry.borderBoxSize[0].inlineSize < ICON_ONLY_WIDTH))
        observer.observe(item)
        return () => observer.disconnect()
    }, [ref, row])
    return iconOnly
}

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
}> = ({ tab, mode, onActivate, onClose, onPress, onNudge, dragged, shifting, style }) => {
    const { find } = useFlock()
    const { settings } = useShell()
    // BerryCompanion perches here, except on the new tab page, where it sits on the composer.
    const perch = tab.isActive && settings.showBerry && tab.page !== 'new-tab'
    const row = mode === 'horizontal'
    const item = useRef<HTMLLIElement>(null)
    const iconOnly = useIconOnly(item, row)
    return (
    <li
        ref={item}
        data-berry-tab={tab.id}
        onPointerDown={onPress}
        onDragStart={(e) => e.preventDefault()}
        style={style}
        className={cn(
            "group/tab flex items-center h-[34px] pr-1.5 gap-2 rounded-card transition-colors app-region-no-drag",
            iconOnly ? "pl-1.5 gap-1" : "pl-3",
            row && "flex-1 min-w-[60px] max-w-56",
            // Only the active tab always shows its close button, 32px, and the bird perches on it, 44px more, so it starts
            // that much wider than the others, which start from their 18px of padding, and its title gets as much room.
            row && tab.isActive && (perch
                ? "basis-[94px] min-w-36 max-w-[calc(theme(maxWidth.56)+76px)]"
                : "basis-[50px] max-w-[calc(theme(maxWidth.56)+32px)]"),
            tab.isActive ? "bg-selected shadow-selected" : "hover:bg-foreground/5",
            shifting && "transition-transform",
            dragged && "relative z-10 shadow-float"
        )}
    >
        <button
            type="button"
            aria-current={tab.isActive ? 'page' : undefined}
            title={tab.berryWorking ? `${find(tab.workingMascotId).name} is working here` : iconOnly ? tab.title || 'New tab' : undefined}
            onClick={onActivate}
            onKeyDown={(e) => {
                if (!e.altKey) return
                const [back, forward] = mode === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
                if (e.key !== back && e.key !== forward) return
                e.preventDefault()
                onNudge(e.key === back ? -1 : 1, e.currentTarget)
            }}
            className={cn(
                "flex flex-1 min-w-0 items-center gap-3 h-full text-left outline-none rounded-control focus-visible:ring-2 focus-visible:ring-ring",
                iconOnly && "justify-center"
            )}
        >
            <span className={LEADING_SLOT}><TabIcon tab={tab} /></span>
            <span className={cn("flex-1 min-w-0 text-14 truncate", iconOnly && "sr-only", tab.berryWorking && SHIMMER_TEXT)}>{tab.title || 'New tab'}</span>
            {perch && <span aria-hidden className="w-8 shrink-0" />}
            {tab.berryWorking && <span className="sr-only"> ({find(tab.workingMascotId).name} is working here)</span>}
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
                // In the row, a tab that isn't active only makes room for it on hover or focus, so its title gets the space.
                row && !tab.isActive && "hidden group-hover/tab:flex group-focus-within/tab:flex",
                tab.isActive && "opacity-100"
            )}
        >
            <X className="size-3" />
        </button>
    </li>
    )
}

// One tab list for both layouts: a column in the sidebar, a row in the horizontal tab strip.
// The sidebar puts its new tab button in the section heading, so it passes showNew={false}.
export const Tabs: React.FC<{ mode: LayoutMode; labelledBy?: string; label?: string; showNew?: boolean }> = ({
    mode,
    labelledBy,
    label,
    showNew = true
}) => {
    const { tabs: allTabs, createTab, closeTab, switchTab, moveTab, moveTabBy } = useBrowser()
    const { chats, nests } = useLibrary()
    const vertical = mode === 'vertical'
    // In the sidebar, a chat is its row under Chats, a Nest its row under Nests, and a running job's tabs show under
    // that chat or Nest. The tab row has neither, so it shows them all.
    const listedChat = (tab: TabInfo) =>
        (tab.page === 'chat' && chats.some(({ id }) => id === tab.pageParam)) || (tab.page === 'nest' && nests.some(({ id }) => id === tab.pageParam))
    const tabs = vertical ? allTabs.filter((tab) => !tab.jobChatId && !listedChat(tab)) : allTabs
    // A drag counts places in this list, and the window in all of them.
    const moveShown = (tabId: string, toIndex: number) =>
        moveTab(tabId, toIndex < tabs.length ? allTabs.indexOf(tabs[toIndex]) : allTabs.length - 1)
    const { start, itemProps } = useTabDrag(tabs.map(tab => tab.id), vertical ? 'y' : 'x', moveShown)
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
                            // With a job's tabs hidden, a step counts only the ones shown.
                            if (tabs.length === allTabs.length) return void moveTabBy(tab.id, delta)
                            const to = nudgeTarget(allTabs.map(({ id }) => id), tabs.map(({ id }) => id), tab.id, delta)
                            if (to !== null) void moveTab(tab.id, to)
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
