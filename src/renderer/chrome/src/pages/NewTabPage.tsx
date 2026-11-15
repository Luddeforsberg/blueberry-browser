import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { TabInfo } from '@shared/ipc'
import type { MascotProfile, NeedsYouItem, Suggestion } from '@shared/library'
import type { Mood } from '@common/components/Mascot'
import { BERRY, permissionsInWords } from '@shared/mascots'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { looksLikeUrl, toUrl } from '@common/lib/url'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Berry, useAssistantName } from '../components/Berry'
import { Composer, type PillFace } from '../components/Composer'
import { useCloud } from '../useCloud'
import { useRunner } from '../useRunner'
import { setFlockView, suggestedMascot } from '../flockView'
import { setRoutinesView, suggestedForm } from '../routinesView'
import { asContinuation, withSiteNames } from '../siteNames'
import { shortWhen } from '../shortWords'

// DESIGN.md section 10, New tab: no page yet, so no sheet. The well, the greeting, the prompt box, and what's real under it.

const SINCE_SHOWN = 3

// DESIGN.md section 10, Choosing a mascot: the old one's eyes shut, the new one pops in at 120ms with the pips for a
// face, and its eyes open at 420ms. Held still, it's a short fade. Choosing again partway starts over from there.
const ARRIVES_MS = 120
const SETTLED_MS = 420
const useMascotSwitch = (chosen: MascotProfile) => {
    const { keepBerryStill } = useShell().settings
    const [shown, setShown] = useState(chosen)
    const [phase, setPhase] = useState<'rest' | 'shut' | 'arriving'>('rest')
    const [arrival, setArrival] = useState(0)
    // Who's showing, and the latest of who's chosen, so a library update partway doesn't start the switch again.
    const showing = useRef(chosen.id)
    const latest = useRef(chosen)
    latest.current = chosen

    // The same mascot, saved again: show what it is now.
    useEffect(() => {
        if (chosen.id === showing.current) setShown(chosen)
    }, [chosen])

    useEffect(() => {
        if (chosen.id === showing.current) return
        const arrive = () => {
            showing.current = latest.current.id
            setShown(latest.current)
            setArrival((count) => count + 1)
        }
        if (keepBerryStill) {
            arrive()
            return
        }
        setPhase('shut')
        const arriving = window.setTimeout(() => {
            arrive()
            setPhase('arriving')
        }, ARRIVES_MS)
        const settle = window.setTimeout(() => setPhase('rest'), SETTLED_MS)
        return () => {
            window.clearTimeout(arriving)
            window.clearTimeout(settle)
        }
    }, [chosen.id, keepBerryStill])

    const face: PillFace = { mood: phase === 'arriving' ? 'fetching' : 'rest', shut: phase === 'shut', arrival }
    return { shown, face, switching: phase !== 'rest', still: keepBerryStill }
}

// What a mascot may not do, in words, or nothing for one with no limits, as Berry has none.
const limitsOf = (mascot: MascotProfile): string | null => {
    const lines = permissionsInWords(mascot)
    return lines.every((line) => line.open) ? null : lines.map((line) => `${line.text}.`).join(' ')
}

const openJob = (item: Pick<NeedsYouItem, 'id' | 'job' | 'routineId'>) => {
    if (item.routineId) {
        setRoutinesView({ page: 'detail', id: item.routineId })
        void window.chromeAPI.browser.openPage('routines')
    } else {
        void window.chromeAPI.browser.openPage('chat', { param: item.id, title: item.job })
    }
}

const Label: React.FC<{ ask?: boolean; id: string; children: React.ReactNode }> = ({ ask, id, children }) => (
    <h2 id={id} className={cn('mx-2 mb-1.5 font-mono text-11 lowercase', ask ? 'text-ask' : 'text-ink-3')}>{children}</h2>
)

const ROW = 'w-full min-h-[34px] px-2 flex items-center gap-[11px] rounded-row text-13 text-ink-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus'

