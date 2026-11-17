import React, { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { CloudLogin, CloudState, RunnerState } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Switch } from '@common/components/Controls'
import { CopyLink } from '../components/CopyLink'
import { cn } from '@common/lib/utils'
import { LINE_BETWEEN, ROW } from '../components/PageFrame'
import { SettingsGroup, SettingsRow } from '../components/SettingsRow'
import { openSettings } from '../openSettings'
import { useShell } from '../contexts/ShellContext'
import { useCloud } from '../useCloud'
import { useRunner } from '../useRunner'

const FIELD = 'min-w-0 h-8 rounded-tile border bg-sheet px-3 text-14 outline-none focus-visible:ring-2 focus-visible:ring-focus'

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
    const field = useRef<HTMLInputElement>(null)
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
        <SettingsGroup
            label="signed in to"
            trailing={
                <button type="button" onClick={() => field.current?.focus()} className="h-[22px] -mr-1 px-1.5 flex items-center gap-1 rounded-[7px] font-sans text-13 normal-case text-ink-2 hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    <Plus aria-hidden className="size-[13px]" strokeWidth={1.75} />
                    Add a site
                </button>
            }
        >
            {cloud.logins.length > 0 && (
                <ul aria-label="Sites signed in in the cloud">
                    {cloud.logins.map((login) => (
                        <li key={login.site} className={cn(ROW, LINE_BETWEEN, 'before:left-2 min-h-12 py-[9px] flex items-center gap-3')}>
                            <div className="flex-1 min-w-0">
                                <p className="text-14 truncate">{login.site}</p>
                                <p className={login.status === 'signed-out' ? 'mt-0.5 text-13 text-ask' : 'mt-0.5 text-13 text-ink-2'}>{loginStatus(login)}</p>
                            </div>
                            <Button size="sm" variant="raised" disabled={working !== null} onClick={() => void run(login.site, () => api.checkLogin(login.site))}>Check</Button>
                            <Button size="sm" variant="raised" disabled={working !== null} onClick={() => void run(login.site, () => api.revokeLogin(login.site))}>Remove</Button>
                        </li>
                    ))}
                </ul>
            )}

            <SettingsRow
                id="setting-cloud-logins"
                title={cloud.logins.length > 0 ? 'Another site' : 'Bring a site along'}
                description="Bring your sign-in to a site along, and a mascot in the cloud can use it as you."
                more="Only that site’s cookies are copied, after Touch ID, and they stay in the cloud browser. Nothing else from this browser goes there."
                below={
                    <>
                        <form
                            className="flex items-center gap-2"
                            onSubmit={(event) => {
                                event.preventDefault()
                                if (site.trim()) void bring(site.trim())
                            }}
                        >
                            <input ref={field} aria-label="Site to bring along" spellCheck={false} autoComplete="off" value={site} onChange={(event) => setSite(event.target.value)} placeholder="A site, such as github.com" className={`flex-1 ${FIELD}`} />
                            <Button type="submit" disabled={working !== null || !site.trim()}>{working === site.trim() && site.trim() ? 'Bringing…' : 'Bring along'}</Button>
                        </form>

                        {suggestions.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="text-14 text-ink-2">From your history:</span>
                                {suggestions.map((suggestion) => (
                                    <Button key={suggestion} size="xs" variant="raised" disabled={working !== null} aria-label={`Bring along ${suggestion}`} onClick={() => void bring(suggestion)}>{suggestion}</Button>
                                ))}
                            </div>
                        )}

                        {problem && <p role="alert" className="mt-3 text-14 text-ask">{problem}</p>}
                    </>
                }
            />

            {cloud.logins.length > 0 && (
                <SettingsRow id="setting-cloud-forget-logins" title="Every site above" description="Takes their sign-ins out of the cloud browser.">
                    <Button variant="raised" size="sm" disabled={working !== null} onClick={() => void run('all', () => api.forgetLogins())}>Forget all cloud logins</Button>
                </SettingsRow>
            )}
        </SettingsGroup>
    )
}

const runnerLine = (runner: RunnerState): string => {
    if (runner.status === 'linked') return `Jobs in the cloud run on ${runner.email}, and keep going with your Mac off.`
    if (runner.status === 'waiting') return `Linked to ${runner.email}. Waiting for it to start and accept.`
    return 'Jobs can keep going with your Mac off on a server you run, linked here by the email of its own account.'
}

