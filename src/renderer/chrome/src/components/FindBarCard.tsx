import React from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { FindResult } from '@shared/ipc'
import { cn } from '@common/lib/utils'
import { ToolBarButton } from './ToolBarButton'

const countText = (value: string, result: FindResult | null): string => {
    if (!value || !result) return ''
    return result.total === 0 ? 'No results' : `${result.active} of ${result.total}`
}

export const FindBarCard: React.FC<{
    value: string
    onChange: (value: string) => void
    result: FindResult | null
    onStep: (forward: boolean) => void
    onClose: () => void
    inputRef?: React.Ref<HTMLInputElement>
}> = ({ value, onChange, result, onStep, onClose, inputRef }) => {
    const hasMatches = !!value && !!result && result.total > 0

    return (
        <div
            role="search"
            aria-label="Find in page"
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault()
                    onClose()
                }
            }}
            className={cn(
                "h-12 flex items-center gap-0.5 pl-2 pr-2 rounded-panel bg-surface shadow-float"
            )}
        >
            <input
                ref={inputRef}
                aria-label="Find in page"
                placeholder="Find in page"
                spellCheck={false}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault()
                        onStep(!event.shiftKey)
                    }
                }}
                className="flex-1 min-w-0 h-8 px-2 rounded-card bg-transparent text-14 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span aria-live="polite" className="shrink-0 px-1 text-12 tabular-nums text-muted-foreground">
                {countText(value, result)}
            </span>
            <ToolBarButton Icon={ChevronUp} label="Previous match" active={hasMatches} onClick={() => onStep(false)} />
            <ToolBarButton Icon={ChevronDown} label="Next match" active={hasMatches} onClick={() => onStep(true)} />
            <ToolBarButton Icon={X} label="Close find bar" onClick={onClose} />
        </div>
    )
}
