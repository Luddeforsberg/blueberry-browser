import React, { useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

// DESIGN.md section 10, Settings: 34 by 20px. On is `focus` with a white knob, off is `sheet-2` with a hairline. The knob
// takes the light sheet in either mode, which is white.
export const Switch: React.FC<{
    checked: boolean
    onChange: (checked: boolean) => void
    labelledBy?: string
    label?: string
    describedBy?: string
}> = ({ checked, onChange, labelledBy, label, describedBy }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelledBy}
        aria-label={label}
        aria-describedby={describedBy}
        onClick={() => onChange(!checked)}
        className={cn(
            "relative w-[34px] h-5 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
            checked ? "bg-focus" : "bg-sheet-2 shadow-[inset_0_0_0_1px_var(--line)]"
        )}
    >
        <span
            className={cn(
                "absolute top-0.5 left-0.5 size-4 rounded-full transition-transform",
                checked ? "light bg-sheet translate-x-3.5 shadow-[0_1px_2px_rgb(0_0_0/.25)]" : "bg-sheet shadow-rim dark:bg-ink-3"
            )}
        />
    </button>
)

// A segmented control (DESIGN.md section 8). The left and right arrows move the choice along, as in any group of radio
// buttons, and only the chosen one is a stop for Tab. `fill` shares the width out evenly, and an option can carry an icon.
// With a `picture` for each option, it's a row of small drawings with the name under each instead, as Settings' Theme.
// `pictureClassName` sizes and shapes the drawings when they aren't the window's 86 by 56, as the app icon's aren't.
export const Choice = <T extends string>({
    label,
    value,
    options,
    onChange,
    fill = false,
    describedBy,
    className,
    pictureClassName = 'w-full h-14 rounded-[10px]'
}: {
    label: string
    value: T
    options: { value: T; label: string; Icon?: LucideIcon; picture?: React.ReactNode }[]
    onChange: (value: T) => void
    fill?: boolean
    describedBy?: string
    className?: string
    pictureClassName?: string
}) => {
    const group = useRef<HTMLDivElement>(null)
    const pictures = options.every((option) => option.picture)
    const anyChosen = options.some((option) => option.value === value)
    const step = (by: number) => {
        const at = options.findIndex((option) => option.value === value)
        const next = options[(at + by + options.length) % options.length]
        onChange(next.value)
        group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[options.indexOf(next)]?.focus()
    }
    return (
        <div
            ref={group}
            role="radiogroup"
            aria-label={label}
            aria-describedby={describedBy}
            onKeyDown={(event) => {
                const by = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
                if (!by) return
                event.preventDefault()
                event.stopPropagation()
                step(by)
            }}
            className={cn(pictures ? 'flex shrink-0 gap-2.5' : 'p-0.5 rounded-full bg-sheet-2', !pictures && (fill ? 'grid grid-flow-col auto-cols-fr' : 'inline-flex shrink-0'), className)}
        >
            {options.map((option, index) => {
                const chosen = value === option.value
                const tabIndex = chosen || (!anyChosen && index === 0) ? 0 : -1
                if (pictures) {
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={chosen}
                            tabIndex={tabIndex}
                            onClick={() => onChange(option.value)}
                            className={cn('group w-[86px] flex flex-col items-center gap-[7px] text-13 outline-none', chosen ? 'text-ink font-medium' : 'text-ink-2 hover:text-ink')}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    'relative block overflow-hidden group-focus-visible:ring-2 group-focus-visible:ring-focus',
                                    pictureClassName,
                                    chosen ? 'shadow-[0_0_0_2px_rgb(var(--sheet)),0_0_0_3.5px_rgb(var(--ink))]' : 'shadow-[inset_0_0_0_1px_var(--line)]'
                                )}
                            >
                                {option.picture}
                            </span>
                            <span className="max-w-full truncate">{option.label}</span>
                        </button>
                    )
                }
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        tabIndex={tabIndex}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "h-7 flex items-center justify-center rounded-full text-13 whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
                            fill ? "px-1 gap-[5px]" : "px-2.5 gap-1.5",
                            chosen ? "bg-sheet text-ink shadow-chip" : "text-ink-2 hover:text-ink"
                        )}
                    >
                        {option.Icon && <option.Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />}
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}

// Words in a row, with the chosen one underlined. Quieter than a segmented control, for a row of filters.
export const QuietChoice = <T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) => (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-x-4">
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={value === option.value}
                onClick={() => onChange(option.value)}
                className={cn(
                    "h-7 text-14 outline-none rounded-row underline-offset-[6px] decoration-[1.5px] transition-colors focus-visible:ring-2 focus-visible:ring-focus",
                    value === option.value ? "underline" : "text-ink-2 hover:text-ink"
                )}
            >
                {option.label}
            </button>
        ))}
    </div>
)
