import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DesktopBerryState, DesktopComposerState, DesktopEdge, ThemeState } from '@shared/ipc'
import { BerryDot, Mascot } from '@common/components/Mascot'
import { cn } from '@common/lib/utils'
import { Composer } from './components/Composer'

const desktop = () => window.chromeAPI.desktop

const BIRD_SIZE = 72
// Past this much movement a press on the bird is a drag.
const DRAG_FROM_PX = 3
const GLIDE = 'transform 240ms cubic-bezier(.32, .72, 0, 1)'
// Its feet towards the edge it's on: standing on the bottom, hanging from the top, and on its side on the sides.
const FEET_TOWARDS: Record<DesktopEdge, string> = { bottom: '', top: 'scaleY(-1)', left: 'rotate(90deg)', right: 'rotate(-90deg)' }
const POSE_CHANGES_AFTER_TUCK_MS = 260

const useTheme = (): ThemeState | null => {
    const [theme, setTheme] = useState<ThemeState | null>(null)
    useEffect(() => {
        const apply = (next: ThemeState) => {
            document.documentElement.classList.toggle('dark', next.isDark)
            setTheme(next)
        }
        void window.chromeAPI.theme.getTheme().then(apply)
        return window.chromeAPI.theme.onThemeUpdated(apply)
    }, [])
    return theme
}