const LINK = 'rounded-row text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus'

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
        <SettingsGroup label="With this computer off">
            <SettingsRow
                id="setting-cloud-runner"
                title="Runner"
                description={
                    runner.status === 'signed-out' ? (
                        <>Sign in under <button type="button" onClick={openAccount} className={LINK}>Account</button> to keep jobs going with your Mac off.</>
                    ) : (
                        runnerLine(runner)
                    )
                }
                more={runner.status === 'none' ? 'That server signs in as a Blueberry account of its own, not yours, and its password never comes here.' : undefined}
                below={
                    (runner.status === 'none' || runner.status === 'waiting' || runner.problem) && (
                        <>
                            {(runner.status === 'none' || runner.status === 'waiting') && (
                                <form className="flex items-center gap-2" onSubmit={(event) => void link(event)}>
                                    <input aria-label="Its account’s email" type="email" autoComplete="off" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="cloud@example.com" className={`flex-1 ${FIELD}`} />
                                    <Button type="submit" disabled={busy || !email.trim()}>{busy ? 'Linking…' : 'Link'}</Button>
                                </form>
                            )}
                            {runner.problem && <p role="alert" className="mt-2 text-14 text-ask">{runner.problem}</p>}
                        </>
                    )
                }
            >
                {(runner.status === 'linked' || runner.status === 'waiting') && (
                    <Button variant="raised" size="sm" onClick={() => void api.unlinkRunner().then(setRunner)}>Unlink</Button>
                )}
            </SettingsRow>
            {runner.status === 'linked' && runner.relayUrl && <FromOtherApps address={runner.relayUrl} />}
        </SettingsGroup>
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
        <>
            <SettingsRow
                id="setting-cloud-relay"
                title="From ChatGPT or Claude"
                description="Give your mascots jobs from ChatGPT or Claude on the web or your phone, with your Mac off."
                more="They ask you here or on your phone before anything risky, and ChatGPT and Claude can’t answer for you."
                below={
                    <>
                        <pre aria-labelledby="setting-cloud-relay" className="rounded-row bg-sheet-2 px-3 py-2.5 text-13 text-ink-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{address}</pre>
                        <ol className="mt-2 list-decimal pl-5 text-14 text-ink-2">
                            <li>In ChatGPT, turn on Settings &gt; Apps &amp; Connectors &gt; Advanced &gt; Developer mode, then create a connector with this address and OAuth. In Claude, add a custom connector with this address.</li>
                            <li>Sign in with this Blueberry account when it asks.</li>
                        </ol>
                        <Button className="mt-3" variant="raised" size="sm" onClick={() => void disconnect()}>Disconnect ChatGPT and Claude</Button>
                        {said && <p role="status" className="mt-2 text-14 text-ink-2">{said}</p>}
                    </>
                }
            >
                <CopyLink link={address} label="Copy the address for ChatGPT or Claude" />
            </SettingsRow>
            <SettingsRow
                id="setting-cloud-relay-mac"
                title="Run their jobs on this Mac when it’s on"
                description="While Blueberry is open here, a job from ChatGPT or Claude works in your own tabs and sign-ins instead of the cloud."
                more="It asks you here, and they never see the page you’re on."
            >
                <Switch labelledBy="setting-cloud-relay-mac" checked={settings.relayOnMac} onChange={(relayOnMac) => updateSettings({ relayOnMac })} />
            </SettingsRow>
        </>
    )
}

// Settings > Connections > Cloud: Browserbase, for mascots that work in a browser in the cloud. Off until a key is
// saved. The key and project id leave this page once and never come back to it.
export const CloudSettings: React.FC = () => {
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
            <SettingsGroup label="Browserbase">
                {cloud.provider === 'local' && (
                    <SettingsRow id="setting-cloud-local" title="Local test browser" description="This copy of Blueberry was started with a Chrome on this computer standing in for the cloud, so Browserbase isn’t used." />
                )}

                {cloud.provider !== 'local' && !cloud.configured && (
                    <SettingsRow
                        id="setting-cloud-key"
                        title="Key"
                        description="Both are in Settings in your Browserbase dashboard, and stay encrypted on this computer, sent only to Browserbase."
                        below={
                            <form className="flex flex-col gap-2" onSubmit={(event) => void save(event)}>
                                <input aria-label="API key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API key" className={`w-full ${FIELD}`} />
                                <div className="flex items-center gap-2">
                                    <input aria-label="Project id" type="password" autoComplete="off" spellCheck={false} value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="Project id" className={`flex-1 ${FIELD}`} />
                                    <Button type="submit" disabled={busy || !apiKey.trim() || !projectId.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
                                </div>
                            </form>
                        }
                    />
                )}

                {cloud.configured && (
                    <SettingsRow id="setting-cloud-forget" title="Key" description="Saved, encrypted on this computer. Forgetting it ends the cloud session too.">
                        <Button variant="raised" size="sm" onClick={() => void api.forget().then(setCloud)}>Forget key</Button>
                    </SettingsRow>
                )}

                <SettingsRow id="setting-cloud-status" title="Session" description={statusLine(cloud)}>
                    {cloud.canEnd && <Button variant="raised" size="sm" onClick={() => void api.end().then(setCloud)}>End cloud session</Button>}
                </SettingsRow>

                {cloud.problem && (
                    <SettingsRow id="setting-cloud-problem" title={<span role="alert" className="text-ask">{cloud.problem}</span>}>
                        {cloud.unreleased && <Button variant="raised" size="sm" onClick={() => void api.end().then(setCloud)}>Try again</Button>}
                    </SettingsRow>
                )}
            </SettingsGroup>

            {cloud.provider !== null && <SignedInTo cloud={cloud} />}

            <Runner openAccount={() => openSettings('account')} />
        </>
    )
}
