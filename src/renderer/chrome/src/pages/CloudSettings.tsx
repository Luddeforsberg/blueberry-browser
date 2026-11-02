import React, { useState } from 'react'
import type { CloudState } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { SettingsRow } from '../components/SettingsRow'
import { useCloud } from '../useCloud'

const FIELD = 'min-w-0 h-8 rounded-card border bg-canvas px-3 text-13 outline-none focus-visible:ring-2 focus-visible:ring-ring'

const statusLine = (cloud: CloudState): string => {
    const where = cloud.provider === 'local' ? 'The local test browser' : 'The cloud browser'
    if (cloud.status === 'off') return 'Off. Add a Browserbase key to turn it on.'
    if (cloud.status === 'starting') return `${where} is starting.`
    if (cloud.status === 'running') return cloud.busy ? `${where} is running, with a job in it.` : `${where} is running, with nothing in it right now.`
    if (cloud.status === 'ended') return `${where} has ended. The next job starts it again.`
    return `${where} starts with the first job that needs it.`
}

// Browserbase, for birds that work in a browser in the cloud. Off until a key is saved. The key and project id leave
// this page once and never come back to it.
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
            <SettingsRow
                id="setting-cloud"
                title="Work in the cloud"
                description="A bird can do a job in a browser on Browserbase instead of in your tabs here. You watch it live in a cloud tab and can take over there, and it asks you before anything risky, the same as here. That browser isn’t signed in to anything yet."
            />
            <SettingsRow id="setting-cloud-status" title="Status" description={statusLine(cloud)}>
                <Button variant="outline" disabled={!cloud.canEnd} onClick={() => void api.end().then(setCloud)}>End cloud session</Button>
            </SettingsRow>

            {cloud.provider !== 'local' && !cloud.configured && (
                <div className="py-4 border-b last:border-b-0">
                    <h3 id="setting-cloud-key" className="text-14 font-semibold">Browserbase key</h3>
                    <p className="mt-0.5 text-13 text-muted-foreground">From Settings in your Browserbase dashboard. Both are kept encrypted on this computer and only go to Browserbase.</p>
                    <form className="mt-3 flex flex-col gap-2" onSubmit={(event) => void save(event)}>
                        <input aria-label="API key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API key" className={`w-full ${FIELD}`} />
                        <div className="flex items-center gap-2">
                            <input aria-label="Project id" type="password" autoComplete="off" spellCheck={false} value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="Project id" className={`flex-1 ${FIELD}`} />
                            <Button type="submit" disabled={busy || !apiKey.trim() || !projectId.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
                        </div>
                    </form>
                </div>
            )}

            {cloud.configured && (
                <SettingsRow id="setting-cloud-forget" title="Browserbase key saved" description="It stays on this computer, encrypted. Forgetting it ends the cloud session too.">
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
