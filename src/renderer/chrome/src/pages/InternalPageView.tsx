import React from 'react'
import type { TabInfo } from '@shared/ipc'
import { NewTabPage } from './NewTabPage'
import { ChatPage } from './ChatPage'
import { RoutinesPage } from './RoutinesPage'
import { SettingsPage } from './SettingsPage'

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
        default:
            return null
    }
}
