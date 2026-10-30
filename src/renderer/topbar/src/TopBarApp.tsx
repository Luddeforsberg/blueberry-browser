import React from 'react'
import { BrowserProvider } from './contexts/BrowserContext'
import { TabBar } from './components/TabBar'
import { AddressBar } from './components/AddressBar'

export const TopBarApp: React.FC = () => {
    return (
        <BrowserProvider>
            <div className="flex flex-col bg-background select-none">
                {/* Tab Bar */}
                <div className="w-full h-10 pr-2 flex items-center app-region-drag">
                    <TabBar />
                </div>

                {/* Toolbar */}
                <div className="flex items-center px-2 py-1 gap-2 app-region-drag">
                    <AddressBar />
                </div>
            </div>
        </BrowserProvider>
    )
}

