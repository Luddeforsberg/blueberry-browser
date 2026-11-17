import React, { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { TabInfo } from '@shared/ipc'
import type { NeedsYouItem } from '@shared/library'
import { ApprovalCard, CardInShell, WhyLine } from '@common/components/ApprovalCard'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Berry, useAssistantName } from '../components/Berry'
import { HandoffCard, QuestionCard, approvalWords } from '../components/ChatMessage'
import { EmptyPage, LINE_BETWEEN, ON_ROW, PageFrame, PageHeader, ROW } from '../components/PageFrame'
import { usePhone } from '../usePhone'
import { openSettings } from '../openSettings'
import { openRoutines } from '../routinesView'
import { withSiteNames } from '../siteNames'
import { tallyWords, waitedFor, waitingLine } from '../needsYouWords'

// DESIGN.md section 10, Needs you: everything waiting, one open at a time as the card its chat shows, the oldest first,
// and the rest a line each. It answers through `chat:decide`, like the card in a chat.

// How long the card says what happened, before the next one opens.
const ANSWERED_MS = 1500
const MAX_RESTING = 6
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'
const LINK = cn('rounded-row text-13 text-ink underline decoration-line underline-offset-[3px] hover:decoration-ink-3', FOCUS)

// Whatever answers says so at once, because the card keeps those words for a moment.
type OnAnswered = (said: string) => void

const useNow = () => {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000)
        return () => clearInterval(timer)
    }, [])
    return now
}

const openJob = (item: NeedsYouItem) => {
    if (item.routineId) openRoutines({ page: 'routine', id: item.routineId })
    else void window.chromeAPI.browser.openPage('chat', { param: item.id, title: item.job })
}

const OpenJob: React.FC<{ item: NeedsYouItem }> = ({ item }) => (
    <button type="button" onClick={() => openJob(item)} className={cn('ml-auto shrink-0', LINK)}>
        {item.routineId ? 'Open the routine' : 'Open the chat'}
    </button>
)

// What it wants, as one line: the sentence with addresses cut to their site.
const wants = (item: NeedsYouItem) => withSiteNames(item.approval.text)

const jobWords = (name: string, item: NeedsYouItem) => `${name} · ${item.job}${item.from ? ` · from ${item.from}` : ''}`

// The mascot that's asking, with the `ask` dot.
const Asking: React.FC<{ item: NeedsYouItem; size: number }> = ({ item, size }) => {
    const mascot = useFlock().find(item.mascotId)
    return (
        <span className="relative shrink-0">
            <Berry mood="asking" size={size} mascot={mascot} still />
            <span aria-hidden className="absolute -top-px -right-px size-[7px] rounded-full bg-ask ring-[1.5px] ring-card" />
        </span>
    )
}

