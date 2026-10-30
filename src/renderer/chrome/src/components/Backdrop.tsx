import React from 'react'

// Berry's own faint texture: a scatter of berries and leaves behind the new tab page.
const SHAPES: { x: number; y: number; r: number; leaf?: boolean; turn?: number }[] = [
    { x: 40, y: 50, r: 12 }, { x: 150, y: 24, r: 7 }, { x: 255, y: 70, r: 14, leaf: true, turn: 30 },
    { x: 370, y: 38, r: 9 }, { x: 470, y: 90, r: 13 }, { x: 95, y: 145, r: 15, leaf: true, turn: 110 },
    { x: 205, y: 170, r: 10 }, { x: 320, y: 150, r: 13 }, { x: 430, y: 195, r: 8, leaf: true, turn: 200 },
    { x: 30, y: 245, r: 8 }, { x: 140, y: 275, r: 13 }, { x: 260, y: 255, r: 7 },
    { x: 365, y: 290, r: 14, leaf: true, turn: 70 }, { x: 490, y: 300, r: 10 }, { x: 70, y: 370, r: 13, leaf: true, turn: 160 },
    { x: 190, y: 385, r: 9 }, { x: 300, y: 365, r: 13 }, { x: 420, y: 400, r: 7 }, { x: 510, y: 430, r: 13, leaf: true, turn: 250 },
    { x: 30, y: 470, r: 10 }, { x: 150, y: 490, r: 7 }, { x: 260, y: 480, r: 14 }, { x: 385, y: 500, r: 10, leaf: true, turn: 320 },
]

export const Backdrop: React.FC = () => (
    <svg aria-hidden className="absolute inset-0 size-full pointer-events-none text-foreground opacity-[0.028] dark:opacity-[0.05]">
        <defs>
            <pattern id="berry-backdrop" width="540" height="540" patternUnits="userSpaceOnUse">
                {SHAPES.map(({ x, y, r, leaf, turn }, index) =>
                    leaf ? (
                        <path
                            key={index}
                            d={`M${-r} 0 Q0 ${-r} ${r} 0 Q0 ${r} ${-r} 0 Z`}
                            transform={`translate(${x} ${y}) rotate(${turn})`}
                            fill="currentColor"
                        />
                    ) : (
                        <circle key={index} cx={x} cy={y} r={r} fill="currentColor" />
                    )
                )}
            </pattern>
            <radialGradient id="berry-backdrop-fade" cx="50%" cy="42%" r="70%">
                <stop offset="0%" stopColor="white" stopOpacity="0.35" />
                <stop offset="100%" stopColor="white" />
            </radialGradient>
            <mask id="berry-backdrop-mask">
                <rect width="100%" height="100%" fill="url(#berry-backdrop-fade)" />
            </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#berry-backdrop)" mask="url(#berry-backdrop-mask)" />
    </svg>
)
