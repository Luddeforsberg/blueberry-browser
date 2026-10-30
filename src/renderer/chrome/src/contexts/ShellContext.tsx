import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Layout, ThemeState } from '@shared/ipc'

interface ShellContextType {
    layout: Layout
    theme: ThemeState
    toggleSidebar: () => void
    toggleChat: () => void
    toggleDark: () => void
}

const ShellContext = createContext<ShellContextType | null>(null)

export const useShell = () => {
    const context = useContext(ShellContext)
    if (!context) {
        throw new Error('useShell must be used within a ShellProvider')
    }
    return context
}

// Layout and theme both come from main, which owns the window.
export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [layout, setLayout] = useState<Layout | null>(null)
    const [theme, setTheme] = useState<ThemeState | null>(null)

    useEffect(() => {
        const api = window.chromeAPI
        api.layout.getLayout().then(setLayout)
        api.theme.getTheme().then(setTheme)
        const offLayout = api.layout.onLayoutUpdated(setLayout)
        const offTheme = api.theme.onThemeUpdated(setTheme)
        return () => {
            offLayout()
            offTheme()
        }
    }, [])

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme?.isDark ?? false)
    }, [theme?.isDark])

    if (!layout || !theme) return null

    const value: ShellContextType = {
        layout,
        theme,
        toggleSidebar: () => void window.chromeAPI.layout.toggleSidebar(),
        toggleChat: () => void window.chromeAPI.layout.toggleChat(),
        toggleDark: () => void window.chromeAPI.theme.toggleDark()
    }

    return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}
