import React from 'react'
import type { TabTrouble } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Berry } from './Berry'

const COPY: Record<TabTrouble, { title: string; text: string }> = {
    crashed: {
        title: 'This page crashed',
        text: 'Your other tabs are fine. Reloading starts this page again, so anything unsaved on it may be gone.'
    },
    unresponsive: {
        title: 'This page isn’t responding',
        text: 'It comes back here if it recovers. Reloading starts it again, so anything unsaved on it may be gone.'
    }
}

// Shown in the space a tab's page leaves, with the way forward.
export const PageTrouble: React.FC<{ trouble: TabTrouble; onReload: () => void }> = ({ trouble, onReload }) => (
    <div role="alert" className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
        <Berry mood="oops" size={88} />
        <div>
            <h1 className="text-20 font-semibold">{COPY[trouble].title}</h1>
            <p className="mt-1 max-w-md text-14 text-muted-foreground">{COPY[trouble].text}</p>
        </div>
        <Button onClick={onReload}>Reload</Button>
    </div>
)
