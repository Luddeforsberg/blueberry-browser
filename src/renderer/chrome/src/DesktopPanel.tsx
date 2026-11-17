import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, ChevronDown, Cloud, Laptop, Lock } from 'lucide-react'
import type { DesktopAsk, DesktopEdge, DesktopFace, DesktopPanelState, DesktopTray } from '@shared/ipc'
import { DESKTOP_BOX, DESKTOP_SHADOW, DESKTOP_SHEET } from '@shared/desktopSizes'
import { SHORTCUTS, shortcutKeys } from '@shared/shortcuts'
import { ExactWords } from '@common/components/ApprovalCard'
import { Button } from '@common/components/Button'
import { SwitchSheet } from '@common/components/Controls'
import { Mascot } from '@common/components/Mascot'
import { Pips } from '@common/components/Pips'
import { TIP_KEY, Tooltip, TooltipProvider } from '@common/components/Tooltip'
import { cn } from '@common/lib/utils'
import { HANDOFF_TITLE } from './components/ChatMessage'
import { DropFace, DropShape } from './DesktopDrop'
import { EASE, FADES_IN, clockTime, dropAt, elapsed, restingSize, sideEdge } from './desktopShape'
import { waitedFor } from './needsYouWords'
import { asContinuation, withSiteNames } from './siteNames'
import { useDesktopTheme } from './useDesktopTheme'

const desktop = () => window.chromeAPI.desktop

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'
// Five lines of words, and then the box scrolls.
const MAX_TEXT_HEIGHT = 5 * 23
const BOX_PADDING = (DESKTOP_BOX.thick - 23) / 2
const CHIP = 'press h-7 min-w-0 max-w-40 shrink px-[11px] rounded-full bg-tip text-tip-ink shadow-tip text-13 font-medium inline-flex items-center gap-1.5 whitespace-nowrap'

const useRoom = () => {
    const [room, setRoom] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
    useEffect(() => {
        const resized = () => setRoom({ width: window.innerWidth, height: window.innerHeight })
        window.addEventListener('resize', resized)
        return () => window.removeEventListener('resize', resized)
    }, [])
    return room
}

const useNow = (every: number): number => {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), every)
        return () => clearInterval(timer)
    }, [every])
    return now
}

const Keys: React.FC<{ keys: string[] }> = ({ keys }) => (
    <span className="flex gap-[3px]">
        {keys.map((key) => (
            <kbd key={key} className={TIP_KEY}>{key}</kbd>
        ))}
    </span>
)

// This PC or Cloud, on the drop: the chosen side carries its name and the other is its icon, and the sheet slides.
const WhereSwitch: React.FC<{ on: boolean; mac: boolean; onToggle: () => void }> = ({ on, mac, onToggle }) => {
    const group = useRef<HTMLDivElement>(null)
    const ruler = useRef<HTMLSpanElement>(null)
    const here = mac ? 'This Mac' : 'This PC'
    const sides = ([false, true] as const).map((cloud) => ({
        chosen: on === cloud,
        Icon: cloud ? Cloud : Laptop,
        label: cloud ? 'Cloud' : here,
        tip: cloud ? `${on ? 'Runs' : 'Run'} in the cloud, with your ${mac ? 'Mac' : 'PC'} off` : `${on ? 'Run' : 'Runs'} on ${mac ? 'this Mac' : 'this PC'}`
    }))
    const side = 'h-[26px] px-2 flex items-center rounded-full text-13'
    const name = (chosen: boolean) => cn('whitespace-nowrap overflow-hidden', chosen ? 'max-w-20 ml-1.5 opacity-100' : 'max-w-0 ml-0 opacity-0')
    return (
        <div ref={group} role="radiogroup" aria-label="Where it runs" className="relative shrink-0 flex p-[3px] rounded-full bg-tip-ink/10">
            <span ref={ruler} aria-hidden className="absolute inset-0 p-[3px] flex invisible pointer-events-none">
                {sides.map(({ chosen, Icon, label }) => (
                    <span key={label} data-side className={side}>
                        <Icon className="size-[14px]" strokeWidth={1.75} />
                        <span className={name(chosen)}>{label}</span>
                    </span>
                ))}
            </span>
            <SwitchSheet group={group} ruler={ruler} chosen={on ? 1 : 0} className="bg-tip-ink/[.18]" />
            {sides.map(({ chosen, Icon, label, tip }) => (
                <Tooltip key={label} words={tip}>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        aria-label={label}
                        onClick={() => !chosen && onToggle()}
                        className={cn(side, 'press relative', chosen ? 'text-tip-ink' : 'text-tip-ink/60 hover:text-tip-ink', FOCUS)}
                    >
                        <Icon className="size-[14px]" strokeWidth={1.75} />
                        <span className={cn(name(chosen), 'transition-[max-width,margin,opacity] duration-slide ease-crisp')}>{label}</span>
                    </button>
                </Tooltip>
            ))}
        </div>
    )
}

