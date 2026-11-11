import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Check, Cloud, Plus, Square } from 'lucide-react'
import type { MascotProfile } from '@shared/library'
import { cn } from '@common/lib/utils'
import { MascotChip, MascotPerch } from './MascotPerch'

// The edge every control in the box shares in light mode. In dark mode they're filled instead, with no edge, so the box
// reads as one surface with a few quiet buttons.
export const BOX_CONTROL = cn(
    "shrink-0 flex items-center justify-center rounded-full outline-none transition-colors",
    "shadow-[inset_0_0_0_1px_rgb(var(--outline))] dark:shadow-none dark:bg-control-fill",
    "hover:bg-hover active:bg-pressed focus-visible:shadow-[inset_0_0_0_2px_rgb(var(--ring))]"
)

// The one input for talking to a bird, on the new tab page, the main chat and the chat panel. The text comes first, and
// its controls sit in one row under it: who it goes to, `+` where there's something to add, In the cloud where that
// bird works there, and send at the right end.
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
    // The new tab's box is taller, with room above its text.
    tall?: boolean
    canSend: boolean
    onSend: () => void
    // While a reply is running, the send button stops it.
    onStop?: () => void
    // Who this goes to. With `onChooseMascot`, pressing it opens the flock. Without, it just says who.
    mascot?: MascotProfile
    onChooseMascot?: (id: string) => void
    // Whether this job is done in the cloud, where that's set up. A switch in the row for a bird that works there,
    // otherwise an item in the + menu, and a mark on Send while on.
    cloud?: { on: boolean; onToggle: () => void; asSwitch?: boolean }
}> = ({ label, placeholder, value, onChange, onKeyDown, rows = 1, autoFocus, focusKey, spellCheck, attachment, onAdd, addLabel, noAdd, bare, tall, canSend, onSend, onStop, mascot, onChooseMascot, cloud }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [choosing, setChoosing] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const addRef = useRef<HTMLButtonElement>(null)
    // The + menu only holds the cloud option, so it's there only where the + has nothing else to do.
    const menu = !onAdd && cloud && !cloud.asSwitch ? cloud : null

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

    const textarea = (
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
            className={cn(
                "block resize-none bg-transparent text-16 outline-none",
                bare ? "flex-1 min-w-0 px-2 py-[7px] placeholder:text-foreground/70" : "w-full placeholder:text-muted-foreground"
            )}
        />
    )

    const sendLabel = onStop ? 'Stop' : cloud?.on ? 'Send to the cloud' : 'Send'
    const control = tall ? "size-10" : "size-9"

    // The desktop bird's composer is a window of its own, kept as it was.
    if (bare) {
        return (
            <div onClick={(event) => !(event.target as Element).closest('button') && textareaRef.current?.focus()} className="relative w-full cursor-text p-1.5 pl-2">
                <div className="flex items-end gap-1">
                    {textarea}
                    <button
                        type="button"
                        aria-label={sendLabel}
                        onClick={onStop ?? onSend}
                        disabled={!onStop && !canSend}
                        className="size-8 mb-0.5 shrink-0 rounded-full flex items-center justify-center outline-none transition-colors bg-primary text-primary-foreground disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {onStop ? <Square className="size-3.5" fill="currentColor" /> : <ArrowUp className="size-[18px]" />}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div
            onClick={(event) => {
                if (!(event.target as Element).closest('button, [role="menu"]')) textareaRef.current?.focus()
            }}
            className={cn(
                "relative w-full cursor-text bg-surface",
                // On a page or the panel it's lifted a little and edged in light mode. Over the valley the page lifts it.
                tall ? "rounded-composer pt-5 pr-3 pb-3 pl-6" : "rounded-list pt-3.5 pr-2.5 pb-2.5 pl-4 shadow-raised ring-1 ring-border dark:ring-0"
            )}
        >
            {choosing && mascot && onChooseMascot && (
                <div className="mb-3 -ml-1 cursor-default">
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
            {attachment && <div className="mb-2 cursor-default">{attachment}</div>}
            <div className={tall ? "pr-3 min-h-7" : "pr-2"}>{textarea}</div>
            <div className={cn("flex items-center gap-1.5", tall ? "mt-3.5 -ml-2" : "mt-2 -ml-1.5")}>
                {mascot && (
                    <MascotChip mascot={mascot} open={choosing} tall={tall} onPress={onChooseMascot && (() => setChoosing(!choosing))} />
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
                            className={cn(BOX_CONTROL, control, menuOpen && "bg-pressed dark:bg-pressed")}
                        >
                            <Plus className="size-4" />
                        </button>
                        {menu && menuOpen && (
                            <div role="menu" aria-label="More options" className="absolute left-0 top-full mt-2 z-20 w-60 p-1 rounded-list bg-surface shadow-float cursor-default">
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
                                    className="w-full h-9 px-3 flex items-center gap-2.5 rounded-full text-14 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                                >
                                    <Cloud className="size-4 shrink-0 text-muted-foreground" />
                                    <span className="flex-1">Do this in the cloud</span>
                                    {menu.on && <Check className="size-4 shrink-0 text-accent-ink" />}
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {cloud?.asSwitch && (
                    <button
                        type="button"
                        role="switch"
                        aria-checked={cloud.on}
                        onClick={cloud.onToggle}
                        className={cn(BOX_CONTROL, tall ? "h-10" : "h-9", "px-3 gap-2 text-13 text-muted-foreground hover:text-foreground")}
                    >
                        <Cloud aria-hidden className="size-4" />
                        In the cloud
                        <span aria-hidden className={cn("relative w-7 h-4 rounded-full transition-colors", cloud.on ? "bg-primary" : "bg-muted-foreground/70")}>
                            <span className={cn("absolute top-0.5 size-3 rounded-full bg-surface transition-transform", cloud.on ? "translate-x-3.5" : "translate-x-0.5")} />
                        </span>
                    </button>
                )}
                <div className="flex-1" />
                {/* An outline at rest, filled once there's something to send. While a job runs it's Stop, the only one. */}
                <button
                    type="button"
                    aria-label={sendLabel}
                    title={!onStop && cloud?.on ? 'Done in the cloud' : undefined}
                    onClick={onStop ?? onSend}
                    disabled={!onStop && !canSend}
                    className={cn(
                        control,
                        "relative shrink-0 rounded-full flex items-center justify-center outline-none transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring focus-visible:ring-offset-surface",
                        onStop || canSend
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "text-muted-foreground shadow-[inset_0_0_0_1px_rgb(var(--outline))] dark:shadow-none dark:bg-control-fill"
                    )}
                >
                    {onStop ? <Square className="size-3.5" fill="currentColor" /> : <ArrowUp className="size-[18px]" />}
                    {!onStop && cloud?.on && (
                        <span aria-hidden className="absolute -top-1 -right-1 size-[18px] rounded-full bg-surface shadow-[0_0_0_1px_rgb(var(--border))] flex items-center justify-center text-foreground">
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
