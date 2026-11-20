import React, { useRef } from 'react'
import { cn } from '@common/lib/utils'
import { SwitchSheet } from '@common/components/Controls'

// A `tray` strip with the current side a sheet with `chip`, which slides between them: the sidebar's Tabs and Chats, and Settings' five sections. `after` is
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
}) => {
    const group = useRef<HTMLDivElement>(null)
    return (
        <div ref={group} role="tablist" aria-label={label} className={cn('relative shrink-0 p-0.5 grid grid-flow-col auto-cols-fr bg-tray app-region-no-drag', className)}>
            <SwitchSheet group={group} chosen={items.findIndex((item) => item.value === current)} className="bg-sheet shadow-chip" />
            {items.map((item) => (
                <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={current === item.value}
                    data-side
                    onClick={() => onChange(item.value)}
                    className={cn(
                        'press relative min-w-0 px-1 flex items-center justify-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-focus',
                        current === item.value ? 'text-ink font-medium' : 'text-ink-2 hover:text-ink'
                    )}
                >
                    <span className="truncate">{item.label}</span>
                    {item.after}
                </button>
            ))}
        </div>
    )
}
