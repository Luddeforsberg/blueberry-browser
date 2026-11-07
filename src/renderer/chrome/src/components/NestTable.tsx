import React, { useState } from 'react'
import { plainCell, type Table } from '@shared/nestTable'
import { cn } from '@common/lib/utils'

// How many rows a closed card shows before "N more".
const ROWS_SHOWN = 5

export type PickMode = 'one' | 'range' | 'toggle'

// Shift picks a range from the last row clicked, Cmd (Ctrl elsewhere) adds or takes one away, a plain click picks one.
const pickMode = (event: React.MouseEvent | React.KeyboardEvent): PickMode =>
    event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'one'

// A card's result when its answer has a table: plain rows across the card, a muted header, and the words before it.
// Rows can be selected once the answer is finished, and a line pulled out then takes only those.
export const TableResult: React.FC<{
    table: Table
    // Null while the answer is still being written, when nothing can be picked.
    selected: readonly number[] | null
    onPick: (index: number, mode: PickMode) => void
    // Rows a For-each card is working on right now, by index, with who: "Writer is here". Its column is kept while any
    // For-each card reads from this table, so the table doesn't shift as runs start and end.
    here?: { who: string; rows: ReadonlyMap<number, string> } | null
}> = ({ table, selected, onPick, here = null }) => {
    const [all, setAll] = useState(false)
    const hidden = Math.max(0, table.rows.length - ROWS_SHOWN)
    const rows = all ? table.rows : table.rows.slice(0, ROWS_SHOWN)
    const picked = selected?.length ?? 0
    // Rows being worked on out of sight, below "N more", are named in the footer instead.
    const below = here ? [...here.rows.keys()].filter((index) => index >= rows.length) : []
    const belowLine =
        here && below.length > 0
            ? below.length === 1
                ? `${here.rows.get(below[0])} is on ${plainCell(table.rows[below[0]][0] ?? '')}`
                : `${here.who} is on ${below.length} rows below`
            : null
    return (
        <div className="flex flex-col">
            {table.before && <p className="px-5 pb-3 text-13 text-muted-foreground line-clamp-2">{plainCell(table.before)}</p>}
            <div data-keep-selection className={cn("nowheel overflow-x-auto border-t", all && "max-h-[400px] overflow-y-auto")}>
                <table aria-label="Result" aria-multiselectable={selected ? true : undefined} className="w-full border-collapse text-left select-none">
                    <thead>
                        <tr className="h-8 text-12 text-muted-foreground">
                            {table.header.map((cell, column) => (
                                <th key={column} scope="col" className="pl-5 last:pr-5 font-regular whitespace-nowrap">
                                    {plainCell(cell)}
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
                                        <td key={column} className="pl-5 last:pr-5 max-w-[200px] truncate">
                                            {plainCell(row[column] ?? '')}
                                        </td>
                                    ))}
                                    {here && <td className="pr-5 text-right text-12 text-accent-ink whitespace-nowrap">{here.rows.has(index) && `${here.rows.get(index)} is here`}</td>}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            {(picked > 0 || hidden > 0) && (
                <div data-keep-selection className="h-9 px-5 border-t flex items-center gap-1 text-13">
                    {belowLine && <span className="order-last ml-auto text-12 text-accent-ink truncate">{belowLine}</span>}
                    {picked > 0 && <span role="status" className="text-accent-ink">{picked} selected</span>}
                    {picked > 0 && hidden > 0 && <span className="text-muted-foreground" aria-hidden>·</span>}
                    {hidden > 0 && (
                        <button
                            type="button"
                            onClick={() => setAll(!all)}
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
