import React from 'react'
import { File, FolderOpen, Pause, Play, X } from 'lucide-react'
import type { DownloadAction, DownloadInfo } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { downloadStatus, fractionDone, isActive } from './downloadStatus'
import { ToolBarButton } from './ToolBarButton'

export const DownloadRow: React.FC<{
    download: DownloadInfo
    onAction: (action: DownloadAction) => void
}> = ({ download, onAction }) => {
    const status = downloadStatus(download)
    const active = isActive(download)
    const openable = download.state === 'completed' && !download.missing
    const fraction = fractionDone(download.receivedBytes, download.totalBytes)

    return (
        <li aria-label={download.filename} className="min-h-14 px-5 py-3 flex items-center gap-3">
            <File className="size-4 shrink-0 text-ink-2" aria-hidden strokeWidth={1.75} />
            <div className="flex-1 min-w-0">
                <div className={cn("text-14 truncate", !openable && !active && "text-ink-2")} title={download.filename}>
                    {download.filename}
                </div>
                {active && fraction !== null && (
                    <div
                        role="progressbar"
                        aria-label={`Progress of ${download.filename}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(fraction * 100)}
                        className="mt-1 h-1 rounded-full bg-sheet-2 overflow-hidden"
                    >
                        <div className="h-full bg-ink transition-[width] duration-panel" style={{ width: `${fraction * 100}%` }} />
                    </div>
                )}
                <div className="mt-0.5 text-13 truncate tabular-nums">
                    <span className={status.className}>{status.text}</span>
                    {download.source && <span className="text-ink-2"> · {download.source}</span>}
                </div>
            </div>
            <div className="shrink-0 flex items-center gap-1">
                {download.state === 'progressing' && download.path && (
                    <ToolBarButton Icon={Pause} label={`Pause ${download.filename}`} onClick={() => onAction('pause')} />
                )}
                {(download.state === 'paused' || download.canResume) && (
                    <ToolBarButton Icon={Play} label={`Resume ${download.filename}`} onClick={() => onAction('resume')} />
                )}
                {openable && (
                    <>
                        <Button size="sm" variant="raised" onClick={() => onAction('open')}>Open</Button>
                        <ToolBarButton Icon={FolderOpen} label={`Show ${download.filename} in folder`} onClick={() => onAction('show')} />
                    </>
                )}
                <ToolBarButton
                    Icon={X}
                    label={active ? `Cancel ${download.filename}` : `Remove ${download.filename} from the list`}
                    onClick={() => onAction(active ? 'cancel' : 'remove')}
                />
            </div>
        </li>
    )
}