// The prompt box: the drop, grown. Each opening starts at the drop's own size and place, over the drop in its window
// beneath, and grows from there, and closing shrinks it back before the window hides, so the two read as one shape.
const GrownBox: React.FC<{ state: DesktopPanelState; mac: boolean; draft: string; setDraft: (draft: string) => void }> = ({ state, mac, draft, setDraft }) => {
    const { box, edge, anchor, still, closing, opened, showBerry } = state
    const room = useRoom()
    const [grown, setGrown] = useState(false)
    const [picking, setPicking] = useState(false)
    const [cloudChoice, setCloudChoice] = useState<boolean | null>(null)
    const [textHeight, setTextHeight] = useState(23)
    const field = useRef<HTMLTextAreaElement>(null)

    // Null follows the mascot, which may work in the cloud. Choosing another goes back to following it.
    useEffect(() => setCloudChoice(null), [box.chosen.id])
    const inCloud = box.cloud.fits && (cloudChoice ?? box.cloud.on)

    useLayoutEffect(() => {
        setPicking(false)
        if (still) return setGrown(true)
        setGrown(false)
        // Drawn once at the drop's size, then grown from it.
        let second = 0
        const first = requestAnimationFrame(() => (second = requestAnimationFrame(() => setGrown(true))))
        return () => {
            cancelAnimationFrame(first)
            cancelAnimationFrame(second)
        }
    }, [opened, still])
    useEffect(() => {
        if (closing) setGrown(false)
    }, [closing])
    useEffect(() => {
        field.current?.focus()
    }, [opened])
    // Esc closes the picker, and then the box, wherever the keyboard is in it.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            if (!picking) return void desktop().closePanel()
            setPicking(false)
            field.current?.focus()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [picking])

    // The box grows taller with the words, to five lines.
    useLayoutEffect(() => {
        const element = field.current
        if (!element) return
        element.style.height = 'auto'
        const height = Math.min(element.scrollHeight, MAX_TEXT_HEIGHT)
        element.style.height = `${height}px`
        setTextHeight(height)
    }, [draft])
    const thick = Math.max(DESKTOP_BOX.thick, textHeight + 2 * BOX_PADDING)
    useLayoutEffect(() => {
        void desktop().panelHeight(thick)
    }, [thick, opened])

    const resting = restingSize(edge)
    const size = grown ? { width: DESKTOP_BOX.long, height: thick } : resting
    const at = dropAt(edge, anchor, size, room)
    const final = dropAt(edge, anchor, { width: DESKTOP_BOX.long, height: thick }, room)
    const name = box.chosen.name
    const words = draft.trim()
    const others = box.flock.length > 1

    const send = async () => {
        if (words && (await desktop().send(words, inCloud))) setDraft('')
    }
    const next = (by: number) => {
        const at = box.flock.findIndex(({ id }) => id === box.chosen.id)
        const mascot = box.flock[(at + by + box.flock.length) % box.flock.length]
        if (mascot && mascot.id !== box.chosen.id) void desktop().choose(mascot.id)
    }

    // Over the box and under it, on the screen's side of it: chips nearest, then the keys.
    const across = sideEdge(edge)
    const chipsY = across || edge === 'bottom' ? final.y - 8 - 28 : final.y + thick + 8
    const keysY = across ? final.y + thick + 8 : edge === 'bottom' ? chipsY - 8 - 24 : chipsY + 28 + 8
    const line: React.CSSProperties =
        edge === 'right'
            ? { right: 12, left: DESKTOP_SHADOW, justifyContent: 'flex-end' }
            : edge === 'left'
              ? { left: 12, right: DESKTOP_SHADOW }
              : { left: final.x, width: DESKTOP_BOX.long, justifyContent: 'center' }
    const around = cn('absolute flex gap-1.5', still ? '' : 'transition-opacity duration-menu ease-crisp', grown && !closing ? 'opacity-100' : 'opacity-0 pointer-events-none')
    const chips = picking
        ? box.flock.map((mascot) => (
              <button
                  key={mascot.id}
                  type="button"
                  aria-pressed={mascot.id === box.chosen.id}
                  onClick={() => {
                      void desktop().choose(mascot.id)
                      setPicking(false)
                      field.current?.focus()
                  }}
                  className={cn(CHIP, 'pl-1.5', mascot.id === box.chosen.id && 'ring-[1.5px] ring-tip-ink/80', FOCUS)}
              >
                  <DropFace face={{ name: mascot.name, look: mascot.look, mood: 'rest' }} size={18} showBerry={showBerry} still />
                  <span className="truncate">{mascot.name}</span>
              </button>
          ))
        : box.recent.map((job) => (
              <button
                  key={job.prompt}
                  type="button"
                  onClick={() => {
                      setDraft(job.prompt)
                      field.current?.focus()
                  }}
                  className={cn(CHIP, FOCUS)}
              >
                  <span className="truncate">{job.label}</span>
              </button>
          ))

    return (
        <>
            <div className={around} style={{ top: chipsY, ...line }} aria-label={picking ? 'Your mascots' : 'Jobs sent before'} role="group">
                {chips}
            </div>
            <div className={cn(around, 'pointer-events-none')} style={{ top: keysY, ...line }} aria-hidden>
                {[
                    { keys: ['↵'], words: 'Send' },
                    ...(others ? [{ keys: ['Tab'], words: 'Next mascot' }] : []),
                    { keys: ['Esc'], words: 'Close' }
                ].map((hint) => (
                    <span key={hint.words} className="h-6 pl-1 pr-[9px] rounded-[8px] bg-tip/[.82] text-tip-ink text-12 font-medium inline-flex items-center gap-1.5">
                        <Keys keys={hint.keys} />
                        {hint.words}
                    </span>
                ))}
            </div>
            <DropShape edge={edge} x={at.x} y={at.y} width={size.width} height={size.height} still={still} data-desktop-box>
                <div
                    className={cn('dark absolute inset-y-0 left-0 flex items-center gap-2 pl-2 pr-[9px]', still ? '' : 'transition-opacity ease-out', grown && !closing ? 'opacity-100 duration-[120ms]' : 'opacity-0 duration-[60ms]')}
                    style={{ width: DESKTOP_BOX.long }}
                >
                    <Tooltip words="Choose a mascot">
                        <button
                            type="button"
                            aria-label={`Choose a mascot: ${name}`}
                            aria-expanded={picking}
                            onClick={() => setPicking((was) => !was)}
                            className={cn('press h-9 pl-[5px] pr-1.5 rounded-full bg-tip-ink/10 hover:bg-tip-ink/[.16] flex items-center gap-1 shrink-0', FOCUS)}
                        >
                            <DropFace face={{ name, look: box.chosen.look, mood: 'rest' }} size={20} showBerry={showBerry} still />
                            <ChevronDown className={cn('size-3 text-tip-ink/60 transition-transform duration-menu ease-crisp', picking && 'rotate-180')} strokeWidth={1.75} />
                        </button>
                    </Tooltip>
                    <textarea
                        ref={field}
                        rows={1}
                        value={draft}
                        aria-label={`Give ${name} a job`}
                        placeholder={`Give ${name} a job`}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault()
                                void send()
                            } else if (event.key === 'Tab' && others) {
                                event.preventDefault()
                                next(event.shiftKey ? -1 : 1)
                            }
                        }}
                        className="flex-1 min-w-0 resize-none bg-transparent text-15 leading-[23px] text-tip-ink placeholder:text-tip-ink/50 caret-focus outline-none overflow-y-auto"
                    />
                    {box.cloud.fits && <WhereSwitch on={inCloud} mac={mac} onToggle={() => setCloudChoice(!inCloud)} />}
                    <Tooltip words={words ? 'Send' : null}>
                        <button
                            type="button"
                            aria-label="Send"
                            disabled={!words}
                            onClick={() => void send()}
                            className={cn('press size-[34px] shrink-0 rounded-full grid place-items-center', words ? 'bg-tip-ink text-tip' : 'bg-tip-ink/[.14] text-tip-ink/55', FOCUS)}
                            style={{ transition: still ? undefined : `background-color 160ms ${EASE}, color 160ms ${EASE}` }}
                        >
                            <ArrowUp className="size-4" strokeWidth={2} />
                        </button>
                    </Tooltip>
                </div>
            </DropShape>
        </>
    )
}

