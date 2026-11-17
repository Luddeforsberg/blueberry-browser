import React, { useId } from 'react'
import type { MascotLook } from '@shared/library'
import type { AppIconGround } from '@shared/appIcon'
import { BERRY_KIND, Mascot } from '@common/components/Mascot'

// The app's icon (DESIGN.md section 10, Settings, App icon): a square with corners a quarter of its width, and the
// mascot's face at about two thirds of it. Paper and Night carry the dot grid, fading towards the middle. Its colour is
// a pale tint of the mascot's own colour, and Glow is white fading to it. Settings shows it, and the same drawing becomes
// the picture the taskbar or Dock shows (iconPicture.ts) and the one the app ships with (scripts/appIcon.mjs).
//
// Night is drawn with the dark tokens, so a dark body still shows on it, and the rest with the light ones, whatever the
// window's theme.

const BERRY_LOOK: MascotLook = { palette: 'kingfisher', accessory: 'none' }
const FACE = 66.7

export const AppIcon: React.FC<{ look?: MascotLook; ground: AppIconGround; size: number; className?: string }> = ({ look = BERRY_LOOK, ground, size, className }) => {
    const id = useId().replace(/[^\w-]/g, '')
    const body = `var(--berry-${BERRY_KIND[look.palette]})`
    const dots = ground === 'paper' || ground === 'night'
    return (
        <svg aria-hidden viewBox="0 0 100 100" width={size} height={size} className={`${ground === 'night' ? 'dark' : 'light'} shrink-0 ${className ?? ''}`}>
            <defs>
                <clipPath id={`${id}-shape`}>
                    <rect width={100} height={100} rx={25} />
                </clipPath>
                <radialGradient id={`${id}-paper`} cx="50%" cy="40%" r="70%">
                    <stop offset={0} stopColor="rgb(var(--sheet))" />
                    <stop offset={1} stopColor="rgb(var(--well))" />
                </radialGradient>
                <radialGradient id={`${id}-glow`} cx="50%" cy="46%" r="70%">
                    <stop offset={0.26} stopColor={body} stopOpacity={0} />
                    <stop offset={1} stopColor={body} stopOpacity={0.46} />
                </radialGradient>
                <pattern id={`${id}-dots`} width={12.5} height={12.5} patternUnits="userSpaceOnUse">
                    <circle cx={6.25} cy={6.25} r={1.7} fill="var(--dot)" />
                </pattern>
                {/* A mask goes by brightness: black hides, white shows. */}
                <radialGradient id={`${id}-fade`} cx={50} cy={50} r={70.7} gradientUnits="userSpaceOnUse">
                    <stop offset={0.46} stopColor="#000" />
                    <stop offset={1} stopColor="#fff" />
                </radialGradient>
                <mask id={`${id}-edges`}>
                    <rect width={100} height={100} fill={`url(#${id}-fade)`} />
                </mask>
            </defs>
            <g clipPath={`url(#${id}-shape)`}>
                <rect width={100} height={100} fill={dots ? `url(#${id}-paper)` : 'rgb(var(--sheet))'} />
                {dots && <rect width={100} height={100} fill={`url(#${id}-dots)`} mask={`url(#${id}-edges)`} />}
                {ground === 'colour' && <rect width={100} height={100} fill={body} fillOpacity={0.2} />}
                {ground === 'glow' && <rect width={100} height={100} fill={`url(#${id}-glow)`} />}
                <g transform={`translate(${(100 - FACE) / 2} ${(100 - FACE) / 2 - 1.5})`}>
                    <Mascot size={FACE} look={look} still />
                </g>
                {/* A hairline at the edge, so a pale icon still has one on a pale sheet or taskbar. Half is clipped. */}
                <rect width={100} height={100} rx={25} fill="none" stroke="var(--line)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </g>
        </svg>
    )
}
