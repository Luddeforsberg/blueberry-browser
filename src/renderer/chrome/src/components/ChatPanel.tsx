import React from 'react'
import { Plus, X } from 'lucide-react'
import { useChat } from '../contexts/ChatContext'
import { useShell } from '../contexts/ShellContext'
import { Chat } from './Chat'
import { ToolBarButton } from './ToolBarButton'

export const ChatPanel: React.FC = () => {
    const { messages, clearChat } = useChat()
    const { layout, theme, toggleChat } = useShell()

    return (
        <aside aria-label="Chat" className="h-full flex flex-col">
            <div
                className="flex items-center gap-1 px-2 app-region-drag shrink-0"
                style={{
                    height: layout.toolbar.height,
                    paddingRight: theme.platform === 'windows' ? layout.controls.width : undefined
                }}
            >
                <h2 className="flex-1 px-2 text-13 font-semibold">Chat</h2>
                {messages.length > 0 && (
                    <ToolBarButton Icon={Plus} label="New chat" onClick={clearChat} />
                )}
                <ToolBarButton Icon={X} label="Close chat" onClick={toggleChat} />
            </div>
            <div className="flex-1 min-h-0">
                <Chat />
            </div>
        </aside>
    )
}
