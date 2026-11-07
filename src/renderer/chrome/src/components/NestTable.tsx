import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, Copy, Download, Sheet } from 'lucide-react'
import { cellParts, plainCell, type CellPart, type PickedRows } from '@shared/nestTable'
import { cn } from '@common/lib/utils'
import { Markdown } from './ChatMessage'

// How many rows a closed card shows before "N more".
const ROWS_SHOWN = 5

export type PickMode = 'one' | 'range' | 'toggle'

// Shift picks a range from the last row clicked, Cmd (Ctrl elsewhere) adds or takes one away, a plain click picks one.
const pickMode = (event: React.MouseEvent | React.KeyboardEvent): PickMode =>
    event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'one'

// A card's markdown, as the chat draws it, but compact: headings at the text's own size, and less room between blocks.
export const CARD_PROSE = cn(
    "prose-headings:text-[1em] prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 [&>:first-child]:mt-0",
    "prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:my-2 prose-blockquote:my-2 prose-hr:my-3 prose-table:my-2"
)

// A cell's words in their look: bold, italic and code from its markdown.
const Marked: React.FC<{ part: CellPart }> = ({ part }) => {
    let words: React.ReactNode = part.text
    if (part.code) words = <code className="px-1 py-0.5 rounded-control bg-muted text-[0.9em]">{words}</code>
    if (part.em) words = <em>{words}</em>
    if (part.strong) words = <strong className="font-semibold">{words}</strong>
    return <>{words}</>
}