// The bird on the edge of the screen, in a transparent window of its own. Main decides everything it says and shows,
// and the window doesn't change size for any of it. All the movement is transforms, so it stays smooth by itself.
export const DesktopApp: React.FC = () => {
    const [state, setState] = useState<DesktopBerryState | null>(null)
    const [settledTucked, setSettledTucked] = useState(false)
    const [words, setWords] = useState<string | null>(null)
    const mover = useRef<HTMLDivElement>(null)
    const body = useRef<HTMLDivElement>(null)
    const lineBox = useRef<HTMLDivElement>(null)
    const lastFrame = useRef(0)
    const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null)
    const latest = useRef<DesktopBerryState | null>(null)
    latest.current = state
    useTheme()

    useEffect(() => {
        void desktop().state().then(setState)
        return desktop().onState(setState)
    }, [])

    const x = state?.at.x
    const y = state?.at.y
    const frame = state?.frame
    const still = state?.still ?? false
    const dragging = state?.dragging ?? false
    const flight = state?.flight ?? null
    const tucked = state?.tucked ?? true
    const lineShowing = state?.lineShowing ?? false
    const line = state?.line ?? null

    // Glides when it's the bird that moved. When it's the window that moved, the bird just has a new place in it.
    useLayoutEffect(() => {
        const element = mover.current
        if (!element || x === undefined || y === undefined) return
        const sameWindow = frame === lastFrame.current
        lastFrame.current = frame ?? 0
        // The pointer moves it for as long as it has it, from where it was when the window changed.
        if (dragging && sameWindow) return
        element.style.transition = sameWindow && !still ? GLIDE : 'none'
        element.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }, [x, y, frame, still, dragging])

    useEffect(() => {
        const element = mover.current
        if (!element || !flight) return
        const animation = element.animate(
            flight.path.map((point) => ({ transform: `translate3d(${point.x}px, ${point.y}px, 0)` })),
            { duration: flight.ms, easing: 'linear', fill: 'forwards' }
        )
        return () => animation.cancel()
    }, [flight])

    // Settles once it lands, with its weight going down through its feet.
    const wasFlying = useRef(false)
    useEffect(() => {
        if (wasFlying.current && !flight && !still) {
            body.current?.animate([{ transform: 'scale(1.06, 0.9)' }, { transform: 'scale(1, 1)' }], { duration: 220, easing: 'ease-out' })
        }
        wasFlying.current = !!flight
    }, [flight, still])

    // Only out of sight does it go back to resting, so a mood isn't seen changing on its way down.
    useEffect(() => {
        if (!tucked) return setSettledTucked(false)
        const timer = setTimeout(() => setSettledTucked(true), POSE_CHANGES_AFTER_TUCK_MS)
        return () => clearTimeout(timer)
    }, [tucked])

    // The words stay while they fade away.
    useEffect(() => {
        if (lineShowing && line) setWords(line)
    }, [lineShowing, line])

    useLayoutEffect(() => {
        const element = lineBox.current
        if (!lineShowing || !element) {
            void desktop().lineBox(null)
            return
        }
        const { x: left, y: top, width, height } = element.getBoundingClientRect()
        void desktop().lineBox({ x: left, y: top, width, height })
    }, [lineShowing, words, frame, state?.lineAnchor.fromSide, state?.lineAnchor.middle])

    if (!state) return null

    const pose = flight ? 'fetching' : settledTucked && state.mood !== 'asking' ? 'rest' : state.mood
    const anchor = state.lineAnchor
    const turned = flight
        ? (flight.left ? 'scaleX(-1)' : '')
        : dragging
          ? (state.flip ? 'scaleX(-1)' : '')
          : `${FEET_TOWARDS[state.edge]} ${state.flip ? 'scaleX(-1)' : ''}`

    return (
        <div className={cn("fixed inset-0 overflow-hidden transition-opacity duration-150", state.shown ? "opacity-100" : "opacity-0")}>
            <div
                ref={lineBox}
                className="absolute"
                style={{
                    [anchor.side]: anchor.fromSide,
                    maxWidth: anchor.maxWidth,
                    width: 'max-content',
                    ...(anchor.across === 'middle'
                        ? { top: anchor.middle, transform: 'translateY(-50%)' }
                        : { [anchor.across]: 10 })
                }}
            >
                <button
                    type="button"
                    data-desktop-line={lineShowing ? '' : undefined}
                    tabIndex={-1}
                    aria-hidden={!lineShowing}
                    onClick={() => void desktop().press()}
                    className={cn(
                        "block px-3 py-1.5 rounded-card border bg-surface text-13 leading-[18px] text-left outline-none line-clamp-2",
                        "shadow-[0_1px_4px_rgb(var(--berry-pupil)/0.18)]",
                        !still && "transition-[opacity,transform] duration-200 ease-out",
                        lineShowing ? "opacity-100 translate-x-0" : cn("opacity-0 pointer-events-none", anchor.side === 'left' ? "-translate-x-1.5" : "translate-x-1.5")
                    )}
                    style={{ textWrap: 'pretty' }}
                >
                    {words}
                </button>
            </div>
            <div
                ref={mover}
                data-desktop-bird
                data-mood={state.mood}
                data-tucked={state.tucked}
                data-edge={state.edge}
                role="button"
                aria-label={line ?? `Give ${state.name} a job`}
                className="absolute left-0 top-0 select-none will-change-transform"
                style={{ width: BIRD_SIZE, height: BIRD_SIZE }}
                onContextMenu={(event) => {
                    event.preventDefault()
                    void desktop().menu()
                }}
                onPointerDown={(event) => {
                    if (event.button === 0) drag.current = { startX: event.screenX, startY: event.screenY, moved: false }
                }}
                onPointerMove={(event) => {
                    const held = drag.current
                    if (!held) return
                    if (!held.moved) {
                        if (Math.hypot(event.screenX - held.startX, event.screenY - held.startY) < DRAG_FROM_PX) return
                        // Only now, because a captured press would click this box rather than the bird in it, which reacts.
                        event.currentTarget.setPointerCapture(event.pointerId)
                        held.moved = true
                        void desktop().dragStart()
                    }
                    const current = latest.current
                    if (!current?.dragging) return
                    event.currentTarget.style.transition = 'none'
                    event.currentTarget.style.transform = `translate3d(${event.screenX - current.origin.x - BIRD_SIZE / 2}px, ${event.screenY - current.origin.y - BIRD_SIZE / 2}px, 0)`
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
                <div
                    className="absolute inset-0"
                    style={{ transform: turned, transition: still ? undefined : 'transform 200ms cubic-bezier(.32, .72, 0, 1)' }}
                >
                    <div ref={body} className="absolute inset-0" style={{ transformOrigin: '48% 100%' }}>
                        <Mascot
                            mood={pose}
                            size={BIRD_SIZE}
                            look={state.look}
                            name={state.name}
                            hidden={!state.showBerry}
                            still={state.still}
                            lively
                            noBlink
                            className={cn(!flight && "drop-shadow-[0_1px_2px_rgb(var(--berry-pupil)/0.45)]")}
                        />
                        {state.sign && (
                            <span data-desktop-sign={state.sign} className="absolute left-1 top-2">
                                <BerryDot size={14} working={state.sign === 'working' && !state.still} />
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// The prompt box, in a window of its own. With glass, the window's own material is behind this, tinted so that the words
// read over any wallpaper.
export const DesktopComposerApp: React.FC = () => {
    const [state, setState] = useState<DesktopComposerState | null>(null)
    const [draft, setDraft] = useState('')
    const [focusKey, setFocusKey] = useState(0)
    const content = useRef<HTMLDivElement>(null)
    const theme = useTheme()
    const open = state?.open ?? false

    useEffect(() => {
        void desktop().composerState().then(setState)
        return desktop().onComposerState(setState)
    }, [])

    useEffect(() => {
        if (open) setFocusKey((key) => key + 1)
    }, [open])

    useLayoutEffect(() => {
        const element = content.current
        if (!element) return
        const observer = new ResizeObserver(() => void desktop().composerHeight(element.offsetHeight))
        observer.observe(element)
        return () => observer.disconnect()
    }, [state !== null])

    const send = useCallback(async () => {
        const message = draft.trim()
        if (message && (await desktop().send(message))) setDraft('')
    }, [draft])

    if (!state) return null
    const glass = theme?.glass && theme.platform === 'mac'
    const words = `Give ${state.name} a job`

    return (
        <div className={cn("h-screen overflow-hidden", glass ? "bg-surface/60" : "bg-surface border rounded-composer")}>
            <div ref={content}>
                <Composer
                    label={words}
                    placeholder={words}
                    value={draft}
                    onChange={setDraft}
                    focusKey={focusKey}
                    noAdd
                    bare
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
        </div>
    )
}
