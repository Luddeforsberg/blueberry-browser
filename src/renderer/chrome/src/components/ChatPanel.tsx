import React from 'react'
import { SquarePen, X } from 'lucide-react'
import { useChat } from '../contexts/ChatContext'
import { useFlock } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Chat } from './Chat'
import { Berry, useAssistantName } from './Berry'
import { SHORTCUTS } from '@shared/shortcuts'
import { Tooltip } from '@common/components/Tooltip'

const ICON_BUTTON = 'size-7 shrink-0 flex items-center justify-center rounded-full text-ink-3 outline-none transition-[background-color,color,transform] duration-fast hover:bg-hover hover:text-ink active:scale-[.96] active:bg-press focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:text-faint'

// A second sheet beside the page, under the toolbar (DESIGN.md section 2). Its header is the mascot, the chat's name, and
// a close ×, with New chat beside it once there's a chat to leave.
export const ChatPanel: React.FC = () => {
    const { clearChat, messages, chatId, title, mascotId, approval } = useChat()
    const { toggleChat } = useShell()
    const { find, chosen } = useFlock()
    const mascot = chatId ? find(mascotId) : chosen
    const name = useAssistantName(mascot)

    return (
        <aside aria-label={name} className="h-full flex flex-col rounded-sheet bg-sheet shadow-lift overflow-hidden">
            <div className="h-[50px] shrink-0 flex items-center gap-2 pl-3.5 pr-2.5">
                <Berry mood={approval ? 'asking' : 'rest'} size={20} mascot={mascot} still />
                <h2 className="min-w-0 flex-1 truncate text-14 font-medium text-ink">{title || name}</h2>
                <Tooltip words="New chat">
                    <button type="button" aria-label="New chat" disabled={messages.length === 0} onClick={clearChat} className={ICON_BUTTON}>
                        <SquarePen className="size-4" strokeWidth={1.75} />
                    </button>
                </Tooltip>
                <Tooltip words="Close" shortcut={SHORTCUTS.chat}>
                    <button type="button" aria-label={`Close ${name}`} onClick={toggleChat} className={ICON_BUTTON}>
                        <X className="size-4" strokeWidth={1.75} />
                    </button>
                </Tooltip>
            </div>
            <div className="flex-1 min-h-0">
                <Chat />
            </div>
        </aside>
    )
}
