import React from 'react'
import { Plus } from 'lucide-react'
import { useChat } from '../contexts/ChatContext'
import { useShell } from '../contexts/ShellContext'
import { Chat } from './Chat'
import { cn } from '@common/lib/utils'

// Part of the chrome, on `background`, with nothing between it and the top bar. The chat toggle in the address row
// opens and closes it.
export const ChatPanel: React.FC = () => {
    const { clearChat, messages } = useChat()
    const { layout, theme } = useShell()

    return (
        <aside aria-label="Berry" className="h-full flex flex-col">
            {/* On the top bar's line, so New chat sits at the panel's left content edge, level with the address row. */}
            <div
                className="flex items-center gap-1 px-4 box-content app-region-drag shrink-0"
                style={{
                    paddingTop: layout.addressRow.y - layout.chat.y,
                    height: layout.addressRow.height,
                    paddingRight: theme.platform !== 'mac' && layout.addressRow.y < layout.controls.y + layout.controls.height ? layout.controls.width : undefined
                }}
            >
                <button
                    type="button"
                    disabled={messages.length === 0}
                    onClick={clearChat}
                    className={cn(
                        "h-[30px] pl-2 pr-3 flex items-center gap-1.5 rounded-full text-13 app-region-no-drag outline-none transition-colors",
                        "shadow-[inset_0_0_0_1px_rgb(var(--outline))] dark:shadow-none dark:bg-control-fill",
                        "hover:bg-hover active:bg-pressed focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-none",
                        "disabled:opacity-40 disabled:hover:bg-transparent"
                    )}
                >
                    <Plus aria-hidden className="size-3.5" />
                    New chat
                </button>
            </div>
            <div className="flex-1 min-h-0">
                <Chat />
            </div>
        </aside>
    )
}
