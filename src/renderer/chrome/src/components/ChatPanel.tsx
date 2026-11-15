import React from 'react'
import { SquarePen, X } from 'lucide-react'
import { useChat } from '../contexts/ChatContext'
import { useShell } from '../contexts/ShellContext'
import { Chat } from './Chat'
import { useAssistantName } from './Berry'
import { ToolBarButton } from './ToolBarButton'

export const ChatPanel: React.FC = () => {
    const { clearChat, messages } = useChat()
    const { toggleChat } = useShell()
    const name = useAssistantName()

    // A second sheet beside the page, under the toolbar (DESIGN.md section 2).
    return (
        <aside aria-label="Berry" className="h-full flex flex-col rounded-sheet bg-sheet shadow-lift overflow-hidden">
            <div className="h-12 shrink-0 flex items-center gap-1 px-2">
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
