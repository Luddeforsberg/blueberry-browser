import React, { useEffect, useRef, useState } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { Group, SquareDashed, X } from 'lucide-react'
import type { NestSection } from '@shared/library'
import { drawnSection, nameSize, resizeSection, SECTION_COLORS, type NestSectionColor, type SectionCorner } from '@shared/nestSections'
import type { Rect } from '@shared/nestPlace'
import { cn } from '@common/lib/utils'

// Sections on a Nest's board: named, coloured areas drawn behind every card and line. Only a section's name and, while
// it's selected, its corners and colours take the pointer, so the cards, lines, handles and drop targets over it work as
// anywhere on the board, and a press on its empty inside is a press on the board.

// Written out in full, so Tailwind makes each class.
const FILL: Record<NestSectionColor, string> = {
    yellow: 'bg-section-yellow border-section-yellow-ink/30',
    green: 'bg-section-green border-section-green-ink/30',
    blue: 'bg-section-blue border-section-blue-ink/30',
    pink: 'bg-section-pink border-section-pink-ink/30',
    purple: 'bg-section-purple border-section-purple-ink/30',
    gray: 'bg-section-gray border-section-gray-ink/30'
}
const DOT: Record<NestSectionColor, string> = {
    yellow: 'bg-section-yellow-ink',
    green: 'bg-section-green-ink',
    blue: 'bg-section-blue-ink',
    pink: 'bg-section-pink-ink',
    purple: 'bg-section-purple-ink',
    gray: 'bg-section-gray-ink'
}
const COLOR_NAME: Record<NestSectionColor, string> = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink', purple: 'Purple', gray: 'Gray' }

// How far a press on a name may move and still be a click, in screen pixels.
const CLICK = 4
// Where the bottom of a section's name sits, from the section's top edge. A bigger name, zoomed out, grows up from here.
const NAME_BOTTOM = 36
const CORNERS: SectionCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

const rectOf = (section: NestSection): Rect => ({ x: section.x, y: section.y, width: section.width, height: section.height })

export interface SectionMove {
    // The section and the cards and other sections inside it, where each was when the drag started.
    cards: { id: string; x: number; y: number }[]
    sections: { id: string; x: number; y: number }[]
}

export interface SectionLayerProps {
    sections: readonly NestSection[]
    selectedId: string | null
    renamingId: string | null
    // A press on a name: the first selects the section and its cards, one on a selected section renames it.
    onPressName: (id: string) => void
    onRenaming: (id: string | null) => void
    // What's inside a section as a drag on its name starts.
    inside: (id: string) => SectionMove
    // Cards moved with a section while its name is dragged, and once more as it's let go, with `done`.
    moveCards: (moves: { id: string; x: number; y: number }[], done: boolean) => void
}

