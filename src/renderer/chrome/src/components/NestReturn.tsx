import React, { useEffect, useRef, useState } from 'react'
import { useStore, useStoreApi } from '@xyflow/react'
import type { NestBoard, NestSince } from '@shared/library'
import { cn } from '@common/lib/utils'

// Coming back to a board: a card's title for what it found, its unread dot, what it shows zoomed out, and which cards
// the board has in sight, so main knows which changes nobody saw. The words come from main, which checked them.

// Zoomed out past this, a sent card shows only its title and status, at a size that can still be read.
const FAR_ZOOM = 0.55
// How long the cards that changed since the Nest was last open stay highlighted.
const HIGHLIGHT_MS = 4000
// How much of a card's top must be in sight for it to count as seen: its header, where its status is.
const HEADER = 48

// A sent card's title, which reads as text until it's pressed, and then renames it. A name the user types is never
// replaced, and an empty one lets the next answer name it again.
export const CardTitle: React.FC<{ cardId: string; title: string }> = ({ cardId, title }) => {
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState(title)
    useEffect(() => setValue(title), [title])
    const save = () => {
        setEditing(false)
        if (value.trim() !== title) void window.chromeAPI.nests.renameCard(cardId, value.trim())
    }
    if (editing) {
        return (
            <input
                aria-label="Card title"
                value={value}
                maxLength={100}
                autoFocus
                onChange={(event) => setValue(event.target.value)}
                onBlur={save}
                onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                        event.preventDefault()
                        setValue(title)
                        setEditing(false)
                    }
                }}
                className="nodrag shrink-0 w-full h-7 -mx-1 px-1 rounded-control bg-muted text-14 font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
        )
    }
    return (
        <button
            type="button"
            data-card-title
            title="Rename the card"
            aria-label={`${title}, rename the card`}
            onClick={() => setEditing(true)}
            className="nodrag shrink-0 self-start max-w-full h-7 -mx-1 px-1 rounded-control text-left text-14 font-semibold text-foreground truncate outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
            {title}
        </button>
    )
}

// On a card that finished, failed or started waiting while nobody was looking, until it's opened.
export const UnreadDot: React.FC = () => <span data-unread role="img" aria-label="New since you looked" className="shrink-0 size-1.5 rounded-full bg-accent-ink" />

// Zoomed out, a sent card is only its title, or what was asked when it has none, and its status, drawn over the card so
// its size never changes. Its words stay about the same size on screen, and the prompt is still there on hover.
export const FarCard: React.FC<{ title: string | null; asked: string | null; status: { text: string; className: string } | null; unread: boolean }> = ({
    title,
    asked,
    status,
    unread
}) => {
    const zoom = useStore((state) => state.transform[2])
    if (zoom >= FAR_ZOOM) return null
    const words = title ?? asked?.replace(/\s+/g, ' ').trim() ?? ''
    // Never so big that two lines and the status outgrow the smallest card, near the furthest zoom.
    const size = (screen: number, most: number) => Math.min(screen / zoom, most)
    return (
        <div
            data-far-card
            aria-hidden
            title={asked ?? undefined}
            className="nest-drag cursor-grab absolute inset-0 rounded-panel bg-surface px-5 overflow-hidden flex flex-col justify-center"
            style={{ gap: size(6, 16) }}
        >
            <p className={cn('font-semibold line-clamp-2', !title && 'text-muted-foreground')} style={{ fontSize: size(13, 40), lineHeight: 1.25 }}>
                {words}
            </p>
            {status && (
                <p className={cn('flex items-center', status.className)} style={{ fontSize: size(11, 32), gap: size(6, 16) }}>
                    {unread && <span className="shrink-0 rounded-full bg-accent-ink" style={{ width: size(6, 16), height: size(6, 16) }} />}
                    {status.text}
                </p>
            )}
        </div>
    )
}

// Tells main which cards the board has in sight, by their header, and the open one, so a card that changes there gets no
// dot. Opening a card takes its dot away. Nothing is in sight once the board goes.
export const useCardsInView = (board: NestBoard, openId: string | null) => {
    const store = useStoreApi()
    const nestId = board.id
    useEffect(() => {
        let timer = 0
        let last = ''
        const report = () => {
            const { transform, width, height, nodeLookup } = store.getState()
            const [tx, ty, zoom] = transform
            const ids = [...nodeLookup.values()].flatMap((node) => {
                const { x, y } = node.internals.positionAbsolute
                const left = x * zoom + tx
                const top = y * zoom + ty
                const right = left + (node.measured.width ?? 0) * zoom
                const seen = node.id === openId || (left < width && right > 0 && top < height && top + HEADER * zoom > 0)
                return seen ? [node.id] : []
            })
            const key = ids.join()
            if (key === last) return
            last = key
            void window.chromeAPI.nests.inView(nestId, ids)
        }
        report()
        const off = store.subscribe(() => {
            window.clearTimeout(timer)
            timer = window.setTimeout(report, 150)
        })
        return () => {
            off()
            window.clearTimeout(timer)
            void window.chromeAPI.nests.inView(nestId, [])
        }
    }, [store, nestId, openId])
    const openUnread = !!openId && !!board.cards.find((card) => card.id === openId)?.unread
    useEffect(() => {
        if (openId && openUnread) void window.chromeAPI.nests.readCard(openId)
    }, [openId, openUnread])
}

// Each Nest's newest summary that has highlighted its cards already, so going away and back doesn't do it again. Memory
// only, like the summary.
const highlighted = new Map<string, number>()

// The cards that changed since the Nest was last open, for a few seconds after Berry says so.
export const useSinceHighlight = (nestId: string, since: NestSince | null | undefined): ReadonlySet<string> => {
    const [cards, setCards] = useState<ReadonlySet<string>>(new Set())
    const latest = useRef(since)
    latest.current = since
    // Each board that comes is a new object, so only a new summary starts it again.
    const sinceId = since?.id ?? null
    useEffect(() => {
        const current = latest.current
        if (!current || highlighted.get(nestId) === current.id) return undefined
        highlighted.set(nestId, current.id)
        setCards(new Set(current.cards))
        const timer = window.setTimeout(() => setCards(new Set()), HIGHLIGHT_MS)
        return () => {
            window.clearTimeout(timer)
            setCards(new Set())
        }
    }, [nestId, sinceId])
    return cards
}
