import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { ChatApproval, ChatStep, HandoffNeed, MascotProfile, StepKind, UsedPage } from '@shared/library'
import { linkSite } from '@shared/publishing'
import { ArrowUp, Check, ChevronDown, Cloud, Copy, Lock, Repeat } from 'lucide-react'
import { ApprovalCard, CardInShell } from '@common/components/ApprovalCard'
import { useShell } from '../contexts/ShellContext'
import { asContinuation, withSiteNames } from '../siteNames'
import { STOPPED_STEP, trailFor } from '../stepTrail'
import { Button } from '@common/components/Button'
import { Pips, type PipMark, type PipPattern } from '@common/components/Pips'
import { useStill } from '@common/components/motion'
import { cn } from '@common/lib/utils'
import { useBrowser } from '../contexts/BrowserContext'
import { Berry, useAssistantName } from './Berry'
import type { Mood } from '@common/components/Mascot'
import { Favicon, siteIcon } from './Favicon'
import { SentAttachments } from './AttachmentChips'
import type { SentAttachment } from '@shared/attachments'
import { RememberedLine } from './MemoryInChat'
import { blankForm, setRoutinesView } from '../routinesView'

const FOLLOW_DISTANCE = 120
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'

// Keeps the newest words in view while a reply streams, unless the reader has scrolled up to read.
// Sending a message always comes back down to it.
export const useFollowReply = (sentCount: number, partial: string | null | undefined, stepCount: number) => {
    const scrollerRef = useRef<HTMLDivElement>(null)
    const lastSentCount = useRef(0)

    useLayoutEffect(() => {
        const scroller = scrollerRef.current
        if (!scroller) return
        const nearEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < FOLLOW_DISTANCE
        if (sentCount !== lastSentCount.current || nearEnd) scroller.scrollTop = scroller.scrollHeight
        lastSentCount.current = sentCount
    }, [sentCount, partial, stepCount])

    return scrollerRef
}

// `fromStranger` is for what someone else wrote: nothing in it can load anything or take you anywhere. An image is
// only its description, a link is its words and its site as text, and raw HTML shows as text, which ReactMarkdown does
// by itself as long as no plugin here parses it.
const STRANGER_COMPONENTS: Components = {
    img: ({ alt }) => <span>{alt}</span>,
    a: ({ children, href }) => {
        const site = href ? linkSite(href) : null
        const words = String(children)
        if (!site || words === site) return <span>{children}</span>
        return <span>{words === href ? site : <>{children} ({site})</>}</span>
    },
}

export const Markdown: React.FC<{ content: string; fromStranger?: boolean; className?: string }> = ({ content, fromStranger, className }) => (
    <div className={cn("prose max-w-none prose-pre:p-3 prose-pre:overflow-x-auto", className)}>
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
                code: ({ node, className, children, ...props }) => {
                    const inline = !className
                    return inline ? (
                        <code className="bg-sheet-2 px-1 py-0.5 rounded-row" {...props}>
                            {children}
                        </code>
                    ) : (
                        <code className={className} {...props}>
                            {children}
                        </code>
                    )
                },
                a: ({ children, href }) => (
                    <a
                        href={href}
                        className="text-ink hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {children}
                    </a>
                ),
                ...(fromStranger ? STRANGER_COMPONENTS : {}),
            }}
        >
            {content}
        </ReactMarkdown>
    </div>
)

// Your own words, on `sheet-2` at the right, with a small corner where a tail would be (DESIGN.md section 10, Main chat).
// Yours, at the right, with what went with it over it.
export const UserMessage: React.FC<{ content: string; attached?: readonly SentAttachment[] }> = ({ content, attached }) => (
    <div className="flex flex-col items-end gap-1.5 animate-fade-in">
        {attached && attached.length > 0 && <div className="max-w-[80%]"><SentAttachments attached={attached} /></div>}
        <div className="max-w-[76%] px-3.5 py-2.5 rounded-sheet rounded-br-[5px] bg-sheet-2 text-15 text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">
            {content}
        </div>
    </div>
)

