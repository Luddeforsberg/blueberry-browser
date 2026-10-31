import React from 'react'
import type { MascotProfile } from '@shared/library'
import { BERRY_ID } from '@shared/mascots'
import { Mascot, type Mood } from '@common/components/Mascot'
import { useShell } from '../contexts/ShellContext'

// Berry, or one of the flock, as the settings say: hidden, still, or itself. Right-clicking it offers both switches.
export const Berry: React.FC<{ mood?: Mood; size: number; className?: string; mascot?: MascotProfile }> = ({ mascot, ...props }) => {
    const { settings } = useShell()

    return (
        <Mascot
            {...props}
            look={mascot?.look}
            name={mascot?.name}
            hidden={!settings.showBerry}
            still={settings.keepBerryStill}
            onContextMenu={(event) => {
                event.preventDefault()
                void window.chromeAPI.settings.showBerryMenu()
            }}
        />
    )
}

// With Berry hidden, the copy turns neutral too. A mascot the user named keeps its name, so they can tell who's who.
export const useAssistantName = (mascot?: MascotProfile) => {
    const { showBerry } = useShell().settings
    if (mascot && mascot.id !== BERRY_ID) return mascot.name
    return showBerry ? 'Berry' : 'Assistant'
}

// A place on the page for Berry to land. BerryCompanion draws Berry here, so there's only ever one.
export const BerrySpot: React.FC<{ size: number }> = ({ size }) => {
    const { settings } = useShell()

    return settings.showBerry ? <div data-berry-spot style={{ width: size, height: size }} /> : null
}

// Berry above the composer in an empty chat. The page title is for screen readers: the composer
// already says what to do. With Berry hidden, the composer stands alone.
export const BerryHero: React.FC<{ title: string }> = ({ title }) => (
    <div className="flex justify-center pb-8">
        <h1 className="sr-only">{title}</h1>
        <BerrySpot size={112} />
    </div>
)
