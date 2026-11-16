import React, { useId, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@common/lib/utils'

// DESIGN.md section 10, Settings: groups are sheets under a mono label, and a row has its name on the left, at most one
// line of explanation, and one control on the right. Anything longer waits behind More, or on a page one step in.

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'
// The hairline between two rows starts where the text does, after an icon when the rows have one, so a row that leads
// with something sets `before:left-*` to where its text starts.
export const BETWEEN = "relative before:content-[''] before:absolute before:right-0 before:top-0 before:h-px before:bg-line first:before:hidden"

// An 11px mono label over a group. `trailing` sits at its right, such as a button that adds a row.
export const SettingsLabel: React.FC<{ id?: string; trailing?: React.ReactNode; children: React.ReactNode }> = ({ id, trailing, children }) => (
    <h3 id={id} className="h-[18px] mt-[18px] mb-1.5 mx-3 flex items-center gap-1.5 font-mono text-11 lowercase text-ink-3">
        {children}
        {trailing && <span className="ml-auto flex items-center">{trailing}</span>}
    </h3>
)

export const SettingsGroup: React.FC<{ label?: string; trailing?: React.ReactNode; children: React.ReactNode }> = ({ label, trailing, children }) => {
    const id = useId()
    return (
        <section aria-labelledby={label ? id : undefined} className={label ? undefined : 'mt-4'}>
            {label && <SettingsLabel id={id} trailing={trailing}>{label}</SettingsLabel>}
            <div className="rounded-sheet bg-sheet shadow-rim">{children}</div>
        </section>
    )
}

// A row's name is a heading under its group's label, so a screen reader can move from row to row.
const Words: React.FC<{ id: string; title: React.ReactNode; description?: React.ReactNode; more?: string }> = ({ id, title, description, more }) => (
    <div className="flex-1 min-w-0">
        <h4 id={id} className="text-13 text-ink break-words">{title}</h4>
        {description && (
            <div className="mt-0.5 text-12 leading-[1.4] text-ink-2 break-words">
                {description}
                {more && <> <More about={id} text={more} /></>}
            </div>
        )}
    </div>
)

// A row. `children` is its one control, at the right. `below` is what can't fit beside its name, such as a form, and goes
// under it at the row's full width. `lead` is an icon or face before the name.
export const SettingsRow: React.FC<{
    id: string
    title: React.ReactNode
    description?: React.ReactNode
    more?: string
    lead?: React.ReactNode
    below?: React.ReactNode
    // For a control taller than a line, such as pictures: the name sits at the top beside it.
    top?: boolean
    children?: React.ReactNode
}> = ({ id, title, description, more, lead, below, top = false, children }) => (
    <div className={cn(BETWEEN, lead ? 'before:left-14' : 'before:left-4', 'min-h-12 pl-4 pr-3.5', top ? 'pt-3.5 pb-3' : 'py-[9px]')}>
        <div className={cn('min-h-[30px] flex gap-3', top ? 'items-start' : 'items-center')}>
            {lead}
            <Words id={id} title={title} description={description} more={more} />
            {children}
        </div>
        {below && <div className="mt-2.5 mb-1">{below}</div>}
    </div>
)

// A row that opens something: a page one step in, or another page. The whole row is the button, with an arrow at its end
// and, before that, its state in mono or a quiet value.
export const SettingsLink: React.FC<{
    title: string
    description?: string
    lead?: React.ReactNode
    // A quiet value, which may lead with a small face. It's cut short rather than pushing the name aside.
    value?: React.ReactNode
    state?: string
    stateOn?: boolean
    onOpen: () => void
}> = ({ title, description, lead, value, state, stateOn, onOpen }) => (
    <button
        type="button"
        onClick={onOpen}
        className={cn(
            BETWEEN,
            lead ? 'before:left-14' : 'before:left-4',
            'w-full min-h-12 py-[9px] pl-4 pr-3.5 flex items-center gap-3 text-left transition-colors hover:bg-hover active:bg-press first:rounded-t-sheet last:rounded-b-sheet',
            FOCUS
        )}
    >
        {lead}
        <span className="flex-1 min-w-0">
            <span className="block text-13 text-ink break-words">{title}</span>
            {description && <span className="block mt-0.5 text-12 leading-[1.4] text-ink-2 break-words">{description}</span>}
        </span>
        {value && <span className="min-w-0 max-w-[300px] flex items-center gap-[7px] text-12 text-ink-2 whitespace-nowrap [&>:last-child]:truncate">{value}</span>}
        {state && <span className={cn('font-mono text-11 whitespace-nowrap', stateOn ? 'text-ink' : 'text-ink-3')}>{state}</span>}
        <ChevronRight aria-hidden className="size-[13px] shrink-0 -ml-1 text-faint" strokeWidth={1.5} />
    </button>
)

// An icon on a `sheet-2` tile, before a row's name.
export const RowTile: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span aria-hidden className="size-7 shrink-0 flex items-center justify-center rounded-row bg-sheet-2 text-ink-2 [&>svg]:size-4">
        {children}
    </span>
)

// A quiet way back, naming where it goes.
export const BackButton: React.FC<{ back: string; onBack: () => void }> = ({ back, onBack }) => (
    <button type="button" onClick={onBack} className={cn('h-[26px] mx-1.5 mb-2.5 pl-1 pr-2.5 inline-flex items-center gap-1 rounded-row text-12 text-ink-2 transition-colors hover:bg-hover hover:text-ink', FOCUS)}>
        <ChevronLeft aria-hidden className="size-[13px]" strokeWidth={1.5} />
        <span><span className="sr-only">Back to </span>{back}</span>
    </button>
)

// The top of a page one step in: a quiet way back naming its section, its title, and a line or two on what it is.
export const StepInHeader: React.FC<{ back: string; onBack: () => void; title: string; children?: React.ReactNode }> = ({ back, onBack, title, children }) => (
    <>
        <BackButton back={back} onBack={onBack} />
        <h2 className="mx-3 mb-3.5 text-18 font-medium">{title}</h2>
        {children && <p className="-mt-2 mx-3 mb-4 max-w-[520px] text-13 leading-[1.45] text-ink-2">{children}</p>}
    </>
)

// A quiet link at the end of a line that shows the rest under it. `about` is the heading it belongs to, for a screen reader.
export const More: React.FC<{ text: string; about?: string }> = ({ text, about }) => {
    const [open, setOpen] = useState(false)
    const id = useId()
    return (
        <>
            <button
                type="button"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                aria-describedby={about}
                onClick={() => setOpen(!open)}
                className="rounded-row text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
            >
                {open ? 'Less' : 'More'}
            </button>
            {open && <span id={id} className="block mt-1">{text}</span>}
        </>
    )
}
