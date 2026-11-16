import React, { useEffect, useRef } from 'react'
import { cn } from '@common/lib/utils'

// DESIGN.md section 8, Menus: a sheet with a 22px radius and `lift`. The prompt box's menus, the mascot pill's and the +,
// are this, with the same keys: up and down through the rows, Home and End, Escape back to what opened it.

const ITEMS = '[role=menuitemradio],[role=menuitem]'

export const MenuSheet: React.FC<{
    label: string
    // In a chat the box is at the bottom, so its menus open above it.
    above: boolean
    align: 'left' | 'right'
    className?: string
    onClose: (refocus: boolean) => void
    // Keys a menu has of its own, such as going back from a list it opened. Return true if it took the key.
    onKey?: (event: React.KeyboardEvent<HTMLDivElement>) => boolean
    // Changes when the rows are replaced, so the keyboard goes to the first of the new ones, or `focusFirst`'s.
    view?: string
    focusFirst?: string
    children: React.ReactNode
}> = ({ label, above, align, className, onClose, onKey, view, focusFirst, children }) => {
    const menu = useRef<HTMLDivElement>(null)
    const items = () => [...(menu.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])]

    useEffect(() => {
        const first = (focusFirst && menu.current?.querySelector<HTMLElement>(focusFirst)) || menu.current?.querySelector<HTMLElement>('[aria-checked=true]') || items()[0]
        first?.focus({ preventScroll: true })
    }, [view, focusFirst])

    return (
        <div
            ref={menu}
            role="menu"
            aria-label={label}
            onKeyDown={(event) => {
                if (onKey?.(event)) return
                const all = items()
                const at = all.indexOf(document.activeElement as HTMLElement)
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    all[(at + (event.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus()
                } else if (event.key === 'Home' || event.key === 'End') {
                    event.preventDefault()
                    all[event.key === 'Home' ? 0 : all.length - 1]?.focus()
                } else if (event.key === 'Escape') {
                    event.preventDefault()
                    onClose(true)
                } else if (event.key === 'Tab') {
                    onClose(false)
                }
            }}
            className={cn(
                'absolute z-30 max-w-[calc(100vw-32px)] p-1.5 rounded-menu bg-sheet text-13 text-ink shadow-lift cursor-default',
                'animate-[menu-in_150ms_cubic-bezier(.2,.8,.2,1)]',
                align === 'right' ? 'right-0' : 'left-0',
                above ? 'bottom-full mb-2' : 'top-full mt-2',
                above ? (align === 'right' ? 'origin-bottom-right' : 'origin-bottom-left') : align === 'right' ? 'origin-top-right' : 'origin-top-left',
                className
            )}
        >
            {children}
        </div>
    )
}

// A hairline between groups of rows.
export const MenuRule: React.FC = () => <div aria-hidden className="h-px mx-2.5 my-1.5 bg-line" />

// A row is 40px, or 46px with a second line, and hovering or the keyboard gives it a 14px `sheet-2` fill. One that's
// ruled out stays, in `faint`, and its second line says why.
export const menuRowClass = (twoLines: boolean, off = false) =>
    cn(
        'w-full px-2.5 flex items-center gap-[11px] rounded-[14px] text-left outline-none',
        twoLines ? 'h-[46px]' : 'h-10',
        'focus-visible:bg-sheet-2',
        off ? 'text-faint cursor-default' : 'hover:bg-sheet-2'
    )
