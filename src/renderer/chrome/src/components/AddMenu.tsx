import React, { useEffect, useState } from 'react'
import { AppWindow, ChevronLeft, ChevronRight, CircleDot, File } from 'lucide-react'
import type { TabChoice } from '@shared/attachments'
import { cn } from '@common/lib/utils'
import { Favicon } from './Favicon'
import { MenuRule, MenuSheet, menuRowClass } from './MenuSheet'

// DESIGN.md section 10, The prompt box: what the + adds. On the new tab, An open tab, A file, a hairline and Show Berry
// how. In a chat, This page while the page in front isn't a chip, then An open tab and A file. A row that's ruled out
// stays and says why. Mock: docs/design/mocks/the-plus.html.

export interface AddMenuOptions {
    // The page in front, in the chat panel, while it isn't on the card already.
    thisPage?: { site: string; favicon: string | null; problem: string | null; onAdd: () => void }
    tabs: {
        // Why no tab can go, such as the job going to the cloud.
        problem: string | null
        // What limits the list, such as a mascot's sites.
        note: string | null
        load: () => Promise<TabChoice[]>
        // Already in the box, so not offered again.
        added: readonly string[]
        onChoose: (tab: TabChoice) => void
    }
    files: { problem: string | null; onChoose: () => void }
    showHow?: { label: string; problem: string | null; onStart: () => void }
}

const ICON = 'size-4 shrink-0'

const RowWords: React.FC<{ title: string; sub?: string | null; off?: boolean }> = ({ title, sub, off }) => (
    <span className="flex-1 min-w-0">
        <span className="block truncate">{title}</span>
        {sub && <span className={cn('block mt-px text-12 truncate', off ? 'text-faint' : 'text-ink-2')}>{sub}</span>}
    </span>
)

export const AddMenu: React.FC<AddMenuOptions & { above: boolean; onClose: (refocus: boolean) => void }> = ({ thisPage, tabs, files, showHow, above, onClose }) => {
    const [view, setView] = useState<'main' | 'tabs'>('main')
    // Back from the list, the keyboard goes to the row that opened it.
    const [cameBack, setCameBack] = useState(false)
    const back = () => {
        setCameBack(true)
        setView('main')
    }
    // Asked for as the menu opens, so the row can say if there's nothing to choose.
    const [choices, setChoices] = useState<TabChoice[] | null>(null)
    useEffect(() => {
        let live = true
        void tabs.load().then((list) => live && setChoices(list))
        return () => {
            live = false
        }
    }, [])

    const pick = (act: () => void) => {
        act()
        onClose(true)
    }
    const noTabs = choices !== null && choices.length === 0
    const tabsOff = tabs.problem ?? (noTabs ? (tabs.note ? `${tabs.note}, and none is open` : 'No other tabs are open') : null)

    if (view === 'tabs') {
        return (
            <MenuSheet
                label="An open tab"
                above={above}
                align="left"
                className="w-[320px]"
                view="tabs"
                // The keyboard goes to the first tab, as the pointer would, with the way back above it.
                focusFirst="[data-tab-row]"
                onClose={onClose}
                onKey={(event) => {
                    if (event.key !== 'ArrowLeft') return false
                    event.preventDefault()
                    back()
                    return true
                }}
            >
                <button type="button" role="menuitem" onClick={back} className="w-full h-[34px] px-2 flex items-center gap-2 rounded-[14px] text-12 text-ink-2 outline-none hover:bg-sheet-2 focus-visible:bg-sheet-2">
                    <ChevronLeft aria-hidden className="size-[13px]" strokeWidth={1.5} />
                    An open tab
                </button>
                <div className="max-h-[min(322px,50vh)] overflow-y-auto">
                    {(choices ?? []).map((tab) => {
                        const added = tabs.added.includes(tab.id)
                        const why = tab.problem ?? (added ? 'Already added' : null)
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="menuitem"
                                data-tab-row
                                aria-disabled={why !== null}
                                onClick={() => why === null && pick(() => tabs.onChoose(tab))}
                                className={menuRowClass(true, why !== null)}
                            >
                                <span className={cn('flex', why !== null && 'opacity-50')}><Favicon src={tab.favicon} site={tab.site} /></span>
                                <RowWords title={tab.title} sub={why ?? tab.site} off={why !== null} />
                            </button>
                        )
                    })}
                </div>
            </MenuSheet>
        )
    }

    return (
        <MenuSheet label="Add to the message" above={above} align="left" className="w-[300px]" view="main" focusFirst={cameBack ? '[data-tabs-row]' : undefined} onClose={onClose}>
            {thisPage && (
                <button
                    type="button"
                    role="menuitem"
                    aria-disabled={thisPage.problem !== null}
                    onClick={() => thisPage.problem === null && pick(thisPage.onAdd)}
                    className={menuRowClass(true, thisPage.problem !== null)}
                >
                    <span className={cn('flex', thisPage.problem !== null && 'opacity-50')}><Favicon src={thisPage.favicon} site={thisPage.site} /></span>
                    <RowWords title="This page" sub={thisPage.problem ?? thisPage.site} off={thisPage.problem !== null} />
                </button>
            )}
            <button
                type="button"
                role="menuitem"
                data-tabs-row
                aria-haspopup="menu"
                aria-disabled={tabsOff !== null}
                onClick={() => tabsOff === null && setView('tabs')}
                onKeyDown={(event) => {
                    if (event.key !== 'ArrowRight' || tabsOff !== null) return
                    event.preventDefault()
                    setView('tabs')
                }}
                className={menuRowClass(!!(tabsOff ?? tabs.note), tabsOff !== null)}
            >
                <AppWindow aria-hidden className={cn(ICON, tabsOff ? 'text-faint' : 'text-ink-3')} strokeWidth={1.5} />
                <RowWords title="An open tab" sub={tabsOff ?? tabs.note} off={tabsOff !== null} />
                {tabsOff === null && <ChevronRight aria-hidden className="size-[13px] shrink-0 text-ink-3" strokeWidth={1.5} />}
            </button>
            <button
                type="button"
                role="menuitem"
                aria-disabled={files.problem !== null}
                onClick={() => files.problem === null && pick(files.onChoose)}
                className={menuRowClass(files.problem !== null, files.problem !== null)}
            >
                <File aria-hidden className={cn(ICON, files.problem ? 'text-faint' : 'text-ink-3')} strokeWidth={1.5} />
                <RowWords title="A file" sub={files.problem} off={files.problem !== null} />
            </button>
            {showHow && (
                <>
                    <MenuRule />
                    <button
                        type="button"
                        role="menuitem"
                        aria-disabled={showHow.problem !== null}
                        onClick={() => showHow.problem === null && pick(showHow.onStart)}
                        className={menuRowClass(showHow.problem !== null, showHow.problem !== null)}
                    >
                        <CircleDot aria-hidden className={cn(ICON, showHow.problem ? 'text-faint' : 'text-ink-3')} strokeWidth={1.5} />
                        <RowWords title={showHow.label} sub={showHow.problem} off={showHow.problem !== null} />
                    </button>
                </>
            )}
        </MenuSheet>
    )
}
