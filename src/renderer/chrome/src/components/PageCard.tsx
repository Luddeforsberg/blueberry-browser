import React from 'react'
import { X } from 'lucide-react'
import { Favicon } from './Favicon'

// The page the mascot can see, as a chip at the top of the prompt box: its icon and site, marked as the page in front.
// Removing it takes the page away from the mascot.
export const PageCard: React.FC<{
    title: string
    host: string
    favicon?: string | null
    onRemove: () => void
}> = ({ title, host, favicon, onRemove }) => (
    <div
        role="group"
        aria-label={`Berry can see ${host}`}
        title={title}
        className="h-[26px] max-w-full pl-1.5 pr-0.5 inline-flex items-center gap-[7px] rounded-row bg-card-2 text-12 text-ink"
    >
        <Favicon src={favicon} site={host} />
        <span className="min-w-0 truncate">{host}</span>
        <span className="shrink-0 text-ink-3">this page</span>
        <button
            type="button"
            aria-label="Remove this page"
            title="Remove this page"
            onClick={onRemove}
            className="size-[22px] shrink-0 flex items-center justify-center rounded-full text-ink-3 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
        >
            <X className="size-3" strokeWidth={1.5} />
        </button>
    </div>
)
