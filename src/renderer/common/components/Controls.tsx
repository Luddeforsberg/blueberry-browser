import React from 'react'
import { cn } from '../lib/utils'

export const Switch: React.FC<{
    checked: boolean
    onChange: (checked: boolean) => void
    labelledBy?: string
    label?: string
}> = ({ checked, onChange, labelledBy, label }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelledBy}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
            "relative w-9 h-5 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
            checked ? "bg-ink" : "bg-line"
        )}
    >
        <span
            className={cn(
                "absolute top-0.5 left-0.5 size-4 rounded-full bg-ground transition-transform",
                checked && "translate-x-4"
            )}
        />
    </button>
)

export const Choice = <T extends string>({
    label,
    value,
    options,
    onChange
}: {
    label: string
    value: T
    options: { value: T; label: string }[]
    onChange: (value: T) => void
}) => (
    <div role="radiogroup" aria-label={label} className="inline-flex p-1 rounded-full bg-tray">
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={value === option.value}
                onClick={() => onChange(option.value)}
                className={cn(
                    "h-8 px-4 rounded-full text-13 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
                    value === option.value ? "bg-sheet shadow-rim" : "text-ink-2 hover:text-ink"
                )}
            >
                {option.label}
            </button>
        ))}
    </div>
)

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
                    "h-7 text-13 outline-none rounded-row underline-offset-[6px] decoration-[1.5px] transition-colors focus-visible:ring-2 focus-visible:ring-focus",
                    value === option.value ? "underline" : "text-ink-2 hover:text-ink"
                )}
            >
                {option.label}
            </button>
        ))}
    </div>
)