const WaitingRow: React.FC<{ item: NeedsYouItem }> = ({ item }) => {
    const mascot = useFlock().find(item.mascotId)
    const name = useAssistantName(mascot)
    const { approval } = item
    // An approval says what it would do, so it reads on from the mascot's name. A question or a handoff is already a sentence.
    const words = withSiteNames(approval.text)
    return (
        <li className="h-11 pl-2 pr-[9px] flex items-center gap-[11px] rounded-tile bg-sheet text-13 text-ink shadow-rim">
            <Berry mood="asking" size={24} mascot={mascot} />
            <span className="flex-1 min-w-0 truncate">
                {approval.question || approval.handoff ? words : <><span className="font-medium">{name}</span> wants to {asContinuation(words)}</>}
                <span className="text-ink-2">, on {item.job}</span>
            </span>
            <Button size="sm" onClick={() => openJob(item)} aria-label={`Review ${item.job}`}>Review</Button>
        </li>
    )
}

interface SinceItem {
    id: string
    at: number
    mascot: MascotProfile
    mood: Mood
    words: React.ReactNode
    when: string
    open: () => void
}

// Up to three real things, newest first: finished chats, routines' results, and what's scheduled next.
const useSinceYouLeft = (asking: Set<string>): SinceItem[] => {
    const { chats, routines } = useLibrary()
    const { find } = useFlock()
    const nameOf = (mascot: MascotProfile) => (mascot.id === BERRY.id ? BERRY.name : mascot.name)
    const finished: SinceItem[] = chats
        .filter((chat) => !chat.running && !asking.has(chat.id) && !chat.from)
        .map((chat) => {
            const mascot = find(chat.mascotId)
            return { id: chat.id, at: chat.updatedAt, mascot, mood: 'delivered', words: <><span className="font-medium text-ink">{nameOf(mascot)}</span> finished {chat.title}</>, when: shortWhen(chat.updatedAt), open: () => openJob({ id: chat.id, job: chat.title, routineId: null }) }
        })
    const results: SinceItem[] = routines.flatMap((routine) => {
        const run = routine.latestRun
        if (!run?.endedAt || !(run.result ?? routine.lastResult)) return []
        const mascot = find(routine.mascotId)
        const said = (run.result ?? routine.lastResult).split('\n')[0]
        return [{ id: run.id, at: run.endedAt, mascot, mood: 'delivered' as const, words: <><span className="font-medium text-ink">{routine.name}</span> {said}</>, when: shortWhen(run.endedAt), open: () => openJob({ id: routine.id, job: routine.name, routineId: routine.id }) }]
    })
    const next = routines
        .filter((routine) => !routine.paused && routine.nextRunAt !== null)
        .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))[0]
    const past = [...finished, ...results].sort((a, b) => b.at - a.at).slice(0, next ? SINCE_SHOWN - 1 : SINCE_SHOWN)
    if (!next?.nextRunAt) return past
    const nextMascot = find(next.mascotId)
    return [
        ...past,
        { id: `next-${next.id}`, at: next.nextRunAt, mascot: nextMascot, mood: 'off-duty', words: <><span className="font-medium text-ink">{next.name}</span> runs {next.schedule.charAt(0).toLowerCase() + next.schedule.slice(1)}</>, when: `next ${shortWhen(next.nextRunAt)}`, open: () => openJob({ id: next.id, job: next.name, routineId: next.id }) },
    ]
}

// What Blueberry noticed you repeat. Taking one up only fills something in, for you to send or save.
export const IdeaRow: React.FC<{ suggestion: Suggestion; onUse: () => void; onDismiss: () => void }> = ({ suggestion, onUse, onDismiss }) => {
    const mascot: MascotProfile = suggestion.kind === 'mascot' ? { ...suggestion.draft, id: suggestion.id, deletedAt: null } : BERRY
    const action = suggestion.kind === 'mascot' ? `Meet ${suggestion.draft.name}` : suggestion.kind === 'prompt' ? 'Put it in the box' : 'Set it up'
    return (
        <li className="group min-h-[34px] px-2 flex items-center gap-[11px] rounded-row text-13 text-ink-2 hover:bg-hover">
            <Berry mood={suggestion.kind === 'mascot' ? 'curious' : 'rest'} size={22} mascot={mascot} />
            <span className="flex-1 min-w-0 py-1.5">
                <span className="font-medium text-ink">{suggestion.title}</span> {suggestion.why}.
            </span>
            <Button size="sm" variant="outline" onClick={onUse}>{action}</Button>
            <button
                type="button"
                aria-label={`Dismiss: ${suggestion.title}`}
                onClick={onDismiss}
                className="size-6 shrink-0 flex items-center justify-center rounded-[7px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
                <X className="size-[13px]" strokeWidth={1.5} />
            </button>
        </li>
    )
}

