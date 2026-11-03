import React from 'react'
import { useShell } from '../contexts/ShellContext'
import { Tabs } from './Tabs'

export const TabStrip: React.FC = () => {
    const { layout, theme } = useShell()

    // The tab row is the window's top edge here, so it keeps the system's window buttons clear, and off a Mac the menu button.
    const leftClear = theme.platform === 'mac' ? layout.controls.width : 8
    const rightClear = !layout.chatOpen && theme.platform !== 'mac' ? layout.controls.width : 8

    return (
        <div
            className="h-full flex items-center gap-1 app-region-drag"
            style={{ paddingLeft: leftClear, paddingRight: rightClear }}
        >
            <Tabs mode="horizontal" label="Tabs" />
        </div>
    )
}