// Words for work happening right now: a band of `ink` passes through them. With the pips beside them they're one thing
// moving (DESIGN.md section 7), and they hold still as the pips do, in plain `ink`.
export const LiveWords: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => {
    const still = useStill()
    return <span className={cn(still ? 'text-ink' : 'bg-shimmer bg-[length:260%_100%] bg-clip-text text-transparent animate-shimmer', className)}>{children}</span>
}

// What a job said it's doing, in its mascot's own words, while it works. Its answer replaces it.
export const StatusLine: React.FC<{ text: string }> = ({ text }) => (
    <p role="status" className="text-14 text-ink-2 line-clamp-2">{text}</p>
)

// Left foot, right foot.
export const StepFootprint: React.FC<{ index: number }> = ({ index }) => (
    <svg aria-hidden viewBox="-8 -8 16 16" className="size-4" style={{ transform: `rotate(${index % 2 ? 12 : -12}deg)` }} fill="currentColor">
        <ellipse cx={0} cy={-3.6} rx={1.25} ry={2.9} />
        <ellipse cx={-3.2} cy={-1.2} rx={1.1} ry={2.5} transform="rotate(-34 -3.2 -1.2)" />
        <ellipse cx={3.2} cy={-1.2} rx={1.1} ry={2.5} transform="rotate(34 3.2 -1.2)" />
        <ellipse cx={0} cy={3} rx={1} ry={2.1} />
    </svg>
)

// Which pips a step has: the pattern while it's the live one, and its kind's still mark once it's done (DESIGN.md
// section 6). A step from before steps had kinds, or one no tool made, such as Stopped here, is plain.
const STEP_PIPS: Record<StepKind | 'plain', { live: PipPattern; done: PipMark }> = {
    open: { live: 'think', done: 'opened' },
    read: { live: 'reading', done: 'read' },
    scan: { live: 'scanning', done: 'read' },
    search: { live: 'searching', done: 'read' },
    click: { live: 'clicking', done: 'clicked' },
    type: { live: 'typing', done: 'typed' },
    ask: { live: 'waiting', done: 'done' },
    wait: { live: 'think', done: 'done' },
    plain: { live: 'think', done: 'done' },
}

// One line of what a mascot did or is doing, in its words, after a pip mark. The live one has moving pips and its
// words shimmer, and finished ones are `ink-3`.
const StepLine: React.FC<{ pips: PipPattern | PipMark; live?: boolean; ask?: boolean; children: React.ReactNode }> = ({ pips, live = false, ask = false, children }) => (
    <span className={cn('flex items-start gap-3 font-mono text-11.5', live ? 'text-ink' : 'text-ink-3')}>
        <span className={cn('h-4 shrink-0 flex items-center', ask && 'text-ask')}>
            <Pips pattern={pips} />
        </span>
        {live ? <LiveWords className="min-w-0 [overflow-wrap:anywhere]">{children}</LiveWords> : <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>}
    </span>
)

const StepItem: React.FC<{ step: ChatStep }> = ({ step }) => {
    const { live, done } = STEP_PIPS[step.kind ?? 'plain']
    return (
        <li>
            <StepLine pips={step.done ? done : live} live={!step.done} ask={!step.done && step.kind === 'ask'}>
                {step.shown ?? step.text}
                {!step.done && <span className="sr-only"> (in progress)</span>}
            </StepLine>
        </li>
    )
}

const StepList: React.FC<{ steps: ChatStep[] }> = ({ steps }) => (
    <ol aria-label="Steps" className="flex flex-col gap-[9px]">
        {steps.map((step, index) => <StepItem key={index} step={step} />)}
    </ol>
)

// The quiet line that stands for steps not showing, and opens them.
const FoldLine: React.FC<{ open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ open, onToggle, children }) => (
    <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn('-mx-1.5 px-1.5 h-6 w-fit flex items-center gap-1.5 rounded-row font-mono text-11.5 text-ink-2 transition-colors hover:text-ink', FOCUS)}
    >
        <ChevronDown aria-hidden className={cn('size-3 transition-transform duration-fast', !open && '-rotate-90')} strokeWidth={1.75} />
        {children}
    </button>
)

