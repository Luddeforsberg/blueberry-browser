import React, { useEffect, useState } from 'react'
import type { TooltipShown } from '@shared/ipc'
import { TipPill } from '@common/components/Tooltip'

// A tooltip over a web page, in its own view: main places the view and says what to draw. The pointer reaching it means
// it has left the control, so it goes at once rather than standing in the way of the page.
export const TooltipApp: React.FC = () => {
    const [shown, setShown] = useState<TooltipShown | null>(null)
    // The last one stays drawn while it fades.
    const [last, setLast] = useState<TooltipShown | null>(null)

    useEffect(() => {
        const api = window.chromeAPI
        void api.theme.getTheme().then((theme) => document.documentElement.classList.toggle('dark', theme.isDark))
        const unsubscribe = [
            api.theme.onThemeUpdated((theme) => document.documentElement.classList.toggle('dark', theme.isDark)),
            api.tooltip.onShown((next) => {
                setShown(next)
                if (next) setLast(next)
            })
        ]
        return () => unsubscribe.forEach((off) => off())
    }, [])

    return (
        <div className="h-full" onPointerMove={() => void window.chromeAPI.tooltip.hide()}>
            {last && <TipPill tip={last} on={!!shown} fixed={false} />}
        </div>
    )
}
