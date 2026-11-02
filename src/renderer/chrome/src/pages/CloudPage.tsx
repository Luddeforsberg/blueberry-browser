import React, { useCallback, useEffect, useState } from 'react'
import type { CloudView, TabInfo } from '@shared/ipc'
import { Cloud } from 'lucide-react'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { Berry } from '../components/Berry'
import { liveFrameLock } from '../cloudView'

const api = () => window.chromeAPI.cloud

// A page in the cloud browser. Browserbase's live view sits in a frame, which only takes the pointer or the keyboard
// once the user has taken the tab over, so nothing they do lands in the middle of a job. A local test browser sends pictures instead.
// None of what's shown here goes anywhere but this screen.
export const CloudPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const [view, setView] = useState<CloudView | null>(null)
    const [frame, setFrame] = useState<string | null>(null)

    const refresh = useCallback(() => void api().view(tab.id).then(setView), [tab.id])
    useEffect(() => {
        refresh()
        return api().onUpdated(refresh)
    }, [refresh])

    const pictures = view?.kind === 'frames'
    useEffect(() => {
        if (!pictures) return
        const off = api().onFrame((next) => {
            if (next.tabId === tab.id) setFrame(next.data)
        })
        void api().watch(tab.id)
        return () => {
            off()
            void api().watch(null)
        }
    }, [pictures, tab.id])

    if (view?.kind === 'gone') {
        return (
            <div role="alert" className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
                <Berry mood="oops" size={88} />
                <div>
                    <h1 className="text-20 font-semibold">This cloud tab has closed</h1>
                    <p className="mt-1 max-w-md text-14 text-muted-foreground">Its page went when the cloud session ended. Nothing of it was kept on this computer.</p>
                </div>
            </div>
        )
    }

    const takenOver = view?.takenOver ?? false
    const lock = liveFrameLock(takenOver)
    const takeOver = () => void api().takeOver(tab.id).then(refresh)

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center gap-3 px-4 py-2 border-b">
                <Cloud className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <p className="flex-1 min-w-0 truncate text-13">
                    <span className="font-semibold">In the cloud</span>
                    <span className="text-muted-foreground">
                        {' · '}
                        {takenOver
                            ? pictures ? 'Yours now. The local test browser only shows pictures here.' : 'Yours now.'
                            : 'Take over to use it yourself. That stops the job here.'}
                    </span>
                </p>
                {!takenOver && view && (
                    <Button variant="outline" size="sm" onClick={takeOver}>Take over</Button>
                )}
            </div>
            <div className="relative flex-1 min-h-0">
                {view?.kind === 'live' && (
                    <iframe
                        title={`Live view of ${tab.title}`}
                        src={view.url}
                        sandbox="allow-same-origin allow-scripts"
                        allow="clipboard-read; clipboard-write"
                        inert={lock.inert}
                        tabIndex={lock.tabIndex}
                        className={cn('absolute inset-0 size-full border-0', lock.className)}
                    />
                )}
                {pictures && (frame
                    ? <img alt={`Picture of ${tab.title}`} src={`data:image/jpeg;base64,${frame}`} className="absolute inset-0 size-full object-contain object-top" />
                    : <p className="absolute inset-0 flex items-center justify-center text-14 text-muted-foreground">Waiting for the first picture…</p>
                )}
            </div>
        </div>
    )
}
