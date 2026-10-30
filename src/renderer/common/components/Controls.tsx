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
            "relative w-9 h-5 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            checked ? "bg-primary" : "bg-border"
        )}
    >
        <span
            className={cn(
                "absolute top-0.5 left-0.5 size-4 rounded-full bg-surface transition-transform",
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
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-card bg-muted">
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={value === option.value}
                onClick={() => onChange(option.value)}
                className={cn(
                    "h-7 px-3 rounded-control text-13 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    value === option.value ? "bg-surface font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
            >
                {option.label}
            </button>
        ))}
    </div>
)
