import React from 'react'
import { ArrowLeft, ArrowRight, PanelLeft, PanelRight, RotateCw, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { useShell } from '../contexts/ShellContext'
import { AddressBar } from './AddressBar'
import { ToolBarButton } from './ToolBarButton'

export const Toolbar: React.FC = () => {
    const { activeTab, goBack, goForward, reload, stop } = useBrowser()
    const { layout, theme, toggleSidebar, toggleChat } = useShell()

    // With no sidebar, the toolbar is the window's top-left corner, where macOS puts its buttons.
    const leftClear = !layout.sidebarOpen && theme.platform === 'mac' ? layout.controls.width : 8
    const rightClear = !layout.chatOpen && theme.platform === 'windows' ? layout.controls.width : 8

    return (
        <div
            className="h-full flex items-center gap-1 app-region-drag"
            style={{ paddingLeft: leftClear, paddingRight: rightClear }}
        >
            {!layout.sidebarOpen && (
                <ToolBarButton Icon={PanelLeft} label="Show sidebar" onClick={toggleSidebar} />
            )}
            <ToolBarButton
                Icon={ArrowLeft}
                label="Back"
                onClick={goBack}
                active={activeTab?.canGoBack ?? false}
            />
            <ToolBarButton
                Icon={ArrowRight}
                label="Forward"
                onClick={goForward}
                active={activeTab?.canGoForward ?? false}
            />
            {activeTab?.isLoading ? (
                <ToolBarButton Icon={X} label="Stop loading" onClick={stop} />
            ) : (
                <ToolBarButton Icon={RotateCw} label="Reload" onClick={reload} active={activeTab !== null} />
            )}

            <div className="flex-1 min-w-0 flex px-1">
                <AddressBar />
            </div>

            <ToolBarButton
                Icon={PanelRight}
                label={layout.chatOpen ? "Hide Berry" : "Show Berry"}
                onClick={toggleChat}
                toggled={layout.chatOpen}
            />
        </div>
    )
}