// What a mascot did on the way to a reply, outside a chat: a routine's run keeps this.
export const StepTrail: React.FC<{ steps: ChatStep[]; running?: boolean; cutShort?: boolean }> = ({ steps, running = false, cutShort = false }) => {
    const [open, setOpen] = useState(false)
    const { shown, line } = trailFor(steps, { running, cutShort, open })
    return (
        <div className="flex flex-col items-start gap-2">
            {line && <FoldLine open={open} onToggle={() => setOpen(!open)}>{line}</FoldLine>}
            {shown.length > 0 && <StepList steps={shown.map(({ step }) => step)} />}
        </div>
    )
}

// "12s", "1m 12s".
const elapsedWords = (ms: number): string => {
    const seconds = Math.max(0, Math.floor(ms / 1000))
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

const Elapsed: React.FC<{ since: number }> = ({ since }) => {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [])
    return <span className="ml-auto font-mono text-11.5 font-regular text-ink-3 tabular-nums">{elapsedWords(now - since)}</span>
}

// What a reply is doing between its steps: thinking, or waiting for an answer to a card. Present tense, two dots. With
// no steps yet the mascot's face beside it is the pips, so the words stand alone (`bare`).
const statusRow = (waiting: boolean, bare = false) => {
    const words = waiting ? 'Waiting for you..' : 'Thinking..'
    if (bare) return <LiveWords className="font-mono text-11.5">{words}</LiveWords>
    return waiting ? <StepLine pips="waiting" live ask>{words}</StepLine> : <StepLine pips="think" live>{words}</StepLine>
}

// While a reply works: an outlined block headed Working, with its latest steps and the one it's on now. The one thing
// that moves in a conversation is in here (DESIGN.md section 7).
const WorkingBlock: React.FC<{ steps: ChatStep[]; status: React.ReactNode; startedAt?: number; onShowWork?: () => void }> = ({ steps, status, startedAt, onShowWork }) => {
    const [open, setOpen] = useState(false)
    const { shown, line } = trailFor(steps, { running: true, open })
    return (
        <section aria-label="Working" className="rounded-sheet px-3.5 pt-3 pb-[13px] shadow-[inset_0_0_0_1px_var(--line)]">
            <h3 className="mb-[11px] h-[18px] flex items-center gap-2 text-14 font-medium text-ink">
                Working
                {startedAt !== undefined && <Elapsed since={startedAt} />}
                {/* Brings back the working view after Hide work. */}
                {onShowWork && (
                    <button
                        type="button"
                        onClick={onShowWork}
                        className={cn('-my-[3px] -mr-1.5 h-6 px-1.5 shrink-0 rounded-row text-13 font-regular text-ink-3 transition-colors hover:bg-hover hover:text-ink', startedAt === undefined && 'ml-auto', FOCUS)}
                    >
                        Show work
                    </button>
                )}
            </h3>
            <div role="status" className="pl-[5px] flex flex-col items-start gap-[9px]">
                {line && <FoldLine open={open} onToggle={() => setOpen(!open)}>{line}</FoldLine>}
                <StepList steps={shown.map(({ step }) => step)} />
                {status}
            </div>
        </section>
    )
}

// A chip, as under a finished reply and under the working view's picture. `bare` ones are outlined, for actions. A
// `tray` one keeps its fill and takes `hover` over it, so it darkens on a sheet as it does on the ground.
export const chipClass = (bare = false) =>
    cn(
        'h-7 max-w-full pl-[7px] pr-2.5 shrink-0 inline-flex items-center gap-[7px] rounded-row text-13 whitespace-nowrap transition-[background-color,color,transform] duration-fast active:scale-[.96]',
        bare
            ? 'shadow-[inset_0_0_0_1px_var(--line)] text-ink-2 hover:bg-hover hover:text-ink active:bg-press'
            : 'relative bg-tray text-ink-2 hover:text-ink after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-hover after:opacity-0 hover:after:opacity-100 active:after:bg-press',
        FOCUS
    )

const PageChips: React.FC<{ pages: UsedPage[] }> = ({ pages }) => (
    <ul aria-label="Pages it used" className="contents">
        {pages.map((page) => (
            <li key={page.url} className="min-w-0 max-w-full flex">
                <button type="button" title={page.url} onClick={() => void window.chromeAPI.browser.createTab(page.url)} className={chipClass()}>
                    <Favicon src={siteIcon(page.url)} site={page.url} />
                    <span className="truncate max-w-56">{page.title || page.url}</span>
                </button>
            </li>
        ))}
    </ul>
)