const Label: React.FC<{ ask?: boolean; count?: number; children: React.ReactNode }> = ({ ask = false, count, children }) => (
    <h3 className={cn('mt-3 mb-1 px-2.5 flex items-baseline gap-[7px] text-12 font-medium', ask ? 'text-ask' : 'text-ink-2')}>
        {children}
        {count !== undefined && <span className={cn('font-mono text-11', ask ? 'text-ask/75' : 'text-faint')}>{count}</span>}
    </h3>
)

const Face: React.FC<{ face: DesktopFace; size: number; showBerry: boolean; still: boolean }> = ({ face, size, showBerry, still }) =>
    showBerry ? (
        <Mascot mood={face.mood} size={size} look={face.look} name={face.name} still className="shrink-0" />
    ) : (
        <span className="shrink-0 grid place-items-center text-ink-3" style={{ width: size, height: size }}>
            <Pips pattern={face.mood === 'asking' ? 'waiting' : face.mood === 'fetching' ? 'think' : 'done'} still={still || face.mood !== 'fetching'} className={face.mood === 'asking' || face.mood === 'oops' ? 'text-ask' : undefined} />
        </span>
    )

const ROW = cn('w-full mx-0.5 px-2.5 py-[7px] flex items-center gap-2.5 rounded-tile text-left hover:bg-hover active:bg-press transition-colors duration-fast', FOCUS)

