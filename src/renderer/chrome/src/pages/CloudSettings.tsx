import React, { useEffect, useState } from 'react'
import type { CloudLogin, CloudState, RunnerState } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Switch } from '@common/components/Controls'
import { CopyLink } from '../components/CopyLink'
import { More, SettingsRow } from '../components/SettingsRow'
import { useShell } from '../contexts/ShellContext'
import { useCloud } from '../useCloud'
import { useRunner } from '../useRunner'

const FIELD = 'min-w-0 h-8 rounded-card border bg-canvas px-3 text-13 outline-none focus-visible:ring-2 focus-visible:ring-ring'

const statusLine = (cloud: CloudState): string => {
    const where = cloud.provider === 'local' ? 'The local test browser' : 'The cloud browser'
    if (cloud.status === 'off') return 'Off. Add a Browserbase key to turn it on.'
    if (cloud.status === 'starting') return `${where} is starting.`
    if (cloud.status === 'running') return cloud.busy ? `${where} is running, with a job in it.` : `${where} is running, with nothing in it right now.`
    if (cloud.status === 'ended') return `${where} has ended. The next job starts it again.`
    return `${where} starts with the first job that needs it.`
}

const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

const loginStatus = (login: CloudLogin): string => {
    if (login.status === 'checked') return `Checked by you, ${day(login.checkedAt ?? login.addedAt)}`
    if (login.status === 'signed-out') return `Signed out when you checked, ${day(login.checkedAt ?? login.addedAt)}`
    return `Brought over ${day(login.addedAt)}, not checked yet`
}

// Sites whose sign-in the user brought into the cloud browser. Only names and dates reach this page, never a cookie, and
// only the user can start any of it: each site asks for Touch ID first.
const SignedInTo: React.FC<{ cloud: CloudState }> = ({ cloud }) => {
    const api = window.chromeAPI.cloud
    const [site, setSite] = useState('')
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [working, setWorking] = useState<string | null>(null)
    const [problem, setProblem] = useState<string | null>(null)
    const sites = cloud.logins.map((login) => login.site).join(' ')

    useEffect(() => {
        void api.loginSuggestions().then(setSuggestions)
    }, [api, sites])

    const run = async (what: string, act: () => Promise<string | null>) => {
        setWorking(what)
        setProblem(null)
        const said = await act()
        setWorking(null)
        setProblem(said)
        return said
    }
    const bring = async (choice: string) => {
        const said = await run(choice, () => api.bringLogin(choice))
        if (!said) setSite('')
    }

    return (
        <div className="py-4 border-b last:border-b-0">
            <h3 id="setting-cloud-logins" className="text-14 font-semibold">Signed in to</h3>
            <p className="mt-0.5 text-13 text-muted-foreground">
                Bring your sign-in to a site along, and a bird in the cloud can use it as you.{' '}
                <More about="setting-cloud-logins" text="Only that site’s cookies are copied, after Touch ID, and they stay in the cloud browser. Nothing else from this browser goes there." />
            </p>

            {cloud.logins.length > 0 && (
                <ul aria-label="Sites signed in in the cloud" className="mt-3 rounded-card border">
                    {cloud.logins.map((login) => (
                        <li key={login.site} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0">
                            <div className="flex-1 min-w-0">
                                <p className="text-14 font-semibold truncate">{login.site}</p>
                                <p className={login.status === 'signed-out' ? 'text-13 text-warning' : 'text-13 text-muted-foreground'}>{loginStatus(login)}</p>
                            </div>
                            <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={working !== null} onClick={() => void run(login.site, () => api.checkLogin(login.site))}>Check</Button>
                            <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={working !== null} onClick={() => void run(login.site, () => api.revokeLogin(login.site))}>Remove</Button>
                        </li>
                    ))}
                </ul>
            )}

            <form
                className="mt-3 flex items-center gap-2"
                onSubmit={(event) => {
                    event.preventDefault()
                    if (site.trim()) void bring(site.trim())
                }}
            >
                <input aria-label="Site to bring along" spellCheck={false} autoComplete="off" value={site} onChange={(event) => setSite(event.target.value)} placeholder="A site, such as github.com" className={`flex-1 ${FIELD}`} />
                <Button type="submit" disabled={working !== null || !site.trim()}>{working === site.trim() && site.trim() ? 'Bringing…' : 'Bring along'}</Button>
            </form>

            {suggestions.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-13 text-muted-foreground">From your history:</span>
                    {suggestions.map((suggestion) => (
                        <Button key={suggestion} size="xs" variant="outline" disabled={working !== null} aria-label={`Bring along ${suggestion}`} onClick={() => void bring(suggestion)}>{suggestion}</Button>
                    ))}
                </div>
            )}

            {problem && <p role="alert" className="mt-3 text-13 text-warning">{problem}</p>}

            {cloud.logins.length > 0 && (
                <div className="mt-3">
                    <Button variant="outline" disabled={working !== null} onClick={() => void run('all', () => api.forgetLogins())}>Forget all cloud logins</Button>
                </div>
            )}
        </div>
    )
}

