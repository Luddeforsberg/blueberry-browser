import React from 'react'
import type { MascotProfile } from '@shared/library'
import { BERRY_ID } from '@shared/mascots'
import { Mascot, type Mood } from '@common/components/Mascot'
import { useShell } from '../contexts/ShellContext'

// Berry, or one of the flock, as the settings say: hidden, still, or itself. Right-clicking it offers both switches.
// `still` holds it still whatever the settings say, where something else in its area already moves.
export const Berry: React.FC<{ mood?: Mood; size: number; className?: string; mascot?: MascotProfile; still?: boolean; shut?: boolean }> = ({ mascot, ...props }) => {
    const { settings } = useShell()

    return (
        <Mascot
            {...props}
            look={mascot?.look}
            name={mascot?.name}
            hidden={!settings.showBerry}
            lively
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

// A mascot where a page has room for it, such as an empty chat. With Berry hidden there's nothing in its place.
export const BerrySpot: React.FC<{ size: number; mascot?: MascotProfile }> = ({ size, mascot }) => {
    const { settings } = useShell()

    return settings.showBerry ? <Berry size={size} mascot={mascot} /> : null
}
