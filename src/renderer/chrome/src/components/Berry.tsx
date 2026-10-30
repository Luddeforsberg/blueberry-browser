import React from 'react'
import { Mascot, type Mood } from '@common/components/Mascot'
import { useShell } from '../contexts/ShellContext'

// Berry as the settings say: hidden, still, or itself. Right-clicking it offers both switches.
export const Berry: React.FC<{ mood?: Mood; size: number; className?: string }> = (props) => {
    const { settings } = useShell()

    return (
        <Mascot
            {...props}
            hidden={!settings.showBerry}
            still={settings.keepBerryStill}
            onContextMenu={(event) => {
                event.preventDefault()
                void window.chromeAPI.settings.showBerryMenu()
            }}
        />
    )
}

// With Berry hidden, the copy turns neutral too.
export const useAssistantName = () => (useShell().settings.showBerry ? 'Berry' : 'Assistant')
