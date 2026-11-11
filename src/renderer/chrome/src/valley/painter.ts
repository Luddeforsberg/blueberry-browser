import type { ValleyLight } from '@shared/ipc'

// The valley, painted in code in 2px cells, as the approved mocks were (DESIGN.md section 9). Pure, so it runs in a
// worker off the main thread. The illustrator's layers replace it later, behind the same <Valley>.
//
// The colours are the artwork's own, not the interface's tokens, and come from the mock's painter unchanged.

type RGB = [number, number, number]

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const ss = (a: number, b: number, x: number) => {
    const t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)
}
const hash = (x: number, y: number, s: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
    return n - Math.floor(n)
}
const vnoise = (x: number, y: number, s: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm = (x: number, y: number, s: number, o = 4) => {
    let t = 0, a = 0.5, f = 1, n = 0
    for (let i = 0; i < o; i++) {
        t += a * vnoise(x * f, y * f, s + i * 13)
        n += a
        f *= 2.03
        a *= 0.5
    }
    return t / n
}
// A cell's threshold, taken against its neighbours' average so dots spread evenly.
const th = (k: number, j: number) => clamp(0.5 + (hash(k, j, 5) - (hash(k - 1, j, 5) + hash(k + 1, j, 5) + hash(k, j - 1, 5) + hash(k, j + 1, 5)) / 4) * 0.85)
const dith = (p: RGB[], f: number, k: number, j: number): RGB => {
    const pos = clamp(f) * (p.length - 1), i = Math.min(p.length - 2, Math.floor(pos))
    return p[th(k, j) < pos - i ? i + 1 : i]
}
// A smooth minimum, so two hills meet in a soft saddle rather than a corner.
const smin = (a: number, b: number, k = 14) => {
    const m = Math.min(a, b)
    return m - k * Math.log(Math.exp((m - a) / k) + Math.exp((m - b) / k))
}
const ramp = (cols: string[], n: number): RGB[] =>
    Array.from({ length: n }, (_, i) => {
        const t = (i / (n - 1)) * (cols.length - 1), a = Math.min(cols.length - 2, Math.floor(t))
        return mix(hex(cols[a]), hex(cols[a + 1]), t - a)
    })
const toHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

interface Look {
    sky: RGB[]
    ridges: [string, string, string][]
    hill: RGB[]
    cloud?: RGB[]
    moon?: RGB[]
    sun?: RGB[]
    haze: string
    sunAt?: [number, number]
    water: RGB
    glint: RGB
    hz: RGB
    rr: RGB[][]
}

const LOOKS: Record<ValleyLight, Omit<Look, 'hz' | 'rr'>> = {
    day: {
        sky: ramp(['#1a46a6', '#2457bd', '#3270d0', '#4f8ddf', '#7eaeea', '#b5d2f3', '#e1edfa'], 15),
        ridges: [['#8daee2', '#a7c4ef', '#c9ddf6'], ['#6c91d4', '#86a8e3', '#aac6f0'], ['#4f78c4', '#668fd6', '#8fb3ea'], ['#375db0', '#4c75c6', '#7499df'], ['#24479a', '#355fb3', '#5b84d2']],
        hill: ramp(['#174a28', '#226233', '#327d3c', '#4e9a44', '#78b84f', '#a8d164', '#d2e88e'], 13),
        cloud: ramp(['#8fafe2', '#bcd2f2', '#e6eff9', '#fffdf6'], 4),
        haze: '#e8f1fb',
        water: hex('#2a5fb8'),
        glint: hex('#dfeefb')
    },
    night: {
        sky: ramp(['#03061a', '#060d2c', '#0b1642', '#12215a', '#1b3074', '#27418c'], 14),
        ridges: [['#222d68', '#2a3779', '#36468e'], ['#1b245a', '#222d6a', '#2d3b82'], ['#151d4c', '#1a245a', '#243270'], ['#0f1640', '#141c4c', '#1d295f'], ['#0a0f32', '#0f163e', '#16204f']],
        hill: ramp(['#020c07', '#04160e', '#082417', '#0e3422', '#16452c', '#20573a'], 16),
        moon: ramp(['#8692c8', '#aeb8e4', '#cfd5f0', '#dfe3f4'], 8),
        haze: '#3a4f9e',
        water: hex('#0a1440'),
        glint: hex('#8f9fe0')
    },
    // Pale blue overhead, peach at the horizon, the light low from the left.
    dawn: {
        sky: ramp(['#3a62b6', '#5079c8', '#7d98d8', '#adb6e2', '#dcc6dc', '#f6d6c8', '#ffe9cf'], 15),
        ridges: [['#a3a6d8', '#bab8e2', '#e0cfe6'], ['#8890cc', '#9ea2d8', '#c8bce2'], ['#6e78bf', '#838ccd', '#ada8da'], ['#56619f', '#6a74bd', '#9590d0'], ['#404b92', '#535ea8', '#7f7cc2']],
        hill: ramp(['#183f2e', '#24553a', '#356e44', '#4f8a4e', '#78a660', '#adc380', '#e2dcae'], 13),
        cloud: ramp(['#b4a4d6', '#e2bccc', '#ffdccc', '#fff6ea'], 4),
        haze: '#fbe8e0',
        sunAt: [0.17, 0.3],
        water: hex('#4a5fae'),
        glint: hex('#ffe4d2')
    },
    // Indigo overhead through violet and rose to orange, and the sun going down on the left.
    dusk: {
        sky: ramp(['#1b1d6a', '#2f2d88', '#5340a2', '#8550ac', '#bd5f9e', '#e8807e', '#ffb06e'], 15),
        ridges: [['#6e4e9e', '#865ca4', '#c27a9c'], ['#53418e', '#644b9a', '#9c6198'], ['#3d337a', '#4a3b8c', '#7a4e90'], ['#2c2868', '#38307a', '#5e4386'], ['#1f1d54', '#282466', '#48387e']],
        hill: ramp(['#0b1719', '#122624', '#1a362e', '#26483a', '#3a5a40', '#6a6c48', '#b08458'], 13),
        sun: ramp(['#ff9f50', '#ffc878', '#ffe6b0', '#fff6dc'], 8),
        haze: '#f6b8b0',
        sunAt: [0.18, 0.19],
        water: hex('#2a246e'),
        glint: hex('#ffb27a')
    }
}

const look = (light: ValleyLight): Look => {
    const L = LOOKS[light]
    const haze = L.sky[L.sky.length - 3]
    return {
        ...L,
        hz: hex(L.haze),
        rr: L.ridges.map(([d, b, l], i) => ramp([d, b, l, toHex(mix(hex(l), haze, 0.55 - i * 0.08))], 9))
    }
}

// A cloud drawn as one soft volume with a smooth outline, lit from the upper left. Sizes in pixels.
const LOBES = [[-0.1, -0.52, 0.42], [-0.62, -0.32, 0.33], [0.46, -0.42, 0.37], [0.98, -0.22, 0.27], [-1.04, -0.18, 0.23], [0.18, -0.3, 0.36], [-0.3, -0.16, 0.36], [0.34, -0.16, 0.36], [0.76, -0.13, 0.28], [-0.76, -0.13, 0.28]]
const cumulus = (cx: number, base: number, h: number) => (x: number, y: number): [number, number] | null => {
    if (y > base + 4 || y < base - 1.1 * h || Math.abs(x - cx) > 1.45 * h) return null
    let f = 0
    for (const [dx, dy, r] of LOBES) {
        const ex = (x - cx - dx * h) / (r * h), ey = (y - base - dy * h) / (r * h)
        f += Math.exp(-(ex * ex + ey * ey) * 2.8)
    }
    const a = ss(0.38, 0.46, f * ss(base + 6, base - 0.22 * h, y))
    if (!a) return null
    let lit = 0
    for (const [dx, dy, r] of LOBES) {
        const ex = (x - cx - dx * h) / (r * h), ey = (y - base - dy * h) / (r * h), w = Math.exp(-(ex * ex + ey * ey) * 2.2)
        lit += w * clamp(0.5 - ex * 0.42 - ey * 0.55)
    }
    const up = (base - y) / h
    return [a, clamp(0.3 + lit * 0.55 + up * 0.4 + (fbm(x / 30, y / 30, 7) - 0.5) * 0.12)]
}

// Where the box you type in is, in the painting's pixels. Everything is composed around it.
export interface ValleyBox {
    top: number
    left: number
    right: number
}

// The near banks, where the resting birds stand: a point on each, as x and the ground's y there.
export interface ValleyBanks {
    left: { x: number; y: number }
    right: { x: number; y: number }
}

export const valleyBanks = (width: number): { left: number; right: number } => ({
    left: Math.max(width * 0.1, 56),
    right: width - Math.max(width * 0.05, 48)
})

const scene = (W: number, H: number, box: ValleyBox, light: ValleyLight) => {
    const L = look(light), night = light === 'night', asp = W / H
    const u0 = (x: number) => x / W
    // Ridge tops, far to near. Each rises towards the sides by its own amount, so they cross differently on each side.
    const SIDE = [[0.55, 1], [1, 0.45], [0.35, 0.9], [0.95, 0.35], [0.4, 0.75]]
    const lift = 0.085
    const tops = SIDE.map(([wl, wr], i) => {
        const t = new Float32Array(W + 80)
        for (let x = -40; x < W + 40; x++) {
            const u = u0(x), e = wl * ss(0.42, 0, u) + wr * ss(0.58, 1, u)
            const base = 0.5 + i * 0.058 - lift, amp = 0.11 - i * 0.012
            t[x + 40] = (base - (0.2 - i * 0.022) * e + amp * (fbm(u * asp * (1.3 + i * 0.35) + i * 7.3, i * 3.1, 60 + i, 3) - 0.5) * 2) * H
        }
        return t
    })
    const top = (i: number, x: number) => tops[i][Math.max(0, Math.min(W + 79, Math.round(x) + 40))]
    // Slope over a wide span, so light turns across a face gradually rather than in stripes.
    const slope = (i: number, x: number) => (top(i, x + 36) - top(i, x - 36)) / 72
    // The banks in front: a large one at the left that leads up towards the box, a small one at the right.
    const meadow = (x: number) => {
        const u = u0(x)
        return smin((1.04 - 0.33 * ss(0.52, 0, u)) * H, (1.04 - 0.15 * ss(0.8, 1, u)) * H)
    }
    const water = 0.715 * H
    const sunAt = L.sunAt ?? [0.17, 0.21]
    const sun = [W * sunAt[0], H * sunAt[1]]
    // The bright thing keeps clear of the page's left edge, and above the box, in any window.
    const ch = Math.max(40, Math.min(110, box.top - 160)), ccx = Math.max(W * 0.2, 1.5 * ch + 70)
    const cloud = L.cloud ? cumulus(ccx, Math.max(box.top - 110, 150), ch) : null

    const sky0 = (u: number, v: number, d: number, k: number, j: number) =>
        dith(L.sky, (v / 0.6) * 0.86 + Math.exp((-d * d) / (night ? 0.02 : L.sunAt ? 0.09 : 0.05)) * (night ? 0.3 : L.sunAt ? 0.34 : 0.22) + (fbm(u * asp * 1.4, v * 2, 23, 3) - 0.5) * 0.08, k, j)
    const sky = (x: number, y: number, k: number, j: number): RGB => {
        const u = u0(x), v = y / H, d = Math.hypot((x - sun[0]) / H, (y - sun[1]) / H)
        if (night && L.moon) {
            const md = Math.hypot(x - sun[0], y - sun[1]), mr = 23
            if (md < mr + 1) {
                const c = dith(L.moon, 0.7 - (x - sun[0] + (y - sun[1])) / (mr * 3) + (fbm(x / 9, y / 9, 3) - 0.5) * 0.25, k, j)
                return md > mr ? mix(sky0(u, v, d, k, j), c, mr + 1 - md) : c
            }
            const s = mix(sky0(u, v, d, k, j), L.moon[4], Math.exp(-(md - mr) / 46) * 0.2)
            // Stars are few and loosely clustered, and none near the box or under the top bar.
            const clear = y < 72 || (y > box.top - 150 && y < box.top + 200), dens = 0.0006 + 0.0034 * Math.pow(fbm(x / 260, y / 260, 81, 2), 3) * 2.4
            if (!clear && md > 70) {
                if (hash(k >> 1, j >> 1, 79) > 0.99955) return mix([255, 248, 226], s, 0.1)
                if (hash(k, j, 77) > 1 - dens) return mix([255, 248, 226], s, 0.25 + hash(k, j, 78) * 0.45)
            }
            return s
        }
        const s = sky0(u, v, d, k, j)
        if (L.sun) {
            const sd = Math.hypot(x - sun[0], y - sun[1]), sr = 28
            if (sd < sr + 1) {
                const c = dith(L.sun, 0.75 - (y - sun[1]) / (sr * 2.4), k, j)
                return sd > sr ? mix(s, c, sr + 1 - sd) : c
            }
            return mix(s, L.sun[5], Math.exp(-(sd - sr) / 34) * 0.55)
        }
        if (cloud && L.cloud) {
            const c = cloud(x, y)
            if (c) return mix(s, dith(L.cloud, c[1], k, j), c[0])
        }
        return s
    }
    const ridge = (i: number, x: number, y: number, k: number, j: number) => {
        const t = top(i, x), sl = slope(i, x), lit = ss(-0.05, 0.45, -sl), shade = ss(-0.05, 0.45, sl)
        const dpx = y - t, mist = ss(0, 0.16 * H, dpx)
        let p = 0.34 + lit * 0.4 - shade * 0.36 + mist * 0.42
        if (dpx < 3 && lit > 0.15) p += 0.16
        p += (fbm(x / 70, y / 50, 90 + i, 3) - 0.5) * 0.1
        return dith(L.rr[i], p, k, j)
    }
    const grass = (x: number, y: number, k: number, j: number) => {
        const t = meadow(x), sl = (meadow(x + 40) - meadow(x - 40)) / 80, dv = (y - t) / H
        let p = 0.62 + ss(0, 0.4, -sl) * 0.2 - ss(0, 0.4, sl) * 0.22 - dv * 2.2 + (fbm(x / 90, y / 60, 41, 4) - 0.5) * 0.3
        if (y - t < 3) p += 0.12
        return dith(L.hill, p, k, j)
    }
    // A band of pale air across the scene, brightest at the box's top edge and behind the perched bird.
    const air = (x: number, y: number) =>
        Math.exp(-Math.pow((y - (box.top - 34)) / 86, 2)) * (0.45 + 0.55 * Math.exp(-Math.pow((x - (box.left + box.right) / 2) / (W * 0.42), 2))) * (night ? 0.75 : 0.72)
    // Nearer ridges sit lower, so the nearest one above this point is the one seen.
    const land = (x: number, y: number, k: number, j: number) => {
        let c: RGB | null = null
        for (let i = 4; i >= 0 && !c; i--) if (y > top(i, x)) c = ridge(i, x, y, k, j)
        if (!c) c = sky(x, y, k, j)
        const a = air(x, y)
        return a > 0.02 ? mix(c, L.hz, a * 0.8) : c
    }
    const pick = (x: number, y: number, k: number, j: number): RGB => {
        if (y > meadow(x)) return grass(x, y, k, j)
        if (y > water) {
            // The lake mirrors what's above its edge, broken by ripples, and darkens towards you.
            const dv = (y - water) / H, rip = fbm(x / 160, y / 2.4, 51, 3) - 0.5
            const my = 2 * water - y + rip * 5 * (1 + dv * 8), mx = x + rip * 4
            const c = mix(land(mx, my, k, j), L.water, 0.22 + dv * 1.4)
            const streak = ss(0.6, 0.76, fbm(x / (120 + 260 * fbm(y / 9, 2, 53, 2)), y / 3.2, 52, 3)) * (0.3 + dv)
            return mix(c, L.glint, streak * (night ? 0.25 : 0.4))
        }
        return land(x, y, k, j)
    }
    return { pick, meadow }
}

// Paints one cell per 2x2 pixels, which is all the grain needs, so the picture is a quarter of the window's pixels and is
// shown at twice the size without smoothing.
export const paintValley = (width: number, height: number, box: ValleyBox, light: ValleyLight) => {
    const W = Math.max(Math.round(width), 2), H = Math.max(Math.round(height), 2)
    const cw = Math.ceil(W / 2), chh = Math.ceil(H / 2)
    const { pick, meadow } = scene(W, H, box, light)
    const data = new Uint8ClampedArray(cw * chh * 4)
    for (let j = 0, i = 0; j < chh; j++) {
        for (let k = 0; k < cw; k++, i += 4) {
            const c = pick(k * 2 + 1, j * 2 + 1, k, j), g = (hash(k, j, 9) - 0.5) * 6
            data[i] = c[0] + g
            data[i + 1] = c[1] + g
            data[i + 2] = c[2] + g
            data[i + 3] = 255
        }
    }
    const at = valleyBanks(W)
    const banks: ValleyBanks = { left: { x: at.left, y: meadow(at.left) }, right: { x: at.right, y: meadow(at.right) } }
    return { data, width: cw, height: chh, banks }
}
