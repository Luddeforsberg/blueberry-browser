import React from 'react'
import { cn } from '@common/lib/utils'

// A `tray` strip with the current side a sheet: the sidebar's Tabs and Chats, and Settings' five sections. `after` is
// something said beside one side's name, such as the dot on Chats while anything needs you. The caller sizes it, with
// its sides' radius two less than the strip's so the corners stay concentric.
export const SegmentSwitch = <T extends string>({
    label,
    items,
    current,
    onChange,
    className
}: {
    label: string
    items: { value: T; label: string; after?: React.ReactNode }[]
    current: T
    onChange: (value: T) => void
    className?: string
}) => (
    <div role="tablist" aria-label={label} className={cn('shrink-0 p-0.5 grid grid-flow-col auto-cols-fr bg-tray app-region-no-drag', className)}>
        {items.map((item) => (
            <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={current === item.value}
                onClick={() => onChange(item.value)}
                className={cn(
                    'min-w-0 px-1 flex items-center justify-center gap-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    current === item.value ? 'bg-sheet text-ink font-medium shadow-rim' : 'text-ink-2 hover:text-ink'
                )}
            >
                <span className="truncate">{item.label}</span>
                {item.after}
            </button>
        ))}
    </div>
)
