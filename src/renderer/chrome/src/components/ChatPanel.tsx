import React from 'react'
import { Plus } from 'lucide-react'
import { useChat } from '../contexts/ChatContext'
import { useShell } from '../contexts/ShellContext'
import { Chat } from './Chat'
import { ToolBarButton } from './ToolBarButton'

export const ChatPanel: React.FC = () => {
    const { messages, clearChat } = useChat()
    const { layout, theme } = useShell()

    return (
        <aside aria-label="Berry" className="h-full flex flex-col">
            <div
                className="flex items-center gap-1 px-2 app-region-drag shrink-0"
                style={{
                    height: layout.toolbar.height,
                    paddingRight: theme.platform === 'windows' ? layout.controls.width : undefined
                }}
            >
                <h2 className="flex-1 px-2 text-13 font-semibold">Berry</h2>
                {messages.length > 0 && (
                    <ToolBarButton Icon={Plus} label="New chat" onClick={clearChat} />
                )}
            </div>
            <div className="flex-1 min-h-0">
                <Chat />
            </div>
        </aside>
    )
}