// What's going, waiting and finished today, beside the drop. Each row opens its chat in Blueberry, and Answer opens the ask.
const TraySheet: React.FC<{ tray: DesktopTray; state: DesktopPanelState; mac: boolean }> = ({ tray, state, mac }) => {
    const now = useNow(1000)
    const { showBerry, still, box } = state
    const chosen = tray.flock.find((face) => face.chosen)
    return (
        <section data-desktop-tray aria-label="Your mascots" className={cn('w-[324px] max-h-full overflow-y-auto rounded-menu bg-sheet shadow-lift shrink-0', !still && 'animate-menu-in')}>
            <div data-sheet-content className="p-2">
                <div className="flex items-center justify-between pl-1.5 pr-2 pt-1.5 pb-0.5">
                    <div className="flex gap-1">
                        {tray.flock.map((face, index) => (
                            <span key={index} className={cn('p-[3px] rounded-full', face.chosen && 'shadow-[inset_0_0_0_1.5px_rgb(var(--ink))]')}>
                                <Face face={face} size={22} showBerry={showBerry} still />
                            </span>
                        ))}
                    </div>
                    <button type="button" onClick={() => void desktop().openBlueberry()} className={cn('press h-7 px-1.5 rounded-row inline-flex items-center gap-1 text-13 font-medium text-ink-2 hover:text-ink', FOCUS)}>
                        Open Blueberry
                        <ArrowUpRight className="size-[13px]" strokeWidth={1.75} />
                    </button>
                </div>
                {tray.asks.length > 0 && (
                    <>
                        <Label ask count={tray.asks.length}>Needs you</Label>
                        <ul className="flex flex-col gap-1.5">
                            {tray.asks.map((ask) => (
                                <li key={ask.key} className="mx-0.5 pl-[9px] pr-2.5 py-2.5 rounded-sheet bg-card shadow-up flex items-center gap-2.5">
                                    <Face face={ask} size={24} showBerry={showBerry} still />
                                    <span className="min-w-0 flex-1 flex flex-col">
                                        <span className="truncate text-14 font-medium text-ink">{ask.words}</span>
                                        <span className="font-mono text-11.5 text-ink-3">{waitedFor(ask.since, now)}</span>
                                    </span>
                                    <Button size="sm" onClick={() => void desktop().trayPress(ask.key)}>Answer</Button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                {tray.working.length > 0 && (
                    <>
                        <Label count={tray.working.length}>Working</Label>
                        <ul>
                            {tray.working.map((job) => (
                                <li key={job.key} className="flex">
                                    <button type="button" onClick={() => void desktop().trayPress(job.key)} className={ROW}>
                                        <Face face={job} size={24} showBerry={showBerry} still />
                                        <span className="min-w-0 flex-1 flex flex-col">
                                            <span className="truncate text-14 font-medium text-ink">{job.title}</span>
                                            <span className="min-w-0 flex items-center gap-[7px] text-13 text-ink-2">
                                                <Pips pattern="think" still={still} />
                                                <span className="truncate">{job.step ?? 'Thinking..'}</span>
                                            </span>
                                        </span>
                                        {job.since !== null && <span className="shrink-0 font-mono text-11.5 text-faint tabular-nums">{elapsed(job.since, now)}</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                {tray.finished.length > 0 && (
                    <>
                        <Label>Finished today</Label>
                        <ul>
                            {tray.finished.map((job) => (
                                <li key={job.key} className="flex">
                                    <button type="button" onClick={() => void desktop().trayPress(job.key)} className={ROW}>
                                        <Face face={job} size={24} showBerry={showBerry} still />
                                        <span className="min-w-0 flex-1 flex flex-col">
                                            <span className="truncate text-14 font-medium text-ink-2">{job.title}</span>
                                            <span className={cn('truncate text-13', job.problem ? 'text-ask' : 'text-ink-3')}>
                                                {job.problem ?? 'Done'}
                                                <span className="font-mono text-11.5"> · {clockTime(job.at)}</span>
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                <button type="button" onClick={() => void desktop().openBox()} className={cn('press mt-2.5 w-full h-[42px] pl-1.5 pr-2.5 rounded-[15px] bg-sheet-2 flex items-center gap-1.5 text-14 text-faint hover:text-ink-2', FOCUS)}>
                    <span className="p-[5px]">{chosen && <Face face={{ ...chosen, mood: 'rest' }} size={20} showBerry={showBerry} still />}</span>
                    <span className="flex-1 text-left">Give {box.chosen.name} a job</span>
                    {box.shortcut && (
                        <span className="flex gap-[3px]">
                            {shortcutKeys(SHORTCUTS.desktop, mac).map((key) => (
                                <kbd key={key} className="min-w-4 px-1 py-[3px] rounded-[4px] bg-ink/[.08] text-center text-[10.5px] leading-none font-medium text-ink-2">{key}</kbd>
                            ))}
                        </span>
                    )}
                </button>
            </div>
        </section>
    )
}

// The ask, after Answer: the mascot asking, what it wants with addresses cut to their site, and the exact words, never
// cut. Only the decision goes back to main, which holds which ask this is.
const AskSheet: React.FC<{ ask: DesktopAsk; state: DesktopPanelState }> = ({ ask, state }) => {
    const { showBerry, still } = state
    const [answer, setAnswer] = useState('')
    const [problem, setProblem] = useState<string | null>(null)
    const [sent, setSent] = useState(false)
    const name = ask.face.name
    const field = useRef<HTMLInputElement>(null)
    const sheet = useRef<HTMLElement>(null)

    useEffect(() => {
        if (ask.kind === 'question') field.current?.focus()
        else sheet.current?.focus()
    }, [ask.kind, state.opened])

    const decide = async (allow: boolean, words?: string) => {
        if (sent) return
        setSent(true)
        const result = await desktop().decide(words === undefined ? { allow } : { allow, answer: words })
        if (result === 'code') {
            setSent(false)
            setProblem('That looks like a code. Codes only go into the page itself, never through here.')
        }
    }

    const wants = withSiteNames(asContinuation(ask.text))
    const lead = 'relative mt-2 text-13 text-ink-2'
    const title = 'relative mt-0.5 text-[18px] leading-[23px] font-semibold tracking-[-.02em] text-ink [overflow-wrap:anywhere]'
    return (
        <section
            ref={sheet}
            tabIndex={-1}
            data-desktop-ask={ask.kind}
            aria-label={`${name} is asking`}
            className={cn('w-[324px] max-h-full overflow-y-auto shrink-0 rounded-prompt bg-sheet shadow-lift outline-none', !still && 'animate-menu-in')}
        >
            <div data-sheet-content className="relative px-4 pt-[18px] pb-3.5 text-center">
                <div aria-hidden className="absolute inset-x-0 top-0 h-[150px] max-h-full pointer-events-none bg-[radial-gradient(circle,var(--dot)_1px,transparent_1.3px)] bg-[length:16px_16px] bg-[position:8px_8px] [mask-image:radial-gradient(120%_100%_at_50%_0,#000_20%,transparent_78%)]" />
                <div className="relative flex justify-center">
                    {/* Once it's answered, it goes back to work. */}
                    <Face face={ask.said ? { ...ask.face, mood: 'fetching' } : ask.face} size={56} showBerry={showBerry} still />
                </div>
                {ask.said ? (
                    <p role="status" className={cn('relative mt-3 mb-2 text-15 text-ink', FADES_IN)}>{ask.said}</p>
                ) : ask.kind === 'handoff' && ask.handoff ? (
                    <>
                        <p className={lead}>{name} needs you to</p>
                        <h2 className={cn(title, 'flex items-center justify-center gap-2')}>
                            <Lock aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                            {HANDOFF_TITLE[ask.handoff.need]} {ask.handoff.site}
                        </h2>
                        <p className="relative mt-2 text-13 leading-[19px] text-ink-2">Only you can do this, in the page in Blueberry. What you type there goes straight to the site.</p>
                        <Button className="relative mt-3 w-full h-[42px] text-14" onClick={() => void desktop().seePage()}>Open the page</Button>
                    </>
                ) : ask.kind === 'question' ? (
                    <>
                        <p className={lead}>{name} asks</p>
                        <h2 className={title}>{ask.text}</h2>
                        {ask.answers.length > 0 && (
                            <ul aria-label="Answers" className="relative mt-3 flex flex-col gap-1 text-left">
                                {ask.answers.map((each) => (
                                    <li key={each} className="flex">
                                        <button type="button" disabled={sent} onClick={() => void decide(true, each)} className={cn('press h-10 flex-1 min-w-0 px-3 rounded-tile bg-card-2 text-14 text-ink truncate text-left hover:[background-image:linear-gradient(var(--hover),var(--hover))]', FOCUS)}>
                                            {each}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <form
                            className="relative mt-3 flex items-center gap-2"
                            onSubmit={(event) => {
                                event.preventDefault()
                                if (answer.trim()) void decide(true, answer)
                            }}
                        >
                            <input
                                ref={field}
                                aria-label={`Your answer to ${name}`}
                                value={answer}
                                placeholder={ask.answers.length > 0 ? 'Or type an answer' : 'Your answer'}
                                onChange={(event) => {
                                    setAnswer(event.target.value)
                                    setProblem(null)
                                }}
                                className="min-w-0 flex-1 h-9 px-3 rounded-tile bg-card-2 shadow-[inset_0_0_0_1px_var(--line)] text-14 text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-focus"
                            />
                            <Button type="submit" disabled={!answer.trim() || sent}>Answer</Button>
                        </form>
                        {problem && <p role="alert" className="relative mt-2 text-13 text-ask text-left">{problem}</p>}
                        <div className="relative mt-2 flex">
                            <Button variant="ghost" size="sm" className="-ml-2 px-2" disabled={sent} onClick={() => void decide(false)}>Skip</Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className={lead}>{name} wants to</p>
                        <h2 className={title}>{wants}</h2>
                        <ExactWords className="relative mt-3.5 text-left bg-card-2">{ask.text}</ExactWords>
                        <div className="relative mt-3 grid grid-cols-[1.25fr_1fr] gap-2">
                            <Button className="h-[42px] text-14" disabled={sent} onClick={() => void decide(true)}>Allow</Button>
                            <Button variant="raised" className="h-[42px] text-14" disabled={sent} onClick={() => void decide(false)}>Don’t allow</Button>
                        </div>
                    </>
                )}
                {!ask.said && ask.kind !== 'handoff' && (
                    <p className="relative mt-3 mx-0.5 flex items-center gap-2.5 text-13 text-ink-3 text-left">
                        <span className="min-w-0 flex-1 truncate">For “{ask.job}”</span>
                        <button type="button" onClick={() => void desktop().seePage()} className={cn('shrink-0 rounded-row inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink', FOCUS)}>
                            See the page
                            <ArrowUpRight className="size-[13px]" strokeWidth={1.75} />
                        </button>
                    </p>
                )}
            </div>
        </section>
    )
}

// Side by side beside the drop, the tray nearest it, and as tall as the taller, which main sizes the window to.
const Sheets: React.FC<{ state: DesktopPanelState; mac: boolean }> = ({ state, mac }) => {
    const { tray, ask, edge, closing, still } = state
    const root = useRef<HTMLDivElement>(null)
    // What's in them at their own height, however much of it the window has room for, whenever any of it changes.
    const shown = `${!!tray}:${ask ? `${ask.kind}:${ask.text}` : ''}`
    useLayoutEffect(() => {
        const element = root.current
        if (!element) return
        const contents = [...element.querySelectorAll<HTMLElement>('[data-sheet-content]')]
        const report = () => void desktop().panelHeight(Math.max(0, ...contents.map((content) => content.offsetHeight)) + 2 * DESKTOP_SHADOW)
        report()
        const observer = new ResizeObserver(report)
        contents.forEach((content) => observer.observe(content))
        return () => observer.disconnect()
    }, [shown])
    const sheets = [tray && <TraySheet key="tray" tray={tray} state={state} mac={mac} />, ask && <AskSheet key={`${ask.kind}:${ask.text}`} ask={ask} state={state} />]
    const align: Record<DesktopEdge, string> = { right: 'items-center justify-end', left: 'items-center justify-start', top: 'items-start justify-center', bottom: 'items-end justify-center' }
    return (
        <div
            ref={root}
            className={cn('absolute inset-0 flex pointer-events-none [&>*]:pointer-events-auto', align[edge], !still && 'transition-opacity duration-fast', closing && 'opacity-0')}
            style={{ padding: DESKTOP_SHADOW, gap: DESKTOP_SHEET.gap }}
        >
            {edge === 'right' ? [...sheets].reverse() : sheets}
        </div>
    )
}

// The window beside the drop that can take the keyboard without bringing Blueberry forward: the prompt box, or the tray
// and the ask. A click anywhere in it that isn't on them, or Esc, closes it, and what was typed is kept.
export const DesktopPanelApp: React.FC = () => {
    const [state, setState] = useState<DesktopPanelState | null>(null)
    const [draft, setDraft] = useState('')
    const theme = useDesktopTheme()
    const mac = theme?.platform === 'mac'

    useEffect(() => {
        void desktop().panelState().then(setState)
        return desktop().onPanelState(setState)
    }, [])

    const sheets = state?.open === 'sheets'
    useEffect(() => {
        if (!sheets) return
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') void desktop().closePanel()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [sheets])

    if (!state?.open) return null
    return (
        <TooltipProvider mac={mac}>
            <div
                className="fixed inset-0"
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget) void desktop().closePanel()
                }}
            >
                {state.open === 'box' ? <GrownBox state={state} mac={mac} draft={draft} setDraft={setDraft} /> : <Sheets state={state} mac={mac} />}
            </div>
        </TooltipProvider>
    )
}
