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

// Berry above the composer on the new tab page and an empty chat. The page title is for screen readers:
// the composer already says what to do. With Berry hidden, the composer stands alone.
export const BerryHero: React.FC<{ title: string }> = ({ title }) => {
    const { settings } = useShell()

    return (
        <div className="flex justify-center pb-8">
            <h1 className="sr-only">{title}</h1>
            {settings.showBerry && <Berry mood="rest" size={112} />}
        </div>
    )
}
