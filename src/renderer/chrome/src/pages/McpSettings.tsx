import React, { useEffect, useRef, useState } from 'react'
import type { McpActivity, McpSnippet, McpState } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Switch } from '@common/components/Controls'
import { SettingsGroup, SettingsRow } from '../components/SettingsRow'

const OFF: McpState = { on: false, url: null, problem: null, snippets: [], activity: [] }
const SAID_FOR_MS = 1500

export const useMcp = () => {
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
        <SettingsRow
            id={id}
            title={snippet.app}
            description={snippet.where}
            below={<pre aria-labelledby={id} className="max-h-32 overflow-auto rounded-row bg-sheet-2 px-3 py-2.5 text-13 text-ink-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{snippet.text}</pre>}
        >
            <Button variant="raised" size="sm" aria-describedby={id} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
        </SettingsRow>
    )
}

const ActivityRow: React.FC<{ entry: McpActivity }> = ({ entry }) => (
    <li className="flex items-baseline gap-3 py-2 border-t first:border-t-0 text-14">
        <span className="shrink-0 w-12 tabular-nums text-ink-2">{timeOf(entry.at)}</span>
        <span className="shrink-0 w-28 truncate text-ink-2">{entry.client}</span>
        <span className="min-w-0 flex-1 truncate">
            <span className={entry.failed ? 'text-ask' : undefined}>{entry.tool.replace(/_/g, ' ')}</span>
            <span className="text-ink-2"> · {entry.summary}</span>
        </span>
    </li>
)

// Settings > Connections > Claude and other apps: Claude Code and Claude Desktop on this computer, over MCP. Off until
// it's turned on here.
export const McpSettings: React.FC = () => {
    const [mcp, setMcp] = useMcp()
    const api = window.chromeAPI.mcp

    return (
        <>
            <SettingsGroup>
                <SettingsRow
                    id="setting-mcp"
                    title="Use Blueberry from Claude"
                    description="They run here, signed in as you, within each mascot’s limits, and ask you before anything risky, the same as a job you start. Claude can’t allow anything for you."
                >
                    <Switch labelledBy="setting-mcp" checked={mcp.on} onChange={(on) => void api.setOn(on).then(setMcp)} />
                </SettingsRow>
                <SettingsRow
                    id="setting-mcp-reads"
                    title="What Claude can see"
                    description="Your open tabs, pages you ask about, your history, bookmarks and what your mascots remember."
                    more="It never gets passwords, codes you entered, cookies or recordings, and it can’t change your settings or memory."
                />
                {mcp.problem && <SettingsRow id="setting-mcp-problem" title={<span role="alert" className="text-ask">{mcp.problem}</span>} />}
            </SettingsGroup>

            {mcp.on && mcp.url && (
                <>
                    <SettingsGroup label="Set up an app">
                        {mcp.snippets.map((snippet) => <Snippet key={snippet.app} snippet={snippet} />)}
                        <SettingsRow id="setting-mcp-revoke" title="Revoke access" description="Makes a new key, so every app you set up has to be set up again with a fresh copy.">
                            <Button variant="raised" size="sm" onClick={() => void api.revoke().then(setMcp)}>Revoke</Button>
                        </SettingsRow>
                    </SettingsGroup>
                    <SettingsGroup label="Recent calls">
                        <SettingsRow
                            id="setting-mcp-activity"
                            title="Since Blueberry opened, newest first"
                            description="Nothing here is saved."
                            below={
                                mcp.activity.length > 0 ? (
                                    <ul aria-labelledby="setting-mcp-activity">
                                        {mcp.activity.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
                                    </ul>
                                ) : (
                                    <p className="text-14 text-ink-2">No calls yet.</p>
                                )
                            }
                        />
                    </SettingsGroup>
                </>
            )}
        </>
    )
}
