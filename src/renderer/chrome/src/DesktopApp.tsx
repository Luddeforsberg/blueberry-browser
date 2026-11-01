import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DesktopBerryState, ThemeState } from '@shared/ipc'
import { Mascot } from '@common/components/Mascot'
import { cn } from '@common/lib/utils'
import { Composer } from './components/Composer'

const desktop = () => window.chromeAPI.desktop

const BIRD_SIZE = 72
// The window around the bird, from DESKTOP_BIRD_SIZE in Layout.ts. Its tail and wings go past the drawing in places.
const BIRD_ROOM = 96
// Past this much movement a press on the bird is a drag.
const DRAG_FROM_PX = 3
const LINE_SHOWS_MS = 8000
// Room around the composer for its shadow. The bird and its words don't need it.
const SHADOW_ROOM = 16

// The bird on the edge of the screen, in a transparent window of its own. Main decides everything it says and shows.
export const DesktopApp: React.FC = () => {
    const [state, setState] = useState<DesktopBerryState | null>(null)
    const [draft, setDraft] = useState('')
    const [focusKey, setFocusKey] = useState(0)
    const [lineShowing, setLineShowing] = useState(false)
    const [hovering, setHovering] = useState(false)
    const root = useRef<HTMLDivElement>(null)
    const bird = useRef<HTMLDivElement>(null)
    const drag = useRef<{ startX: number; moved: boolean } | null>(null)
    const composing = state?.composing ?? false
    const flying = state?.flying ?? null
    const line = state?.line ?? null
    const hasState = state !== null

    useEffect(() => {
        void desktop().state().then(setState)
        return desktop().onState(setState)
    }, [])

    useEffect(() => {
        const apply = ({ isDark }: ThemeState) => document.documentElement.classList.toggle('dark', isDark)
        void window.chromeAPI.theme.getTheme().then(apply)
        return window.chromeAPI.theme.onThemeUpdated(apply)
    }, [])

    useEffect(() => {
        if (composing) setFocusKey((key) => key + 1)
    }, [composing])

    // New words show for a moment and then wait for the pointer, unless they're waiting on an answer.
    useEffect(() => {
        if (!line) return setLineShowing(false)
        setLineShowing(true)
        if (line.lasting) return
        const timer = setTimeout(() => setLineShowing(false), LINE_SHOWS_MS)
        return () => clearTimeout(timer)
    }, [line?.text, line?.lasting])

    // Settles onto the edge once it lands, with its weight going down through its feet.
    const wasFlying = useRef(false)
    useEffect(() => {
        if (wasFlying.current && !flying && !state?.still) {
            bird.current?.animate([{ transform: 'scale(1.06, 0.9)' }, { transform: 'scale(1, 1)' }], { duration: 220, easing: 'ease-out' })
        }
        wasFlying.current = !!flying
    }, [flying, state?.still])

    const showingLine = !composing && !flying && !!line && (lineShowing || hovering)

    // Main fits the window to this, and only lets clicks land on what's listed, so the rest of it never gets in the way.
    useLayoutEffect(() => {
        const element = root.current
        if (!element) return
        const report = () => {
            // From the corner of this box, because the window is about to become its size.
            const origin = element.getBoundingClientRect()
            const hits = [...element.querySelectorAll<HTMLElement>('[data-hit]')].map((hit) => {
                const { x, y, width, height } = hit.getBoundingClientRect()
                return { x: x - origin.x, y: y - origin.y, width, height }
            })
            void desktop().layout({ width: element.offsetWidth, height: element.offsetHeight, hits })
        }
        const observer = new ResizeObserver(report)
        observer.observe(element)
        element.querySelectorAll('[data-hit]').forEach((hit) => observer.observe(hit))
        return () => observer.disconnect()
    }, [hasState, composing, showingLine, flying])

    const send = useCallback(async () => {
        const message = draft.trim()
        if (message && (await desktop().send(message))) setDraft('')
    }, [draft])

    if (!state) return null
    const towardsLeft = state.side === 'left'

    return (
        <div
            className={cn(
                "fixed bottom-0 w-max flex items-end transition-opacity duration-150",
                towardsLeft ? "right-0 flex-row" : "left-0 flex-row-reverse",
                state.shown ? "opacity-100" : "opacity-0"
            )}
            ref={root}
            style={{ paddingTop: composing || showingLine ? SHADOW_ROOM : 0 }}
        >
            {composing && (
                <div data-hit className="shrink-0" style={{ width: 380, marginBottom: 8, [towardsLeft ? 'marginLeft' : 'marginRight']: SHADOW_ROOM }}>
                    <Composer
                        label={`Give ${state.name} a job`}
                        placeholder={`Give ${state.name} a job`}
                        value={draft}
                        onChange={setDraft}
                        focusKey={focusKey}
                        noAdd
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault()
                                void send()
                            }
                            if (event.key === 'Escape') {
                                event.preventDefault()
                                void desktop().closeComposer()
                            }
                        }}
                        canSend={draft.trim().length > 0}
                        onSend={() => void send()}
                    />
                </div>
            )}
            {showingLine && line && (
                <button
                    type="button"
                    data-hit
                    onClick={() => void desktop().press()}
                    onMouseEnter={() => setHovering(true)}
                    onMouseLeave={() => setHovering(false)}
                    style={{ [towardsLeft ? 'marginLeft' : 'marginRight']: SHADOW_ROOM }}
                    className="shrink-0 mb-3 max-w-[320px] px-3 py-1.5 rounded-card border bg-surface shadow-raised text-13 text-left outline-none line-clamp-2"
                >
                    {line.text}
                </button>
            )}
            <div className="relative shrink-0" style={{ width: BIRD_ROOM, height: BIRD_ROOM }}>
                <div
                    ref={bird}
                    data-hit
                    data-desktop-bird
                    role="button"
                    aria-label={line ? line.text : `Give ${state.name} a job`}
                    className="absolute bottom-0 select-none"
                    style={{ left: (BIRD_ROOM - BIRD_SIZE) / 2, width: BIRD_SIZE, height: BIRD_SIZE, transformOrigin: '48% 100%' }}
                    onMouseEnter={() => setHovering(true)}
                    onMouseLeave={() => setHovering(false)}
                    onContextMenu={(event) => {
                        event.preventDefault()
                        void desktop().menu()
                    }}
                    onPointerDown={(event) => {
                        if (event.button !== 0) return
                        drag.current = { startX: event.screenX, moved: false }
                    }}
                    onPointerMove={(event) => {
                        const held = drag.current
                        if (!held) return
                        if (!held.moved && Math.abs(event.screenX - held.startX) < DRAG_FROM_PX) return
                        // Only now, because a captured press would click this box rather than the bird in it, which reacts.
                        if (!held.moved) event.currentTarget.setPointerCapture(event.pointerId)
                        held.moved = true
                        void desktop().drag(event.screenX)
                    }}
                    onPointerUp={() => {
                        if (drag.current?.moved) void desktop().dragEnd()
                    }}
                    onClickCapture={(event) => {
                        // The end of a drag isn't a click, for the bird's reaction or for what it opens.
                        if (drag.current?.moved) event.stopPropagation()
                        drag.current = null
                    }}
                    onClick={() => void desktop().press()}
                >
                    {/* Its toes are a little above the bottom of the drawing, so that much goes over the edge. */}
                    <div className="absolute inset-x-0 bottom-[-3%]" style={{ transform: flying === 'left' ? 'scaleX(-1)' : undefined }}>
                        <Mascot
                            mood={flying ? 'fetching' : state.mood}
                            size={BIRD_SIZE}
                            look={state.look}
                            name={state.name}
                            hidden={!state.showBerry}
                            still={state.still}
                            lively
                            noBlink
                            className="drop-shadow-[0_1px_2px_rgb(var(--berry-pupil)/0.45)]"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
