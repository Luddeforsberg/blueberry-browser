import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { TabInfo } from '@shared/ipc'

interface BrowserContextType {
    tabs: TabInfo[]
    activeTab: TabInfo | null

    // Tab management
    createTab: (url?: string) => Promise<void>
    closeTab: (tabId: string) => Promise<void>
    switchTab: (tabId: string) => Promise<void>
    moveTab: (tabId: string, toIndex: number) => Promise<void>

    // Navigation
    navigateToUrl: (url: string) => Promise<void>
    goBack: () => Promise<void>
    goForward: () => Promise<void>
    reload: () => Promise<void>
    stop: () => Promise<void>
}

const BrowserContext = createContext<BrowserContextType | null>(null)

export const useBrowser = () => {
    const context = useContext(BrowserContext)
    if (!context) {
        throw new Error('useBrowser must be used within a BrowserProvider')
    }
    return context
}

const browser = () => window.chromeAPI.browser

export const BrowserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [tabs, setTabs] = useState<TabInfo[]>([])

    const activeTab = tabs.find(tab => tab.isActive) || null

    // Main pushes every change, so the list only needs fetching once.
    useEffect(() => {
        browser().getTabs().then(setTabs).catch((error) => console.error('Failed to load tabs:', error))
        return browser().onTabsUpdated(setTabs)
    }, [])

    const run = useCallback(async (label: string, action: () => Promise<unknown>) => {
        try {
            await action()
        } catch (error) {
            console.error(`Failed to ${label}:`, error)
        }
    }, [])

    const createTab = useCallback(
        (url?: string) => run('create tab', () => browser().createTab(url)),
        [run]
    )
    const closeTab = useCallback(
        (tabId: string) => run('close tab', () => browser().closeTab(tabId)),
        [run]
    )
    const switchTab = useCallback(
        (tabId: string) => run('switch tab', () => browser().switchTab(tabId)),
        [run]
    )

    const moveTab = useCallback(
        (tabId: string, toIndex: number) => run('move tab', () => browser().moveTab(tabId, toIndex)),
        [run]
    )

    const withActiveTab = useCallback(
        (label: string, action: (tabId: string) => Promise<unknown>) =>
            activeTab ? run(label, () => action(activeTab.id)) : Promise.resolve(),
        [activeTab, run]
    )

    const navigateToUrl = useCallback(
        (url: string) => withActiveTab('navigate', (id) => browser().navigateTab(id, url)),
        [withActiveTab]
    )
    const goBack = useCallback(() => withActiveTab('go back', browser().goBack), [withActiveTab])
    const goForward = useCallback(() => withActiveTab('go forward', browser().goForward), [withActiveTab])
    const reload = useCallback(() => withActiveTab('reload', browser().reload), [withActiveTab])
    const stop = useCallback(() => withActiveTab('stop', browser().stop), [withActiveTab])

    const value: BrowserContextType = {
        tabs,
        activeTab,
        createTab,
        closeTab,
        switchTab,
        moveTab,
        navigateToUrl,
        goBack,
        goForward,
        reload,
        stop
    }

    return (
        <BrowserContext.Provider value={value}>
            {children}
        </BrowserContext.Provider>
    )
}
