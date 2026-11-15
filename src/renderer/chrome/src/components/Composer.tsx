import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Check, ChevronDown, Cloud, Laptop, Lock, Plus } from 'lucide-react'
import type { MascotProfile } from '@shared/library'
import type { Mood } from '@common/components/Mascot'
import { cn } from '@common/lib/utils'
import { useFlock } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Berry, useAssistantName } from './Berry'
import { limitsInBrief } from '../shortWords'
import { blankMascot, setFlockView } from '../flockView'

// DESIGN.md section 10, The prompt box: one component everywhere, a card set into a shell.

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'

// What the mascot in the pill shows while one gives way to another (see useMascotSwitch on the new tab).
export interface PillFace {
    mood: Mood
    shut: boolean
    // Changes each time a new one arrives, so it pops in again.
    arrival: number
}

// The menu under the pill: one row per mascot, its face, its name and what it may do, with a tick on the current one.
const MascotMenu: React.FC<{ chosenId: string; above: boolean; onChoose: (id: string) => void; onClose: (refocus: boolean) => void }> = ({ chosenId, above, onChoose, onClose }) => {
    const { flock } = useFlock()
    const menu = useRef<HTMLDivElement>(null)
    const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role=menuitemradio],[role=menuitem]') ?? [])]

    useEffect(() => {
        const current = menu.current?.querySelector<HTMLElement>('[aria-checked=true]') ?? items()[0]
        current?.focus()
    }, [])

    return (
        <div
            ref={menu}
            role="menu"
            aria-label="Choose who to ask"
            onKeyDown={(event) => {
                const all = items()
                const at = all.indexOf(document.activeElement as HTMLElement)
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    all[(at + (event.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus()
                } else if (event.key === 'Home' || event.key === 'End') {
                    event.preventDefault()
                    all[event.key === 'Home' ? 0 : all.length - 1]?.focus()
                } else if (event.key === 'Escape') {
                    event.preventDefault()
                    onClose(true)
                } else if (event.key === 'Tab') {
                    onClose(false)
                }
            }}
            className={cn(
                'absolute right-0 z-30 w-[316px] max-w-[calc(100vw-32px)] p-1.5 rounded-menu bg-sheet text-13 text-ink shadow-lift cursor-default',
                'origin-top-right animate-[menu-in_150ms_cubic-bezier(.2,.8,.2,1)]',
                above ? 'bottom-full mb-2 origin-bottom-right' : 'top-full mt-2'
            )}
        >
            {flock.map((mascot) => (
                <MenuRow key={mascot.id} mascot={mascot} checked={mascot.id === chosenId} onChoose={() => onChoose(mascot.id)} />
            ))}
            <div aria-hidden className="h-px mx-2.5 my-1 bg-line" />
            <button
                type="button"
                role="menuitem"
                onClick={() => {
                    setFlockView({ page: 'form', values: blankMascot() })
                    void window.chromeAPI.browser.openPage('flock')
                    onClose(false)
                }}
                className="w-full h-10 px-2.5 flex items-center gap-[11px] rounded-[14px] text-left text-ink-2 outline-none hover:bg-sheet-2 focus-visible:bg-sheet-2 hover:text-ink"
            >
                <span className="size-7 flex items-center justify-center"><Plus className="size-4" strokeWidth={1.5} /></span>
                New mascot
            </button>
        </div>
    )
}

const MenuRow: React.FC<{ mascot: MascotProfile; checked: boolean; onChoose: () => void }> = ({ mascot, checked, onChoose }) => {
    const name = useAssistantName(mascot)
    return (
        <button
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            onClick={onChoose}
            className="w-full h-[46px] px-2.5 flex items-center gap-[11px] rounded-[14px] text-left outline-none hover:bg-sheet-2 focus-visible:bg-sheet-2"
        >
            <Berry size={28} mascot={mascot} still />
            <span className="flex-1 min-w-0">
                <span className="block truncate">{name}</span>
                <span className="block mt-px font-mono text-11 text-ink-3 truncate">{limitsInBrief(mascot)}</span>
            </span>
            {checked && <Check className="size-4 shrink-0 text-ink" strokeWidth={1.5} />}
        </button>
    )
}

// Says who this goes to. Where the choice is still open it opens the menu, and anywhere else it only says who.
const MascotPill: React.FC<{
    mascot: MascotProfile
    face?: PillFace
    small: boolean
    chooser?: { open: boolean; onToggle: () => void; onOpen: () => void; button: React.Ref<HTMLButtonElement> }
}> = ({ mascot, face, small, chooser }) => {
    const name = useAssistantName(mascot)
    const { keepBerryStill } = useShell().settings
    const look = cn('shrink-0 flex items-center gap-[7px] rounded-full bg-sheet shadow-[inset_0_0_0_1px_var(--line)] text-12 text-ink', small ? 'h-7 pl-1 pr-2' : 'h-[30px] pl-[5px] pr-[9px]')
    const drawn = (
        <span key={face?.arrival} className={cn('flex origin-[50%_70%]', face && face.arrival > 0 && (keepBerryStill ? 'animate-[mascot-fade_150ms_ease-out]' : 'animate-mascot-pop'))}>
            <Berry size={20} mascot={mascot} mood={face?.mood ?? 'rest'} shut={face?.shut} />
        </span>
    )
    if (!chooser) {
        return (
            <span aria-label={`This chat is with ${name}`} className={cn(look, 'pr-[11px] cursor-default')}>
                {drawn}
                <span className="max-w-28 truncate">{name}</span>
            </span>
        )
    }
    return (
        <button
            ref={chooser.button}
            type="button"
            aria-label={`Asking ${name}. Choose who to ask`}
            aria-haspopup="menu"
            aria-expanded={chooser.open}
            onClick={chooser.onToggle}
            onKeyDown={(event) => {
                if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !chooser.open) {
                    event.preventDefault()
                    chooser.onOpen()
                }
            }}
            className={cn(look, 'transition-[background-color,transform] duration-fast hover:bg-sheet-2 active:scale-[.96]', chooser.open && 'bg-sheet-2', FOCUS)}
        >
            {drawn}
            <span className="max-w-28 truncate">{name}</span>
            <ChevronDown className={cn('size-3 text-ink-3 transition-transform duration-menu', chooser.open && 'rotate-180')} strokeWidth={1.5} />
        </button>
    )
}

