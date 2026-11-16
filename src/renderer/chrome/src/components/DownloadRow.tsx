import React from 'react'
import { File } from 'lucide-react'
import type { DownloadAction, DownloadInfo } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { downloadStatus, fileEnding, fractionDone, isActive, timeLeft } from './downloadStatus'
import { BETWEEN } from './SettingsRow'

// DESIGN.md section 10, Downloads: the kind of file on its tile, its name, and one line with its size, the site it came
// from, and while it runs how much has arrived and how long is left. What can be done shows on the row you're on, and
// pressing a finished one opens it.
export const DownloadRow: React.FC<{
    download: DownloadInfo
    onAction: (action: DownloadAction) => void
}> = ({ download, onAction }) => {
    const status = downloadStatus(download)
    const active = isActive(download)
    const openable = download.state === 'completed' && !download.missing
    const fraction = fractionDone(download.receivedBytes, download.totalBytes)
    const ending = fileEnding(download.filename)
    const left = timeLeft(download)
    const act = (action: DownloadAction) => () => onAction(action)

    return (
        <li aria-label={download.filename} className={cn(BETWEEN, 'group before:left-[59px] relative min-h-[60px] py-[13px] pl-3.5 pr-3.5 flex items-center gap-[13px] transition-colors first:rounded-t-sheet last:rounded-b-sheet', openable && 'hover:bg-hover has-[>button:first-child:active]:bg-press')}>
            {openable && (
                <button
                    type="button"
                    aria-label={`Open ${download.filename}`}
                    onClick={act('open')}
                    className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                />
            )}
            <span aria-hidden className="size-8 shrink-0 grid place-items-center rounded-[10px] bg-sheet-2 shadow-[inset_0_0_0_1px_var(--line)] text-ink-2 pointer-events-none">
                {ending ? <span className="font-mono text-[10px] leading-none">{ending}</span> : <File className="size-4" strokeWidth={1.75} />}
            </span>
            <span className="flex-1 min-w-0 pointer-events-none">
                <span className={cn('block truncate text-14 font-medium', openable || active ? 'text-ink' : 'text-ink-2')} title={download.filename}>
                    {download.filename}
                </span>
                <span className="block mt-0.5 truncate text-13 tabular-nums">
                    <span className={status.className}>{status.text}</span>
                    {left && <span className="text-ink-2"> · {left}</span>}
                    {download.source && <span className="text-ink-2"> · {download.source}</span>}
                </span>
                {active && fraction !== null && (
                    <span
                        role="progressbar"
                        aria-label={`Progress of ${download.filename}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(fraction * 100)}
                        className="block mt-[7px] h-[3px] rounded-full bg-sheet-2 overflow-hidden"
                    >
                        <span className="block h-full rounded-full bg-ink transition-[width] duration-panel" style={{ width: `${fraction * 100}%` }} />
                    </span>
                )}
            </span>
            {/* Takes no room until it shows, so the name and the bar use the whole row at rest. Still reachable by keyboard. */}
            <span className="relative shrink-0 max-w-0 -ml-[13px] flex items-center gap-1.5 overflow-hidden opacity-0 transition-opacity group-hover:max-w-none group-hover:ml-0 group-hover:overflow-visible group-hover:opacity-100 group-focus-within:max-w-none group-focus-within:ml-0 group-focus-within:overflow-visible group-focus-within:opacity-100">
                {download.state === 'progressing' && download.path && (
                    <Button size="sm" variant="raised" aria-label={`Pause ${download.filename}`} onClick={act('pause')}>Pause</Button>
                )}
                {(download.state === 'paused' || download.canResume) && (
                    <Button size="sm" variant="raised" aria-label={`Resume ${download.filename}`} onClick={act('resume')}>Resume</Button>
                )}
                {active && <Button size="sm" variant="raised" aria-label={`Cancel ${download.filename}`} onClick={act('cancel')}>Cancel</Button>}
                {openable && (
                    <>
                        <Button size="sm" variant="raised" onClick={act('open')}>Open</Button>
                        <Button size="sm" variant="raised" aria-label={`Show ${download.filename} in folder`} onClick={act('show')}>Show in folder</Button>
                    </>
                )}
                {!active && <Button size="sm" variant="raised" aria-label={`Remove ${download.filename} from the list`} onClick={act('remove')}>Remove</Button>}
            </span>
        </li>
    )
}
