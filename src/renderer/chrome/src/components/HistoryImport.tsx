import React, { useEffect, useState } from 'react'
import type { HistoryImportResult, ImportSource } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Choice } from '@common/components/Controls'

// What happens, in the one place both screens say it. The last line has to match `buildDigest` in suggestionDigest.ts.
export const IMPORT_NOTES = [
    'Only history comes across: addresses, page titles and visit times from the last 90 days, from every profile. Not passwords or cookies.',
    'It stays on this computer.',
    'To decide what to suggest, a summary of the last two weeks goes to the AI service: site names and page titles in the order you visited them, what you searched for, and your chat and routine titles. Never page text or full addresses. Local addresses, and sites it recognises as banks or mail, are left out. You can turn Suggestions off in Settings.'
]

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
            : `Brought in ${outcome.result.added.toLocaleString()} ${outcome.result.added === 1 ? 'visit' : 'visits'} from ${outcome.name}.`

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

// Hidden with no browser to bring from, so it never offers something it can't do.
export const HistoryImportSettings: React.FC = () => {
    const { sources, source, choose, busy, bringIn, message } = useHistoryImport()
    if (!sources || !source) return null
    return (
        <div className="py-4 border-b">
            <div className="flex items-center gap-6">
                <div className="flex-1 min-w-0">
                    <h3 className="text-14 font-semibold">Bring in history</h3>
                    <p className="mt-0.5 text-13 text-muted-foreground">{IMPORT_NOTES.join(' ')}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <SourceChoice sources={sources} source={source} choose={choose} />
                    <Button variant="outline" disabled={busy} onClick={() => void bringIn()}>
                        {busy ? 'Bringing it in…' : `From ${source.name}`}
                    </Button>
                </div>
            </div>
            {message && <p role="status" className="mt-2 text-13">{message}</p>}
        </div>
    )
}
