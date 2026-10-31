import { useEffect, useState } from 'react'
import type { DownloadInfo } from '@shared/ipc'

// Main pushes every change. Coming back to the window checks again, since files can go while it's away.
export const useDownloads = (): DownloadInfo[] => {
    const [downloads, setDownloads] = useState<DownloadInfo[]>([])

    useEffect(() => {
        const load = () => void window.chromeAPI.downloads.list().then(setDownloads)
        load()
        window.addEventListener('focus', load)
        const off = window.chromeAPI.downloads.onUpdated(setDownloads)
        return () => {
            window.removeEventListener('focus', load)
            off()
        }
    }, [])

    return downloads
}
