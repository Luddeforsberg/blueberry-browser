import React, { useEffect, useState } from 'react'
import type { PermissionPrompt } from '@shared/ipc'
import { Button } from './Button'
import { ASKS_EVERY_TIME, permissionQuestion, siteName } from '../lib/sitePermissions'

// A page can open this right under the pointer as the user clicks, so the buttons wake up just after it appears.
const ARM_DELAY_MS = 500

// Solid and without Berry: a page can't change how it reads, and it's the user's call alone.
export const PermissionCard: React.FC<{
    prompt: Pick<PermissionPrompt, 'origin' | 'permissions'>
    onDecide: (allow: boolean) => void
}> = ({ prompt, onDecide }) => {
    const [armed, setArmed] = useState(false)

    useEffect(() => {
        const timer = window.setTimeout(() => setArmed(true), ARM_DELAY_MS)
        return () => window.clearTimeout(timer)
    }, [])

    const once = prompt.permissions.some((permission) => ASKS_EVERY_TIME.includes(permission))

    return (
        <section aria-label="Site permission" className="rounded-panel border bg-surface p-4 shadow-float text-foreground">
            <h1 className="text-14">
                <span className="font-semibold break-all">{siteName(prompt.origin)}</span>{' '}
                {permissionQuestion(prompt.permissions)}
            </h1>
            <p className="mt-1 text-12 text-muted-foreground">
                {once
                    ? 'Allow is for this time only. Block is remembered for this site.'
                    : 'Your answer is remembered for this site. You can change it in Settings.'}
            </p>
            <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={!armed} onClick={() => onDecide(false)}>
                    Block
                </Button>
                <Button size="sm" disabled={!armed} onClick={() => onDecide(true)}>
                    Allow
                </Button>
            </div>
        </section>
    )
}