export const NewTabPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const [text, setText] = useState('')
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    // A prompt put in the box: moves the keyboard there, and goes away once it's been sent.
    const [filled, setFilled] = useState<{ id: string; times: number } | null>(null)
    const browser = window.chromeAPI.browser
    const library = useLibrary()
    const { layout } = useShell()
    const { chosen, choose } = useFlock()
    const { shown, face, switching, still } = useMascotSwitch(chosen)
    const [cloudState] = useCloud()
    // Only with a runner linked in Settings > Cloud, which has accepted, so nothing waits in a queue nobody takes from.
    const [runnerState] = useRunner()
    const canUseRunner = runnerState.status === 'linked'
    const canUseCloud = cloudState.status !== 'off'
    // Null follows the mascot, which may work in the cloud. Choosing another goes back to following it.
    const [cloudChoice, setCloudChoice] = useState<boolean | null>(null)
    useEffect(() => setCloudChoice(null), [chosen.id])
    // One that only reads the page in front has no use for the cloud, where that page isn't.
    const cloudFits = (canUseRunner || canUseCloud) && chosen.tools.includes('visit')
    const inCloud = cloudFits && (cloudChoice ?? chosen.worksInCloud === true)

    // Saved cards, at once. New ones arrive when they're written, and the page never waits for them.
    useEffect(() => {
        const { list, onUpdated } = window.chromeAPI.suggestions
        void list().then(setSuggestions)
        return onUpdated(setSuggestions)
    }, [])

    const takeUp = (suggestion: Suggestion) => {
        if (suggestion.kind === 'prompt') {
            setText(suggestion.prompt)
            setFilled({ id: suggestion.id, times: (filled?.times ?? 0) + 1 })
        } else if (suggestion.kind === 'routine') {
            setRoutinesView({ page: 'form', values: suggestedForm(suggestion.draft, suggestion.id) })
            void browser.openPage('routines')
        } else {
            setFlockView({ page: 'form', values: suggestedMascot(suggestion.draft, suggestion.id) })
            void browser.openPage('flock')
        }
    }

    const dismiss = (id: string) => void window.chromeAPI.suggestions.dismiss(id).then(setSuggestions)

    const ask = async (message: string) => {
        if (filled) void window.chromeAPI.suggestions.used(filled.id)
        const chat = await window.chromeAPI.chat.send(null, message, {
            seePage: false,
            mascotId: chosen.id,
            // The runner keeps going with this computer off, so it's used whenever there is one. The user never picks.
            runner: inCloud && canUseRunner,
            cloud: inCloud && !canUseRunner && canUseCloud
        })
        if (!chat) return
        await browser.openPage('chat', { param: chat.id, title: chat.title })
        await browser.closeTab(tab.id)
    }

    // Enter opens anything that looks like an address and asks the mascot about everything else. ⌘Enter always asks.
    const submit = (alwaysAsk: boolean) => {
        const message = text.trim()
        if (!message) return
        if (alwaysAsk || !looksLikeUrl(message)) void ask(message)
        else void browser.navigateTab(tab.id, toUrl(message))
    }

    // Out on the desktop, so there's an empty place here rather than a second one.
    const [away, setAway] = useState(false)
    useEffect(() => window.chromeAPI.desktop.onAway(setAway), [])

    const name = useAssistantName(shown)
    const asking = new Set(library.needsYou.map(({ id }) => id))
    const since = useSinceYouLeft(asking)

    return (
        <div className="relative h-full">
            {/* The well's dot grid, fading towards the middle where the box is. */}
            <div
                aria-hidden
                className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,var(--dot)_1px,transparent_1.3px)] bg-[length:14px_14px] [mask-image:radial-gradient(ellipse_62%_70%_at_50%_44%,transparent_0,transparent_46%,#000_100%)]"
            />
            <div className="absolute inset-0 overflow-y-auto">
                <div className="min-h-full flex flex-col items-center px-6 pt-[clamp(48px,calc(100vh-640px),138px)] pb-12">
                    {/* A mark, not a control. Blueberry on the desktop flies out from here. */}
                    <h1 className="mb-[26px] flex items-center gap-3 text-30 font-medium text-ink">
                        <span data-berry-perched className="-mt-1.5 flex" style={away ? { opacity: 0 } : undefined}>
                            <span key={face.arrival} className={cn('flex origin-[50%_70%]', face.arrival > 0 && (still ? 'animate-[mascot-fade_150ms_ease-out]' : 'animate-mascot-pop'))}>
                                <Berry size={40} mascot={shown} mood={face.mood} shut={face.shut} />
                            </span>
                        </span>
                        Where to?
                    </h1>

                    <div className="w-full max-w-[640px]">
                        <Composer
                            size="hero"
                            label={`Search, enter a URL, or ask ${name === 'Assistant' ? 'a question' : name}`}
                            placeholder={`Ask ${name}, or type an address`}
                            quietPlaceholder={switching && face.shut}
                            value={text}
                            onChange={(next) => {
                                setText(next)
                                // Emptied, it's no longer that prompt being sent.
                                if (!next.trim()) setFilled(null)
                            }}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter' || event.shiftKey) return
                                event.preventDefault()
                                submit(event.metaKey || event.ctrlKey)
                            }}
                            spellCheck={false}
                            autoFocus
                            focusKey={filled?.times}
                            canSend={text.trim().length > 0}
                            onSend={() => submit(false)}
                            mascot={shown}
                            chosenId={chosen.id}
                            face={face}
                            onChooseMascot={choose}
                            limits={limitsOf(shown)}
                            cloud={cloudFits ? { on: inCloud, onToggle: () => setCloudChoice(!inCloud) } : undefined}
                        />
                    </div>

                    <div className="w-full max-w-[640px] mt-[30px] flex flex-col gap-4">
                        {library.needsYou.length > 0 && (
                            <section aria-labelledby="new-tab-waiting">
                                <Label ask id="new-tab-waiting">waiting for you</Label>
                                <ul className="flex flex-col gap-1.5">
                                    {library.needsYou.map((item) => <WaitingRow key={item.id} item={item} />)}
                                </ul>
                            </section>
                        )}
                        {since.length > 0 && (
                            <section aria-labelledby="new-tab-since">
                                <Label id="new-tab-since">lately</Label>
                                <ul>
                                    {since.map((item) => (
                                        <li key={item.id}>
                                            <button type="button" onClick={item.open} className={cn(ROW, 'hover:bg-hover')}>
                                                <Berry mood={item.mood} size={22} mascot={item.mascot} still />
                                                <span className="flex-1 min-w-0 truncate">{item.words}</span>
                                                <span className="shrink-0 font-mono text-11.5 text-ink-3 tabular-nums">{item.when}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        {suggestions.length > 0 && (
                            <section aria-labelledby="new-tab-ideas">
                                <Label id="new-tab-ideas">things you repeat</Label>
                                <ul>
                                    {suggestions.map((suggestion) => (
                                        <IdeaRow key={suggestion.id} suggestion={suggestion} onUse={() => takeUp(suggestion)} onDismiss={() => dismiss(suggestion.id)} />
                                    ))}
                                </ul>
                            </section>
                        )}
                        {/* With no sidebar, the pages it leads to are here. */}
                        {!layout.sidebarOpen && (
                            <nav aria-label="Places" className="flex flex-wrap justify-center gap-1">
                                {([['needs-you', 'Needs you'], ['routines', 'Routines'], ['flock', 'Your mascots'], ['settings', 'Settings']] as const).map(([page, words]) => (
                                    <Button key={page} variant="ghost" size="sm" onClick={() => void browser.openPage(page)}>{words}</Button>
                                ))}
                            </nav>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
