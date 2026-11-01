import React, { useEffect, useRef, useState } from 'react'
import { WalkingBird } from '@common/components/Mascot'
import { useShell } from '../contexts/ShellContext'
import { BIRD_SIZE, facesLeft, oldTrail, placeWalker, stepWalker, STRIDE, type Bounds, type Print, type Walker } from './walk'

const STEP_MS = 300
// Enough for a trail about as long as the bird's walk stays visible.
const MAX_PRINTS = 200
const BIRD_COUNT = 2
// Where the feet are in the bird's drawing, so it stands on the spot its walk is at.
const FEET_X = 57 / 120
const FEET_Y = 112 / 120

// A footprint the width of the bird's own foot: three toes forward, one back. Drawn pointing up, so it
// turns to face the way the bird walked.
const Footprint: React.FC<Print> = ({ x, y, turn }) => (
    <path
        d="M0 1 L0 -5 M0 1 L-3.6 -3.4 M0 1 L3.6 -3.4 M0 1 L0 4.6"
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${turn.toFixed(1)}) scale(0.45)`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
    />
)

// Small birds walking behind the page, each leaving prints that slowly fade.
const Walkers: React.FC = () => {
    const box = useRef<HTMLDivElement>(null)
    const [birds, setBirds] = useState<Walker[]>([])
    const [prints, setPrints] = useState<(Print & { id: number })[]>([])

    useEffect(() => {
        const bounds = (): Bounds => {
            const { width, height } = box.current!.getBoundingClientRect()
            return { width, height }
        }
        let current = Array.from({ length: BIRD_COUNT }, () => placeWalker(bounds(), Math.random))
        let nextPrint = 0
        setBirds(current)

        const timer = window.setInterval(() => {
            if (document.hidden) return
            const steps = current.map((bird) => stepWalker(bird, bounds(), Math.random))
            current = steps.map((step) => step.walker)
            setBirds(current)
            const left = steps.flatMap((step) => (step.print ? [{ ...step.print, id: nextPrint++ }] : []))
            if (left.length > 0) setPrints((old) => [...old, ...left].slice(-MAX_PRINTS))
        }, STEP_MS)

        return () => window.clearInterval(timer)
    }, [])

    return (
        <div ref={box} aria-hidden data-berry-walkers className="absolute inset-0 overflow-hidden pointer-events-none">
            <svg className="absolute inset-0 size-full text-foreground">
                {prints.map(({ id, ...print }) => (
                    <g key={id} className="animate-berry-print">
                        <Footprint {...print} />
                    </g>
                ))}
            </svg>
            {birds.map((bird, index) => (
                <div
                    key={index}
                    className="absolute left-0 top-0"
                    style={{
                        transform: `translate(${bird.x - BIRD_SIZE * FEET_X}px, ${bird.y - BIRD_SIZE * FEET_Y}px)`,
                        transition: `transform ${STEP_MS}ms linear`
                    }}
                >
                    {/* Turns around its feet, so it doesn't jump sideways off its trail. */}
                    <div
                        style={{
                            transform: facesLeft(bird.heading) ? 'scaleX(-1)' : undefined,
                            transformOrigin: `${FEET_X * 100}% 100%`
                        }}
                    >
                        <WalkingBird
                            size={BIRD_SIZE}
                            foot={bird.pecksLeft > 0 ? 0 : bird.foot}
                            stepMs={STEP_MS}
                            pecking={bird.pecksLeft > 0}
                        />
                    </div>
                </div>
            ))}
        </div>
    )
}

// Old tracks have different ages and lengths, as if birds wandered through at different times.
// `quiet` keeps the old trails but sends the walking birds away, for when others on the page are saying something.
export const Backdrop: React.FC<{ quiet?: boolean }> = ({ quiet = false }) => {
    const { settings } = useShell()
    const background = useRef<SVGSVGElement>(null)
    const [bounds, setBounds] = useState<Bounds>({ width: 0, height: 0 })
    useEffect(() => {
        const node = background.current
        if (!node) return
        const observer = new ResizeObserver(([entry]) => {
            setBounds({ width: entry.contentRect.width, height: entry.contentRect.height })
        })
        observer.observe(node)
        return () => observer.disconnect()
    }, [])
    const trails = [
        { x: -0.02, y: 0.14, heading: 0.1, length: 0.42 },
        { x: 0.58, y: -0.02, heading: 1.15, length: 0.31 },
        { x: 1.02, y: 0.43, heading: 3.5, length: 0.25 },
        { x: 0.07, y: 0.61, heading: 0.8, length: 0.28 },
        { x: 0.7, y: 0.92, heading: 3.35, length: 0.37 }
    ].map(({ x, y, heading, length }) =>
        oldTrail(x * bounds.width, y * bounds.height, heading,
            Math.ceil(Math.min(bounds.width * length, 380) / STRIDE))
    )
    const [reducedMotion, setReducedMotion] = useState(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
    useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => setReducedMotion(media.matches)
        media.addEventListener('change', update)
        update()
        return () => media.removeEventListener('change', update)
    }, [])
    const walking = !quiet && settings.showBerry && !settings.keepBerryStill && !reducedMotion

    return (
        <>
            <svg ref={background} aria-hidden className="absolute inset-0 size-full pointer-events-none text-foreground opacity-[0.1] dark:opacity-[0.14]">
                <defs>
                    <radialGradient id="berry-backdrop-fade" cx="50%" cy="42%" r="70%">
                        <stop offset="0%" stopColor="white" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="white" />
                    </radialGradient>
                    <mask id="berry-backdrop-mask">
                        <rect width="100%" height="100%" fill="url(#berry-backdrop-fade)" />
                    </mask>
                </defs>
                <g id="berry-backdrop" mask="url(#berry-backdrop-mask)">
                    {trails.map((trail, trailIndex) => (
                        <g key={trailIndex}>
                            {trail.map((print, index) => (
                                <g key={index} opacity={
                                    Math.min(1, index / 7, (trail.length - 1 - index) / 9) *
                                    Math.max(0, Math.sin(index * 0.12 + trailIndex * 1.7) * 0.8 + 0.45)
                                }>
                                    <Footprint {...print} />
                                </g>
                            ))}
                        </g>
                    ))}
                </g>
            </svg>
            {walking && <Walkers />}
        </>
    )
}
