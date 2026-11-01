import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Mood } from '@common/components/Mascot'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { BERRY_ID } from '@shared/mascots'
import { Berry } from './Berry'

// Drawn at one size and scaled, so it keeps the full drawing wherever it lands.
const BASE_SIZE = 112
// How far down the drawing Berry's seat is in the sitting pose.
const SEAT = 46 / 64
const HOME_SIZE = 112
// How far down the standing drawing its feet reach, so the toes grip the composer's top edge.
const STANDING_FEET = 113 / 120
const FEET_X = 57 / 120
// Between the composer's text, which starts on the left, and its controls on the right.
const HOME_INSET = 250
const HOME_RIGHT = HOME_INSET - HOME_SIZE / 2
// In the slot the active tab keeps free for it, between its title and its close button.
const TAB_SIZE = 32
const TAB_INSET = 54
const MIN_FLIGHT_GAP_MS = 15000
const FLIGHT_FRAMES = 16

interface Target {
    x: number
    y: number
    size: number
    mood: Mood
}

const onScreen = (element: Element) => {
    if (!element.isConnected) return false
    const { top, bottom } = element.getBoundingClientRect()
    const scroller = element.parentElement?.closest('.overflow-y-auto')?.getBoundingClientRect()
    const middle = (top + bottom) / 2
    return top !== bottom && (!scroller || (middle >= scroller.top && middle <= scroller.bottom))
}

const targetFor = (element: HTMLElement): Target => {
    const rect = element.getBoundingClientRect()
    if ('berrySpot' in element.dataset) return { x: rect.left, y: rect.top, size: rect.width, mood: 'rest' }

    if ('berryHome' in element.dataset) {
        return { x: rect.right - HOME_RIGHT - HOME_SIZE, y: rect.top - HOME_SIZE * STANDING_FEET, size: HOME_SIZE, mood: 'rest' }
    }
    // On the tab's lower edge with its legs over it, in both layouts, so it covers no title.
    return { x: rect.right - TAB_INSET - TAB_SIZE / 2, y: rect.bottom - 2 - TAB_SIZE * SEAT, size: TAB_SIZE, mood: 'sitting' }
}

const transformOf = ({ x, y, size }: Target) => `translate(${x}px, ${y}px) scale(${size / BASE_SIZE})`

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

// A smooth arc from one place to the other, rising higher the further Berry goes.
const flightPath = (from: Target, to: Target) => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const peak = Math.min(from.y, to.y) - Math.min(distance * 0.25, 70)
    const middleX = (from.x + to.x) / 2

    return Array.from({ length: FLIGHT_FRAMES + 1 }, (_, frame) => {
        const t = easeInOut(frame / FLIGHT_FRAMES)
        const rest = 1 - t
        return {
            transform: transformOf({
                ...to,
                x: rest * rest * from.x + 2 * rest * t * middleX + t * t * to.x,
                y: rest * rest * from.y + 2 * rest * t * peak + t * t * to.y,
                size: from.size + (to.size - from.size) * t
            })
        }
    })
}

