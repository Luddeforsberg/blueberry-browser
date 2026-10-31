import { useEffect, useState } from 'react'
import type { PhoneState } from '@shared/ipc'

const OFF: PhoneState = { status: 'off', botName: null, pairLink: null, problem: null }

export const usePhone = () => {
    const [state, setState] = useState(OFF)
    useEffect(() => {
        void window.chromeAPI.phone.state().then(setState)
        return window.chromeAPI.phone.onUpdated(setState)
    }, [])
    return [state, setState] as const
}