// Every section, the biggest first, so one inside another is drawn over it and its name can be pressed. In the board's
// own layers, under the lines and the cards.
export const SectionLayer: React.FC<SectionLayerProps> = ({ sections, selectedId, renamingId, onPressName, onRenaming, inside, moveCards }) => {
    const flow = useReactFlow()
    const zoom = useStore((state) => state.transform[2])
    const api = window.chromeAPI.nests
    // Where sections are drawn while one is dragged or resized, until main has what it was left at.
    const [live, setLive] = useState<Record<string, Rect>>({})
    const shown = sections.map((section) => ({ ...section, ...(live[section.id] ?? {}) })).sort((a, b) => b.width * b.height - a.width * a.height)
    const settleLive = (ids: readonly string[]) =>
        setLive((current) => {
            const next = { ...current }
            ids.forEach((id) => delete next[id])
            return next
        })

    // A drag on a section's name moves it with what's inside, and a press that doesn't move is a click on the name.
    const pressName = (event: React.PointerEvent, section: NestSection) => {
        if (event.button !== 0) return
        event.stopPropagation()
        const element = event.currentTarget as HTMLElement
        element.setPointerCapture(event.pointerId)
        const start = { x: event.clientX, y: event.clientY }
        const from = inside(section.id)
        const others = from.sections.map((each) => ({ ...each, rect: rectOf(sections.find((other) => other.id === each.id)!) }))
        let moved = false
        const at = (point: { clientX: number; clientY: number }) => {
            const { zoom: now } = flow.getViewport()
            return { dx: (point.clientX - start.x) / now, dy: (point.clientY - start.y) / now }
        }
        const place = (dx: number, dy: number) => {
            setLive((current) => ({
                ...current,
                [section.id]: { ...rectOf(section), x: section.x + dx, y: section.y + dy },
                ...Object.fromEntries(others.map((each) => [each.id, { ...each.rect, x: each.x + dx, y: each.y + dy }]))
            }))
        }
        const move = (each: PointerEvent) => {
            if (!moved && Math.hypot(each.clientX - start.x, each.clientY - start.y) < CLICK) return
            moved = true
            const { dx, dy } = at(each)
            place(dx, dy)
            moveCards(from.cards.map((card) => ({ id: card.id, x: card.x + dx, y: card.y + dy })), false)
        }
        const up = (each: PointerEvent) => {
            element.removeEventListener('pointermove', move)
            element.removeEventListener('pointerup', up)
            element.removeEventListener('pointercancel', up)
            if (!moved) return each.type === 'pointerup' && onPressName(section.id)
            const { dx, dy } = at(each)
            const cards = from.cards.map((card) => ({ id: card.id, x: card.x + dx, y: card.y + dy }))
            place(dx, dy)
            moveCards(cards, true)
            void api
                .moveSection(section.id, { x: section.x + dx, y: section.y + dy, cards, sections: others.map((other) => ({ id: other.id, x: other.x + dx, y: other.y + dy })) })
                .finally(() => settleLive([section.id, ...others.map((other) => other.id)]))
        }
        element.addEventListener('pointermove', move)
        element.addEventListener('pointerup', up)
        element.addEventListener('pointercancel', up)
    }

    // A corner of a selected section makes it bigger or smaller, the opposite corner staying put. Nothing else moves, and
    // the cards it then covers are the ones in it.
    const pressCorner = (event: React.PointerEvent, section: NestSection, corner: SectionCorner) => {
        if (event.button !== 0) return
        event.stopPropagation()
        const element = event.currentTarget as HTMLElement
        element.setPointerCapture(event.pointerId)
        const start = { x: event.clientX, y: event.clientY }
        const sized = (point: PointerEvent) => {
            const { zoom: now } = flow.getViewport()
            return resizeSection(rectOf(section), corner, (point.clientX - start.x) / now, (point.clientY - start.y) / now)
        }
        const move = (each: PointerEvent) => setLive((current) => ({ ...current, [section.id]: sized(each) }))
        const up = (each: PointerEvent) => {
            element.removeEventListener('pointermove', move)
            element.removeEventListener('pointerup', up)
            element.removeEventListener('pointercancel', up)
            const rect = sized(each)
            setLive((current) => ({ ...current, [section.id]: rect }))
            void api.editSection(section.id, { rect }).finally(() => settleLive([section.id]))
        }
        element.addEventListener('pointermove', move)
        element.addEventListener('pointerup', up)
        element.addEventListener('pointercancel', up)
    }

    const fontSize = nameSize(zoom)
    // Controls that stay one size on screen, whatever the zoom.
    const steady = 1 / zoom
    return (
        <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: -1 }}>
            {shown.map((section) => {
                const selected = section.id === selectedId
                return (
                    <div
                        key={section.id}
                        data-section={section.id}
                        className={cn('absolute left-0 top-0 rounded-panel border', FILL[section.color], selected && 'ring-2 ring-accent-ink')}
                        style={{ transform: `translate(${section.x}px, ${section.y}px)`, width: section.width, height: section.height }}
                    >
                        <div className="absolute left-3 flex items-end" style={{ top: NAME_BOTTOM, transform: 'translateY(-100%)', maxWidth: 'calc(100% - 24px)' }}>
                            {section.id === renamingId ? (
                                <SectionNameField section={section} fontSize={fontSize} onDone={() => onRenaming(null)} />
                            ) : (
                                <button
                                    type="button"
                                    data-section-name
                                    aria-label={`${section.name}, a section. Press to select its cards${selected ? ', again to rename it' : ''}.`}
                                    title={selected ? 'Press to rename, or drag to move' : 'Press to select its cards, or drag to move'}
                                    onPointerDown={(event) => pressName(event, section)}
                                    onKeyDown={(event) => {
                                        if (event.key !== 'Enter' && event.key !== ' ') return
                                        event.preventDefault()
                                        onPressName(section.id)
                                    }}
                                    className="nopan nodrag pointer-events-auto max-w-full cursor-grab truncate rounded-control font-semibold leading-tight text-foreground outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
                                    style={{ fontSize, padding: '0.15em 0.4em' }}
                                >
                                    {section.name}
                                </button>
                            )}
                        </div>
                        {selected && (
                            <>
                                <div
                                    role="group"
                                    aria-label="Section colour"
                                    className="nopan nodrag pointer-events-auto absolute right-0 top-full flex items-center gap-1.5 rounded-full bg-surface px-2 py-1.5 shadow-selected origin-top-right"
                                    style={{ transform: `translateY(${8 * steady}px) scale(${steady})` }}
                                >
                                    {SECTION_COLORS.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            aria-label={COLOR_NAME[color]}
                                            aria-pressed={section.color === color}
                                            title={COLOR_NAME[color]}
                                            onClick={() => void api.editSection(section.id, { color })}
                                            className={cn(
                                                'size-4 rounded-full outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring',
                                                DOT[color],
                                                section.color === color && 'ring-2 ring-offset-2 ring-offset-surface ring-foreground/60'
                                            )}
                                        />
                                    ))}
                                    <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
                                    <button
                                        type="button"
                                        aria-label="Delete the section, keeping its cards"
                                        title="Delete the section (⌫). Its cards stay."
                                        onClick={() => void api.deleteSection(section.id)}
                                        className="size-5 flex items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </div>
                                {CORNERS.map((corner) => (
                                    <span
                                        key={corner}
                                        data-section-corner={corner}
                                        aria-hidden
                                        onPointerDown={(event) => pressCorner(event, section, corner)}
                                        className={cn(
                                            'nopan nodrag pointer-events-auto absolute size-3 rounded-full border-2 border-accent-ink bg-surface',
                                            corner.startsWith('top') ? 'top-0 -translate-y-1/2' : 'bottom-0 translate-y-1/2',
                                            corner.endsWith('left') ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
                                            corner === 'top-left' || corner === 'bottom-right' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
                                        )}
                                        style={{ scale: `${steady}` }}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// A section's name being typed: Enter keeps it, Esc puts the old one back, and leaving the field keeps it too.
const SectionNameField: React.FC<{ section: NestSection; fontSize: number; onDone: () => void }> = ({ section, fontSize, onDone }) => {
    const [value, setValue] = useState(section.name)
    const cancelled = useRef(false)
    const field = useRef<HTMLInputElement>(null)
    useEffect(() => {
        field.current?.focus()
        field.current?.select()
    }, [])
    const save = () => {
        onDone()
        if (cancelled.current) return
        const name = value.trim()
        if (name && name !== section.name) void window.chromeAPI.nests.editSection(section.id, { name })
    }
    return (
        <input
            ref={field}
            aria-label="Section name"
            value={value}
            maxLength={40}
            onChange={(event) => setValue(event.target.value)}
            onBlur={save}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelled.current = true
                    event.currentTarget.blur()
                }
            }}
            style={{ fontSize, padding: '0.15em 0.4em', fieldSizing: 'content' } as React.CSSProperties}
            className="nopan nodrag pointer-events-auto min-w-24 max-w-full rounded-control bg-surface font-semibold leading-tight text-foreground outline-none ring-2 ring-ring"
        />
    )
}

// While the section tool is on, a drag anywhere on the board draws a section, and a click makes one of the usual size
// there. Esc puts the tool away.
export const SectionDraw: React.FC<{ onDrawn: (rect: Rect) => void; onCancel: () => void }> = ({ onDrawn, onCancel }) => {
    const flow = useReactFlow()
    const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
    const own = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const away = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            onCancel()
        }
        window.addEventListener('keydown', away)
        return () => window.removeEventListener('keydown', away)
    }, [onCancel])
    return (
        <div
            ref={own}
            data-section-draw
            aria-hidden
            className="absolute inset-0 cursor-crosshair"
            onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                event.currentTarget.setPointerCapture(event.pointerId)
                const start = { x: event.clientX, y: event.clientY }
                const origin = own.current!.getBoundingClientRect()
                const element = event.currentTarget
                const move = (each: PointerEvent) =>
                    setBox({
                        left: Math.min(start.x, each.clientX) - origin.left,
                        top: Math.min(start.y, each.clientY) - origin.top,
                        width: Math.abs(each.clientX - start.x),
                        height: Math.abs(each.clientY - start.y)
                    })
                const up = (each: PointerEvent) => {
                    element.removeEventListener('pointermove', move)
                    element.removeEventListener('pointerup', up)
                    setBox(null)
                    const { zoom } = flow.getViewport()
                    onDrawn(drawnSection(flow.screenToFlowPosition(start), flow.screenToFlowPosition({ x: each.clientX, y: each.clientY }), 8 / zoom))
                }
                element.addEventListener('pointermove', move)
                element.addEventListener('pointerup', up)
            }}
        >
            {box && <div className="absolute rounded-panel border-2 border-dashed border-accent-ink/60 bg-accent-ink/5" style={box} />}
        </div>
    )
}

// The section tool and Group, beside Fit to screen. Group shows only while cards are selected.
export const SectionTools: React.FC<{ drawing: boolean; onDraw: () => void; canGroup: boolean; onGroup: () => void }> = ({ drawing, onDraw, canGroup, onGroup }) => (
    <>
        {canGroup && (
            <button
                type="button"
                onClick={onGroup}
                title="Group in a section (⌘G)"
                className="h-7 px-2 flex items-center gap-1.5 rounded-control text-12 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Group className="size-4" />
                Group
            </button>
        )}
        <button
            type="button"
            onClick={onDraw}
            title="Section (S)"
            aria-label="Draw a section"
            aria-pressed={drawing}
            className={cn(
                'size-7 flex items-center justify-center rounded-control outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                drawing ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
        >
            <SquareDashed className="size-4" />
        </button>
    </>
)