// A reply's action: an icon with its name as a tooltip, and no outline, so the reply stays the thing to read.
const ReplyAction: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        className={cn('size-7 shrink-0 grid place-items-center rounded-row text-ink-3 transition-[background-color,color,transform] duration-fast hover:bg-hover hover:text-ink active:bg-press active:scale-[.96]', FOCUS)}
    >
        {children}
    </button>
)

const CopyAction: React.FC<{ content: string }> = ({ content }) => {
    const [copied, setCopied] = useState(false)
    useEffect(() => {
        if (!copied) return undefined
        const timer = setTimeout(() => setCopied(false), 1500)
        return () => clearTimeout(timer)
    }, [copied])
    return (
        <ReplyAction label={copied ? 'Copied' : 'Copy'} onClick={() => void navigator.clipboard.writeText(content).then(() => setCopied(true))}>
            {copied ? <Check aria-hidden className="size-[15px]" strokeWidth={1.75} /> : <Copy aria-hidden className="size-[15px]" strokeWidth={1.75} />}
        </ReplyAction>
    )
}

// Save as routine: only what the user asked for, in a form they can change before saving it.
export const saveChatAsRoutine = (title: string, messages: Array<{ role: string; content: string }>, mascotId: string | null) => {
    const asked = messages.filter((message) => message.role === 'user').map((message) => message.content)
    setRoutinesView({ page: 'form', values: blankForm(title, asked.join('\n\n'), mascotId) })
    void window.chromeAPI.browser.openPage('routines')
}

// Whether a mascot has done something in this chat, so it has something to repeat.
export const didWork = (messages: Array<{ role: string; steps?: ChatStep[] }>) =>
    messages.some((message) => message.role === 'assistant' && (message.steps?.length ?? 0) > 0)

// What the last reply in a chat can do next, which an earlier one doesn't offer again.
export interface ReplyActions {
    // Carries on after Stop, or tries again after it went wrong, by saying so as the user.
    onSay: (words: string) => void
    // Only after a job that did some work: a reply that's just an answer has nothing to repeat.
    onSaveAsRoutine?: () => void
}

const stepsWord = (count: number) => `${count} ${count === 1 ? 'step' : 'steps'}`

// Where a chat runs, said only when it isn't here, or who started it when it wasn't the user. Quiet, over its first reply.
export interface ReplyOrigin {
    words: string
    cloud: boolean
}

const OriginLine: React.FC<{ origin: ReplyOrigin }> = ({ origin }) => (
    <p className="-mb-3 h-[22px] flex items-center gap-1.5 font-mono text-11.5 text-ink-3">
        {origin.cloud && <Cloud aria-hidden className="size-[13px] shrink-0" strokeWidth={1.75} />}
        <span className="min-w-0 truncate">{origin.words}</span>
    </p>
)

// A reply's face, beside its first line (DESIGN.md section 10). In the main chat it hangs in the gutter so the words keep
// their column, and in the panel it's smaller and in line. Beside a Working block it lines up with the heading. With
// Berry hidden there's no face, and the words take its place.
const WithFace: React.FC<{
    mascot?: MascotProfile
    mood: Mood
    still?: boolean
    gutter: boolean
    besideHeading?: boolean
    className?: string
    children: React.ReactNode
}> = ({ mascot, mood, still, gutter, besideHeading = false, className, children }) => {
    const { showBerry } = useShell().settings
    const place = gutter ? cn('absolute -left-9', besideHeading ? 'top-[9px]' : 'top-0') : besideHeading ? 'mt-[11px]' : 'mt-0.5'
    return (
        <div className={cn('group/reply flex animate-fade-in', gutter ? 'relative' : 'gap-2')}>
            {showBerry && <Berry mood={mood} size={gutter ? 24 : 20} mascot={mascot} still={still} className={cn('shrink-0', place)} />}
            <div className={cn('min-w-0 flex-1', className)}>{children}</div>
        </div>
    )
}

// A line of its own and what to do about it, in a reply: for stopped and went wrong. The reply's face says which.
const TroubleLine: React.FC<{ words: string; alert?: boolean; children?: React.ReactNode }> = ({ words, alert, children }) => (
    <div>
        <p role={alert ? 'alert' : undefined} className="text-15 text-ink [overflow-wrap:anywhere]">{words}</p>
        {children && <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{children}</div>}
    </div>
)

