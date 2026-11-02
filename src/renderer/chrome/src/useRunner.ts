import { useEffect, useState } from 'react'
import type { RunnerState } from '@shared/ipc'

// Starts as not set up, so no control shows until main has said there's a linked runner.
const UNKNOWN: RunnerState = { status: 'not-set-up', email: null, problem: null }

export const useRunner = () => {
    const [state, setState] = useState(UNKNOWN)
    useEffect(() => {
        void window.chromeAPI.cloud.runnerState().then(setState)
        return window.chromeAPI.cloud.onRunnerUpdated(setState)
    }, [])
    return [state, setState] as const
}
