import React, { useEffect, useRef, useState } from 'react'
import type { McpActivity, McpSnippet, McpState } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Switch } from '@common/components/Controls'
import { SettingsRow } from '../components/SettingsRow'

const OFF: McpState = { on: false, url: null, problem: null, snippets: [], activity: [] }
const SAID_FOR_MS = 1500

const useMcp = () => {
    const [state, setState] = useState(OFF)
    useEffect(() => {
        void window.chromeAPI.mcp.state().then(setState)
        return window.chromeAPI.mcp.onUpdated(setState)
    }, [])
    return [state, setState] as const
}

const timeOf = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

// The snippet shows the key hidden. Copying puts the real one on the clipboard from main, so it never reaches this page.
const Snippet: React.FC<{ snippet: McpSnippet }> = ({ snippet }) => {
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    const id = `setting-mcp-${snippet.app.toLowerCase().replace(/\W+/g, '-')}`
    const copy = async () => {
        if (!(await window.chromeAPI.mcp.copy(snippet.app))) return
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), SAID_FOR_MS)
    }
    return (
        <div className="py-4 border-b">
            <div className="flex items-center gap-6">
                <div className="flex-1 min-w-0">
                    <h3 id={id} className="text-14 font-semibold">{snippet.app}</h3>
                    <p className="mt-0.5 text-13 text-muted-foreground">{snippet.where}</p>
                </div>
                <Button variant="outline" size="sm" aria-describedby={id} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
            </div>
            <pre aria-labelledby={id} className="mt-3 max-h-32 overflow-auto rounded-control bg-tray px-3 py-2.5 text-12 text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">{snippet.text}</pre>
        </div>
    )
}

const ActivityRow: React.FC<{ entry: McpActivity }> = ({ entry }) => (
    <li className="flex items-baseline gap-3 py-2 border-b last:border-b-0 text-13">
        <span className="shrink-0 w-12 tabular-nums text-muted-foreground">{timeOf(entry.at)}</span>
        <span className="shrink-0 w-28 truncate text-muted-foreground">{entry.client}</span>
        <span className="min-w-0 flex-1 truncate">
            <span className={entry.failed ? 'text-warning' : undefined}>{entry.tool.replace(/_/g, ' ')}</span>
            <span className="text-muted-foreground"> · {entry.summary}</span>
        </span>
    </li>
)

// Claude Code and Claude Desktop on this computer, over MCP. Off until it's turned on here.
export const McpSettings: React.FC = () => {
    const [mcp, setMcp] = useMcp()
    const api = window.chromeAPI.mcp

    return (
        <>
            <SettingsRow
                id="setting-mcp"
                title="Use Blueberry from Claude"
                description="Claude Code and Claude Desktop on this computer can give your birds jobs."
                more="They run here, signed in as you, within each bird’s limits, and ask you before anything risky, the same as a job you start. Claude can’t allow anything for you."
            >
                <Switch labelledBy="setting-mcp" checked={mcp.on} onChange={(on) => void api.setOn(on).then(setMcp)} />
            </SettingsRow>
            <SettingsRow
                id="setting-mcp-reads"
                title="What Claude can see"
                description="Your open tabs, pages you ask about, your history, bookmarks and what your birds remember."
                more="It never gets passwords, codes you entered, cookies or recordings, and it can’t change your settings or memory."
            />

            {mcp.problem && (
                <div className="py-4 border-b">
                    <p role="alert" className="text-13 text-warning">{mcp.problem}</p>
                </div>
            )}

            {mcp.on && mcp.url && (
                <>
                    {mcp.snippets.map((snippet) => <Snippet key={snippet.app} snippet={snippet} />)}
                    <SettingsRow id="setting-mcp-revoke" title="Revoke access" description="Makes a new key, so every app you set up has to be set up again with a fresh copy.">
                        <Button variant="outline" onClick={() => void api.revoke().then(setMcp)}>Revoke</Button>
                    </SettingsRow>
                    <div className="py-4">
                        <h3 id="setting-mcp-activity" className="text-14 font-semibold">Recent calls</h3>
                        <p className="mt-0.5 text-13 text-muted-foreground">Since Blueberry opened, newest first. Nothing here is saved.</p>
                        {mcp.activity.length > 0 ? (
                            <ul aria-labelledby="setting-mcp-activity" className="mt-2">
                                {mcp.activity.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
                            </ul>
                        ) : (
                            <p className="mt-3 text-13 text-muted-foreground">No calls yet.</p>
                        )}
                    </div>
                </>
            )}
        </>
    )
}
