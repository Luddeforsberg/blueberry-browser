import React from 'react'
import type { Rect } from '@shared/ipc'
import { BrowserProvider } from './contexts/BrowserContext'
import { ChatProvider } from './contexts/ChatContext'
import { ShellProvider, useShell } from './contexts/ShellContext'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { ChatPanel } from './components/ChatPanel'
import { cn } from '@common/lib/utils'

// Regions sit exactly where main's layout puts them, so the tab view lines up with the page card.
const Region: React.FC<{ rect: Rect; className?: string; children?: React.ReactNode }> = ({
    rect,
    className,
    children
}) => (
    <div
        className={cn("absolute", className)}
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
        {children}
    </div>
)

const Shell: React.FC = () => {
    const { layout, theme } = useShell()

    return (
        <div className={cn("relative h-full", theme.glass ? "bg-glass-tint" : "bg-background")}>
            {/* Shows until the page paints, and wherever the tab view isn't. */}
            <Region rect={layout.page} className="bg-surface rounded-card" />
            {layout.sidebarOpen && (
                <Region rect={layout.sidebar}>
                    <Sidebar />
                </Region>
            )}
            <Region rect={layout.toolbar}>
                <Toolbar />
            </Region>
            {layout.chatOpen && (
                <Region rect={layout.chat}>
                    <ChatPanel />
                </Region>
            )}
        </div>
    )
}

export const ChromeApp: React.FC = () => (
    <ShellProvider>
        <BrowserProvider>
            <ChatProvider>
                <Shell />
            </ChatProvider>
        </BrowserProvider>
    </ShellProvider>
)
