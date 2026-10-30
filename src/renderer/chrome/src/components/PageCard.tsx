import React from 'react'
import { X } from 'lucide-react'
import { Favicon } from './Favicon'

// The page Berry can see, attached to the composer. Removing it takes the page away from Berry.
export const PageCard: React.FC<{
    title: string
    host: string
    favicon?: string | null
    onRemove: () => void
}> = ({ title, host, favicon, onRemove }) => (
    <div
        role="group"
        aria-label={`Berry can see ${host}`}
        className="group/page relative inline-flex max-w-[240px] items-center gap-2.5 p-1.5 pr-4 rounded-card bg-tray"
    >
        <span className="size-9 shrink-0 flex items-center justify-center rounded-control bg-surface border">
            <Favicon src={favicon} />
        </span>
        <span className="min-w-0 flex flex-col">
            <span className="text-13 truncate">{title}</span>
            <span className="text-11 text-muted-foreground truncate">{host}</span>
        </span>
        <button
            type="button"
            aria-label="Remove this page"
            title="Remove this page"
            onClick={onRemove}
            className="absolute -top-1.5 -right-1.5 size-5 flex items-center justify-center rounded-full border bg-surface outline-none opacity-0 group-hover/page:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring transition-opacity"
        >
            <X className="size-3" />
        </button>
    </div>
)
