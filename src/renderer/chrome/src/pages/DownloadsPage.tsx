import React from 'react'
import { Button } from '@common/components/Button'
import { DownloadRow } from '../components/DownloadRow'
import { useDownloads } from '../components/useDownloads'
import { EmptySheet, PageFrame, PageHeader } from '../components/PageFrame'
import { SettingsGroup } from '../components/SettingsRow'
import { byDay } from './historyDays'

// DESIGN.md section 10, Downloads: a page in a tab, with a group for each day, newest first. Open folder shows the
// folder files are saved to, which main knows, so nothing here names a path.
export const DownloadsPage: React.FC = () => {
    const downloads = useDownloads()

    return (
        <PageFrame>
            <PageHeader title="Downloads" actions={<Button variant="raised" onClick={() => void window.chromeAPI.downloads.openFolder()}>Open folder</Button>}>
                Files you download from the web.
            </PageHeader>
            {downloads.length === 0 ? (
                <EmptySheet>Nothing here yet. Files you download are saved straight to your folder and listed here.</EmptySheet>
            ) : (
                byDay(downloads, (download) => download.startedAt).map((day) => (
                    <SettingsGroup key={day.key} label={day.label}>
                        <ul aria-label={day.label}>
                            {day.items.map((download) => (
                                <DownloadRow key={download.id} download={download} onAction={(action) => void window.chromeAPI.downloads.act(download.id, action)} />
                            ))}
                        </ul>
                    </SettingsGroup>
                ))
            )}
        </PageFrame>
    )
}
