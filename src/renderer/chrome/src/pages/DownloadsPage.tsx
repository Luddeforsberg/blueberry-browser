import React from 'react'
import { DownloadRow } from '../components/DownloadRow'
import { useDownloads } from '../components/useDownloads'

export const DownloadsPage: React.FC = () => {
    const downloads = useDownloads()

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10">
                <h1 className="text-20 font-semibold">Downloads</h1>
                <p className="mt-1 text-14 text-muted-foreground">Files you download from the web.</p>
                {downloads.length === 0 ? (
                    <p className="mt-6 rounded-panel border bg-surface px-5 py-4 text-14 text-muted-foreground">Nothing here yet.</p>
                ) : (
                    <ul aria-label="Downloads" className="mt-6 rounded-panel border bg-surface divide-y overflow-hidden">
                        {downloads.map((download) => (
                            <DownloadRow
                                key={download.id}
                                download={download}
                                onAction={(action) => void window.chromeAPI.downloads.act(download.id, action)}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
