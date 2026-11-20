import React, { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@common/lib/utils'
import { Tooltip } from '@common/components/Tooltip'

// DESIGN.md section 10, A page in a tab: every page of Blueberry's own that opens in a tab is built from these, so they
// can't drift apart. The page is the sheet, as a chat is (the shell draws it under `PageFrame`), in one column 620px
// wide that scrolls as a whole, with a title and the page's own actions on its right, and lists straight on the page:
// a group is a label and its rows (`SettingsGroup`), with no sheet. One step in is `BackButton` or `StepInHeader`.

// The gutter stays when nothing scrolls, so the column doesn't move between a short page and a long one. The column is
// at least as tall as the page, so nothing to show can stand in its middle.
export const PageFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable_both-edges]">
        <div data-page-column className="w-[620px] max-w-[calc(100%-32px)] min-h-full mx-auto pt-[26px] pb-12 flex flex-col">{children}</div>
    </div>
)

// The title at 20px semibold, with the page's search and its actions on the right, and one line under it in `ink-2`.
export const PageHeader: React.FC<{ title: string; search?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }> = ({ title, search, actions, children }) => (
    <>
        <div className="min-h-[34px] flex items-center gap-2">
            <h1 className="flex-1 min-w-0 text-20 font-semibold [overflow-wrap:anywhere]">{title}</h1>
            {search}
            {actions}
        </div>
        {children && <p className="mt-1 max-w-[520px] text-14 text-ink-2">{children}</p>}
    </>
)

// A row on the page has 8px inside each end and an 11px radius, so the row you're on fills from edge to edge.
export const ROW = 'relative px-2 rounded-[11px]'
// The row you're on, by pointer or by keyboard: it fills with `hover`, and the hairline above it goes. `group/row` lets
// what's on it show (`ON_ROW_SHOW`), and `row-on` the hairline under it go (`LINE_BETWEEN`).
export const ON_ROW = 'row-on group/row transition-colors hover:bg-hover focus-visible:bg-hover has-[:focus-visible]:bg-hover hover:before:hidden focus-visible:before:hidden has-[:focus-visible]:before:hidden'
// What shows only on the row you're on. It's still there to the keyboard, which is what brings it out.
export const ON_ROW_SHOW = 'opacity-0 transition-opacity group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100'
// And what it takes the place of.
export const OFF_ROW_HIDE = 'transition-opacity group-hover/row:opacity-0 group-has-[:focus-visible]/row:opacity-0'
// The hairline between two rows starts where the text does, after an icon when the rows have one, so a row that leads
// with something sets `before:left-*` to where its text starts.
export const BETWEEN = "relative before:content-[''] before:absolute before:right-0 before:top-0 before:h-px before:bg-line first:before:hidden"
// Between rows of two lines on the page, the hairline stops 8px from the end, as the row's words do, and goes from
// under the row you're on as well as from above it (`ON_ROW`).
export const LINE_BETWEEN = cn(BETWEEN, 'before:right-2 [.row-on:hover+&]:before:hidden [.row-on:focus-visible+&]:before:hidden [.row-on:has(:focus-visible)+&]:before:hidden')

// Nothing to show: the mascot where the page is about it, and one sentence, in the middle of the page with no sheet.
// Never an empty page with a heading. Where something went wrong, a title at 20px says what, and the way on is under it.
export const EmptyPage: React.FC<{ face?: React.ReactNode; title?: string; actions?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ face, title, actions, className, children }) => (
    <div className={cn('flex-1 min-h-[220px] pb-[8vh] flex flex-col items-center justify-center gap-3 text-center', className)}>
        {face}
        {title && <h2 className="-mb-1.5 text-20 font-semibold">{title}</h2>}
        <p className="max-w-[420px] text-14 text-ink-2">{children}</p>
        {actions && <div className="mt-1.5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
)

const editable = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')

// A page's search, beside the title's actions: 32px, round, on `sheet-2`, and wider while it has the keyboard. It doesn't
// take the keyboard when the page opens, so no ring is lit before the user has done anything, but the first key typed
// anywhere that isn't a field goes to it, so searching is still just typing. `fill` takes the width it's given, as in
// the Gallery's list, and `folded` is only its magnifier until it's pressed or has words, as on a narrow page.
export const SearchField: React.FC<{ label: string; value: string; onChange: (value: string) => void; placeholder?: string; fill?: boolean; folded?: boolean }> = ({
    label,
    value,
    onChange,
    placeholder = 'Search',
    fill = false,
    folded = false
}) => {
    const input = useRef<HTMLInputElement>(null)
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
            // A character, not Space, which presses the button it's on or scrolls.
            if (event.key.length !== 1 || event.key === ' ' || editable(event.target)) return
            // Focused while the key is down, so the key itself lands in the field.
            input.current?.focus()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])
    // Folded, it's only an icon, so it says what it is.
    return (
        <Tooltip words={folded && !value ? label : null}>
            <label
                className={cn(
                    'h-8 px-3 flex items-center gap-[7px] rounded-full bg-sheet-2 transition-[width] duration-fast has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus',
                    fill ? 'w-full' : folded && !value ? 'w-8 shrink-0 px-[9px] gap-0 cursor-pointer focus-within:w-[260px] focus-within:px-3 focus-within:gap-[7px]' : 'w-[190px] shrink min-w-[120px] focus-within:w-[260px]'
                )}
            >
                <Search aria-hidden className="size-3.5 shrink-0 text-faint" strokeWidth={1.75} />
                <input
                    ref={input}
                    type="search"
                    aria-label={label}
                    placeholder={placeholder}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    spellCheck={false}
                    className="flex-1 min-w-0 h-full bg-transparent text-13 text-ink outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
                />
            </label>
        </Tooltip>
    )
}