// The one Berry that moves around the window. It sits on the new tab composer or the active tab, or
// stands on a page's spot if it has one. It only moves when that place changes. Web pages sit above the
// chrome, so a flight towards a web page passes behind it.
export const BerryCompanion: React.FC = () => {
    const { settings } = useShell()
    const { activeTab } = useBrowser()
    const { chats } = useLibrary()
    const { find, chosen } = useFlock()
    // Whoever is working here, or an open chat's own, or else whoever the next chat goes to.
    const working = activeTab?.workingMascotId ?? (activeTab?.page === 'chat' && activeTab.pageParam ? chats.find((chat) => chat.id === activeTab.pageParam)?.mascotId ?? BERRY_ID : null)
    const mascot = working ? find(working) : chosen
    const box = useRef<HTMLDivElement>(null)
    const body = useRef<HTMLDivElement>(null)
    const landed = useRef<{ element: HTMLElement; target: Target; tabId: string | undefined } | null>(null)
    const flying = useRef(false)
    const flight = useRef<Animation | null>(null)
    const lastFlight = useRef(0)
    const [mood, setMood] = useState<Mood>('rest')
    const [flipped, setFlipped] = useState(false)
    const [visible, setVisible] = useState(false)
    const [atSpot, setAtSpot] = useState(false)
    // The composer it's standing on. It's drawn inside that box, so the page can't scroll one without the other.
    const [home, setHome] = useState<HTMLElement | null>(null)
    // Out on the desktop, so there's an empty place here rather than a second bird.
    const [away, setAway] = useState(false)
    useEffect(() => window.chromeAPI.desktop.onAway(setAway), [])

    const activeId = activeTab?.id
    const canFly = useCallback(
        () =>
            !settings.keepBerryStill &&
            !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
            Date.now() - lastFlight.current >= MIN_FLIGHT_GAP_MS,
        [settings.keepBerryStill]
    )

    const update = useCallback(() => {
        const node = box.current
        if (!node || flying.current) return

        const anchors = [
            document.querySelector<HTMLElement>('[data-berry-home]'),
            document.querySelector<HTMLElement>('[data-berry-spot]'),
            document.querySelector<HTMLElement>(`[data-berry-tab="${activeId}"]`)
        ]
        const element = anchors.find((anchor): anchor is HTMLElement => !!anchor && onScreen(anchor))
        if (!element) {
            landed.current = null
            setVisible(false)
            setHome(null)
            return
        }

        const target = targetFor(element)
        const from = landed.current
        landed.current = { element, target, tabId: activeId }
        setVisible(true)

        const arrive = () => {
            const transform = transformOf(target)
            if (node.style.transform !== transform) node.style.transform = transform
            setMood(target.mood)
            setFlipped(false)
            setAtSpot('berrySpot' in element.dataset)
            setHome('berryHome' in element.dataset ? element : null)
        }

        // The same place, moved: the page scrolled or a tab was dragged, so Berry just stays on it.
        if (!from || from.element === element) return arrive()

        if (from.tabId === activeId || !canFly()) {
            arrive()
            node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 })
            return
        }

        const distance = Math.hypot(target.x - from.target.x, target.y - from.target.y)
        flying.current = true
        lastFlight.current = Date.now()
        setAtSpot(false)
        setHome(null)
        setMood('fetching')
        setFlipped(target.x < from.target.x)
        node.style.transform = transformOf(target)
        const animation = node.animate(flightPath(from.target, target), {
            duration: Math.min(Math.max(distance * 1.1, 420), 900)
        })
        flight.current = animation
        animation.onfinish = () => {
            flight.current = null
            flying.current = false
            arrive()
            // Settles onto the perch, with its weight going down through its seat, once it's drawn there.
            requestAnimationFrame(() => {
                body.current?.animate([{ transform: 'scale(1.04, 0.92)' }, { transform: 'scale(1, 1)' }], {
                    duration: 220,
                    easing: 'ease-out'
                })
            })
            update()
        }
    }, [activeId, canFly])

    // Follows the page: tabs appear and move, pages scroll, and a new page can bring a place to land on.
    useEffect(() => {
        if (!settings.showBerry) return
        let frame = 0
        const schedule = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(update)
        }
        const observer = new MutationObserver(schedule)
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] })
        const media = window.matchMedia('(prefers-reduced-motion: reduce)')
        const stopFlight = () => {
            flight.current?.cancel()
            flight.current = null
            flying.current = false
        }
        const motionChanged = () => {
            stopFlight()
            schedule()
        }
        media.addEventListener('change', motionChanged)
        window.addEventListener('resize', schedule)
        window.addEventListener('scroll', schedule, true)
        schedule()
        return () => {
            cancelAnimationFrame(frame)
            observer.disconnect()
            stopFlight()
            media.removeEventListener('change', motionChanged)
            window.removeEventListener('resize', schedule)
            window.removeEventListener('scroll', schedule, true)
        }
    }, [settings.showBerry, update])

    if (!settings.showBerry) return null

    const bird = (
        <div ref={body} className={atSpot || home || mood === 'sitting' ? '[&_svg_*]:pointer-events-auto' : undefined} style={{ transformOrigin: home ? `${FEET_X * 100}% ${STANDING_FEET * 100}%` : `50% ${SEAT * 100}%` }}>
            <div style={{ transform: flipped ? 'scaleX(-1)' : undefined }}>
                <Berry mood={mood} size={home ? HOME_SIZE : BASE_SIZE} mascot={mascot} />
            </div>
        </div>
    )

    return (
        <>
            <div
                ref={box}
                data-berry-companion
                className="fixed left-0 top-0 z-40 pointer-events-none origin-top-left"
                style={{ width: BASE_SIZE, height: BASE_SIZE, visibility: visible && !home ? undefined : 'hidden', opacity: away ? 0 : undefined }}
            >
                {!home && bird}
            </div>
            {home && createPortal(
                <div
                    data-berry-perched
                    className="absolute pointer-events-none"
                    style={{ right: HOME_RIGHT, top: -HOME_SIZE * STANDING_FEET, width: HOME_SIZE, height: HOME_SIZE, opacity: away ? 0 : undefined }}
                >
                    {/* The shadow its feet leave on the box, cut off at the edge so it only falls on the box. */}
                    <div aria-hidden className="absolute h-2 overflow-hidden" style={{ left: HOME_SIZE * FEET_X - 24, width: 48, top: HOME_SIZE * STANDING_FEET }}>
                        <div className="absolute inset-x-1 -top-1 h-2 rounded-full bg-berry-pupil/30 blur-[2px]" />
                    </div>
                    {bird}
                </div>,
                home
            )}
        </>
    )
}
