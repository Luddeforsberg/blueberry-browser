import React, { useCallback, useEffect, useRef, useState } from 'react'
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
// Between the composer's text, which starts on the left, and its controls on the right.
const HOME_INSET = 250
// Small enough to fit within the row above the tab, and clear of the tab's close button.
const TAB_SIZE = 36
const TAB_INSET = 50
const TIGHT_TAB_SIZE = 32
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

    const home = 'berryHome' in element.dataset
    const size = home ? HOME_SIZE : TAB_SIZE
    const seatX = rect.right - (home ? HOME_INSET : TAB_INSET)
    // The horizontal tab row touches the top of the window, so there Berry sits on the tab's lower edge.
    if (rect.top - size * SEAT < 0) {
        return { x: seatX - TIGHT_TAB_SIZE / 2, y: rect.bottom - 2 - TIGHT_TAB_SIZE * SEAT, size: TIGHT_TAB_SIZE, mood: 'sitting' }
    }
    return { x: seatX - size / 2, y: rect.top - size * SEAT, size, mood: 'sitting' }
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
            // Settles onto the perch, with its weight going down through its seat.
            body.current?.animate([{ transform: 'scale(1.04, 0.92)' }, { transform: 'scale(1, 1)' }], {
                duration: 220,
                easing: 'ease-out'
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

    return (
        <div
            ref={box}
            data-berry-companion
            className="fixed left-0 top-0 z-40 pointer-events-none origin-top-left"
            style={{ width: BASE_SIZE, height: BASE_SIZE, visibility: visible ? undefined : 'hidden' }}
        >
            <div ref={body} className={atSpot || mood === 'sitting' ? 'pointer-events-auto' : undefined} style={{ transformOrigin: `50% ${SEAT * 100}%` }}>
                <div style={{ transform: flipped ? 'scaleX(-1)' : undefined }}>
                    <Berry mood={mood} size={BASE_SIZE} mascot={mascot} />
                </div>
            </div>
        </div>
    )
}
