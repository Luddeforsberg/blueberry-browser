import { useEffect, useState } from 'react'
import type { AccountState } from '@shared/ipc'

// Starts as not set up, so no control shows until main has said there's a server.
const UNKNOWN: AccountState = { status: 'not-set-up', email: null, problem: null }

export const useAccount = () => {
    const [state, setState] = useState(UNKNOWN)
    useEffect(() => {
        void window.chromeAPI.account.state().then(setState)
        return window.chromeAPI.account.onUpdated(setState)
    }, [])
    return [state, setState] as const
}
