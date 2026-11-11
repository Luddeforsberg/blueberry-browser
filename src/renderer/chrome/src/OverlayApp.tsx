import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BrowserProvider } from './contexts/BrowserContext'
import { LibraryProvider } from './contexts/LibraryContext'
import { ShellProvider } from './contexts/ShellContext'
import { Sidebar } from './components/Sidebar'
import { cn } from '@common/lib/utils'

// Matches `duration-layout`, so the view only hides once the card has slid away.
const SLIDE_MS = 240

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
                    "h-full rounded-panel bg-background shadow-float overflow-hidden",
                    slide === 'hidden' ? "transition-none" : "transition-transform duration-layout",
                    slide !== 'in' && "-translate-x-[calc(100%+24px)]"
                )}
            >
                <Sidebar floating />
            </div>
        </div>
    )
}

export const OverlayApp: React.FC = () => (
    <ShellProvider>
        <BrowserProvider>
            <LibraryProvider>
                <FloatingSidebar />
            </LibraryProvider>
        </BrowserProvider>
    </ShellProvider>
)
