import React, { useEffect, useState } from 'react'
import { AppWindow, ChevronLeft, ChevronRight, CircleDot, Paperclip } from 'lucide-react'
import type { TabChoice } from '@shared/attachments'
import { cn } from '@common/lib/utils'
import { LABEL } from '@common/components/StatusPill'
import { Favicon } from './Favicon'
import { MenuRule, MenuSheet, menuRowClass } from './MenuSheet'

// DESIGN.md section 10, The prompt box: what the + adds. As wide as the card, with the open tabs in it, so adding one is
// a single press: This page in the chat panel while the page in front isn't a chip, the tabs, a hairline, A file, and
// Show Berry how on the new tab. A row that's ruled out stays and says why.

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
    // `note` is what it leads to, where the label doesn't say.
    showHow?: { label: string; note: string | null; problem: string | null; onStart: () => void }
}

// The menu lists this many tabs itself. With more, it lists one fewer and a row that opens them all.
const TABS_SHOWN = 4

const ICON = 'size-4 shrink-0'

// One line: what it adds, and a quiet note at the right, such as a tab's site. Ruled out, it stays, off, and the reason
// takes a second line in place of the note.
const Row: React.FC<
    {
        icon: React.ReactNode
        title: string
        note?: string | null
        why?: string | null
        // It opens a list rather than adding something.
        opens?: boolean
        onPick: () => void
        className?: string
    } & React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ icon, title, note, why = null, opens, onPick, className, ...rest }) => (
    <button type="button" role="menuitem" aria-disabled={why !== null} onClick={() => why === null && onPick()} className={cn(menuRowClass(why !== null, why !== null), className)} {...rest}>
        {icon}
        <span className="flex-1 min-w-0">
            <span className="block truncate">{title}</span>
            {why && <span className="block mt-px text-13 truncate">{why}</span>}
        </span>
        {!why && note && <span className="shrink-0 max-w-[60%] truncate text-13 text-ink-3">{note}</span>}
        {!why && opens && <ChevronRight aria-hidden className="leans size-3.5 shrink-0 text-faint" strokeWidth={1.75} />}
    </button>
)

const SiteIcon: React.FC<{ favicon: string | null; site: string; off: boolean }> = ({ favicon, site, off }) => (
    <span className={cn('flex shrink-0', off && 'opacity-50')}><Favicon src={favicon} site={site} /></span>
)

export const AddMenu: React.FC<AddMenuOptions & { above: boolean; leaving?: boolean; onClose: (refocus: boolean) => void }> = ({ thisPage, tabs, files, showHow, above, leaving, onClose }) => {
    const [view, setView] = useState<'main' | 'tabs'>('main')
    // Back from the list, the keyboard goes to the row that opened it.
    const [cameBack, setCameBack] = useState(false)
    const back = () => {
        setCameBack(true)
        setView('main')
    }
    // Asked for as the + is pressed. The menu opens once they're here, so it opens whole, with the keyboard on its first row.
    const [choices, setChoices] = useState<TabChoice[] | null>(null)
    useEffect(() => {
        let live = true
        const show = (list: TabChoice[]) => live && setChoices(list)
        void tabs.load().then(show, () => show([]))
        return () => {
            live = false
        }
    }, [])
    if (choices === null) return null

    const pick = (act: () => void) => {
        act()
        onClose(true)
    }
    const tabsOff = tabs.problem ?? (choices.length === 0 ? (tabs.note ? `${tabs.note}, and none is open` : 'No other tabs are open') : null)
    const tabRow = (tab: TabChoice) => {
        const why = tab.problem ?? (tabs.added.includes(tab.id) ? 'Already added' : null)
        return (
            <Row
                key={tab.id}
                data-tab-row
                icon={<SiteIcon favicon={tab.favicon} site={tab.site} off={why !== null} />}
                title={tab.title}
                note={tab.site}
                why={why}
                onPick={() => pick(() => tabs.onChoose(tab))}
            />
        )
    }

    if (view === 'tabs') {
        return (
            <MenuSheet
                label="Open tabs"
                above={above}
                align="box"
                view="tabs"
                // The keyboard goes to the first tab, as the pointer would, with the way back above it.
                focusFirst="[data-tab-row]"
                leaving={leaving}
                onClose={onClose}
                onKey={(event) => {
                    if (event.key !== 'ArrowLeft') return false
                    event.preventDefault()
                    back()
                    return true
                }}
            >
                <button type="button" role="menuitem" onClick={back} className="w-full h-[34px] px-2 flex items-center gap-2 rounded-[14px] text-13 text-ink-2 outline-none hover:bg-sheet-2 focus-visible:bg-sheet-2">
                    <ChevronLeft aria-hidden className="size-[13px]" strokeWidth={1.75} />
                    Open tabs
                </button>
                <div className="max-h-[min(322px,50vh)] overflow-y-auto">{choices.map(tabRow)}</div>
            </MenuSheet>
        )
    }

    const many = choices.length > TABS_SHOWN
    return (
        <MenuSheet label="Add to the message" above={above} align="box" view="main" focusFirst={cameBack ? '[data-all-row]' : undefined} leaving={leaving} onClose={onClose}>
            {thisPage && (
                <Row
                    icon={<SiteIcon favicon={thisPage.favicon} site={thisPage.site} off={thisPage.problem !== null} />}
                    title="This page"
                    note={thisPage.site}
                    why={thisPage.problem}
                    onPick={() => pick(thisPage.onAdd)}
                />
            )}
            {tabsOff !== null ? (
                <Row icon={<AppWindow aria-hidden className={ICON} strokeWidth={1.75} />} title="An open tab" why={tabsOff} onPick={() => undefined} />
            ) : (
                <div role="group" aria-label="Open tabs">
                    <p aria-hidden className={cn('px-2.5 pt-1.5 pb-1', LABEL)}>Open tabs</p>
                    {tabs.note && <p className="px-2.5 pb-1.5 text-13 text-ink-2">{tabs.note}</p>}
                    {(many ? choices.slice(0, TABS_SHOWN - 1) : choices).map(tabRow)}
                    {many && (
                        <Row
                            data-all-row
                            aria-haspopup="menu"
                            icon={<AppWindow aria-hidden className={cn(ICON, 'text-ink-3')} strokeWidth={1.75} />}
                            title={`All ${choices.length} tabs`}
                            opens
                            onPick={() => setView('tabs')}
                            onKeyDown={(event) => {
                                if (event.key !== 'ArrowRight') return
                                event.preventDefault()
                                setView('tabs')
                            }}
                            className="text-ink-2"
                        />
                    )}
                </div>
            )}
            <MenuRule />
            <Row icon={<Paperclip aria-hidden className={ICON} strokeWidth={1.75} />} title="A file" note="or drop it on the box" why={files.problem} onPick={() => pick(files.onChoose)} />
            {showHow && <Row icon={<CircleDot aria-hidden className={ICON} strokeWidth={1.75} />} title={showHow.label} note={showHow.note} why={showHow.problem} onPick={() => pick(showHow.onStart)} />}
        </MenuSheet>
    )
}
