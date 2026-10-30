import React from 'react'
import { PanelLeft } from 'lucide-react'
import { useShell } from '../contexts/ShellContext'
import { Tabs } from './Tabs'
import { ToolBarButton } from './ToolBarButton'

// `floating` is the collapsed sidebar shown over the page, where the button pins it open again.
export const Sidebar: React.FC<{ floating?: boolean }> = ({ floating = false }) => {
    const { layout, theme, toggleSidebar } = useShell()

    return (
        <nav aria-label="Sidebar" className="h-full flex flex-col">
            <div
                className="flex items-center justify-end px-2 app-region-drag shrink-0"
                style={{
                    height: layout.toolbar.height,
                    paddingLeft: theme.platform === 'mac' ? layout.controls.width : undefined
                }}
            >
                <ToolBarButton
                    Icon={PanelLeft}
                    label={floating ? "Keep sidebar open" : "Hide sidebar"}
                    onClick={toggleSidebar}
                />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
                <h2 id="sidebar-tabs" className="px-2 pt-2 pb-1 text-11 text-muted-foreground">
                    Tabs
                </h2>
                <Tabs mode="vertical" labelledBy="sidebar-tabs" />
            </div>
        </nav>
    )
}
