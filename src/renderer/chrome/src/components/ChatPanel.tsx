import React from 'react'
import { SquarePen, X } from 'lucide-react'
import { useChat } from '../contexts/ChatContext'
import { useShell } from '../contexts/ShellContext'
import { Chat } from './Chat'
import { useAssistantName } from './Berry'
import { ToolBarButton } from './ToolBarButton'

export const ChatPanel: React.FC = () => {
    const { clearChat, messages } = useChat()
    const { layout, theme, toggleChat } = useShell()
    const name = useAssistantName()

    return (
        <aside aria-label="Berry" className="h-full flex flex-col">
            <div
                className="flex items-center gap-1 px-3 app-region-drag shrink-0"
                style={{
                    height: layout.controls.height + 8,
                    paddingRight: theme.platform === 'windows' ? layout.controls.width : undefined
                }}
            >
                <ToolBarButton Icon={SquarePen} label="New chat" active={messages.length > 0} onClick={clearChat} />
                <div className="flex-1" />
                <ToolBarButton Icon={X} label={`Close ${name}`} onClick={toggleChat} />
            </div>
            <div className="flex-1 min-h-0">
                <Chat />
            </div>
        </aside>
    )
}
