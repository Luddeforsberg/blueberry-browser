import { useEffect, useState } from 'react'
import type { CloudState } from '@shared/ipc'

const OFF: CloudState = { provider: null, configured: false, status: 'off', busy: false, canEnd: false, unreleased: false, problem: null, logins: [] }

// Whether there's a cloud browser, and what it's doing. Never the key.
export const useCloud = () => {
    const [state, setState] = useState(OFF)
    useEffect(() => {
        void window.chromeAPI.cloud.state().then(setState)
        return window.chromeAPI.cloud.onUpdated(setState)
    }, [])
    return [state, setState] as const
}
