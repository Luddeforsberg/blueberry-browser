import React from 'react'
import type { TabInfo } from '@shared/ipc'
import { NewTabPage } from './NewTabPage'
import { ChatPage } from './ChatPage'
import { RoutinesPage } from './RoutinesPage'
import { SettingsPage } from './SettingsPage'
import { GalleryPage } from './GalleryPage'
import { DownloadsPage } from './DownloadsPage'
import { HistoryPage } from './HistoryPage'

export const InternalPageView: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    switch (tab.page) {
        case 'new-tab':
            return <NewTabPage key={tab.id} tab={tab} />
        case 'chat':
            return <ChatPage key={tab.id} tab={tab} />
        case 'routines':
            return <RoutinesPage />
        case 'settings':
            return <SettingsPage />
        case 'downloads':
            return <DownloadsPage />
        case 'gallery':
            return <GalleryPage />
        case 'history':
            return <HistoryPage />
        default:
            return null
    }
}