// This Mac or Cloud, as a segmented control. The chosen side carries its name, the other is its icon alone.
const WhereSwitch: React.FC<{ on: boolean; onToggle: () => void; small: boolean }> = ({ on, onToggle, small }) => {
    // The words follow the platform (DESIGN.md section 14).
    const here = useShell().theme.platform === 'mac' ? 'This Mac' : 'This PC'
    return (
    <div role="radiogroup" aria-label="Where it runs" className="shrink-0 flex p-0.5 rounded-full bg-sheet-2">
        {([false, true] as const).map((cloud) => {
            const chosen = on === cloud
            const Icon = cloud ? Cloud : Laptop
            const label = cloud ? 'Cloud' : here
            return (
                <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    aria-label={label}
                    title={chosen ? undefined : label}
                    onClick={() => !chosen && onToggle()}
                    className={cn(
                        'flex items-center gap-1.5 rounded-full text-12 transition-colors duration-fast',
                        small ? 'h-6 px-2' : 'h-7 px-2.5',
                        chosen ? 'bg-sheet text-ink shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_0/0.1)]' : 'text-ink-3 hover:text-ink',
                        FOCUS
                    )}
                >
                    <Icon className="size-4" strokeWidth={1.5} />
                    {chosen && <span>{label}</span>}
                </button>
            )
        })}
    </div>
    )
}

