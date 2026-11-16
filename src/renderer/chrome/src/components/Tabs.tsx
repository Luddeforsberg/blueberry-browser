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

// A tab in the row at its widest, and the space between two.
const ROW_TAB_MAX = 196
const ROW_TAB_GAP = 2

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
        data-active={tab.isActive || undefined}
        onPointerDown={onPress}
        onDragStart={(e) => e.preventDefault()}
        style={style}
        className={cn(
            "group/tab flex items-center pr-1 rounded-row text-ink-2 transition-colors app-region-no-drag",
            row ? "relative h-8" : "h-[30px]",
            iconOnly ? "pl-1.5 gap-1" : row ? "pl-2.5 gap-2" : "pl-2 gap-[9px]",
            // In the row they take equal shares up to 196px, down to an icon's 36. The one in front keeps room for its name.
            row && "flex-[1_1_196px] min-w-9 max-w-[196px]",
            // Its close button always shows, so it gives way at half the others' rate, and its title keeps up with theirs.
            row && tab.isActive && "min-w-[120px] shrink-[0.5]",
            tab.isActive ? "bg-sheet text-ink shadow-rim" : row ? "hover:bg-tray hover:text-ink" : "hover:bg-hover hover:text-ink",
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
            <span className={cn("flex-1 min-w-0 text-14 truncate", iconOnly && "sr-only")}>{tab.title || 'New tab'}</span>
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
            <X className="size-[13px]" strokeWidth={1.75} />
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
                <button type="button" aria-current={chatTab?.isActive ? 'page' : undefined} onClick={open} className={cn(row, "flex-1 min-w-0 h-full text-14 text-ink")}>
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
                        <X className="size-[13px]" strokeWidth={1.75} />
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
                            className={cn(row, "h-[27px] text-13", tab.isActive ? "bg-sheet text-ink shadow-rim" : "text-ink-2 hover:bg-hover hover:text-ink")}
                        >
                            {/* The group's own row is what moves while the job works. */}
                            <span className={LEADING_SLOT}><TabIcon tab={tab} still /></span>
                            <span className="flex-1 truncate">{tab.title || 'New tab'}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </li>
    )
}

// The tab row's version of the job block: a tray-toned group with the mascot's face and the job's name, then its tabs,
// and the waiting pips in `ask` at its end while it needs you. Pressing the face or the name opens the chat.
const JobGroupRow: React.FC<{ chatId: string; chatTab: TabInfo | undefined; tabs: TabInfo[] }> = ({ chatId, chatTab, tabs }) => {
    const { chats, needsYou } = useLibrary()
    const { find } = useFlock()
    const { switchTab } = useBrowser()
    const chat = chats.find(({ id }) => id === chatId)
    const mascot = find(chat?.mascotId ?? null)
    const asking = needsYou.some(({ id }) => id === chatId)
    const title = chat?.title ?? chatTab?.title ?? 'A job'
    const open = () => (chatTab ? void switchTab(chatTab.id) : void window.chromeAPI.browser.openPage('chat', { param: chatId, title }))
    const focus = "outline-none focus-visible:ring-2 focus-visible:ring-focus app-region-no-drag"

    return (
        <li aria-label={`${title}, ${asking ? `${mascot.name} needs you` : `${mascot.name} is working`}`} className="h-9 mx-[3px] pl-1 pr-0.5 min-w-0 shrink flex items-center gap-0.5 rounded-tile bg-tray">
            <button
                type="button"
                aria-current={chatTab?.isActive ? 'page' : undefined}
                onClick={open}
                className={cn("h-[30px] pl-1 pr-2 min-w-0 shrink-0 flex items-center gap-[7px] rounded-row text-14 text-ink", chatTab?.isActive ? "bg-sheet shadow-rim" : "hover:bg-hover", focus)}
            >
                <Berry mood={asking ? 'asking' : 'fetching'} size={20} mascot={mascot} />
                <span className="max-w-[124px] truncate">{title}</span>
            </button>
            <ul aria-label={`Pages ${mascot.name} opened`} className="min-w-0 flex items-center gap-0.5">
                {tabs.map((tab) => (
                    <li key={tab.id} className="min-w-9 flex-[0_1_136px]">
                        <button
                            type="button"
                            aria-current={tab.isActive ? 'page' : undefined}
                            title={tab.title || 'New tab'}
                            onClick={() => !tab.isActive && void switchTab(tab.id)}
                            className={cn("w-full h-[30px] px-2.5 flex items-center gap-2 rounded-row text-14", tab.isActive ? "bg-sheet text-ink shadow-rim" : "text-ink-2 hover:bg-hover hover:text-ink", focus)}
                        >
                            {/* The group's face is what moves while the job works. */}
                            <span className={LEADING_SLOT}><TabIcon tab={tab} still /></span>
                            <span className="flex-1 min-w-0 truncate">{tab.title || 'New tab'}</span>
                        </button>
                    </li>
                ))}
            </ul>
            {asking && <Pips pattern="waiting" className="mx-1.5 shrink-0 text-ask" />}
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
    // A running job's tabs show in a group of their own, and that chat's own tab heads the group: under its chat in the
    // sidebar, and after the user's tabs in the row.
    const jobs = [...new Set(allTabs.flatMap((tab) => (tab.jobChatId ? [tab.jobChatId] : [])))]
    const heads = (tab: TabInfo) => tab.page === 'chat' && !!tab.pageParam && jobs.includes(tab.pageParam)
    const tabs = allTabs.filter((tab) => !tab.jobChatId && !heads(tab))
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
                // In the row, as wide as its tabs at their widest, and narrower with less room, so + follows the last tab.
                style={vertical ? undefined : { flexBasis: tabs.length * (ROW_TAB_MAX + ROW_TAB_GAP) }}
                className={cn("flex gap-0.5", vertical ? "flex-col" : "tab-row min-w-0 shrink grow-0 items-center")}
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
            {/* A list of their own, because a job's tabs aren't the user's. */}
            {!vertical && jobs.length > 0 && (
                <ul aria-label="Running jobs" className="min-w-0 shrink flex items-center">
                    {jobs.map((chatId) => (
                        <JobGroupRow
                            key={chatId}
                            chatId={chatId}
                            chatTab={allTabs.find((tab) => tab.page === 'chat' && tab.pageParam === chatId)}
                            tabs={allTabs.filter((tab) => tab.jobChatId === chatId)}
                        />
                    ))}
                </ul>
            )}
            {vertical && jobs.length > 0 && (
                <ul aria-label="Running jobs" className="flex flex-col">
                    {jobs.map((chatId) => (
                        <JobGroup
                            key={chatId}
                            chatId={chatId}
                            chatTab={allTabs.find((tab) => tab.page === 'chat' && tab.pageParam === chatId)}
                            tabs={allTabs.filter((tab) => tab.jobChatId === chatId)}
                            onClose={(id) => void closeTab(id)}
                        />
                    ))}
                </ul>
            )}
            {showNew && (
                <button
                    type="button"
                    aria-label="New tab"
                    onClick={() => createTab()}
                    className={cn(
                        "flex items-center gap-2 h-8 rounded-row text-14 text-ink-2 app-region-no-drag",
                        "hover:bg-hover outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
                        vertical ? "w-full px-2 mt-0.5" : "size-7 ml-1 shrink-0 justify-center text-ink-3 hover:text-ink"
                    )}
                >
                    <Plus className="size-4" />
                    {vertical && 'New tab'}
                </button>
            )}
        </>
    )
}
