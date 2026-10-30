import React from 'react'
import { BrowserProvider } from './contexts/BrowserContext'
import { LibraryProvider } from './contexts/LibraryContext'
import { ShellProvider, useShell } from './contexts/ShellContext'
import { Sidebar } from './components/Sidebar'
import { cn } from '@common/lib/utils'

// The collapsed sidebar, floating over the page in its own view. It hides when the pointer leaves it.
const FloatingSidebar: React.FC = () => {
    const { theme } = useShell()

    return (
        <div className="h-full p-2">
            <div
                className={cn(
                    "h-full rounded-panel border shadow-float overflow-hidden",
                    theme.glass ? "bg-glass-tint backdrop-blur-xl" : "bg-background"
                )}
                onMouseLeave={() => void window.chromeAPI.layout.hideFloatingSidebar()}
            >
                <Sidebar floating />
            </div>
        </div>
    )
}

export const OverlayApp: React.FC = () => (
    <ShellProvider>
        <BrowserProvider>
            <LibraryProvider>
                <FloatingSidebar />
            </LibraryProvider>
        </BrowserProvider>
    </ShellProvider>
)