// The one that's open: the real card, with who's asking, for what and how long over its words.
export const WaitingCard: React.FC<{ item: NeedsYouItem; now: number; onAnswered: OnAnswered }> = ({ item, now, onAnswered }) => {
    const mascot = useFlock().find(item.mascotId)
    const name = useAssistantName(mascot)
    const { showBerry } = useShell().settings
    const [answer, setAnswer] = useState('')
    const { id, approval } = item
    const send = (allow: boolean, said: string, words?: string) => {
        onAnswered(said)
        void window.chromeAPI.chat.decide(id, approval.id, allow, words)
    }
    const head = (
        <p className="mb-2.5 flex items-center gap-2 text-13 text-ink-2">
            <Asking item={item} size={20} />
            <span className="min-w-0 flex-1 truncate">{jobWords(name, item)}</span>
            <span className="shrink-0 font-mono text-11.5 text-ink-3 tabular-nums">{waitedFor(item.askedAt, now)}</span>
        </p>
    )

    if (approval.question) {
        const answerTyped = () => {
            if (answer.trim()) send(true, `Answered. ${name} carries on.`, answer)
        }
        return (
            <QuestionCard
                approval={approval}
                name={name}
                head={head}
                focusOnShow
                onAnswer={(words) => send(true, `Answered. ${name} carries on.`, words)}
                onSkip={() => send(false, `Skipped. ${name} carries on without it.`)}
                more={<OpenJob item={item} />}
                field={
                    <form
                        onSubmit={(event) => {
                            event.preventDefault()
                            answerTyped()
                        }}
                        className="flex items-center gap-2"
                    >
                        <input
                            aria-label={`Your answer to ${name}`}
                            value={answer}
                            placeholder="Or type an answer"
                            onChange={(event) => setAnswer(event.target.value)}
                            className="min-w-0 flex-1 h-9 px-3 rounded-tile bg-card-2 shadow-[inset_0_0_0_1px_var(--line)] text-14 text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-focus"
                        />
                        <Button type="submit" disabled={!answer.trim()}>Answer</Button>
                    </form>
                }
            />
        )
    }

    if (approval.handoff) {
        return (
            <HandoffCard
                approval={approval}
                name={name}
                head={head}
                focusOnShow
                onDone={() => send(true, `${name} has the tab back.`)}
                onNotNow={() => send(false, `${name} carries on without it.`)}
                note={
                    <>
                        <span className="min-w-0 truncate">{name} waits until you say so</span>
                        <OpenJob item={item} />
                    </>
                }
            />
        )
    }

    const { question, exactly, mark, why } = approvalWords(approval, name, showBerry)
    return (
        <ApprovalCard
            question={question}
            exactly={exactly}
            mark={mark}
            head={head}
            focusOnShow
            onConfirm={() => send(true, `Allowed. ${name} carries on.`)}
            onDeny={() => send(false, `Not allowed, and ${name} knows.`)}
            note={
                <>
                    {why && <WhyLine>{why}</WhyLine>}
                    <OpenJob item={item} />
                </>
            }
        />
    )
}

// The card just after an answer, saying what happened.
const AnsweredCard: React.FC<{ item: NeedsYouItem; said: string }> = ({ item, said }) => {
    const mascot = useFlock().find(item.mascotId)
    return (
        <CardInShell label="Answered">
            <p role="status" className="min-h-8 flex items-center gap-2.5 text-15 text-ink">
                <Berry mood="fetching" size={24} mascot={mascot} className="shrink-0" />
                {said}
            </p>
        </CardInShell>
    )
}

// One of the rest, as one line. Pressing it opens it as the card.
export const WaitingRow: React.FC<{ item: NeedsYouItem; now: number; onOpen: () => void }> = ({ item, now, onOpen }) => {
    const mascot = useFlock().find(item.mascotId)
    const name = useAssistantName(mascot)
    return (
        <li className={cn(ROW, ON_ROW, LINE_BETWEEN, 'before:left-12 px-0')}>
            <button type="button" onClick={onOpen} className={cn('w-full px-2 py-3 flex items-center gap-3 text-left rounded-[inherit] active:bg-press', FOCUS)}>
                <Asking item={item} size={28} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-14 font-medium text-ink">{wants(item)}</span>
                    <span className="block truncate text-13 text-ink-2">{jobWords(name, item)}</span>
                </span>
                <span className="shrink-0 font-mono text-11.5 text-ink-3 tabular-nums">{waitedFor(item.askedAt, now)}</span>
                <ChevronRight aria-hidden className="size-3.5 shrink-0 text-faint" strokeWidth={1.75} />
            </button>
        </li>
    )
}

// Nothing waiting. Anyone working is named, because "resting" has to be true.
const AllClear: React.FC = () => {
    const { chats, routines } = useLibrary()
    const { flock, find } = useFlock()
    const working = new Set([
        ...chats.filter((chat) => chat.running).map((chat) => find(chat.mascotId).id),
        ...routines.filter((routine) => routine.status === 'running').map((routine) => find(routine.mascotId).id),
    ])
    const anyone = useAssistantName(flock.find((mascot) => working.has(mascot.id)))
    return (
        <EmptyPage
            face={
                <ul aria-hidden className="flex items-end justify-center gap-2">
                    {flock.slice(0, MAX_RESTING).map((mascot) => (
                        <li key={mascot.id}>
                            <Berry mood={working.has(mascot.id) ? 'fetching' : 'off-duty'} size={40} mascot={mascot} />
                        </li>
                    ))}
                </ul>
            }
        >
            <span className="block text-15 text-ink">Nothing needs you right now.</span>
            {working.size > 0 && <span className="block mt-1">{working.size === 1 ? `${anyone} is` : `${working.size} of them are`} working, and waits here if it gets stuck.</span>}
        </EmptyPage>
    )
}