const runnerLine = (runner: RunnerState): string => {
    if (runner.status === 'linked') return `Jobs in the cloud run on ${runner.email}, and keep going with your Mac off.`
    if (runner.status === 'waiting') return `Linked to ${runner.email}. Waiting for it to start and accept.`
    return 'Jobs can keep going with your Mac off on a server you run, linked here by the email of its own account.'
}

const LINK = 'rounded-control text-accent-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring'

// The cloud runner, which keeps a job going with this computer off. It's its own account, linked here by email, and it
// only counts once the runner accepts, naming this account back. Its password never comes here.
const Runner: React.FC<{ openAccount: () => void }> = ({ openAccount }) => {
    const [runner, setRunner] = useRunner()
    const [email, setEmail] = useState('')
    const [busy, setBusy] = useState(false)
    const api = window.chromeAPI.cloud
    if (runner.status === 'not-set-up') return null

    const link = async (event: React.FormEvent) => {
        event.preventDefault()
        setBusy(true)
        const state = await api.linkRunner(email)
        setBusy(false)
        setRunner(state)
        if (!state.problem) setEmail('')
    }

    return (
        <div className="py-4 border-b last:border-b-0">
            <h3 id="setting-cloud-runner" className="text-14 font-semibold">With your Mac off</h3>
            {runner.status === 'signed-out' ? (
                <p className="mt-0.5 text-13 text-muted-foreground">
                    Sign in under <button type="button" onClick={openAccount} className={LINK}>Account</button> to keep jobs going with your Mac off.
                </p>
            ) : (
                <p className="mt-0.5 text-13 text-muted-foreground">
                    {runnerLine(runner)}
                    {runner.status === 'none' && <> <More about="setting-cloud-runner" text="That server signs in as a Blueberry account of its own, not yours, and its password never comes here." /></>}
                </p>
            )}
            {(runner.status === 'none' || runner.status === 'waiting') && (
                <form className="mt-3 flex items-center gap-2" onSubmit={(event) => void link(event)}>
                    <input aria-label="Its account’s email" type="email" autoComplete="off" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="cloud@example.com" className={`flex-1 ${FIELD}`} />
                    <Button type="submit" disabled={busy || !email.trim()}>{busy ? 'Linking…' : 'Link'}</Button>
                </form>
            )}
            {(runner.status === 'linked' || runner.status === 'waiting') && (
                <Button className="mt-3" variant="outline" onClick={() => void api.unlinkRunner().then(setRunner)}>Unlink</Button>
            )}
            {runner.problem && <p role="alert" className="mt-2 text-13 text-warning">{runner.problem}</p>}
            {runner.status === 'linked' && runner.relayUrl && <FromOtherApps address={runner.relayUrl} />}
        </div>
    )
}

// The address ChatGPT and Claude connect to, which the server in the cloud gives once it has accepted. Signing in there
// takes this Blueberry account, and nothing else can connect.
const FromOtherApps: React.FC<{ address: string }> = ({ address }) => {
    const { settings, updateSettings } = useShell()
    const [said, setSaid] = useState<string | null>(null)
    const disconnect = async () => {
        setSaid(null)
        setSaid((await window.chromeAPI.cloud.disconnectRelay()) ? 'Disconnected. ChatGPT and Claude have to sign in again.' : 'Couldn’t disconnect. Try again.')
    }
    return (
    <div className="mt-4">
        <div className="flex items-center gap-6">
            <div className="flex-1 min-w-0">
                <h4 id="setting-cloud-relay" className="text-13 font-semibold">From ChatGPT or Claude</h4>
                <p className="mt-0.5 text-13 text-muted-foreground">Give your flock jobs from ChatGPT or Claude on the web or your phone, with your Mac off. <More about="setting-cloud-relay" text="They ask you here or on your phone before anything risky, and ChatGPT and Claude can’t answer for you." /></p>
            </div>
            <CopyLink link={address} label="Copy the address for ChatGPT or Claude" />
        </div>
        <pre aria-labelledby="setting-cloud-relay" className="mt-3 rounded-control bg-tray px-3 py-2.5 text-12 text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">{address}</pre>
        <ol className="mt-2 list-decimal pl-5 text-13 text-muted-foreground">
            <li>In ChatGPT, turn on Settings &gt; Apps &amp; Connectors &gt; Advanced &gt; Developer mode, then create a connector with this address and OAuth. In Claude, add a custom connector with this address.</li>
            <li>Sign in with this Blueberry account when it asks.</li>
        </ol>
        <div className="mt-4 flex items-center gap-6">
            <div className="flex-1 min-w-0">
                <h4 id="setting-cloud-relay-mac" className="text-13 font-semibold">Run their jobs on this Mac when it’s on</h4>
                <p className="mt-0.5 text-13 text-muted-foreground">While Blueberry is open here, a job from ChatGPT or Claude works in your own tabs and sign-ins instead of the cloud. <More about="setting-cloud-relay-mac" text="It asks you here, and they never see the page you’re on." /></p>
            </div>
            <Switch labelledBy="setting-cloud-relay-mac" checked={settings.relayOnMac} onChange={(relayOnMac) => updateSettings({ relayOnMac })} />
        </div>
        <Button className="mt-3" variant="outline" onClick={() => void disconnect()}>Disconnect ChatGPT and Claude</Button>
        {said && <p role="status" className="mt-2 text-13 text-muted-foreground">{said}</p>}
    </div>
    )
}

