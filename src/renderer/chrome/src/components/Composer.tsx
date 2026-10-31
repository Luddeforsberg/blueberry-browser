import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Plus, Square } from 'lucide-react'
import { cn } from '@common/lib/utils'

// The one input for talking to Berry, on the new tab page, the main chat and the chat panel.
export const Composer: React.FC<{
    label: string
    placeholder: string
    value: string
    onChange: (value: string) => void
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
    rows?: number
    autoFocus?: boolean
    // Moves the keyboard here each time this changes.
    focusKey?: number
    spellCheck?: boolean
    // Shown above the text, such as the page Berry can see.
    attachment?: React.ReactNode
    // The + button. With no handler it stays disabled until attachments exist.
    onAdd?: () => void
    addLabel?: string
    canSend: boolean
    onSend: () => void
    // While a reply is running, the send button stops it.
    onStop?: () => void
}> = ({ label, placeholder, value, onChange, onKeyDown, rows = 1, autoFocus, focusKey, spellCheck, attachment, onAdd, addLabel, canSend, onSend, onStop }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useLayoutEffect(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.style.height = 'auto'
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }, [value])

    useEffect(() => {
        if (focusKey) textareaRef.current?.focus()
    }, [focusKey])

    return (
        <div
            onClick={(event) => {
                if (!(event.target as Element).closest('button')) textareaRef.current?.focus()
            }}
            className={cn(
                "relative w-full p-2 pl-3 rounded-composer border bg-surface shadow-raised cursor-text",
                "transition-colors focus-within:border-muted-foreground/30"
            )}
        >
            {attachment && <div className="mb-1 cursor-default">{attachment}</div>}
            <div className="flex items-end gap-1">
                <textarea
                    ref={textareaRef}
                    aria-label={label}
                    placeholder={placeholder}
                    value={value}
                    rows={rows}
                    autoFocus={autoFocus}
                    spellCheck={spellCheck}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    className="flex-1 min-w-0 block px-2 py-[7px] resize-none bg-transparent text-16 outline-none placeholder:text-muted-foreground"
                />
                <button
                    type="button"
                    aria-label={addLabel ?? 'Add to chat'}
                    title={addLabel ?? 'Adding files arrives with the backend'}
                    onClick={onAdd}
                    disabled={!onAdd}
                    className={cn(
                        "size-9 rounded-full flex items-center justify-center outline-none transition-colors",
                        "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:hover:bg-transparent disabled:text-muted-foreground"
                    )}
                >
                    <Plus className="size-5" />
                </button>
                <button
                    type="button"
                    aria-label={onStop ? 'Stop' : 'Send'}
                    onClick={onStop ?? onSend}
                    disabled={!onStop && !canSend}
                    className={cn(
                        "size-9 shrink-0 rounded-full flex items-center justify-center outline-none transition-colors",
                        "bg-primary text-primary-foreground hover:brightness-110",
                        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring focus-visible:ring-offset-surface",
                        "disabled:hover:brightness-100"
                    )}
                >
                    {onStop ? <Square className="size-3.5" fill="currentColor" /> : <ArrowUp className="size-[18px]" />}
                </button>
            </div>
        </div>
    )
}

// A composer that sends on Enter, for both chats.
export const ChatComposer: React.FC<{
    onSend: (message: string) => void
    onStop?: () => void
    disabled?: boolean
    placeholder: string
    attachment?: React.ReactNode
    onAdd?: () => void
    addLabel?: string
    autoFocus?: boolean
    // Text to add to whatever is already being written. It's never sent without the user.
    draft?: string | null
    onDraftTaken?: () => void
}> = ({ onSend, onStop, disabled = false, placeholder, attachment, onAdd, addLabel, autoFocus, draft, onDraftTaken }) => {
    const [value, setValue] = useState('')
    const [focusKey, setFocusKey] = useState(0)

    // StrictMode runs this twice when the panel opens with a draft waiting, and it must only add it once.
    const draftTaken = useRef(false)
    useEffect(() => {
        if (!draft) {
            draftTaken.current = false
            return
        }
        if (draftTaken.current) return
        draftTaken.current = true
        setValue((current) => (current ? `${current}\n\n${draft}` : draft))
        setFocusKey((key) => key + 1)
        onDraftTaken?.()
    }, [draft, onDraftTaken])

    const send = () => {
        const message = value.trim()
        if (!message || disabled) return
        onSend(message)
        setValue('')
    }

    return (
        <Composer
            label="Message"
            placeholder={placeholder}
            value={value}
            onChange={setValue}
            autoFocus={autoFocus}
            focusKey={focusKey}
            onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    send()
                }
            }}
            attachment={attachment}
            onAdd={onAdd}
            addLabel={addLabel}
            canSend={!disabled && value.trim().length > 0}
            onSend={send}
            onStop={onStop}
        />
    )
}
