import React from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import type { MascotProfile } from '@shared/library'
import { cn } from '@common/lib/utils'
import { useFlock } from '../contexts/LibraryContext'
import { BERRY_ID } from '@shared/mascots'
import { Berry, useAssistantName } from './Berry'
import { blankMascot, setFlockView } from '../flockView'

// Says who a message goes to, on the composer. It only opens the flock where the choice is still open.
export const MascotChip: React.FC<{ mascot: MascotProfile; open: boolean; onPress?: () => void }> = ({ mascot, open, onPress }) => {
    const name = useAssistantName(mascot)
    const inner = (
        <>
            <Berry size={24} mascot={mascot} />
            <span className="max-w-24 truncate text-13">{name}</span>
        </>
    )
    if (!onPress) {
        return <span aria-label={`This chat is with ${name}`} className="h-9 px-2 flex items-center gap-1.5 text-muted-foreground cursor-default">{inner}</span>
    }
    return (
        <button
            type="button"
            aria-label={`Talking to ${name}. Choose who to ask`}
            aria-expanded={open}
            onClick={onPress}
            className="h-9 pl-1.5 pr-2 flex items-center gap-1.5 rounded-full outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
            {inner}
            <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
    )
}

// The flock on a perch, to choose who does something. In the flow rather than floating, so it works in the chat panel
// beside a web page, which nothing in the chrome can draw over.
export const MascotPerch: React.FC<{ selectedId: string; onChoose: (id: string) => void; onClose?: () => void }> = ({ selectedId, onChoose, onClose }) => {
    const { flock, find } = useFlock()
    const berryName = useAssistantName()
    // A routine can still belong to a mascot that's been deleted, and shows it until it's moved.
    const shown = flock.some((mascot) => mascot.id === selectedId) ? flock : [...flock, find(selectedId)]

    return (
        <ul
            aria-label="Your flock"
            onKeyDown={(event) => {
                if (event.key === 'Escape') onClose?.()
            }}
            className="flex flex-wrap gap-1"
        >
            {shown.map((mascot) => (
                <li key={mascot.id}>
                    <button
                        type="button"
                        aria-pressed={mascot.id === selectedId}
                        onClick={() => onChoose(mascot.id)}
                        className={cn(
                            "w-[72px] py-1.5 flex flex-col items-center gap-0.5 rounded-card outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                            mascot.id === selectedId ? "bg-muted" : "hover:bg-muted"
                        )}
                    >
                        <Berry size={40} mascot={mascot} />
                        <span className="w-full px-1 truncate text-center text-12">{mascot.id === BERRY_ID ? berryName : mascot.name}{mascot.deletedAt !== null && ' (deleted)'}</span>
                    </button>
                </li>
            ))}
            {onClose && (
                <li>
                    <button
                        type="button"
                        onClick={() => {
                            setFlockView({ page: 'form', values: blankMascot() })
                            void window.chromeAPI.browser.openPage('flock')
                            onClose()
                        }}
                        className="w-[72px] py-1.5 flex flex-col items-center gap-0.5 rounded-card text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <span className="size-10 flex items-center justify-center"><Plus className="size-5" /></span>
                        <span className="text-12">New</span>
                    </button>
                </li>
            )}
        </ul>
    )
}