// What a cell says, with its markdown and its links: each link opens in a new tab, as any link in the chrome does, and
// only a web address can be one. A press on it doesn't pick the row.
export const CellText: React.FC<{ cell: string }> = ({ cell }) => (
    <>
        {cellParts(cell).map((part, index) =>
            part.href ? (
                <a
                    key={index}
                    href={part.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    className="text-accent-ink hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[2px]"
                >
                    <Marked part={part} />
                </a>
            ) : (
                <Marked key={index} part={part} />
            )
        )}
    </>
)

// Whether a box with a height it can't pass shows less than its content, for the fade that says there's more.
export const useCut = <T extends HTMLElement>(content: unknown) => {
    const box = useRef<T>(null)
    const [cut, setCut] = useState(false)
    useLayoutEffect(() => {
        const element = box.current
        if (!element) return undefined
        const check = () => setCut(element.scrollHeight > element.clientHeight + 1)
        check()
        const observer = new ResizeObserver(check)
        observer.observe(element)
        if (element.firstElementChild) observer.observe(element.firstElementChild)
        return () => observer.disconnect()
    }, [content])
    return { box, cut }
}

const CUT_FADE = "[mask-image:linear-gradient(to_bottom,black_calc(100%-32px),transparent)]"

// The words before a table, in muted markdown, set tight: three lines on a card of the usual size, such as a heading and
// two lines under it, and more on one made bigger.
const BeforeTable: React.FC<{ text: string; fill: boolean }> = ({ text, fill }) => {
    const { box, cut } = useCut<HTMLDivElement>(text)
    return (
        <div ref={box} className={cn("mx-5 mb-3 overflow-hidden", fill ? "shrink min-h-5 max-h-40" : "shrink-0 max-h-16", cut && CUT_FADE)}>
            <Markdown
                content={text}
                className={cn("text-13 leading-5 text-muted-foreground prose-headings:text-inherit prose-strong:text-inherit", CARD_PROSE, "prose-headings:mb-0.5 prose-p:my-0.5")}
            />
        </div>
    )
}

// Rows a For-each card reading from this table is working on right now, by index, with who: "Writer is here". `outside`
// is any being worked on that isn't among the rows here, when only the first rows are.
export interface WorkingRows {
    who: string
    rows: ReadonlyMap<number, string>
    outside?: { who: string; name: string }[]
}

// A table on a card: its last column drawn by the card, such as a For-each card's own, where each cell is a row's value
// or how its run is going.
export interface OwnColumn {
    header: React.ReactNode
    cell: (index: number) => React.ReactNode
}

// A card's table: plain rows across the card, a muted header, and the words before it. Rows can be selected once the
// answer is finished, and a line pulled out then takes only those. With `every`, every row shows, scrolling.
export const TableResult: React.FC<{
    table: PickedRows & { before?: string }
    // Null while the answer is still being written, when nothing can be picked.
    selected: readonly number[] | null
    onPick: (index: number, mode: PickMode) => void
    // Rows a For-each card is working on right now, by index, with who: "Writer is here". Its column is kept while any
    // For-each card reads from this table, so the table doesn't shift as runs start and end.
    here?: WorkingRows | null
    own?: OwnColumn
    every?: boolean
    // How many rows the whole table has, when only its first are here, and what asks for the rest once "N more" opens.
    total?: number
    onMore?: () => void
    // The card was made a size of its own, so the table takes what's left of it, with every row, scrolling both ways.
    fill?: boolean
}> = ({ table, selected, onPick, here = null, own, every = false, total, onMore, fill = false }) => {
    const [more, setMore] = useState(false)
    const all = every || more || fill
    const hidden = every || fill ? 0 : Math.max(0, (total ?? table.rows.length) - ROWS_SHOWN)
    // A card made bigger shows every row, so it asks for the ones it doesn't have yet.
    const missing = fill && (total ?? 0) > table.rows.length
    useEffect(() => {
        if (missing) onMore?.()
    }, [missing, onMore])
    const rows = all ? table.rows : table.rows.slice(0, ROWS_SHOWN)
    const last = table.header.length - 1
    const picked = selected?.length ?? 0
    // Rows being worked on out of sight, below "N more", are named in the footer instead.
    const below = here
        ? [
              ...[...here.rows].filter(([index]) => index >= rows.length).map(([index, who]) => ({ who, name: plainCell(table.rows[index][0] ?? '') })),
              ...(here.outside ?? [])
          ]
        : []
    const belowLine = here && below.length > 0 ? (below.length === 1 ? `${below[0].who} is on ${below[0].name}` : `${here.who} is on ${below.length} rows below`) : null
    return (
        <div className={cn("flex flex-col", fill && "flex-1 min-h-0")}>
            {table.before && <BeforeTable text={table.before} fill={fill} />}
            <div
                data-keep-selection
                className={cn(
                    "nowheel overflow-x-auto border-t",
                    fill ? "flex-1 min-h-[68px] overflow-y-auto" : all && (every ? "max-h-[520px] overflow-y-auto" : "max-h-[400px] overflow-y-auto")
                )}
            >
                <table aria-label="Result" aria-multiselectable={selected ? true : undefined} className="w-full border-collapse text-left select-none">
                    <thead>
                        <tr className="h-8 text-12 text-muted-foreground">
                            {table.header.map((cell, column) => (
                                <th key={column} scope="col" className="pl-5 last:pr-5 font-regular whitespace-nowrap">
                                    {own && column === last ? own.header : plainCell(cell)}
                                </th>
                            ))}
                            {here && <th scope="col" className="pr-5"><span className="sr-only">Who is working here</span></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => {
                            const on = selected?.includes(index) ?? false
                            return (
                                <tr
                                    key={index}
                                    aria-selected={selected ? on : undefined}
                                    tabIndex={selected ? 0 : undefined}
                                    onClick={selected ? (event) => onPick(index, pickMode(event)) : undefined}
                                    onKeyDown={
                                        selected
                                            ? (event) => {
                                                  if (event.key !== 'Enter' && event.key !== ' ') return
                                                  event.preventDefault()
                                                  onPick(index, event.shiftKey ? 'range' : 'toggle')
                                              }
                                            : undefined
                                    }
                                    className={cn(
                                        "h-[34px] border-t text-14 outline-none",
                                        selected && "cursor-pointer hover:bg-muted/60 focus-visible:bg-muted",
                                        here?.rows.has(index) && "bg-muted/60",
                                        on && "bg-muted hover:bg-muted shadow-[inset_2px_0_0_rgb(var(--accent-ink))]"
                                    )}
                                >
                                    {table.header.map((_, column) => (
                                        <td
                                            key={column}
                                            // A value cut short shows whole on hover.
                                            title={own && column === last ? undefined : plainCell(row[column] ?? '') || undefined}
                                            className={cn("pl-5 last:pr-5 truncate", own && column === last ? "relative max-w-[240px]" : "max-w-[200px]")}
                                        >
                                            {own && column === last ? own.cell(index) : <CellText cell={row[column] ?? ''} />}
                                        </td>
                                    ))}
                                    {here && <td className="pr-5 text-right text-12 text-accent-ink whitespace-nowrap">{here.rows.has(index) && `${here.rows.get(index)} is here`}</td>}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            {(picked > 0 || hidden > 0 || (fill && belowLine)) && (
                <div data-keep-selection className="h-9 shrink-0 px-5 border-t flex items-center gap-1 text-13">
                    {belowLine && <span className="order-last ml-auto text-12 text-accent-ink truncate">{belowLine}</span>}
                    {picked > 0 && <span role="status" className="text-accent-ink">{picked} selected</span>}
                    {picked > 0 && hidden > 0 && <span className="text-muted-foreground" aria-hidden>·</span>}
                    {hidden > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                if (!more) onMore?.()
                                setMore(!more)
                            }}
                            className="-mx-1 px-1 h-6 rounded-control text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {all ? 'Show fewer' : `${hidden} more`}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

const MENU_ITEM = "w-full h-9 px-2.5 flex items-center gap-2.5 rounded-control text-14 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"

// A quiet menu on any card with a table: Copy as table, which puts it on the clipboard as cells, and Download CSV, which
// saves it where the user chooses in main's save dialog. Main reads the table itself, so what's copied is what's shown.
export const TableMenu: React.FC<{ cardId: string; className?: string }> = ({ cardId, className }) => {
    const [open, setOpen] = useState(false)
    const [copied, setCopied] = useState(false)
    const box = useRef<HTMLDivElement>(null)
    const button = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        if (!open) return undefined
        const close = (event: Event) => {
            if (event instanceof KeyboardEvent) {
                if (event.key !== 'Escape') return
                event.preventDefault()
                setOpen(false)
                button.current?.focus()
            } else if (!box.current?.contains(event.target as Node)) setOpen(false)
        }
        window.addEventListener('pointerdown', close)
        window.addEventListener('keydown', close)
        return () => {
            window.removeEventListener('pointerdown', close)
            window.removeEventListener('keydown', close)
        }
    }, [open])
    useEffect(() => {
        if (!copied) return undefined
        const timer = window.setTimeout(() => setCopied(false), 1600)
        return () => window.clearTimeout(timer)
    }, [copied])
    const api = window.chromeAPI.nests
    return (
        <div ref={box} data-keep-selection className={cn("nodrag relative", className)}>
            <button
                ref={button}
                type="button"
                aria-label={copied ? 'Copied' : 'Copy or download the table'}
                title="Copy or download the table"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className={cn(
                    "size-7 flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    open || copied ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 group-focus-within/card:opacity-100",
                    open && "bg-muted text-foreground"
                )}
            >
                {copied ? <Check className="size-4 text-success" /> : <Sheet className="size-4" />}
            </button>
            {copied && <span role="status" className="sr-only">Copied</span>}
            {open && (
                <div role="menu" aria-label="The table" className="absolute right-0 top-full mt-1 z-20 w-52 p-1 rounded-card border bg-surface shadow-float cursor-default">
                    <button
                        type="button"
                        role="menuitem"
                        autoFocus
                        className={MENU_ITEM}
                        onClick={async () => {
                            setOpen(false)
                            if (await api.copyTable(cardId)) setCopied(true)
                        }}
                    >
                        <Copy className="size-4 shrink-0 text-muted-foreground" />
                        Copy as table
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className={MENU_ITEM}
                        onClick={() => {
                            setOpen(false)
                            void api.saveTable(cardId)
                        }}
                    >
                        <Download className="size-4 shrink-0 text-muted-foreground" />
                        Download CSV
                    </button>
                </div>
            )}
        </div>
    )
}