// What went wrong, in plain words, with Try again and the steps it got through. In the reply that went wrong, or on its
// own when there's no reply.
const WhatWentWrong: React.FC<{ message: string; steps: ChatStep[]; actions?: ReplyActions }> = ({ message, steps, actions }) => {
    const [open, setOpen] = useState(false)
    return (
        <>
            <TroubleLine words={message} alert>
                {actions && <Button onClick={() => actions.onSay('Try again')}>Try again</Button>}
                {steps.length > 0 && (
                    <Button variant="raised" aria-expanded={open} onClick={() => setOpen(!open)}>
                        {open ? 'Hide the steps' : `See the ${stepsWord(steps.length)}`}
                    </Button>
                )}
            </TroubleLine>
            {open && <StepList steps={steps} />}
        </>
    )
}

// A mascot's reply: plain text on the sheet, with its face beside it. While it works, the Working block comes first. Once
// it's done, the steps fold into a chip beside the pages it used, then come Copy and Save as routine on the last reply.
export const AssistantMessage: React.FC<{
    content: string
    steps?: ChatStep[]
    // What a running reply said it's doing, until its answer starts.
    statusLine?: string | null
    isStreaming?: boolean
    // A card is waiting for the user's answer.
    waiting?: boolean
    mascot?: MascotProfile
    // This reply went wrong on the way, and this is what happened.
    error?: string
    // What its mascot went into this reply remembering.
    memoryIds?: string[]
    // The pages its job opened, which closed when it ended.
    pages?: UsedPage[]
    // When the running reply started, where that's known.
    startedAt?: number
    // Set on the last reply only.
    actions?: ReplyActions
    // Set on the first reply only, where there's something to say.
    origin?: ReplyOrigin
    // While the working view is hidden.
    onShowWork?: () => void
    // In the main chat, where the face hangs in the gutter.
    gutter?: boolean
}> = ({ content, steps = [], statusLine, isStreaming = false, waiting = false, mascot, error, memoryIds, pages = [], startedAt, actions, origin, onShowWork, gutter = false }) => {
    const [open, setOpen] = useState(false)
    const { showBerry } = useShell().settings
    const failed = error !== undefined
    const working = isStreaming && steps.length > 0
    // While it runs: between steps, with no words yet, it says what it's doing. A step waiting on the user is already
    // the live one. With no Working block the face is the pips, so the words stand alone.
    const status = isStreaming && !content && !steps.some((step) => !step.done) ? statusRow(waiting, !working && showBerry) : null
    // Once it's done: a stopped reply says so in place of its last step, and the rest fold into a chip.
    const stopped = !isStreaming && steps.at(-1)?.text === STOPPED_STEP
    const done = stopped ? steps.slice(0, -1) : steps
    // Folded, the steps worth seeing on any trail still show: anything asked, refused or handed back.
    const { shown, line } = trailFor(done, { running: false, open })
    const chip = !isStreaming && done.length > 1 && !failed
    const listed = isStreaming || failed ? [] : chip && !open ? shown.map(({ step }) => step) : chip ? done : []
    // While it runs the face is the pips, which hold still beside a Working block, whose live step is what moves.
    const mood: Mood = failed ? 'oops' : !isStreaming ? 'rest' : waiting ? 'asking' : 'thinking'
    const besideHeading = working && !origin && !(statusLine && !content)

    // One tree whether it's running or done, with the words in the same place, so they aren't drawn again when it ends.
    return (
        <WithFace mascot={mascot} mood={mood} still={working} gutter={gutter} besideHeading={besideHeading} className="flex flex-col gap-4">
            {origin && <OriginLine origin={origin} />}
            {mascot && <RememberedLine ids={memoryIds} />}
            {isStreaming ? (
                <>
                    {statusLine && !content && <p role="status" className="text-15 text-ink-2 line-clamp-3">{statusLine}</p>}
                    {working ? (
                        <WorkingBlock steps={steps} status={status} startedAt={startedAt} onShowWork={onShowWork} />
                    ) : (
                        status && <div role="status" className="h-6 flex items-center">{status}</div>
                    )}
                </>
            ) : (
                done.length === 1 && !failed && <StepList steps={done} />
            )}
            {content && <Markdown content={content} />}
            {(chip || (!isStreaming && pages.length > 0)) && (
                <div className="-mt-1 flex flex-wrap gap-1.5">
                    {chip && (
                        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={chipClass()}>
                            <Pips pattern="read" />
                            {line}
                            <ChevronDown aria-hidden className={cn('size-3 transition-transform duration-fast', open && 'rotate-180')} strokeWidth={1.75} />
                        </button>
                    )}
                    <PageChips pages={pages} />
                </div>
            )}
            {listed.length > 0 && <StepList steps={listed} />}
            {stopped && (
                <TroubleLine words={done.length ? `You stopped this after ${stepsWord(done.length)}.` : 'You stopped this.'}>
                    {actions && <Button variant="raised" onClick={() => actions.onSay('Carry on')}>Carry on</Button>}
                </TroubleLine>
            )}
            {failed && <WhatWentWrong message={error} steps={steps} actions={actions} />}
            {/* Only while the pointer or the keyboard is in this reply. The row keeps its height, so nothing moves. */}
            {actions && !isStreaming && !stopped && !failed && content && (
                <div className="-mt-3.5 -ml-1.5 h-7 flex gap-0.5 opacity-0 transition-opacity duration-fast group-hover/reply:opacity-100 group-focus-within/reply:opacity-100">
                    <CopyAction content={content} />
                    {actions.onSaveAsRoutine && (
                        <ReplyAction label="Save as routine" onClick={actions.onSaveAsRoutine}>
                            <Repeat aria-hidden className="size-[15px]" strokeWidth={1.75} />
                        </ReplyAction>
                    )}
                </div>
            )}
        </WithFace>
    )
}

