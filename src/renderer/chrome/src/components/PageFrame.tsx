import React from 'react'
import { Search } from 'lucide-react'
import { cn } from '@common/lib/utils'

// DESIGN.md section 10, A page in a tab: every page of Blueberry's own that opens in a tab is built from these, so they
// can't drift apart. The well with no dot grid, one column 620px wide that scrolls as a whole, a title with the page's
// own actions on its right, and groups as sheets (`SettingsGroup`). One step in is `BackButton` or `StepInHeader`.

// The gutter stays when nothing scrolls, so the column doesn't move between a short page and a long one.
export const PageFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable_both-edges]">
        <div className="w-[620px] max-w-[calc(100%-32px)] mx-auto pt-[26px] pb-12">{children}</div>
    </div>
)

// The title at 20px semibold, its actions on the right, raised and at most one filled, and one line under it in `ink-2`.
export const PageHeader: React.FC<{ title: string; actions?: React.ReactNode; children?: React.ReactNode }> = ({ title, actions, children }) => (
    <>
        <div className={cn('mx-3 flex items-center gap-2', children ? 'mb-3' : 'mb-4')}>
            <h1 className="flex-1 min-w-0 text-20 font-semibold [overflow-wrap:anywhere]">{title}</h1>
            {actions}
        </div>
        {children && <p className="-mt-1 mx-3 mb-4 max-w-[520px] text-14 text-ink-2">{children}</p>}
    </>
)

// Nothing to show: one sheet with one sentence, and the mascot where the page is about it. Never an empty page with a
// heading.
export const EmptySheet: React.FC<{ face?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ face, className, children }) => (
    <div className={cn('rounded-sheet bg-sheet shadow-up px-6 py-7 flex flex-col items-center gap-3 text-center', className)}>
        {face}
        <p className="max-w-[420px] text-14 text-ink-2">{children}</p>
    </div>
)

// A page's search, 36px on `tray` with a hairline, as wide as the column, between the line and the first group.
export const SearchField: React.FC<{ label: string; value: string; onChange: (value: string) => void; autoFocus?: boolean }> = ({ label, value, onChange, autoFocus }) => (
    <label className="h-9 mb-1 px-3 flex items-center gap-[9px] rounded-[11px] bg-tray shadow-[inset_0_0_0_1px_var(--line)] focus-within:ring-2 focus-within:ring-focus">
        <Search aria-hidden className="size-4 shrink-0 text-ink-2" strokeWidth={1.75} />
        <input
            type="search"
            aria-label={label}
            placeholder={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            autoFocus={autoFocus}
            className="flex-1 min-w-0 h-full bg-transparent text-14 text-ink outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
        />
    </label>
)
