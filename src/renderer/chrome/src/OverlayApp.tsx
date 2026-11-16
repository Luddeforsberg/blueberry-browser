import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Popover } from '@shared/ipc'
import { BrowserProvider } from './contexts/BrowserContext'
import { LibraryProvider, useFlock } from './contexts/LibraryContext'
import { ShellProvider, useShell } from './contexts/ShellContext'
import { ChatsFace, MascotCard, Sidebar } from './components/Sidebar'
import { cn } from '@common/lib/utils'

// Matches `duration-panel`, so the view only hides once the card has slid away.
const SLIDE_MS = 280

// The collapsed sidebar, floating over the page in its own view. It slides in when main shows the
// view, and slides out before hiding when the pointer leaves it.
const FloatingSidebar: React.FC = () => {
    // `hidden` is off-screen with no transition: main hid the view, so the next show must slide from there.
    const [slide, setSlide] = useState<'in' | 'out' | 'hidden'>('hidden')
    const card = useRef<HTMLDivElement>(null)
    const hideTimer = useRef<number>(undefined)

    const slideIn = useCallback(() => {
        window.clearTimeout(hideTimer.current)
        setSlide('in')
    }, [])

    const slideOut = () => {
        setSlide('out')
        hideTimer.current = window.setTimeout(() => void window.chromeAPI.layout.hideFloatingSidebar(), SLIDE_MS)
    }

    useEffect(
        () =>
            window.chromeAPI.layout.onFloatingSidebarVisibility((visible) => {
                if (visible) slideIn()
                else {
                    window.clearTimeout(hideTimer.current)
                    setSlide('hidden')
                }
            }),
        [slideIn]
    )

    // A hidden view paints no frames, so force the off-screen position to apply before the next show.
    useLayoutEffect(() => {
        if (slide === 'hidden') card.current?.getBoundingClientRect()
    }, [slide])

    return (
        // The pointer is tracked on this still view rather than the moving card, which would slide out from under it.
        <div className="h-full p-2 overflow-hidden" onMouseEnter={slideIn} onMouseLeave={slideOut}>
            <div
                ref={card}
                data-slide={slide}
                className={cn(
                    "h-full rounded-sheet border shadow-lift overflow-hidden",
                    slide === 'hidden' ? "transition-none" : "transition-transform duration-panel",
                    slide !== 'in' && "-translate-x-[calc(100%+24px)]",
                    "bg-ground"
                )}
            >
                <Sidebar floating />
            </div>
        </div>
    )
}

// DESIGN.md section 10, Horizontal layout: Chats, or a mascot's card, opened from the toolbar. This view covers
// everything under the toolbar's own row, since a tab's view would cover the chrome, so a press anywhere outside the
// panel closes it, as Escape does, and the keyboard goes back to what opened it. Opening a chat or a page from it
// closes it too, in main, since that's a tab coming to the front.
const CHATS_WIDTH = 296
const CARD_WIDTH = 248
const EDGE = 8

const OverPage: React.FC<{ popover: Popover }> = ({ popover }) => {
    const { layout } = useShell()
    const { find } = useFlock()
    const panel = useRef<HTMLDivElement>(null)
    const area = layout.popover
    const close = (refocus: boolean) => void window.chromeAPI.layout.closePopover(refocus)

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close(true)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    // The keyboard goes into it, so Tab starts at its first row, unless the card has already taken it.
    useEffect(() => {
        if (!panel.current?.contains(document.activeElement)) panel.current?.focus()
    }, [popover])

    const { anchor } = popover
    const width = popover.kind === 'chats' ? CHATS_WIDTH : CARD_WIDTH
    const clampLeft = (left: number) => Math.min(Math.max(left, EDGE), area.width - width - EDGE)
    // Chats lines up with the end of what opened it, a card with the middle of its face, and both start just above the
    // page, over the bookmarks bar when there is one.
    const left = clampLeft(popover.kind === 'chats' ? anchor.x + anchor.width - width : anchor.x + anchor.width / 2 - width / 2)
    const top = Math.max(layout.page.y - area.y - 4, 4)
    const place: React.CSSProperties = { left, top, width, maxHeight: area.height - top - EDGE }

    return (
        <div
            className="h-full relative"
            onPointerDown={(event) => {
                if (!panel.current?.contains(event.target as Node)) close(true)
            }}
        >
            {popover.kind === 'chats' ? (
                <div
                    ref={panel}
                    role="dialog"
                    aria-label="Chats"
                    tabIndex={-1}
                    style={place}
                    className="absolute overflow-y-auto px-2 pt-2 pb-2.5 outline-none rounded-sheet bg-sheet text-ink shadow-lift animate-[fade-in_150ms_cubic-bezier(.2,.8,.2,1)]"
                >
                    <ChatsFace onSheet />
                </div>
            ) : (
                <div ref={panel} style={place} className="absolute">
                    <MascotCard key={popover.mascotId} mascot={find(popover.mascotId)} onClose={() => close(true)} className="relative" />
                </div>
            )}
        </div>
    )
}

// The collapsed sidebar in the vertical layout, or what the horizontal toolbar opened. Main decides which is showing.
const Overlay: React.FC = () => {
    const [popover, setPopover] = useState<Popover | null>(null)
    useEffect(() => window.chromeAPI.layout.onPopover(({ shown }) => setPopover(shown)), [])
    return popover ? <OverPage popover={popover} /> : <FloatingSidebar />
}

export const OverlayApp: React.FC = () => (
    <ShellProvider>
        <BrowserProvider>
            <LibraryProvider>
                <Overlay />
            </LibraryProvider>
        </BrowserProvider>
    </ShellProvider>
)