// A chat that went wrong before there was a reply to say so in: the face in Oops, and what happened.
export const WentWrong: React.FC<{ message: string; mascot?: MascotProfile; actions?: ReplyActions; gutter?: boolean }> = ({ message, mascot, actions, gutter = false }) => (
    <WithFace mascot={mascot} mood="oops" gutter={gutter}>
        <WhatWentWrong message={message} steps={[]} actions={actions} />
    </WithFace>
)

// Thinking, before a reply has anything to show, where there's no reply yet to show it in. The face is the pips.
export const ThinkingMessage: React.FC<{ mascot?: MascotProfile; waiting?: boolean }> = ({ mascot, waiting = false }) => {
    const { showBerry } = useShell().settings
    return (
        <WithFace mascot={mascot} mood={waiting ? 'asking' : 'thinking'} gutter={false}>
            <div role="status" className="h-6 flex items-center">{statusRow(waiting, showBerry)}</div>
        </WithFace>
    )
}

type SpokenProps = { chatId: string; approval: ChatApproval; mascot?: MascotProfile }

// The send button of a field that has one, off until there's something to send.
const SendArrow: React.FC<{ label: string; ready: boolean }> = ({ label, ready }) => (
    <button
        type="submit"
        aria-label={label}
        disabled={!ready}
        className={cn('size-[26px] shrink-0 rounded-full flex items-center justify-center bg-ink text-sheet transition-[background-color,transform] duration-fast hover:bg-ink/85 active:scale-[.96] disabled:bg-transparent disabled:text-faint', FOCUS)}
    >
        <ArrowUp className="size-4" strokeWidth={1.75} />
    </button>
)

