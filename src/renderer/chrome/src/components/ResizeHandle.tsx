import React, { useRef } from 'react'
import type { ResizablePanel } from '@shared/ipc'
import { useShell } from '../contexts/ShellContext'
import { cn } from '@common/lib/utils'

const LABELS: Record<ResizablePanel, string> = {
    sidebar: 'Resize sidebar',
    chat: 'Resize Berry'
}

const KEY_STEP = 8

// Sits inside the panel's inner edge, because the page view covers everything past it.
export const ResizeHandle: React.FC<{ panel: ResizablePanel }> = ({ panel }) => {
    const dragging = useRef(false)
    const { layout } = useShell()
    const { min, max } = layout.panelLimits[panel]
    const width = panel === 'sidebar' ? layout.sidebarWidth : layout.chatWidth
    const label = LABELS[panel]
    const resize = (next: number) => void window.chromeAPI.layout.resize(panel, next)

    // The sidebar grows to the right and the chat panel grows to the left.
    const widthAt = (clientX: number) =>
        panel === 'sidebar' ? clientX : window.innerWidth - clientX

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuenow={width}
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={0}
            className={cn(
                "absolute inset-y-0 w-1.5 cursor-col-resize app-region-no-drag outline-none",
                "hover:bg-border focus-visible:bg-accent-ink transition-colors",
                panel === 'sidebar' ? "right-0" : "left-0"
            )}
            onPointerDown={(e) => {
                dragging.current = true
                e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => dragging.current && resize(widthAt(e.clientX))}
            onPointerUp={(e) => {
                dragging.current = false
                e.currentTarget.releasePointerCapture(e.pointerId)
            }}
            onKeyDown={(e) => {
                const grow = panel === 'sidebar' ? 'ArrowRight' : 'ArrowLeft'
                const shrink = panel === 'sidebar' ? 'ArrowLeft' : 'ArrowRight'
                if (e.key === grow) resize(width + KEY_STEP)
                else if (e.key === shrink) resize(width - KEY_STEP)
                else return
                e.preventDefault()
            }}
        />
    )
}
