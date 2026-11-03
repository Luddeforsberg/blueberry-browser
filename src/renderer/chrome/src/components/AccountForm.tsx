import React, { useState } from 'react'
import type { AccountState } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Choice } from '@common/components/Controls'

const FIELD = "block w-full h-9 mt-1 px-3 rounded-card border bg-surface text-14 outline-none focus-visible:ring-2 focus-visible:ring-ring"

// Typed here, in our own page and never in a tab. The password goes to main once, and this forgets it as soon as it has.
export const AccountForm: React.FC<{ problem: string | null; onResult: (state: AccountState) => void }> = ({ problem, onResult }) => {
    const [mode, setMode] = useState<'in' | 'up'>('in')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)

    const submit = async (event: React.FormEvent) => {
        event.preventDefault()
        setBusy(true)
        const { signIn, signUp } = window.chromeAPI.account
        const state = await (mode === 'in' ? signIn : signUp)(email, password)
        setBusy(false)
        setPassword('')
        onResult(state)
    }

    return (
        <form aria-label="Sign in" onSubmit={(event) => void submit(event)} className="max-w-sm flex flex-col gap-3">
            <Choice label="Have an account?" value={mode} onChange={setMode} options={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Create account' }]} />
            <label className="text-13">
                Email
                <input type="email" autoComplete="username" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} className={FIELD} />
            </label>
            <label className="text-13">
                Password
                <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} className={FIELD} />
            </label>
            {problem && <p role="alert" className="text-13 text-destructive">{problem}</p>}
            <div>
                <Button type="submit" disabled={busy || !email.trim() || !password}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</Button>
            </div>
            <p className="text-12 text-muted-foreground">These go to Blueberry’s sign-in service and nowhere else. Berry, tools and mascots never see them, and your email is never shown to anyone.</p>
        </form>
    )
}
