import type { DownloadInfo } from '@shared/ipc'

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export const formatBytes = (bytes: number): string => {
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < UNITS.length - 1) {
        value /= 1024
        unit += 1
    }
    return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`
}

// Still running or able to carry on, as opposed to finished for good.
export const isActive = (download: DownloadInfo): boolean =>
    download.state === 'progressing' || download.state === 'paused' || download.canResume

// Null when the server didn't give a size.
export const fractionDone = (received: number, total: number): number | null =>
    total > 0 ? Math.min(received / total, 1) : null

const progressText = ({ receivedBytes, totalBytes }: DownloadInfo): string =>
    totalBytes > 0 ? `${formatBytes(receivedBytes)} of ${formatBytes(totalBytes)}` : `${formatBytes(receivedBytes)} so far`

// Status colours always come with words, so colour is never the only signal.
export const downloadStatus = (download: DownloadInfo): { text: string; className: string } => {
    if (download.missing) return { text: 'File is missing', className: 'text-warning' }
    switch (download.state) {
        case 'progressing':
            return { text: download.path ? progressText(download) : 'Choosing where to save', className: 'text-muted-foreground' }
        case 'paused':
            return { text: `Paused, ${progressText(download)}`, className: 'text-muted-foreground' }
        case 'completed':
            return { text: formatBytes(download.receivedBytes), className: 'text-muted-foreground' }
        case 'cancelled':
            return { text: 'Cancelled', className: 'text-muted-foreground' }
        case 'interrupted':
            return {
                text: download.canResume ? `Stopped, ${progressText(download)}` : 'Didn’t finish',
                className: 'text-destructive'
            }
    }
}
