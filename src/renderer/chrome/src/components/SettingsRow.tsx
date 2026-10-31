import React from 'react'

export const SettingsRow: React.FC<{ id: string; title: string; description?: string; children?: React.ReactNode }> = ({
    id,
    title,
    description,
    children
}) => (
    <div className="flex items-center gap-6 min-h-16 py-4 border-b last:border-b-0">
        <div className="flex-1 min-w-0">
            <h3 id={id} className="text-14 font-semibold break-words">{title}</h3>
            {description && <p className="mt-0.5 text-13 text-muted-foreground break-words">{description}</p>}
        </div>
        {children}
    </div>
)
