import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Check, Cloud, Plus, Square } from 'lucide-react'
import type { MascotProfile } from '@shared/library'
import { cn } from '@common/lib/utils'
import { MascotChip, MascotPerch } from './MascotPerch'

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
    // The + button. With no handler and nothing for its menu, there's no + at all.
    onAdd?: () => void
    addLabel?: string
    // Leaves out the + button where there's nothing to add.
    noAdd?: boolean
    // With no box of its own, because the window it's in is the box.
    bare?: boolean
    canSend: boolean
    onSend: () => void
    // While a reply is running, the send button stops it.
    onStop?: () => void
    // Who this goes to. With `onChooseMascot`, pressing it opens the flock. Without, it just says who.
    mascot?: MascotProfile
    onChooseMascot?: (id: string) => void
    // Whether this job is done in the cloud, where that's set up. It's an item in the + menu, and a mark on Send while on.
    cloud?: { on: boolean; onToggle: () => void }
}> = ({ label, placeholder, value, onChange, onKeyDown, rows = 1, autoFocus, focusKey, spellCheck, attachment, onAdd, addLabel, noAdd, bare, canSend, onSend, onStop, mascot, onChooseMascot, cloud }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [choosing, setChoosing] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const addRef = useRef<HTMLButtonElement>(null)
    // The + menu only holds the cloud option, so it's there only where the + has nothing else to do.
    const menu = !onAdd && cloud ? cloud : null

    useEffect(() => {
        if (!menuOpen) return
        const close = (event: Event) => {
            if (event instanceof KeyboardEvent) {
                if (event.key !== 'Escape') return
                setMenuOpen(false)
                // The item that had focus goes with the menu, so it comes back to the button that opened it.
                addRef.current?.focus()
            } else if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
        }
        window.addEventListener('pointerdown', close)
        window.addEventListener('keydown', close)
        return () => {
            window.removeEventListener('pointerdown', close)
            window.removeEventListener('keydown', close)
        }
    }, [menuOpen])

    useLayoutEffect(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.style.height = 'auto'
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }, [value])

    useEffect(() => {
        const textarea = textareaRef.current
        if (!focusKey || !textarea) return
        textarea.focus()
        textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }, [focusKey])

    return (
        <div
            onClick={(event) => {
                if (!(event.target as Element).closest('button')) textareaRef.current?.focus()
            }}
            className={cn(
                "relative w-full cursor-text",
                bare ? "p-1.5 pl-2" : "p-2 pl-3 rounded-composer border bg-surface shadow-raised transition-colors focus-within:border-muted-foreground/30"
            )}
        >
            {choosing && mascot && onChooseMascot && (
                <div className="mb-2 cursor-default">
                    <MascotPerch
                        selectedId={mascot.id}
                        onChoose={(id) => {
                            onChooseMascot(id)
                            setChoosing(false)
                            textareaRef.current?.focus()
                        }}
                        onClose={() => setChoosing(false)}
                    />
                </div>
            )}
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
                    className={cn("flex-1 min-w-0 block px-2 py-[7px] resize-none bg-transparent text-16 outline-none", bare ? "placeholder:text-foreground/70" : "placeholder:text-muted-foreground")}
                />
                {mascot && (
                    <MascotChip mascot={mascot} open={choosing} onPress={onChooseMascot && (() => setChoosing(!choosing))} />
                )}
                {!noAdd && (onAdd || menu) && (
                    <div ref={menuRef} className="relative">
                        <button
                            ref={addRef}
                            type="button"
                            aria-label={menu ? 'More options' : (addLabel ?? 'Add to chat')}
                            title={menu ? undefined : addLabel}
                            aria-haspopup={menu ? 'menu' : undefined}
                            aria-expanded={menu ? menuOpen : undefined}
                            onClick={menu ? () => setMenuOpen(!menuOpen) : onAdd}
                            className={cn(
                                "size-9 rounded-full flex items-center justify-center outline-none transition-colors",
                                "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                                menuOpen && "bg-muted"
                            )}
                        >
                            <Plus className="size-5" />
                        </button>
                        {menu && menuOpen && (
                            <div role="menu" aria-label="More options" className="absolute right-0 top-full mt-2 z-20 w-60 p-1 rounded-card border bg-surface shadow-float cursor-default">
                                <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={menu.on}
                                    autoFocus
                                    onClick={() => {
                                        menu.onToggle()
                                        setMenuOpen(false)
                                        textareaRef.current?.focus()
                                    }}
                                    className="w-full h-9 px-2.5 flex items-center gap-2.5 rounded-control text-14 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                                >
                                    <Cloud className="size-4 shrink-0 text-muted-foreground" />
                                    <span className="flex-1">Do this in the cloud</span>
                                    {menu.on && <Check className="size-4 shrink-0 text-accent-ink" />}
                                </button>
                            </div>
                        )}
                    </div>
                )}
                <button
                    type="button"
                    aria-label={onStop ? 'Stop' : cloud?.on ? 'Send to the cloud' : 'Send'}
                    title={!onStop && cloud?.on ? 'Done in the cloud' : undefined}
                    onClick={onStop ?? onSend}
                    disabled={!onStop && !canSend}
                    className={cn(
                        bare ? "size-8 mb-0.5 disabled:opacity-40" : "size-9",
                        "relative shrink-0 rounded-full flex items-center justify-center outline-none transition-colors",
                        "bg-primary text-primary-foreground hover:brightness-110",
                        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring focus-visible:ring-offset-surface",
                        "disabled:hover:brightness-100"
                    )}
                >
                    {onStop ? <Square className="size-3.5" fill="currentColor" /> : <ArrowUp className="size-[18px]" />}
                    {!onStop && cloud?.on && (
                        <span aria-hidden className="absolute -top-1 -right-1 size-[18px] rounded-full bg-surface border flex items-center justify-center text-accent-ink">
                            <Cloud className="size-3" strokeWidth={2.5} />
                        </span>
                    )}
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
    mascot?: MascotProfile
    onChooseMascot?: (id: string) => void
}> = ({ onSend, onStop, disabled = false, placeholder, attachment, onAdd, addLabel, autoFocus, draft, onDraftTaken, mascot, onChooseMascot }) => {
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
            mascot={mascot}
            onChooseMascot={onChooseMascot}
        />
    )
}
