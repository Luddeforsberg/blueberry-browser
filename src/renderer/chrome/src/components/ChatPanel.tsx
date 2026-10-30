import React, { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { useChat } from '../contexts/ChatContext'
import { useShell } from '../contexts/ShellContext'
import { Chat } from './Chat'
import { Berry, useAssistantName } from './Berry'
import { ToolBarButton } from './ToolBarButton'
import { Switch } from '@common/components/Controls'

const hostOf = (url: string) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return null
    }
}

// Always says what Berry can see, with a switch to take the page away.
const CanSee: React.FC = () => {
    const { activeTab } = useBrowser()
    const [enabled, setEnabled] = useState(true)
    const host = activeTab && !activeTab.page ? hostOf(activeTab.url) : null

    useEffect(() => {
        window.chromeAPI.chat.getPageAccess().then(setEnabled)
    }, [])

    const change = (next: boolean) => {
        setEnabled(next)
        window.chromeAPI.chat.setPageAccess(next).then(setEnabled)
    }

    return (
        <div className="mx-3 mb-1 flex items-center gap-2 h-9 px-3 rounded-card bg-surface text-12">
            <span className="flex-1 truncate">
                Can see:{' '}
                <span className="font-semibold">{enabled && host ? host : 'no pages'}</span>
            </span>
            <Switch label="Let Berry see this page" checked={enabled} onChange={change} />
        </div>
    )
}

export const ChatPanel: React.FC = () => {
    const { messages, isLoading, clearChat } = useChat()
    const { layout, theme } = useShell()
    const name = useAssistantName()

    return (
        <aside aria-label="Berry" className="h-full flex flex-col">
            <div
                className="flex items-center gap-2 px-3 app-region-drag shrink-0"
                style={{
                    height: layout.toolbar.height,
                    paddingRight: theme.platform === 'windows' ? layout.controls.width : undefined
                }}
            >
                <Berry size={20} mood={isLoading ? 'thinking' : 'rest'} className="app-region-no-drag" />
                <h2 className="flex-1 text-13 font-semibold">{name}</h2>
                {messages.length > 0 && (
                    <ToolBarButton Icon={Plus} label="New chat" onClick={clearChat} />
                )}
            </div>
            <CanSee />
            <div className="flex-1 min-h-0">
                <Chat />
            </div>
        </aside>
    )
}
