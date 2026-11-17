import React, { useEffect, useState } from 'react'
import type { HistoryImportResult, ImportSource } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Choice } from '@common/components/Controls'
import { More, SettingsGroup, SettingsRow } from './SettingsRow'

// What happens, in the one place both screens say it. The detail has to match `buildDigest` in suggestionDigest.ts.
export const IMPORT_NOTES = [
    'Only addresses, page titles and visit times from the last 90 days come across, from every profile, never passwords or cookies.',
    'It stays on this computer, apart from a summary Suggestions sends to the AI service.',
]
export const IMPORT_DETAIL = 'That summary covers the last two weeks: site names and page titles in the order you visited them, what you searched for, and your chat and routine titles. Never page text or full addresses. Local addresses, and sites it recognises as banks or mail, are left out. You can turn Suggestions off in Settings.'

export const useHistoryImport = () => {
    const [sources, setSources] = useState<ImportSource[] | null>(null)
    const [chosenId, setChosenId] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [outcome, setOutcome] = useState<{ result: HistoryImportResult; name: string } | null>(null)
    const source = sources?.find(({ id }) => id === chosenId) ?? sources?.[0] ?? null

    useEffect(() => {
        void window.chromeAPI.browser.importSources().then(setSources)
    }, [])

    const choose = (id: string) => {
        setChosenId(id)
        setOutcome(null)
    }

    const bringIn = async () => {
        if (!source || busy) return
        setBusy(true)
        const result = await window.chromeAPI.browser.importHistory(source.id).catch((): HistoryImportResult => ({ ok: false }))
        setOutcome({ result, name: source.name })
        setBusy(false)
    }

    const message = !outcome
        ? null
        : !outcome.result.ok
          ? `I couldn’t read ${outcome.name}’s history. Close ${outcome.name} and try again.`
          : outcome.result.added === 0
            ? `Nothing new came across from ${outcome.name}.`
            : `${outcome.result.added.toLocaleString()} ${outcome.result.added === 1 ? 'visit came' : 'visits came'} across from ${outcome.name}.`

    return { sources, source, choose, busy, bringIn, message, done: outcome?.result.ok ?? false }
}

export const SourceChoice: React.FC<{ sources: ImportSource[]; source: ImportSource; choose: (id: string) => void }> = ({ sources, source, choose }) =>
    sources.length > 1 ? (
        <Choice<string>
            label="Browser to bring history from"
            value={source.id}
            onChange={choose}
            options={sources.map(({ id, name }) => ({ value: id, label: name }))}
        />
    ) : null

// Settings > Privacy > Bring in history. Privacy only leads here when there's a browser to bring from.
export const BringInHistory: React.FC = () => {
    const { sources, source, choose, busy, bringIn, message } = useHistoryImport()
    return (
        <>
            <p className="mt-1 max-w-[520px] text-14 leading-[1.45] text-ink-2">
                {IMPORT_NOTES.join(' ')} <More text={IMPORT_DETAIL} />
            </p>
            {sources && source ? (
                <SettingsGroup>
                    {sources.length > 1 && (
                        <SettingsRow id="setting-import-from" title="Browser">
                            <SourceChoice sources={sources} source={source} choose={choose} />
                        </SettingsRow>
                    )}
                    <SettingsRow id="setting-import" title="Your history there" description={message ? <span role="status">{message}</span> : undefined}>
                        <Button variant="raised" size="sm" disabled={busy} onClick={() => void bringIn()}>
                            {busy ? 'Bringing it in…' : `From ${source.name}`}
                        </Button>
                    </SettingsRow>
                </SettingsGroup>
            ) : (
                sources && (
                    <SettingsGroup>
                        <SettingsRow id="setting-import" title="No other browser found" description="Blueberry can bring history in from Chromium browsers on this computer." />
                    </SettingsGroup>
                )
            )}
        </>
    )
}
