import React from 'react'
import { cn } from '../lib/utils'

// An icon that changes in place (DESIGN.md section 7): the old one shrinks to half and blurs out as the new one comes
// in, from wherever it had got to. With less motion asked for, they only fade. `icons` are drawn on top of each other,
// so the space they take never changes, and only the one named by `shown` is there to see, marked `data-shown`.
export const IconSwap = <K extends string>({ shown, icons, className }: { shown: K; icons: Record<K, React.ReactNode>; className?: string }) => (
    <span aria-hidden className={cn('grid place-items-center [&>*]:[grid-area:1/1]', className)}>
        {(Object.entries(icons) as [K, React.ReactNode][]).map(([key, icon]) => (
            <span
                key={key}
                data-fade
                data-shown={key === shown || undefined}
                className={cn(
                    'grid place-items-center transition-[opacity,transform,filter] duration-move ease-crisp',
                    key === shown ? 'opacity-100' : 'opacity-0 scale-50 blur-[2px]'
                )}
            >
                {icon}
            </span>
        ))}
    </span>
)
