import React from 'react'
import { Download } from 'lucide-react'
import type { DownloadInfo } from '@shared/ipc'
import { fractionDone, isActive } from './downloadStatus'
import { ToolBarButton } from './ToolBarButton'
import { useDownloads } from './useDownloads'

const percent = (download: DownloadInfo): string => {
    const fraction = fractionDone(download.receivedBytes, download.totalBytes)
    return fraction === null ? '' : ` ${Math.round(fraction * 100)}%`
}

// The ring is all active downloads together. With no sizes known it stays full, because it can't say how far.
export const DownloadsProgress: React.FC<{ downloads: DownloadInfo[]; onClick?: () => void }> = ({ downloads, onClick }) => {
    const active = downloads.filter(isActive)
    const fraction = fractionDone(
        active.reduce((sum, download) => sum + download.receivedBytes, 0),
        active.reduce((sum, download) => sum + download.totalBytes, 0)
    )
    const label = active.length > 0
        ? `Downloads: ${active.map((download) => `${download.filename}${percent(download)}`).join(', ')}`
        : 'Downloads'

    return (
        <ToolBarButton label={label} onClick={onClick} className="relative">
            <Download className={active.length > 0 ? 'size-3' : 'size-4'} aria-hidden />
            {active.length > 0 && (
                <svg viewBox="0 0 24 24" className="absolute inset-1 size-6 -rotate-90" aria-hidden>
                    <circle cx="12" cy="12" r="10.5" fill="none" strokeWidth="2" className="stroke-border" />
                    <circle
                        cx="12"
                        cy="12"
                        r="10.5"
                        fill="none"
                        strokeWidth="2"
                        pathLength={1}
                        strokeDasharray={`${fraction ?? 1} 1`}
                        strokeLinecap="round"
                        className="stroke-accent-ink transition-[stroke-dasharray] duration-layout"
                    />
                </svg>
            )}
        </ToolBarButton>
    )
}

export const DownloadsButton: React.FC = () => {
    const downloads = useDownloads()
    return <DownloadsProgress downloads={downloads} onClick={() => void window.chromeAPI.browser.openPage('downloads')} />
}
