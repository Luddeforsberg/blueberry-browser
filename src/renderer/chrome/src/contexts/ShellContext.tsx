import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Layout, Settings, ThemeState } from '@shared/ipc'

interface ShellContextType {
    layout: Layout
    theme: ThemeState
    settings: Settings
    toggleSidebar: () => void
    toggleChat: () => void
    updateSettings: (patch: Partial<Settings>) => void
}

const ShellContext = createContext<ShellContextType | null>(null)

export const useShell = () => {
    const context = useContext(ShellContext)
    if (!context) {
        throw new Error('useShell must be used within a ShellProvider')
    }
    return context
}

// Layout, theme and settings all come from main, which owns the window.
export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [layout, setLayout] = useState<Layout | null>(null)
    const [theme, setTheme] = useState<ThemeState | null>(null)
    const [settings, setSettings] = useState<Settings | null>(null)

    useEffect(() => {
        const api = window.chromeAPI
        api.layout.getLayout().then(setLayout)
        api.theme.getTheme().then(setTheme)
        api.settings.getSettings().then(setSettings)
        const unsubscribe = [
            api.layout.onLayoutUpdated(setLayout),
            api.theme.onThemeUpdated(setTheme),
            api.settings.onSettingsUpdated(setSettings)
        ]
        return () => unsubscribe.forEach((off) => off())
    }, [])

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme?.isDark ?? false)
    }, [theme?.isDark])

    if (!layout || !theme || !settings) return null

    const value: ShellContextType = {
        layout,
        theme,
        settings,
        toggleSidebar: () => void window.chromeAPI.layout.toggleSidebar(),
        toggleChat: () => void window.chromeAPI.layout.toggleChat(),
        updateSettings: (patch) => void window.chromeAPI.settings.updateSettings(patch)
    }

    return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}
