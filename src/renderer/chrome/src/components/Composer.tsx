import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AppWindow, ArrowUp, ChevronRight, Clock, Cloud, Plus, Square, X } from 'lucide-react'
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

// Pressing the bird perched on the box opens the bird picker, as the name beside Send does.
export const CHOOSE_BIRD_EVENT = 'blueberry:choose-bird'

// Whether this job is done in the cloud, where that's set up for this bird.
interface Cloud {
    on: boolean
    onToggle: () => void
    // One line under Do this in the cloud, saying where it runs.
    hint: string
}

// The `+` menu's items, which the arrow keys move between.
const MENU_ITEM = '[role="menuitemcheckbox"], [role="menuitem"]'

// `+` and what it opens: Add an open tab and Add a recent page, then Do this in the cloud where the cloud is set up.
// The two Add items show as the design has them, but a new tab's message can't carry a page yet, so they're marked
// unavailable and do nothing until that's built.
const AddMenu: React.FC<{ size: string; cloud?: Cloud }> = ({ size, cloud }) => {
    const [open, setOpen] = useState(false)
    const wrap = useRef<HTMLDivElement>(null)
    const button = useRef<HTMLButtonElement>(null)
    const panel = useRef<HTMLDivElement>(null)

    const close = (refocus: boolean) => {
        setOpen(false)
        if (refocus) button.current?.focus()
    }

    useEffect(() => {
        if (!open) return
        panel.current?.querySelector<HTMLElement>(MENU_ITEM)?.focus()
        const away = (event: PointerEvent) => {
            if (!wrap.current?.contains(event.target as Node)) setOpen(false)
        }
        window.addEventListener('pointerdown', away)
        return () => window.removeEventListener('pointerdown', away)
    }, [open])

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            return close(true)
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        const items = [...(panel.current?.querySelectorAll<HTMLElement>(MENU_ITEM) ?? [])]
        if (items.length === 0) return
        event.preventDefault()
        const at = items.indexOf(document.activeElement as HTMLElement)
        const next =
            event.key === 'Home' ? 0
            : event.key === 'End' ? items.length - 1
            : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next].focus()
    }

    return (
        <div
            ref={wrap}
            className="relative"
            onKeyDown={open ? onKeyDown : undefined}
            // Tabbing out of it closes it, as a click elsewhere does.
            onBlur={(event) => {
                if (open && !wrap.current?.contains(event.relatedTarget as Node | null)) setOpen(false)
            }}
        >
            <button
                ref={button}
                type="button"
                aria-label="Add to message"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' && !open) {
                        event.preventDefault()
                        setOpen(true)
                    }
                }}
                className={cn(
                    size,
                    "shrink-0 flex items-center justify-center rounded-full bg-control-fill text-foreground outline-none transition-colors",
                    "hover:bg-hover active:bg-pressed focus-visible:ring-2 focus-visible:ring-ring",
                    open && "bg-pressed"
                )}
            >
                <Plus className="size-4" />
            </button>
            {open && (
                <div
                    ref={panel}
                    role="menu"
                    aria-label="Add to message"
                    className="absolute left-0 top-full mt-2 z-20 w-[268px] p-1.5 rounded-list bg-surface shadow-float cursor-default"
                >
                    {[
                        { label: 'Add an open tab', Icon: AppWindow },
                        { label: 'Add a recent page', Icon: Clock }
                    ].map(({ label, Icon }) => (
                        <button
                            key={label}
                            type="button"
                            role="menuitem"
                            aria-disabled="true"
                            aria-haspopup="menu"
                            title="Coming soon"
                            className="w-full h-9 px-2.5 flex items-center gap-2.5 rounded-[10px] text-14 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                        >
                            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                            <span className="flex-1">{label}</span>
                            <ChevronRight aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                        </button>
                    ))}
                    {cloud && (
                        <>
                            <div role="separator" className="h-px mx-2 my-1.5 bg-border" />
                            <button
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={cloud.on}
                                aria-describedby="add-menu-cloud-hint"
                                onClick={() => {
                                    cloud.onToggle()
                                    close(true)
                                }}
                                className="w-full px-2.5 py-2 flex flex-col gap-0.5 rounded-[10px] text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                            >
                                <span className="flex items-center gap-2.5 text-14">
                                    <Cloud aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                                    <span className="flex-1">Do this in the cloud</span>
                                    <span aria-hidden className={cn("relative w-7 h-4 shrink-0 rounded-full transition-colors", cloud.on ? "bg-berry-blue" : "bg-muted-foreground/70")}>
                                        <span className={cn("absolute left-0 top-0.5 size-3 rounded-full bg-surface transition-transform", cloud.on ? "translate-x-3.5" : "translate-x-0.5")} />
                                    </span>
                                </span>
                                <span id="add-menu-cloud-hint" className="pl-[26px] text-12 text-muted-foreground">{cloud.hint}</span>
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

// The one input for talking to a bird, on the new tab page, the main chat and the chat panel. The text comes first, and
// its controls sit in one row under it. With `split`, `+` and In the cloud are on the left and who it goes to is quiet
// text beside Send. Otherwise who it goes to comes first, then `+`, and send at the right end.
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
    // The + button where it adds one thing, as in the chat panel. With no handler there's no + at all, unless `split`.
    onAdd?: () => void
    addLabel?: string
    // Leaves out the + button where there's nothing to add.
    noAdd?: boolean
    // With no box of its own, because the window it's in is the box.
    bare?: boolean
    // The new tab's box is taller, with room above its text.
    tall?: boolean
    // The row as the new tab has it: `+` with its menu and In the cloud on the left, who it goes to beside Send.
    split?: boolean
    canSend: boolean
    onSend: () => void
    // While a reply is running, the send button stops it.
    onStop?: () => void
    // Who this goes to. With `onChooseMascot`, pressing it opens the flock. Without, it just says who.
    mascot?: MascotProfile
    onChooseMascot?: (id: string) => void
    // Only with `split`: an item in the + menu, and while on, a chip after + and a `berry-blue` Send.
    cloud?: Cloud
}> = ({ label, placeholder, value, onChange, onKeyDown, rows = 1, autoFocus, focusKey, spellCheck, attachment, onAdd, addLabel, noAdd, bare, tall, split, canSend, onSend, onStop, mascot, onChooseMascot, cloud }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [choosing, setChoosing] = useState(false)

    useEffect(() => {
        if (!split || !onChooseMascot) return
        const choose = () => setChoosing(true)
        window.addEventListener(CHOOSE_BIRD_EVENT, choose)
        return () => window.removeEventListener(CHOOSE_BIRD_EVENT, choose)
    }, [split, onChooseMascot])

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

    const inCloud = !!split && !!cloud?.on && !onStop
    const sendLabel = onStop ? 'Stop' : inCloud ? 'Send to the cloud' : 'Send'
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
                if (!(event.target as Element).closest('button')) textareaRef.current?.focus()
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
                {split ? (
                    <>
                        <AddMenu size={control} cloud={cloud} />
                        {inCloud && cloud && (
                            <span className="h-8 pl-2.5 pr-1.5 flex items-center gap-1.5 rounded-full bg-berry-blue/10 dark:bg-berry-blue/20 text-13 text-berry-blue">
                                <Cloud aria-hidden className="size-[15px]" />
                                In the cloud
                                <button
                                    type="button"
                                    aria-label="Turn off In the cloud"
                                    title="Turn off"
                                    onClick={cloud.onToggle}
                                    className="size-5 flex items-center justify-center rounded-full outline-none transition-colors hover:bg-berry-blue/15 focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <X aria-hidden className="size-3" />
                                </button>
                            </span>
                        )}
                        <div className="flex-1" />
                        {mascot && <MascotChip mascot={mascot} open={choosing} quiet onPress={onChooseMascot && (() => setChoosing(!choosing))} />}
                    </>
                ) : (
                    <>
                        {mascot && (
                            <MascotChip mascot={mascot} open={choosing} tall={tall} onPress={onChooseMascot && (() => setChoosing(!choosing))} />
                        )}
                        {!noAdd && onAdd && (
                            <button type="button" aria-label={addLabel ?? 'Add to chat'} title={addLabel} onClick={onAdd} className={cn(BOX_CONTROL, control)}>
                                <Plus className="size-4" />
                            </button>
                        )}
                        <div className="flex-1" />
                    </>
                )}
                {/* An outline at rest, filled once there's something to send, and `berry-blue` with a cloud while it goes
                    there. While a job runs it's Stop, the only one. */}
                <button
                    type="button"
                    aria-label={sendLabel}
                    onClick={onStop ?? onSend}
                    disabled={!onStop && !canSend}
                    className={cn(
                        control,
                        "relative shrink-0 rounded-full flex items-center justify-center outline-none transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring focus-visible:ring-offset-surface",
                        inCloud
                            ? "bg-berry-blue text-primary-foreground hover:bg-berry-blue/90"
                            : onStop || canSend
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "text-muted-foreground shadow-[inset_0_0_0_1px_rgb(var(--outline))] dark:shadow-none dark:bg-control-fill"
                    )}
                >
                    {onStop ? <Square className="size-3.5" fill="currentColor" /> : inCloud ? <Cloud className="size-[18px]" /> : <ArrowUp className="size-[18px]" />}
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