// A mascot needs something only the user knows, and carries on with the answer. Lighter than a card, with no shell,
// because answering lets nothing happen. Secrets go in the page, never here.
const ChatQuestionCard: React.FC<SpokenProps> = ({ chatId, approval, mascot }) => {
    const [answer, setAnswer] = useState('')
    const name = useAssistantName(mascot)
    const send = (allow: boolean) => void window.chromeAPI.chat.decide(chatId, approval.id, allow, allow ? answer : undefined)
    return (
        <section aria-label={`${name} is asking`} className="[overflow-wrap:anywhere] animate-fade-in">
            <h3 className="mb-[9px] text-15 font-medium text-ink">{approval.text}</h3>
            <form
                onSubmit={(event) => {
                    event.preventDefault()
                    if (answer.trim()) send(true)
                }}
                className="h-9 pl-3 pr-[5px] flex items-center gap-2 rounded-tile bg-sheet-2"
            >
                <input
                    aria-label="Your answer"
                    autoFocus
                    value={answer}
                    placeholder="Type an answer"
                    onChange={(event) => setAnswer(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-14 text-ink outline-none placeholder:text-faint"
                />
                <SendArrow label="Answer" ready={!!answer.trim()} />
            </form>
            <div className="mt-2 flex items-center gap-3">
                <Button variant="ghost" className="-ml-1.5 px-1.5" onClick={() => send(false)}>Skip</Button>
                <span className="ml-auto text-13 text-ink-2">Passwords and codes go in the page, never here.</span>
            </div>
        </section>
    )
}

const HANDOFF_TITLE: Record<HandoffNeed, string> = {
    'sign-in': 'Sign in on',
    code: 'Enter the code on',
    captcha: 'Solve the captcha on',
}

// What the user can do about a tab they've been handed. Words are never typed here, so there's nowhere for a secret to go.
const HandoffActions: React.FC<{
    chatId: string
    approval: ChatApproval
}> = ({ chatId, approval }) => {
    const { tabs, switchTab } = useBrowser()
    const tabId = approval.handoff?.tabId
    const here = tabs.some((tab) => tab.id === tabId && tab.isActive)
    const send = (allow: boolean) => void window.chromeAPI.chat.decide(chatId, approval.id, allow)
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {!here && tabId && <Button onClick={() => void switchTab(tabId)}>Go to the tab</Button>}
            <Button variant={here ? 'default' : 'raised'} onClick={() => send(true)}>I’m done</Button>
            <Button variant="ghost" className="px-1.5" onClick={() => send(false)}>Not now</Button>
        </div>
    )
}

// The pips in `ask`, held still beside the line under a card: the live step above already moves.
const WaitingNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <>
        <span className="text-ask"><Pips pattern="waiting" still /></span>
        <span className="min-w-0 truncate">{children}</span>
    </>
)

// Your turn: a sign-in, a code or a captcha only the user can do. The site comes from the tab's address and every word
// from code, so a page can't write any of it.
const ChatHandoffCard: React.FC<SpokenProps> = ({ chatId, approval, mascot }) => {
    const name = useAssistantName(mascot)
    const { need = 'sign-in', site = '' } = approval.handoff ?? {}
    return (
        <CardInShell label={`${name} needs you`} note={<WaitingNote>{name} waits here until you say so</WaitingNote>}>
            <h3 className="mb-1.5 flex items-center gap-2 text-15 font-medium text-ink">
                <Lock aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 [overflow-wrap:anywhere]">{HANDOFF_TITLE[need]} {site}</span>
            </h3>
            <p className="mb-3 text-14 leading-[1.45] text-ink-2">
                {name} has stepped back from this tab and can’t see it. What you type goes straight to the site.
            </p>
            <HandoffActions chatId={chatId} approval={approval} />
        </CardInShell>
    )
}

// An action a mascot wants to take, which waits here until the user answers. The sentence names the sites, and the
// exact words stay under it in full, because that's what is being allowed. With no address to shorten, the sentence is
// them.
export const ChatApprovalCard: React.FC<SpokenProps> = ({ chatId, approval, mascot }) => {
    const name = useAssistantName(mascot)
    const { showBerry } = useShell().settings
    const decide = (allow: boolean) => void window.chromeAPI.chat.decide(chatId, approval.id, allow)
    if (approval.question) return <ChatQuestionCard chatId={chatId} approval={approval} mascot={mascot} />
    if (approval.handoff) return <ChatHandoffCard chatId={chatId} approval={approval} mascot={mascot} />
    return (
        <ApprovalCard
            question={`${showBerry ? 'I’d like to ' : `${name} wants to `}${withSiteNames(asContinuation(approval.text))}`}
            exactly={withSiteNames(approval.text) === approval.text ? undefined : approval.text}
            onConfirm={() => decide(true)}
            onDeny={() => decide(false)}
        />
    )
}

// Why something failed, worded with what to do about it.
export const ChatError: React.FC<{ message: string }> = ({ message }) => (
    <p role="alert" className="text-14 text-ask animate-fade-in">{message}</p>
)
