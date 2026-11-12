import React from 'react'
import { cn } from '@common/lib/utils'

// Icons Lucide doesn't have, drawn as the mocks draw them: a 16px grid, a 1.5px round stroke in the current colour.
const Icon: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
    <svg
        viewBox="0 0 16 16"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("size-4", className)}
    >
        {children}
    </svg>
)

// Two birds in flight, for the flock.
export const FlockIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}>
        <path d="M2 6.5c2-2 4-2 6 1 2-3 4-3 6-1M4.5 11c1.3-1.3 2.3-1.3 3.5.6 1.2-1.9 2.2-1.9 3.5-.6" />
    </Icon>
)

// A hill and the sun, for the new tab's valley.
export const ValleyIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}>
        <path d="M1.5 12.5l4-6 3 4 2-2.5 4 4.5z" />
        <circle cx="11.5" cy="4.5" r="1.4" />
    </Icon>
)
