import React, { useEffect, useRef } from 'react'
import { CROWN, growBerrylets, lightAt, seeded } from './blueberryArt'

// In CSS pixels. The fruit is the same size in any window, so it stays an object rather than a horizon.
const WIDTH = 1400
const HEIGHT = 1320
const RADIUS = 620
const CENTRE = { x: WIDTH / 2, y: RADIUS + 40 }
const SEED = 7
const MAX_SCALE = 2
const BERRYLETS = 24000
const BERRYLET_SIZE = 6.5
const GRAINS = 110000
const DUST = 6000
const DUST_REACH = 46
// Where the spiral starts and how gradually it grows, as shares of the fruit's surface.
const CROWN_HOLLOW = 0.004
const CROWN_FADE = 0.02
const CROWN_SIZE = 74
const CROWN_SQUASH = 0.56

export const FRUIT_RADIUS = RADIUS
export const FRUIT_CENTRE_Y = CENTRE.y

// How far down the art the fruit's outline is, this far left or right of its centre, so a bird can stand on it.
export const fruitTopAt = (fromCentre: number) => CENTRE.y - Math.sqrt(Math.max(0, RADIUS ** 2 - fromCentre ** 2))

type Colour = [number, number, number]

// From shadow to the dusty bloom in the light. Dark mode keeps the light dim, so the fruit doesn't glare.
const RAMPS: Record<'light' | 'dark', Colour[]> = {
    light: [[14, 19, 66], [30, 38, 118], [56, 70, 160], [104, 118, 202], [178, 186, 232]],
    dark: [[9, 12, 44], [20, 26, 84], [38, 48, 124], [66, 80, 158], [116, 128, 196]]
}

const colourAt = (ramp: Colour[], light: number): Colour => {
    const place = Math.max(0, Math.min(0.999, light)) * (ramp.length - 1)
    const low = ramp[Math.floor(place)]
    const high = ramp[Math.floor(place) + 1]
    const mix = place - Math.floor(place)
    return [0, 1, 2].map((i) => low[i] + (high[i] - low[i]) * mix) as Colour
}

const css = ([r, g, b]: Colour, alpha = 1) => `rgb(${r | 0} ${g | 0} ${b | 0} / ${alpha})`

const paint = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, ramp: Colour[]) => {
    const random = seeded(SEED)
    const toX = (x: number) => CENTRE.x + x * RADIUS
    const toY = (y: number) => CENTRE.y + y * RADIUS

    // The body, deep enough that the small berries seem to sit in shadow.
    const body = ctx.createRadialGradient(toX(-0.34), toY(-0.46), 0, toX(-0.1), toY(-0.1), RADIUS * 1.24)
    ;[0, 0.5, 1].forEach((stop) => body.addColorStop(stop, css(colourAt(ramp, 0.42 - stop * 0.42))))
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.arc(CENTRE.x, CENTRE.y, RADIUS, 0, Math.PI * 2)
    ctx.fill()

    // Small berries spiralling out of the crown. They swell in the light and shrink away in shadow,
    // and squash towards the edge so they wrap around the fruit.
    for (const { x, y, facing, light, fromCrown } of growBerrylets(BERRYLETS)) {
        const emerging = Math.min(1, Math.max(0, (fromCrown - CROWN_HOLLOW) / CROWN_FADE))
        if (emerging === 0) continue
        const swell = 0.24 + 0.76 * Math.pow(light, 0.8)
        const size = BERRYLET_SIZE * swell * emerging * (0.78 + random() * 0.44)
        ctx.fillStyle = css(colourAt(ramp, light * 0.92 + 0.04 + (random() - 0.5) * 0.2), 0.62 + random() * 0.34)
        ctx.beginPath()
        ctx.ellipse(toX(x), toY(y), size * Math.max(facing, 0.18), size, Math.atan2(y, x), 0, Math.PI * 2)
        ctx.fill()
    }

    // The crown is where the spiral begins: a soft hollow the small berries grow out of.
    const cx = toX(CROWN.x)
    const cy = toY(CROWN.y)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1, CROWN_SQUASH)
    const hollow = ctx.createRadialGradient(0, 0, 0, 0, 0, CROWN_SIZE)
    hollow.addColorStop(0, css(ramp[0], 0.96))
    hollow.addColorStop(0.62, css(ramp[0], 0.72))
    hollow.addColorStop(1, css(ramp[0], 0))
    ctx.fillStyle = hollow
    ctx.beginPath()
    ctx.arc(0, 0, CROWN_SIZE, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // The fine grain over everything, like the dusty bloom on a real blueberry.
    for (let grain = 0; grain < GRAINS; grain++) {
        const angle = random() * Math.PI * 2
        const distance = Math.sqrt(random())
        const x = Math.cos(angle) * distance
        const y = Math.sin(angle) * distance
        const light = lightAt(x, y)
        const pale = random() < 0.3 + light * 0.5
        ctx.fillStyle = css(colourAt(ramp, pale ? light + 0.3 : light - 0.34), 0.14 + random() * 0.4)
        const size = 0.5 + random() * 1
        ctx.fillRect(toX(x), toY(y), size, size)
    }

    // Dust drifting off the edge, so the fruit has no hard outline.
    for (let grain = 0; grain < DUST; grain++) {
        const angle = random() * Math.PI * 2
        const out = random() * random() * DUST_REACH
        const light = lightAt(Math.cos(angle) * 0.92, Math.sin(angle) * 0.92)
        ctx.fillStyle = css(colourAt(ramp, 0.35 + light * 0.5), 0.5 * (1 - out / DUST_REACH))
        const size = 0.5 + random() * 0.9
        ctx.fillRect(CENTRE.x + Math.cos(angle) * (RADIUS + out), CENTRE.y + Math.sin(angle) * (RADIUS + out), size, size)
    }
}

// Painted once per appearance and scale, and reused by every new tab after that.
const painted = new Map<string, OffscreenCanvas>()

const artFor = (dark: boolean, scale: number) => {
    const key = `${dark}-${scale}`
    const cached = painted.get(key)
    if (cached) return cached
    const art = new OffscreenCanvas(WIDTH * scale, HEIGHT * scale)
    const ctx = art.getContext('2d')
    if (ctx) {
        ctx.scale(scale, scale)
        paint(ctx, RAMPS[dark ? 'dark' : 'light'])
    }
    painted.set(key, art)
    return art
}

// A blueberry built from thousands of small ones and a lot of grain. It's painted once and never moves.
export const ArtBlueberry: React.FC<{ dark: boolean; className?: string }> = ({ dark, className }) => {
    const canvas = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        // After the page's first frame, so the first new tab can be typed in while this paints.
        const timer = window.setTimeout(() => {
            const node = canvas.current
            const scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE)
            const art = artFor(dark, scale)
            if (!node) return
            node.width = art.width
            node.height = art.height
            node.getContext('2d')?.drawImage(art, 0, 0)
        })
        return () => window.clearTimeout(timer)
    }, [dark])

    return <canvas ref={canvas} aria-hidden data-berry-art className={className} style={{ width: WIDTH, height: HEIGHT }} />
}