// The one input for talking to a mascot, on the new tab, the main chat and the chat panel.
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
    // The new tab's box is larger, with 18px words. Everywhere else it's the chat's.
    size?: 'hero' | 'chat'
    // Shown above the text, such as the page Berry can see.
    attachment?: React.ReactNode
    // The + button adds this. Without it, there's no +.
    onAdd?: () => void
    addLabel?: string
    // With no box of its own, because the window it's in is the box.
    bare?: boolean
    canSend: boolean
    onSend: () => void
    // While a reply is running, Send stops it.
    onStop?: () => void
    // Who this goes to. With `onChooseMascot`, pressing it opens the menu. Without, it just says who.
    mascot?: MascotProfile
    onChooseMascot?: (id: string) => void
    // Who's ticked in the menu, when the pill is still showing the one before (the new tab's switch).
    chosenId?: string
    face?: PillFace
    // The placeholder fades while one mascot gives way to another.
    quietPlaceholder?: boolean
    // Whether this job is done in the cloud, where that's set up.
    cloud?: { on: boolean; onToggle: () => void }
    // The chosen mascot's limits, in words, in the shell under the card. Null or empty slides it away.
    limits?: string | null
}> = ({ label, placeholder, value, onChange, onKeyDown, rows = 1, autoFocus, focusKey, spellCheck, size = 'chat', attachment, onAdd, addLabel, bare, canSend, onSend, onStop, mascot, onChooseMascot, chosenId, face, quietPlaceholder, cloud, limits }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [choosing, setChoosing] = useState(false)
    const box = useRef<HTMLDivElement>(null)
    const pill = useRef<HTMLButtonElement>(null)
    const hero = size === 'hero'
    const small = !hero
    // The last words, kept while the line slides away.
    const [lastLimits, setLastLimits] = useState(limits ?? '')
    useEffect(() => {
        if (limits) setLastLimits(limits)
    }, [limits])

    useEffect(() => {
        if (!choosing) return
        const close = (event: PointerEvent) => {
            if (!box.current?.contains(event.target as Node)) setChoosing(false)
        }
        window.addEventListener('pointerdown', close)
        return () => window.removeEventListener('pointerdown', close)
    }, [choosing])

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

    const closeMenu = (refocus: boolean) => {
        setChoosing(false)
        if (refocus) pill.current?.focus()
    }

    const sendButton = (
        <button
            type="button"
            aria-label={onStop ? 'Stop' : cloud?.on ? 'Send to the cloud' : 'Send'}
            onClick={onStop ?? onSend}
            disabled={!onStop && !canSend}
            className={cn(
                'shrink-0 rounded-full flex items-center justify-center transition-[background-color,color,transform] duration-fast active:scale-[.96]',
                small ? 'size-7' : 'size-8',
                'bg-ink text-sheet hover:bg-ink/85 disabled:bg-sheet-2 disabled:text-faint disabled:active:scale-100',
                FOCUS
            )}
        >
            {onStop ? <span aria-hidden className={cn('rounded-[2.5px] bg-current', small ? 'size-[9px]' : 'size-2.5')} /> : <ArrowUp className="size-4" strokeWidth={1.5} />}
        </button>
    )

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
                'block w-full resize-none bg-transparent text-ink caret-ink outline-none placeholder:text-faint placeholder:transition-opacity placeholder:duration-[120ms]',
                hero ? 'text-18 min-h-[56px]' : 'text-15 min-h-[30px]',
                quietPlaceholder && 'placeholder:opacity-0'
            )}
        />
    )

    // The desktop's box is its own window, so it's only the words and Send.
    if (bare) {
        return (
            <div onClick={(event) => !(event.target as Element).closest('button') && textareaRef.current?.focus()} className="w-full flex items-end gap-1 p-1.5 pl-3 cursor-text">
                <div className="flex-1 min-w-0 py-[5px]">{textarea}</div>
                {sendButton}
            </div>
        )
    }

    const plusButton = onAdd && (
        <button
            type="button"
            aria-label={addLabel ?? 'Add to chat'}
            title={addLabel}
            onClick={onAdd}
            className={cn(
                'shrink-0 flex items-center justify-center bg-sheet-2 text-ink transition-[background-color,transform] duration-fast hover:bg-press active:scale-[.96]',
                small ? 'size-7 rounded-row' : 'size-8 rounded-tile',
                FOCUS
            )}
        >
            <Plus className="size-4" strokeWidth={1.5} />
        </button>
    )

    return (
        <div ref={box} className="relative w-full">
            <div className="rounded-shell bg-tray p-1 shadow-[inset_0_0_0_1px_var(--line)]">
                <div
                    onClick={(event) => {
                        if (!(event.target as Element).closest('button,[role=menu]')) textareaRef.current?.focus()
                    }}
                    className={cn('relative rounded-prompt bg-sheet shadow-card-lift cursor-text', hero ? 'pt-[18px] pr-3 pb-3 pl-5' : 'pt-3 pr-2 pb-2 pl-4')}
                >
                    {attachment && <div className="mb-2 -ml-1.5 cursor-default">{attachment}</div>}
                    <div className={hero ? 'mb-1' : 'mb-1.5'}>{textarea}</div>
                    <div className="-ml-2 flex items-center gap-[7px]">
                        {plusButton}
                        {cloud && <WhereSwitch on={cloud.on} onToggle={cloud.onToggle} small={small} />}
                        <span className="flex-1" />
                        {mascot && (
                            <MascotPill
                                mascot={mascot}
                                face={face}
                                small={small}
                                chooser={
                                    onChooseMascot && {
                                        open: choosing,
                                        onToggle: () => setChoosing(!choosing),
                                        onOpen: () => setChoosing(true),
                                        button: pill
                                    }
                                }
                            />
                        )}
                        {sendButton}
                    </div>
                </div>
                {/* The chosen mascot's limits, and nothing else, for as long as it's chosen. */}
                <div
                    aria-hidden={!limits}
                    // Hidden too once it has slid away, so it's out of reach of the keyboard and screen readers.
                    className={cn('grid transition-[grid-template-rows,visibility] duration-panel ease-crisp', limits ? 'grid-rows-[1fr] visible' : 'grid-rows-[0fr] invisible')}
                >
                    <div className="min-h-0 overflow-hidden">
                        <p className="min-h-[38px] px-3.5 py-[11px] flex items-start gap-2.5 text-12 text-ink-2">
                            <Lock aria-hidden className="size-3.5 shrink-0 mt-px text-ink-3" strokeWidth={1.5} />
                            <span className="min-w-0">{limits || lastLimits}</span>
                        </p>
                    </div>
                </div>
            </div>
            {choosing && mascot && onChooseMascot && (
                <MascotMenu
                    chosenId={chosenId ?? mascot.id}
                    above={!hero}
                    onChoose={(id) => {
                        onChooseMascot(id)
                        setChoosing(false)
                        textareaRef.current?.focus()
                    }}
                    onClose={closeMenu}
                />
            )}
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
