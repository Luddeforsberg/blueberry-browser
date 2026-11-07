import React from 'react'
import type { TabInfo } from '@shared/ipc'
import { NewTabPage } from './NewTabPage'
import { ChatPage } from './ChatPage'
import { NestPage } from './NestPage'
import { RoutinesPage } from './RoutinesPage'
import { SettingsPage } from './SettingsPage'
import { GalleryPage } from './GalleryPage'
import { DownloadsPage } from './DownloadsPage'
import { HistoryPage } from './HistoryPage'
import { FlockPage } from './FlockPage'
import { MascotGalleryPage } from './MascotGalleryPage'
import { NeedsYouPage } from './NeedsYouPage'
import { RecordingPage } from './RecordingPage'
import { CloudPage } from './CloudPage'

export const InternalPageView: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    switch (tab.page) {
        case 'new-tab':
            return <NewTabPage key={tab.id} tab={tab} />
        case 'chat':
            return <ChatPage key={tab.id} tab={tab} />
        case 'nest':
            return <NestPage key={tab.id} tab={tab} />
        case 'routines':
            return <RoutinesPage />
        case 'settings':
            return <SettingsPage tab={tab} />
        case 'downloads':
            return <DownloadsPage />
        case 'gallery':
            return <GalleryPage />
        case 'history':
            return <HistoryPage />
        case 'flock':
            return <FlockPage tabId={tab.id} />
        case 'mascot-gallery':
            return <MascotGalleryPage tab={tab} />
        case 'needs-you':
            return <NeedsYouPage tab={tab} />
        case 'recording':
            return <RecordingPage tab={tab} />
        case 'cloud':
            return <CloudPage key={tab.id} tab={tab} />
        default:
            return null
    }
}
