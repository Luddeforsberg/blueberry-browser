import React, { useEffect, useRef } from 'react'
import type { MenuAnchor } from '@shared/ipc'
import { cn } from '@common/lib/utils'

// DESIGN.md section 8, Menus: a sheet with a 22px radius and `lift`. Every menu is this, with the same keys: up and down
// through the rows, Home and End, Escape back to what opened it. In the chrome it grows from the corner nearest its
// button, and `leaving` takes it back there, out of reach while it goes (see `usePresence`). In the menu view, which
// draws the menus main opens over the page, `at` is where main put it.

const ITEMS = '[role=menuitemradio],[role=menuitemcheckbox],[role=menuitem]'

type Placement =
    // In a chat the box is at the bottom, so its menus open above it. `box` is as wide as the card of the box it opens from.
    | { at?: undefined; above: boolean; align: 'left' | 'right' | 'box' }
    | { at: { x: number; y: number }; above?: undefined; align?: undefined }

export const MenuSheet: React.FC<Placement & {
    label: string
    className?: string
    onClose: (refocus: boolean) => void
    // Keys a menu has of its own, such as going back from a list it opened. Return true if it took the key.
    onKey?: (event: React.KeyboardEvent<HTMLDivElement>) => boolean
    // Changes when the rows are replaced, so the keyboard goes to the first of the new ones, or `focusFirst`'s.
    view?: string
    focusFirst?: string
    // False for a submenu, which takes the keyboard only when the keyboard opens it.
    autoFocus?: boolean
    leaving?: boolean
    hidden?: boolean
    // For the menu view, which measures each sheet it drew.
    sheetRef?: (element: HTMLDivElement | null) => void
    children: React.ReactNode
}> = ({ label, above, align, at, className, onClose, onKey, view, focusFirst, autoFocus = true, leaving = false, hidden = false, sheetRef, children }) => {
    const menu = useRef<HTMLDivElement>(null)
    const items = () => [...(menu.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])]

    useEffect(() => {
        if (leaving || hidden || !autoFocus) return
        const first = (focusFirst && menu.current?.querySelector<HTMLElement>(focusFirst)) || menu.current?.querySelector<HTMLElement>('[role=menuitemradio][aria-checked=true]') || items()[0]
        first?.focus({ preventScroll: true })
    }, [view, focusFirst, leaving, hidden, autoFocus])

    return (
        <div
            ref={(element) => {
                menu.current = element
                sheetRef?.(element)
            }}
            role="menu"
            aria-label={label}
            inert={leaving || hidden}
            aria-hidden={leaving || hidden || undefined}
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
            style={at && { left: at.x, top: at.y }}
            className={cn(
                'absolute z-30 max-w-[calc(100vw-32px)] p-1.5 rounded-menu bg-sheet text-14 text-ink shadow-lift cursor-default',
                hidden && 'invisible',
                at
                    ? cn('origin-top-left', !hidden && 'animate-menu-in')
                    : cn(
                          leaving ? (above ? 'animate-menu-out-above' : 'animate-menu-out') : above ? 'animate-menu-in-above' : 'animate-menu-in',
                          align === 'box' ? 'inset-x-1' : align === 'right' ? 'right-0' : 'left-0',
                          above ? 'bottom-full mb-2' : 'top-full mt-2',
                          above ? (align === 'right' ? 'origin-bottom-right' : 'origin-bottom-left') : align === 'right' ? 'origin-top-right' : 'origin-top-left'
                      ),
                className
            )}
        >
            {children}
        </div>
    )
}

// Where a menu main opens hangs from, in this view: the pointer for a right-click, or under a button.
export const atPointer = (event: React.MouseEvent): MenuAnchor => ({ x: event.clientX, y: event.clientY, width: 0, height: 0 })
export const underBox = (element: Element): MenuAnchor => {
    const { x, y, width, height } = element.getBoundingClientRect()
    return { x, y, width, height }
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