// One true line about the phone, or a way to set it up.
const PhoneLine: React.FC = () => {
    const [phone] = usePhone()
    const openPhoneSettings = () => openSettings('phone')
    if (phone.status === 'connected' && !phone.problem) return <span className="text-13 text-ink-2">Replies from your phone are on</span>
    if (phone.status === 'connected') return <button type="button" onClick={openPhoneSettings} className={LINK}>Replies from your phone are paused</button>
    return <button type="button" onClick={openPhoneSettings} className={LINK}>Answer these from your phone</button>
}

// Everything the flock is waiting on, from every chat and routine, answered here one at a time.
export const NeedsYouPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { needsYou } = useLibrary()
    const now = useNow()
    // Answered on this visit, for the tally, and the one whose card still says what happened.
    const [answeredIds, setAnsweredIds] = useState<string[]>([])
    const [justAnswered, setJustAnswered] = useState<{ item: NeedsYouItem; said: string } | null>(null)
    const [chosen, setChosen] = useState<string | null>(tab.pageParam ?? null)

    const onAnswered = (item: NeedsYouItem) => (said: string) => {
        setAnsweredIds((ids) => (ids.includes(item.approval.id) ? ids : [...ids, item.approval.id]))
        setJustAnswered({ item, said })
        setChosen(null)
    }
    useEffect(() => {
        if (!justAnswered) return undefined
        const timer = setTimeout(() => setJustAnswered(null), ANSWERED_MS)
        return () => clearTimeout(timer)
    }, [justAnswered])

    // An answer from the phone may arrive after its row has gone from the list, so rows are remembered for it.
    const seen = useRef(new Map<string, NeedsYouItem>())
    needsYou.forEach((item) => seen.current.set(item.approval.id, item))
    const latestOnAnswered = useRef(onAnswered)
    latestOnAnswered.current = onAnswered
    useEffect(
        () =>
            window.chromeAPI.phone.onAnswered(({ approvalId, said }) => {
                const item = seen.current.get(approvalId)
                if (item) latestOnAnswered.current(item)(said)
            }),
        []
    )
    // Opened for one in particular, from the sidebar or a notification.
    useEffect(() => setChosen(tab.pageParam ?? null), [tab.pageParam])

    // Only the one whose card is saying what happened is held back. An answer that didn't take, as when the cloud
    // couldn't be reached, comes back as waiting once that card has gone.
    const waiting = needsYou.filter((item) => item.approval.id !== justAnswered?.item.approval.id).sort((a, b) => a.askedAt - b.askedAt)
    const answered = answeredIds.filter((id) => !waiting.some((item) => item.approval.id === id)).length
    const open = justAnswered ? null : (waiting.find((item) => item.approval.id === chosen) ?? waiting[0] ?? null)
    const rest = waiting.filter((item) => item !== open)

    return (
        <PageFrame>
            <PageHeader title="Needs you">{waitingLine(waiting, now) ?? undefined}</PageHeader>
            {waiting.length === 0 && !justAnswered ? (
                <AllClear />
            ) : (
                <div className="mt-5">
                    {justAnswered ? (
                        <AnsweredCard item={justAnswered.item} said={justAnswered.said} />
                    ) : (
                        open && <WaitingCard key={open.approval.id} item={open} now={now} onAnswered={onAnswered(open)} />
                    )}
                    {rest.length > 0 && (
                        <ul aria-label="Also waiting" className="mt-3">
                            {rest.map((item) => <WaitingRow key={item.approval.id} item={item} now={now} onOpen={() => setChosen(item.approval.id)} />)}
                        </ul>
                    )}
                </div>
            )}
            <div className="mt-3 px-2 min-h-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                {answered > 0 || waiting.length > 0 ? <span className="font-mono text-11.5 text-ink-2 tabular-nums">{tallyWords(answered, waiting.length)}</span> : <span />}
                <PhoneLine />
            </div>
            <p className="mt-6 px-2 text-13 text-ink-2">Passwords and codes go in the page, not through the model.</p>
        </PageFrame>
    )
}
