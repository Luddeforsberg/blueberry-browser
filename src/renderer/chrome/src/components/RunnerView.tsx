import React, { useEffect, useState } from 'react'
import { Cloud } from 'lucide-react'
import type { ChatApproval, ChatStep } from '@shared/library'
import { cn } from '@common/lib/utils'
import { liveFrameLock } from '../cloudView'

const LOOK_AGAIN_MS = 2000

// A job on the cloud runner, beside its chat: the live view of the page it's on, locked while it works. A page handed to
// the user unlocks, so they can sign in there, and I'm done on the card gives it back. The address is Browserbase's
// own page, checked in main, and goes nowhere but this screen.
export const RunnerView: React.FC<{ chatId: string; steps: ChatStep[]; approval: ChatApproval | null }> = ({ chatId, steps, approval }) => {
    const [url, setUrl] = useState<string | null>(null)
    const handoff = approval?.handoff
    // Asked again every few seconds while it's on screen, since the runner writes it after the step that opened the page,
    // and each page has its own.
    useEffect(() => {
        let current = true
        const look = () => void window.chromeAPI.cloud.runnerView(chatId).then((next) => current && setUrl(next))
        look()
        const timer = setInterval(look, LOOK_AGAIN_MS)
        return () => {
            current = false
            clearInterval(timer)
        }
    }, [chatId, approval?.id])
    const lock = liveFrameLock(!!handoff)
    const doing = steps.filter((one) => !one.done).at(-1)?.text ?? steps.at(-1)?.text ?? 'Waiting to start in the cloud'

    return (
        <section aria-label="In the cloud" className="flex flex-col gap-2 animate-fade-in">
            <p className="flex items-center gap-2 text-13">
                <Cloud aria-hidden className="size-4 text-muted-foreground" />
                <span className="font-semibold">In the cloud</span>
            </p>
            <p className="text-13 text-muted-foreground">
                {handoff ? `Do it in the page below, then press I’m done.` : 'It keeps going with your Mac off. Come back any time.'}
            </p>
            <div className="relative aspect-[4/3] overflow-hidden rounded-card border bg-tray">
                {url ? (
                    <iframe
                        title="Live view of the page in the cloud"
                        src={url}
                        sandbox="allow-same-origin allow-scripts"
                        inert={lock.inert}
                        tabIndex={lock.tabIndex}
                        className={cn('absolute inset-0 size-full border-0', lock.className)}
                    />
                ) : (
                    <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-13 text-muted-foreground">
                        No live view yet. A test browser in the cloud never has one.
                    </p>
                )}
            </div>
            <p role="status" className="text-13 line-clamp-2">{doing}</p>
        </section>
    )
}
