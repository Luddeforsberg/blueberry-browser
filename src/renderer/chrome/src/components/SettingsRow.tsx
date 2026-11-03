import React, { useId, useState } from 'react'

// One sentence says what a row does. Anything more, such as exactly what's sent, waits behind More.
export const SettingsRow: React.FC<{ id: string; title: string; description?: string; more?: string; children?: React.ReactNode }> = ({
    id,
    title,
    description,
    more,
    children
}) => (
    <div className="flex items-center gap-6 min-h-16 py-4 border-b last:border-b-0">
        <div className="flex-1 min-w-0">
            <h3 id={id} className="text-14 font-semibold break-words">{title}</h3>
            {description && <p className="mt-0.5 text-13 text-muted-foreground break-words">{description}{more && <> <More about={id} text={more} /></>}</p>}
        </div>
        {children}
    </div>
)

// A quiet link at the end of a line that shows the rest under it. `about` is the heading it belongs to, for a screen reader.
export const More: React.FC<{ text: string; about?: string }> = ({ text, about }) => {
    const [open, setOpen] = useState(false)
    const id = useId()
    return (
        <>
            <button
                type="button"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                aria-describedby={about}
                onClick={() => setOpen(!open)}
                className="rounded-control text-accent-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
                {open ? 'Less' : 'More'}
            </button>
            {open && <span id={id} className="block mt-1">{text}</span>}
        </>
    )
}
