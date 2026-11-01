import React from 'react'
import type { TabLoadError, TabTrouble } from '@shared/ipc'
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

// What Chromium's codes mean, in the words someone would use. Anything else gets the plain last line.
const loadReason = (description: string): string => {
    if (description === 'ERR_INTERNET_DISCONNECTED') return 'This computer isn’t connected to the internet.'
    if (description === 'ERR_NAME_NOT_RESOLVED') return 'No site could be found at this address. Check it for typos, or check your connection.'
    if (description === 'ERR_CONNECTION_REFUSED') return 'The site refused the connection. It may be down.'
    if (description.includes('TIMED_OUT')) return 'The site took too long to answer.'
    if (description.startsWith('ERR_CERT_') || description.startsWith('ERR_SSL_')) return 'The site’s security couldn’t be verified, so it wasn’t opened.'
    if (description === 'ERR_FILE_NOT_FOUND') return 'There’s no file at this address.'
    return 'The site couldn’t be reached.'
}

// Shown in the space a tab's page leaves, with the way forward.
export const PageTrouble: React.FC<{ trouble: TabTrouble | TabLoadError; onReload: () => void }> = ({ trouble, onReload }) => {
    const failedLoad = typeof trouble === 'string' ? null : trouble
    const { title, text } = typeof trouble === 'string' ? COPY[trouble] : { title: 'This page couldn’t load', text: loadReason(trouble.description) }
    return (
        <div role="alert" className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
            <Berry mood="oops" size={88} />
            <div>
                <h1 className="text-20 font-semibold">{title}</h1>
                {failedLoad && <p className="mt-1 max-w-md text-14 [overflow-wrap:anywhere]">{failedLoad.url}</p>}
                <p className="mt-1 max-w-md text-14 text-muted-foreground">{text}</p>
            </div>
            <Button onClick={onReload}>Reload</Button>
        </div>
    )
}
