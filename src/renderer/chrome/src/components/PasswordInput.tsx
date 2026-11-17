import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@common/lib/utils'

// A password field with an eye at its end to show what's typed, in the first run and in Settings. `className` is the
// field's own look, which differs between a card and a sheet.
export const PasswordInput: React.FC<{ value: string; onChange: (value: string) => void; isNew: boolean; className: string }> = ({ value, onChange, isNew, className }) => {
    const [shown, setShown] = useState(false)
    const Icon = shown ? EyeOff : Eye
    return (
        <span className="relative block">
            <input type={shown ? 'text' : 'password'} autoComplete={isNew ? 'new-password' : 'current-password'} value={value} onChange={(event) => onChange(event.target.value)} className={cn(className, 'pr-10')} />
            <button
                type="button"
                aria-label={shown ? 'Hide the password' : 'Show the password'}
                onClick={() => setShown(!shown)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-row text-ink-3 hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
        </span>
    )
}
