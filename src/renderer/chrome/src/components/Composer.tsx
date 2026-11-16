import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Check, ChevronDown, Cloud, Laptop, Lock, Plus } from 'lucide-react'
import type { MascotProfile } from '@shared/library'
import type { Mood } from '@common/components/Mascot'
import { cn } from '@common/lib/utils'
import { SHELL } from '@common/components/cardShell'
import { useFlock } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Berry, useAssistantName } from './Berry'
import { limitsInBrief } from '../shortWords'
import { startMascot } from '../flockView'
import { MenuRule, MenuSheet, menuRowClass } from './MenuSheet'
import { AddMenu, type AddMenuOptions } from './AddMenu'
import { BoxChips, useAddMenu } from './BoxAttachments'
import { useAttachments, type Attached, type JobPlace } from '../useAttachments'
import { BERRY } from '@shared/mascots'

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
    return (
        <MenuSheet label="Choose who to ask" above={above} align="right" className="w-[316px]" onClose={onClose}>
            {flock.map((mascot) => (
                <MenuRow key={mascot.id} mascot={mascot} checked={mascot.id === chosenId} onChoose={() => onChoose(mascot.id)} />
            ))}
            <MenuRule />
            <button
                type="button"
                role="menuitem"
                onClick={() => {
                    startMascot()
                    onClose(false)
                }}
                className={cn(menuRowClass(false), 'text-ink-2 hover:text-ink')}
            >
                <span className="size-7 flex items-center justify-center"><Plus className="size-4" strokeWidth={1.5} /></span>
                New mascot
            </button>
        </MenuSheet>
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
            className={menuRowClass(true)}
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
    // On the chat's card, where a quiet fill is `card-2`.
    onCard: boolean
    chooser?: { open: boolean; onToggle: () => void; onOpen: () => void; button: React.Ref<HTMLButtonElement> }
}> = ({ mascot, face, small, onCard, chooser }) => {
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
            className={cn(look, 'transition-[background-color,transform] duration-fast active:scale-[.96]', onCard ? 'hover:bg-card-2' : 'hover:bg-sheet-2', chooser.open && (onCard ? 'bg-card-2' : 'bg-sheet-2'), FOCUS)}
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
    // The new tab's box is larger, with room for a longer ask. Everywhere else it's the chat's.
    size?: 'hero' | 'chat'
    // Shown above the text: the chips for what it's been given to read.
    attachment?: React.ReactNode
    // What the + menu offers. Without it, there's no +.
    add?: AddMenuOptions
    // Files dropped or pasted onto the box, which go where A file's do.
    onFiles?: (files: File[]) => void
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
}> = ({ label, placeholder, value, onChange, onKeyDown, rows = 1, autoFocus, focusKey, spellCheck, size = 'chat', attachment, add, onFiles, bare, canSend, onSend, onStop, mascot, onChooseMascot, chosenId, face, quietPlaceholder, cloud, limits }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [choosing, setChoosing] = useState(false)
    const [adding, setAdding] = useState(false)
    // Files are being dragged over the box. Counted, as entering a child leaves the parent.
    const [dropping, setDropping] = useState(false)
    const dragDepth = useRef(0)
    const box = useRef<HTMLDivElement>(null)
    const pill = useRef<HTMLButtonElement>(null)
    const plus = useRef<HTMLButtonElement>(null)
    const hero = size === 'hero'
    // The desktop's box is the only one with smaller tools. In a chat they're the new tab's size.
    const small = !!bare
    // The chat's card is `card`, a step up from the page it's on in dark, and anything quiet on it is `card-2`. The new
    // tab's sits on the well and the desktop's is a window of its own, so they keep `sheet` and `sheet-2`.
    const onCard = !hero && !bare
    // The last words, kept while the line slides away.
    const [lastLimits, setLastLimits] = useState(limits ?? '')
    useEffect(() => {
        if (limits) setLastLimits(limits)
    }, [limits])

    useEffect(() => {
        if (!choosing && !adding) return
        const close = (event: PointerEvent) => {
            if (box.current?.contains(event.target as Node)) return
            setChoosing(false)
            setAdding(false)
        }
        window.addEventListener('pointerdown', close)
        return () => window.removeEventListener('pointerdown', close)
    }, [choosing, adding])

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
    const closeAdding = (refocus: boolean) => {
        setAdding(false)
        if (refocus) plus.current?.focus()
    }

    // Only files: a link or words dragged in aren't added.
    const carriesFiles = (event: React.DragEvent) => !!onFiles && [...event.dataTransfer.types].includes('Files')
    const dropHandlers = onFiles
        ? {
              onDragEnter: (event: React.DragEvent) => {
                  if (!carriesFiles(event)) return
                  event.preventDefault()
                  dragDepth.current++
                  setDropping(true)
              },
              onDragOver: (event: React.DragEvent) => {
                  if (!carriesFiles(event)) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
              },
              onDragLeave: (event: React.DragEvent) => {
                  if (!carriesFiles(event)) return
                  dragDepth.current = Math.max(0, dragDepth.current - 1)
                  if (dragDepth.current === 0) setDropping(false)
              },
              onDrop: (event: React.DragEvent) => {
                  if (!carriesFiles(event)) return
                  event.preventDefault()
                  dragDepth.current = 0
                  setDropping(false)
                  onFiles([...event.dataTransfer.files])
                  textareaRef.current?.focus()
              },
          }
        : {}

    const sendButton = (
        <button
            type="button"
            aria-label={onStop ? 'Stop' : cloud?.on ? 'Send to the cloud' : 'Send'}
            onClick={onStop ?? onSend}
            disabled={!onStop && !canSend}
            className={cn(
                'shrink-0 rounded-full flex items-center justify-center transition-[background-color,color,transform] duration-fast active:scale-[.96]',
                small ? 'size-7' : 'size-8',
                'bg-ink text-sheet hover:bg-ink/85 disabled:text-faint disabled:active:scale-100',
                onCard ? 'disabled:bg-card-2' : 'disabled:bg-sheet-2',
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
            onPaste={(event) => {
                // A picture or a file pasted is added, as A file adds it. Words pasted are typing, whatever else came with them.
                const files = [...event.clipboardData.files]
                if (!onFiles || files.length === 0 || event.clipboardData.types.includes('text/plain')) return
                event.preventDefault()
                onFiles(files)
            }}
            className={cn(
                'block w-full resize-none bg-transparent text-ink caret-ink outline-none placeholder:text-faint placeholder:transition-opacity placeholder:duration-[120ms]',
                hero ? 'text-15 min-h-[50px]' : 'text-15 min-h-[34px]',
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

    const plusButton = add && (
        <button
            ref={plus}
            type="button"
            aria-label="Add a tab or a file"
            title="Add a tab or a file"
            aria-haspopup="menu"
            aria-expanded={adding}
            onClick={() => {
                setChoosing(false)
                setAdding(!adding)
            }}
            className={cn(
                'shrink-0 flex items-center justify-center text-ink transition-[background-color,transform] duration-fast hover:bg-press active:scale-[.96]',
                onCard ? 'bg-card-2' : 'bg-sheet-2',
                adding && 'bg-press',
                small ? 'size-7 rounded-row' : 'size-8 rounded-tile',
                FOCUS
            )}
        >
            <Plus className="size-4" strokeWidth={1.5} />
        </button>
    )

    return (
        <div ref={box} className="relative w-full" {...dropHandlers}>
            {/* At chat size it's a 16px card in a 20px shell, as an approval is, so the chat's cards read as one family. */}
            <div className={cn(dropping ? 'bg-tray p-1 shadow-[inset_0_0_0_1.5px_rgb(var(--ink))]' : SHELL, hero ? 'rounded-shell' : 'rounded-card-shell')}>
                <div
                    onClick={(event) => {
                        if (!(event.target as Element).closest('button,[role=menu],[role=group]')) textareaRef.current?.focus()
                    }}
                    data-sheet={onCard ? undefined : ''}
                    className={cn(
                        'group/box relative cursor-text',
                        dropping ? 'bg-transparent' : cn('shadow-card-lift', onCard ? 'bg-card' : 'bg-sheet'),
                        hero ? 'rounded-prompt pt-[18px] pr-3 pb-3 pl-5' : 'rounded-sheet pt-[13px] pr-[9px] pb-[9px] pl-4'
                    )}
                >
                    {/* Dropping: the box keeps its size, and says what letting go does. */}
                    {dropping && <p aria-hidden className="absolute inset-0 flex items-center justify-center text-15 text-ink pointer-events-none">Drop to add</p>}
                    <div className={cn(dropping && 'invisible')}>
                        {attachment && <div className="mb-2.5 -ml-1.5 cursor-default">{attachment}</div>}
                        <div className={hero ? 'mb-1' : undefined}>{textarea}</div>
                        <div className="-ml-2 flex items-center gap-[7px]">
                            {plusButton}
                            {cloud && <WhereSwitch on={cloud.on} onToggle={cloud.onToggle} small={small} />}
                            <span className="flex-1" />
                            {mascot && (
                                <MascotPill
                                    mascot={mascot}
                                    face={face}
                                    small={small}
                                    onCard={onCard}
                                    chooser={
                                        onChooseMascot && {
                                            open: choosing,
                                            onToggle: () => {
                                            setAdding(false)
                                            setChoosing(!choosing)
                                        },
                                            onOpen: () => setChoosing(true),
                                            button: pill
                                        }
                                    }
                                />
                            )}
                            {sendButton}
                        </div>
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
            {adding && add && <AddMenu {...add} above={!hero} onClose={closeAdding} />}
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
    // Whether main took the message. It may refuse one, as when an attached tab has been handed to the user since.
    onSend: (message: string, attached: Attached) => Promise<boolean>
    onStop?: () => void
    disabled?: boolean
    placeholder: string
    // Shown first among the chips, such as the page in front.
    attachment?: React.ReactNode
    // Where the + adds a tab or a file. Without it, there's no +.
    attach?: { chatId: string | null; mascot: MascotProfile; place: JobPlace; thisPage?: AddMenuOptions['thisPage'] }
    autoFocus?: boolean
    // Text to add to whatever is already being written. It's never sent without the user.
    draft?: string | null
    onDraftTaken?: () => void
    mascot?: MascotProfile
    onChooseMascot?: (id: string) => void
}> = ({ onSend, onStop, disabled = false, placeholder, attachment, attach, autoFocus, draft, onDraftTaken, mascot, onChooseMascot }) => {
    const [value, setValue] = useState('')
    const [focusKey, setFocusKey] = useState(0)
    const box = useAttachments(attach?.place ?? 'here')
    const add = useAddMenu(box, { chatId: attach?.chatId ?? null, mascot: attach?.mascot ?? BERRY, place: attach?.place ?? 'here', thisPage: attach?.thisPage })

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

    // What was typed and attached stays in the box until main has taken it, so a refused message can be sent again.
    const sending = useRef(false)
    const send = async () => {
        const message = value.trim()
        if (!message || disabled || sending.current) return
        sending.current = true
        const sent = await onSend(message, box.sendable()).finally(() => (sending.current = false))
        if (!sent) return
        setValue('')
        box.clear()
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
                    void send()
                }
            }}
            attachment={box.empty && !attachment ? undefined : <BoxChips box={box} before={attachment} />}
            add={attach ? add : undefined}
            onFiles={attach && attach.place !== 'runner' ? (files) => void box.addFiles(files) : undefined}
            canSend={!disabled && value.trim().length > 0}
            onSend={() => void send()}
            onStop={onStop}
            mascot={mascot}
            onChooseMascot={onChooseMascot}
        />
    )
}