// Browserbase, for birds that work in a browser in the cloud. Off until a key is saved. The key and project id leave
// this page once and never come back to it.
export const CloudSettings: React.FC<{ openAccount: () => void }> = ({ openAccount }) => {
    const [cloud, setCloud] = useCloud()
    const [apiKey, setApiKey] = useState('')
    const [projectId, setProjectId] = useState('')
    const [busy, setBusy] = useState(false)
    const api = window.chromeAPI.cloud

    const save = async (event: React.FormEvent) => {
        event.preventDefault()
        setBusy(true)
        const state = await api.save(apiKey, projectId)
        setBusy(false)
        setCloud(state)
        if (!state.problem) {
            setApiKey('')
            setProjectId('')
        }
    }

    return (
        <>
            <SettingsRow
                id="setting-cloud"
                title="Work in the cloud"
                description="A bird can do a job in a browser on Browserbase instead of in your tabs here, signed in only to the sites you bring along."
                more="You watch it live in a cloud tab and can take over there, and it asks you before anything risky, the same as here."
            />
            <SettingsRow id="setting-cloud-status" title="Status" description={statusLine(cloud)}>
                {cloud.canEnd && <Button variant="outline" onClick={() => void api.end().then(setCloud)}>End cloud session</Button>}
            </SettingsRow>

            {cloud.provider !== 'local' && !cloud.configured && (
                <div className="py-4 border-b last:border-b-0">
                    <h3 id="setting-cloud-key" className="text-14 font-semibold">Browserbase key</h3>
                    <p className="mt-0.5 text-13 text-muted-foreground">Both are in Settings in your Browserbase dashboard, and stay encrypted on this computer, sent only to Browserbase.</p>
                    <form className="mt-3 flex flex-col gap-2" onSubmit={(event) => void save(event)}>
                        <input aria-label="API key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API key" className={`w-full ${FIELD}`} />
                        <div className="flex items-center gap-2">
                            <input aria-label="Project id" type="password" autoComplete="off" spellCheck={false} value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="Project id" className={`flex-1 ${FIELD}`} />
                            <Button type="submit" disabled={busy || !apiKey.trim() || !projectId.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
                        </div>
                    </form>
                </div>
            )}

            {cloud.provider !== null && <SignedInTo cloud={cloud} />}

            <Runner openAccount={openAccount} />

            {cloud.configured && (
                <SettingsRow id="setting-cloud-forget" title="Browserbase key saved" description="It stays encrypted on this computer, and forgetting it ends the cloud session too.">
                    <Button variant="outline" onClick={() => void api.forget().then(setCloud)}>Forget key</Button>
                </SettingsRow>
            )}

            {cloud.provider === 'local' && (
                <SettingsRow id="setting-cloud-local" title="Local test browser" description="This copy of Blueberry was started with a Chrome on this computer standing in for the cloud, so Browserbase isn’t used." />
            )}

            {cloud.problem && (
                <div className="py-4 flex items-center gap-6">
                    <p role="alert" className="flex-1 min-w-0 text-13 text-warning">{cloud.problem}</p>
                    {cloud.unreleased && <Button variant="outline" onClick={() => void api.end().then(setCloud)}>Try again</Button>}
                </div>
            )}
        </>
    )
}
