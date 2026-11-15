import React, { useLayoutEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { LayoutMode, TabInfo } from '@shared/ipc'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { LEADING_SLOT, TabIcon } from './TabIcon'
import { nudgeTarget, useTabDrag } from './useTabDrag'
import { Berry } from './Berry'
import { Pips } from '@common/components/Pips'
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
            "group/tab flex items-center h-[30px] pr-1 rounded-row text-ink-2 transition-colors app-region-no-drag",
            iconOnly ? "pl-1.5 gap-1" : "pl-2 gap-[9px]",
            row && "flex-1 min-w-[60px] max-w-56",
            // Only the active tab always shows its close button, so it starts that much wider than the others, and its
            // title gets as much room.
            row && tab.isActive && "basis-[44px] max-w-[calc(theme(maxWidth.56)+24px)]",
            tab.isActive ? "bg-sheet text-ink shadow-rim" : "hover:bg-hover hover:text-ink",
            shifting && "transition-transform",
            dragged && "relative z-10 shadow-lift"
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
                "flex flex-1 min-w-0 items-center gap-[9px] h-full text-left outline-none rounded-row focus-visible:ring-2 focus-visible:ring-focus",
                iconOnly && "justify-center"
            )}
        >
            <span className={LEADING_SLOT}><TabIcon tab={tab} /></span>
            <span className={cn("flex-1 min-w-0 text-13 truncate", iconOnly && "sr-only")}>{tab.title || 'New tab'}</span>
            {tab.berryWorking && <span className="sr-only"> ({find(tab.workingMascotId).name} is working here)</span>}
        </button>
        <button
            type="button"
            aria-label={`Close ${tab.title || 'tab'}`}
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
                "size-[22px] shrink-0 flex items-center justify-center rounded-[7px] text-ink-3 outline-none transition-opacity",
                "hover:bg-press hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:opacity-100",
                "opacity-0 group-hover/tab:opacity-100",
                // In the row, a tab that isn't active only makes room for it on hover or focus, so its title gets the space.
                row && !tab.isActive && "hidden group-hover/tab:flex group-focus-within/tab:flex",
                tab.isActive && "opacity-100"
            )}
        >
            <X className="size-[13px]" strokeWidth={1.5} />
        </button>
    </li>
    )
}

// A job's tabs aren't the user's. While one runs, its chat is a row with its mascot's face, on a tray, and the tabs it
// opened sit under it behind a dotted line. They close when the job ends, except any the user took over.
const JobGroup: React.FC<{ chatId: string; chatTab: TabInfo | undefined; tabs: TabInfo[]; onClose: (id: string) => void }> = ({ chatId, chatTab, tabs, onClose }) => {
    const { chats, needsYou } = useLibrary()
    const { find } = useFlock()
    const { switchTab } = useBrowser()
    const chat = chats.find(({ id }) => id === chatId)
    const mascot = find(chat?.mascotId ?? null)
    const asking = needsYou.some(({ id }) => id === chatId)
    const title = chat?.title ?? chatTab?.title ?? 'A job'
    const open = () => (chatTab ? void switchTab(chatTab.id) : void window.chromeAPI.browser.openPage('chat', { param: chatId, title }))
    const row = "flex items-center gap-[9px] w-full px-2 rounded-row text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus app-region-no-drag"

    return (
        <li className="mt-1 p-0.5 pb-1 rounded-tile bg-tray">
            <div className={cn("flex items-center h-[30px] pr-1 rounded-row", chatTab?.isActive ? "bg-sheet shadow-rim" : "hover:bg-hover")}>
                <button type="button" aria-current={chatTab?.isActive ? 'page' : undefined} onClick={open} className={cn(row, "flex-1 min-w-0 h-full text-13 text-ink")}>
                    <span className={LEADING_SLOT}><Berry mood={asking ? 'asking' : 'fetching'} size={20} mascot={mascot} /></span>
                    <span className="flex-1 truncate">{title}</span>
                    <span className="sr-only">{asking ? `, ${mascot.name} needs you` : `, ${mascot.name} is working`}</span>
                    {asking && <Pips pattern="waiting" className="text-ask" />}
                </button>
                {chatTab?.isActive && (
                    <button
                        type="button"
                        aria-label={`Close ${title}`}
                        onClick={() => onClose(chatTab.id)}
                        className="size-[22px] shrink-0 flex items-center justify-center rounded-[7px] text-ink-3 outline-none hover:bg-press hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <X className="size-[13px]" strokeWidth={1.5} />
                    </button>
                )}
            </div>
            <ul aria-label={`Pages ${mascot.name} opened`} className="ml-[15px] pl-2 border-l border-dotted border-faint">
                {tabs.map((tab) => (
                    <li key={tab.id}>
                        <button
                            type="button"
                            aria-current={tab.isActive ? 'page' : undefined}
                            onClick={() => !tab.isActive && void switchTab(tab.id)}
                            className={cn(row, "h-[27px] text-12", tab.isActive ? "bg-sheet text-ink shadow-rim" : "text-ink-2 hover:bg-hover hover:text-ink")}
                        >
                            <span className={LEADING_SLOT}><TabIcon tab={tab} /></span>
                            <span className="flex-1 truncate">{tab.title || 'New tab'}</span>
                        </button>
                    </li>
                ))}
            </ul>
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
    const vertical = mode === 'vertical'
    // In the sidebar a running job's tabs show in a group under its chat, and that chat's own tab heads the group. The
    // tab row has no groups, so it shows them all.
    const jobs = [...new Set(allTabs.flatMap((tab) => (tab.jobChatId ? [tab.jobChatId] : [])))]
    const heads = (tab: TabInfo) => tab.page === 'chat' && !!tab.pageParam && jobs.includes(tab.pageParam)
    const tabs = vertical ? allTabs.filter((tab) => !tab.jobChatId && !heads(tab)) : allTabs
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
                {vertical && jobs.map((chatId) => (
                    <JobGroup
                        key={chatId}
                        chatId={chatId}
                        chatTab={allTabs.find((tab) => tab.page === 'chat' && tab.pageParam === chatId)}
                        tabs={allTabs.filter((tab) => tab.jobChatId === chatId)}
                        onClose={(id) => void closeTab(id)}
                    />
                ))}
            </ul>
            {showNew && (
                <button
                    type="button"
                    aria-label="New tab"
                    onClick={() => createTab()}
                    className={cn(
                        "flex items-center gap-2 h-8 rounded-row text-13 text-ink-2 app-region-no-drag",
                        "hover:bg-hover outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
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
