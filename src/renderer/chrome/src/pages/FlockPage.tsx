import React, { useEffect, useRef, useState } from 'react'
import { Dices } from 'lucide-react'
import type { MascotLook, MascotProfile } from '@shared/library'
import { BerryDot, Mascot, MOOD_LABELS, type Mood } from '@common/components/Mascot'
import { Button } from '@common/components/Button'
import { Choice, Switch } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { ACCESSORIES, BERRY, BERRY_ID, MASCOT_TOOLS, MAX_MASCOT_INSTRUCTIONS, MAX_MASCOT_NAME, PALETTES, normaliseSite, sitesInWords, toolsInWords } from '@shared/mascots'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Berry } from '../components/Berry'
import { ChatError } from '../components/ChatMessage'
import { useAccount } from '../useAccount'
import { useCloud } from '../useCloud'
import { useRunner } from '../useRunner'
import { PublishMascot } from './PublishMascot'
import { MascotMemory } from './MascotMemory'
import { blankMascot, blankPublish, FLOCK_VIEW_EVENT, flockView, flockViewFor, mascotForm, setFlockShowing, setFlockView, sitesFrom, surprise, toMascotDraft, type FlockView, type MascotFormValues } from '../flockView'
import { blankForm, setRoutinesView } from '../routinesView'

const api = () => window.chromeAPI.mascots
const MOODS = Object.keys(MOOD_LABELS) as Mood[]
const INPUT = "w-full h-9 px-3 rounded-card border bg-surface text-14 outline-none focus-visible:ring-2 focus-visible:ring-ring"
// How long a saved mascot gets to fly off before the flock comes back.
const FLY_OFF_MS = 520

// A bird to press when choosing a look, named for what it's showing.
const wearing = (name: string, look: MascotLook): MascotProfile => ({ ...BERRY, id: name, name, look })

const QUIET_ACTION = "text-muted-foreground"
const BIRD = 96
// How far down the standing drawing its feet reach, and where along it.
const FEET_Y = 113 / 120
const FEET_X = 57 / 120
const BIRD_LEFT = 12
const WIRE_SAG = 5
const HIDDEN_ICON = 32

// One stretch of wire, sagging a little where a bird stands on it. Its flat part is at `top`. Only the last place on the
// list has `runsOn`, since every row before it is full: its wire carries on to the end of the row, and the list clips it.
const Wire: React.FC<{ top: number; sags: boolean; runsOn?: boolean }> = ({ top, sags, runsOn = false }) =>
    runsOn ? (
        <div aria-hidden className="absolute left-0 h-[1.5px] w-screen bg-muted-foreground/45 pointer-events-none" style={{ top: top - 0.75 }} />
    ) : (
        <svg aria-hidden className="absolute inset-x-0 w-full text-muted-foreground/45 pointer-events-none" style={{ top: top - 1, height: WIRE_SAG + 2 }} viewBox={`0 0 100 ${WIRE_SAG + 2}`} preserveAspectRatio="none">
            <path d={sags ? `M0 1 C 8 1, 9 ${WIRE_SAG + 1}, 16 ${WIRE_SAG + 1} S 34 1, 100 1` : 'M0 1 L100 1'} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
    )

// One bird on the wire, with its name and what it's for below it. It looks up when you come near.
export const MascotCard: React.FC<{ mascot: MascotProfile; landed: boolean; flipped?: boolean; onEdit: () => void; onPublish?: () => void; onMemory?: () => void }> = ({ mascot, landed, flipped = false, onEdit, onPublish, onMemory }) => {
    const { chats, routines, memory } = useLibrary()
    const { choose } = useFlock()
    const { showBerry, keepBerryStill } = useShell().settings
    const [near, setNear] = useState(false)
    const isBerry = mascot.id === BERRY_ID
    const own = (id: string | null) => (id ?? BERRY_ID) === mascot.id
    const runs = routines.filter((routine) => own(routine.mascotId))
    const working = chats.some((chat) => own(chat.mascotId) && chat.running) || runs.some((routine) => routine.status === 'running' || routine.status === 'needs-approval')
    const standing = showBerry ? BIRD : HIDDEN_ICON
    const line = standing * (showBerry ? FEET_Y : 1)
    const remembers = memory.facts.filter((fact) => fact.mascotId === mascot.id).length

    const chat = () => {
        choose(mascot.id)
        void window.chromeAPI.browser.createTab()
    }

    const limits = [
        ...(isBerry ? [] : [sitesInWords(mascot.sites), toolsInWords(mascot.tools)]),
        ...(runs.length > 0 ? [runs.length === 1 ? 'Runs a routine' : `Runs ${runs.length} routines`] : [])
    ]

    return (
        <li
            onMouseEnter={() => setNear(true)}
            onMouseLeave={() => setNear(false)}
            onFocus={() => setNear(true)}
            onBlur={() => setNear(false)}
            className="group relative min-w-0 flex flex-col"
        >
            <Wire top={line} sags={showBerry} />
            <div className="relative" style={{ height: line + WIRE_SAG }}>
                <div className="absolute" style={{ left: BIRD_LEFT, top: showBerry ? WIRE_SAG : 0, width: standing, transform: flipped && showBerry ? 'scaleX(-1)' : undefined }}>
                    <div className={cn(landed && !keepBerryStill && "motion-safe:animate-berry-hop")} style={{ transformOrigin: `${FEET_X * 100}% ${FEET_Y * 100}%` }}>
                        <Berry mood={working ? 'fetching' : near ? 'curious' : 'rest'} size={standing} mascot={mascot} />
                    </div>
                </div>
            </div>
            {/* A column to the bottom of the row, so every bird's actions sit on one line whatever is above them. */}
            <div className="mt-4 pr-6 flex-1 flex flex-col [overflow-wrap:anywhere]" style={{ paddingLeft: BIRD_LEFT }}>
                <h2 className="flex items-center gap-2 text-14 font-semibold">
                    {mascot.name}
                    {working && <BerryDot working />}
                </h2>
                <p className="mt-0.5 text-13 line-clamp-2" title={isBerry ? undefined : mascot.instructions}>
                    {isBerry ? 'The original. Always here, and it can do all you let it.' : mascot.instructions}
                </p>
                {limits.length > 0 && <p className="mt-1 text-12 text-muted-foreground">{limits.join(' · ')}</p>}
                <div className="mt-auto pt-1 -ml-2.5 flex flex-wrap">
                    <Button size="xs" variant="ghost" className={QUIET_ACTION} onClick={chat}>Chat</Button>
                    {!isBerry && <Button size="xs" variant="ghost" className={QUIET_ACTION} aria-label={`Edit ${mascot.name}`} onClick={onEdit}>Edit</Button>}
                    {onMemory && <Button size="xs" variant="ghost" className={QUIET_ACTION} aria-label={`What ${isBerry && !showBerry ? 'Assistant' : mascot.name} remembers`} onClick={onMemory}>{remembers > 0 ? `Remembers ${remembers}` : 'Memory'}</Button>}
                    {onPublish && !isBerry && !mascot.galleryId && <Button size="xs" variant="ghost" className={QUIET_ACTION} aria-label={`Publish ${mascot.name}`} onClick={onPublish}>{mascot.publishedId ? 'Published' : 'Publish'}</Button>}
                </div>
            </div>
        </li>
    )
}

const COLUMN = 232
const ROOM_BIRD = 56

const RoomActions: React.FC<{ onNew: () => void }> = ({ onNew }) => (
    <>
        <Button size="xs" variant="outline" onClick={onNew}>New mascot</Button>
        <Button size="xs" variant="outline" onClick={() => void window.chromeAPI.browser.openPage('mascot-gallery')}>Browse the Gallery</Button>
    </>
)

// The next place along the wire: the shape of a bird that isn't there yet. When the row above is full there's no bird
// to share a wire with, so it's one low line instead of a whole row of nothing.
const RoomForOneMore: React.FC<{ alone: boolean; onNew: () => void }> = ({ alone, onNew }) => {
    const { showBerry } = useShell().settings
    const standing = alone ? ROOM_BIRD : showBerry ? BIRD : HIDDEN_ICON
    const line = showBerry ? standing * FEET_Y : alone ? 0 : standing
    const ghost = showBerry && (
        <div aria-hidden className="absolute opacity-[0.09] brightness-0 dark:opacity-[0.16] dark:invert motion-safe:transition-[opacity] group-hover:opacity-20 dark:group-hover:opacity-30" style={{ left: BIRD_LEFT, top: 0 }}>
            <Mascot mood="rest" size={standing} still />
        </div>
    )
    if (alone) {
        return (
            <li className="group relative min-w-0 col-span-full -mt-4">
                <Wire top={line} sags={false} runsOn />
                <div className="relative" style={{ height: line }}>{ghost}</div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ paddingLeft: BIRD_LEFT }}>
                    <p className="text-13 text-muted-foreground">Room for one more</p>
                    <RoomActions onNew={onNew} />
                </div>
            </li>
        )
    }
    return (
        <li className="group relative min-w-0">
            <Wire top={line} sags={false} runsOn />
            <div className="relative" style={{ height: line + WIRE_SAG }}>{ghost}</div>
            <div className="mt-4 flex flex-col items-start" style={{ paddingLeft: BIRD_LEFT }}>
                <p className="text-13 text-muted-foreground">Room for one more</p>
                <div className="mt-1 flex flex-col items-start gap-1"><RoomActions onNew={onNew} /></div>
            </div>
        </li>
    )
}

const List: React.FC<{ landed?: string; onNew: () => void; onEdit: (mascot: MascotProfile) => void; onPublish: (mascot: MascotProfile) => void; onMemory: (mascot: MascotProfile) => void }> = ({ landed, onNew, onEdit, onPublish, onMemory }) => {
    const { flock } = useFlock()
    const [account] = useAccount()
    // How many fit in a row, which is what the grid works out too, so this knows when the row before the last spot is full.
    const list = useRef<HTMLUListElement>(null)
    const [columns, setColumns] = useState(3)
    useEffect(() => {
        const node = list.current
        if (!node) return
        const observer = new ResizeObserver(([entry]) => setColumns(Math.max(1, Math.floor(entry.contentRect.width / COLUMN))))
        observer.observe(node)
        return () => observer.disconnect()
    }, [])
    return (
        <>
            <h1 className="text-20 font-semibold">Flock</h1>
            <p className="mt-1 text-14 text-muted-foreground">Each one has its own look, its own job and its own limits. They all ask before anything risky.</p>
            <ul ref={list} aria-label="Your flock" className="mt-6 pt-2 [overflow-x:clip] grid gap-y-10" style={{ gridTemplateColumns: `repeat(auto-fill,minmax(${COLUMN}px,1fr))` }}>
                {flock.map((mascot, index) => (
                    <MascotCard key={mascot.id} mascot={mascot} landed={mascot.id === landed} flipped={index % 3 === 2} onEdit={() => onEdit(mascot)} onPublish={account.status === 'not-set-up' ? undefined : () => onPublish(mascot)} onMemory={() => onMemory(mascot)} />
                ))}
                <RoomForOneMore alone={flock.length % columns === 0} onNew={onNew} />
            </ul>
        </>
    )
}

const Heading: React.FC<{ step: number; title: string; hint?: string }> = ({ step, title, hint }) => (
    <div className="flex items-baseline gap-2">
        <span aria-hidden className="text-14 font-semibold text-muted-foreground tabular-nums">{step}</span>
        <div>
            <h2 className="text-14 font-semibold">{title}</h2>
            {hint && <p className="mt-0.5 text-13 text-muted-foreground">{hint}</p>}
        </div>
    </div>
)

// The mascot as it's being made. It reacts to what you do, which is the only place a bird moves with no work behind it.
export const Preview: React.FC<{ values: MascotFormValues; mood: Mood; onMood: (mood: Mood) => void; flying: boolean }> = ({ values, mood, onMood, flying }) => {
    const look = { palette: values.palette, accessory: values.accessory }
    const name = values.name.trim()
    const mascot = wearing(name || 'New mascot', look)
    const hopKey = `${values.palette}-${values.accessory}`
    return (
        <aside aria-label="Preview" className="w-full lg:w-[288px] lg:sticky lg:top-0 shrink-0 p-4 rounded-panel bg-surface shadow-raised text-center">
            <div className="h-[184px] flex items-center justify-center">
                <div key={hopKey} className={cn("motion-safe:animate-berry-hop", flying && "motion-safe:-translate-y-10 motion-safe:transition-transform motion-safe:duration-layout")}>
                    <Berry mood={flying ? 'fetching' : mood} size={160} mascot={mascot} />
                </div>
            </div>
            <p className="text-14 font-semibold [overflow-wrap:anywhere]">{name ? `Hi, I’m ${name}.` : 'Who am I?'}</p>
            <p className="mt-1 text-12 text-muted-foreground">{sitesInWords(sitesFrom(values))} · {toolsInWords(values.tools)}</p>
            <ul aria-label="Its moods" className="mt-4 grid grid-cols-3 gap-0.5">
                {MOODS.map((option) => (
                    <li key={option}>
                        <button
                            type="button"
                            aria-label={`Show it ${MOOD_LABELS[option]}`}
                            aria-pressed={option === mood}
                            title={MOOD_LABELS[option]}
                            onClick={() => onMood(option)}
                            className={cn("w-full py-1 flex justify-center rounded-control outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", option === mood && "bg-muted")}
                        >
                            <Berry mood={option} size={60} mascot={mascot} />
                        </button>
                    </li>
                ))}
            </ul>
        </aside>
    )
}

const Form: React.FC<{ values: MascotFormValues; onChange: (values: MascotFormValues) => void; onDone: (landed?: string) => void }> = ({ values, onChange, onDone }) => {
    const { flock } = useFlock()
    const { routines } = useLibrary()
    const [error, setError] = useState<string | null>(null)
    const [picked, setPicked] = useState<Mood | null>(null)
    const [typing, setTyping] = useState<Mood | null>(null)
    const [flying, setFlying] = useState(false)
    const leaving = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    useEffect(() => () => clearTimeout(leaving.current), [])
    const set = (patch: Partial<MascotFormValues>) => onChange({ ...values, ...patch })
    const others = flock.filter((mascot) => mascot.id !== values.id).map((mascot) => mascot.name)
    const own = routines.filter((routine) => values.id && routine.mascotId === values.id)
    const badSite = sitesFrom(values).find((site) => !normaliseSite(site))
    const [cloud] = useCloud()
    const [runner] = useRunner()
    const canWorkInCloud = cloud.status !== 'off' || runner.status === 'linked'

    // Choosing a mood holds it until you get on with something else.
    const reactWith = (mood: Mood | null) => {
        setPicked(null)
        setTyping(mood)
    }

    const save = async (event: React.FormEvent) => {
        event.preventDefault()
        if (values.onlySomeSites && sitesFrom(values).length === 0) {
            setError('Name at least one site, or choose Any site.')
            return
        }
        const result = await api().save(values.id, { ...toMascotDraft(values), worksInCloud: values.worksInCloud })
        if (!result.ok) {
            setError(result.error)
            return
        }
        if (values.suggestionId) void window.chromeAPI.suggestions.used(values.suggestionId)
        setError(null)
        setFlying(true)
        leaving.current = setTimeout(() => onDone(result.id), FLY_OFF_MS)
    }

    const remove = async () => {
        if (values.id && (await api().delete(values.id))) onDone()
    }

    return (
        <div className="flex flex-col-reverse lg:flex-row items-start gap-8">
            <form onSubmit={(event) => void save(event)} className="flex-1 min-w-0 w-full flex flex-col gap-7">
                <div className="flex items-center justify-between gap-4">
                    <h1 className="text-20 font-semibold">{values.id ? `Edit ${values.name || 'mascot'}` : 'New mascot'}</h1>
                    <Button type="button" variant="outline" size="sm" onClick={() => { setPicked(null); onChange(surprise(values, others)) }}>
                        <Dices />
                        Surprise me
                    </Button>
                </div>

                <section>
                    <Heading step={1} title="Choose a look" />
                    <ul aria-label="Colours" className="mt-3 flex flex-wrap gap-1.5">
                        {PALETTES.map(({ id, label }) => (
                            <li key={id}>
                                <button
                                    type="button"
                                    aria-pressed={values.palette === id}
                                    onClick={() => { reactWith(null); set({ palette: id }) }}
                                    className={cn("w-[84px] py-2 flex flex-col items-center gap-1 rounded-card outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", values.palette === id ? "bg-muted" : "hover:bg-muted")}
                                >
                                    <Berry size={44} mascot={wearing(label, { palette: id, accessory: 'none' })} />
                                    <span className="text-12">{label}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <ul aria-label="Accessories" className="mt-2 flex flex-wrap gap-1.5">
                        {ACCESSORIES.map(({ id, label }) => (
                            <li key={id}>
                                <button
                                    type="button"
                                    aria-pressed={values.accessory === id}
                                    onClick={() => { reactWith(null); set({ accessory: id }) }}
                                    className={cn("w-[84px] py-2 flex flex-col items-center gap-1 rounded-card outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", values.accessory === id ? "bg-muted" : "hover:bg-muted")}
                                >
                                    <Berry size={44} mascot={wearing(label, { palette: values.palette, accessory: id })} />
                                    <span className="text-12">{label}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>

                <section>
                    <Heading step={2} title="Give it a name" />
                    <input
                        autoFocus={!values.id}
                        aria-label="Name"
                        maxLength={MAX_MASCOT_NAME}
                        value={values.name}
                        placeholder="Pip"
                        onFocus={() => reactWith('curious')}
                        onBlur={() => setTyping(null)}
                        onChange={(event) => set({ name: event.target.value })}
                        className={cn(INPUT, "mt-3")}
                    />
                </section>

                <section>
                    <Heading step={3} title="Say what it’s for" hint="In your own words, as you’d tell a colleague. It goes into every chat with it." />
                    <textarea
                        aria-label="What it’s for"
                        rows={4}
                        maxLength={MAX_MASCOT_INSTRUCTIONS}
                        value={values.instructions}
                        placeholder="Keep an eye on my pull requests and tell me what needs me. Be brief."
                        onFocus={() => reactWith('thinking')}
                        onBlur={() => setTyping(null)}
                        onChange={(event) => set({ instructions: event.target.value })}
                        className={cn(INPUT, "mt-3 h-auto py-2 resize-y")}
                    />
                </section>

                <section>
                    <Heading step={4} title="Set its limits" hint="Optional. These only take away. It still asks before anything risky, just as Berry does, and no limit changes that." />
                    <div className="mt-3">
                        <Choice
                            label="Where it can go"
                            value={values.onlySomeSites ? 'some' : 'any'}
                            onChange={(choice) => { reactWith('asking'); set({ onlySomeSites: choice === 'some' }) }}
                            options={[
                                { value: 'any', label: 'Any site' },
                                { value: 'some', label: 'Only these sites' }
                            ]}
                        />
                    </div>
                    {values.onlySomeSites && (
                        <>
                            <input
                                aria-label="Sites it may use"
                                value={values.sitesText}
                                placeholder="github.com, example.com"
                                spellCheck={false}
                                onFocus={() => reactWith('asking')}
                                onBlur={() => setTyping(null)}
                                onChange={(event) => set({ sitesText: event.target.value })}
                                className={cn(INPUT, "mt-3")}
                            />
                            <p className={cn("mt-1 text-12", badSite ? "text-warning" : "text-muted-foreground")}>
                                {badSite ? `“${badSite}” doesn’t look like a site.` : 'Each one includes its subdomains. It can’t use any other site.'}
                            </p>
                        </>
                    )}
                    <ul aria-label="What it can do" className="mt-4 rounded-card border bg-surface divide-y">
                        <li className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
                            <div className="flex-1">
                                <p className="text-14">Read pages</p>
                                <p className="text-12">Every mascot can, on the sites it’s allowed.</p>
                            </div>
                            <span className="text-12">Always on</span>
                        </li>
                        {MASCOT_TOOLS.map(({ id, label, hint }) => (
                            <li key={id} className="flex items-center gap-3 px-3 py-2">
                                <div className="flex-1">
                                    <p id={`mascot-tool-${id}`} className="text-14">{label}</p>
                                    <p className="text-12 text-muted-foreground">{hint}</p>
                                </div>
                                <Switch
                                    labelledBy={`mascot-tool-${id}`}
                                    checked={values.tools.includes(id)}
                                    onChange={(on) => { reactWith('asking'); set({ tools: on ? [...values.tools, id] : values.tools.filter((tool) => tool !== id) }) }}
                                />
                            </li>
                        ))}
                    </ul>
                </section>

                {canWorkInCloud && (
                    <section className="flex items-center gap-3">
                        <div className="flex-1">
                            <h2 id="mascot-works-in-cloud" className="text-14 font-semibold">Works in the cloud</h2>
                            <p className="mt-1 text-12 text-muted-foreground">Choosing it turns on Do this in the cloud. You can still turn that off for one message.</p>
                        </div>
                        <Switch labelledBy="mascot-works-in-cloud" checked={values.worksInCloud} onChange={(on) => set({ worksInCloud: on })} />
                    </section>
                )}

                {values.id && (
                    <section>
                        <h2 className="text-14 font-semibold">What it remembers</h2>
                        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setFlockView({ page: 'memory', mascotId: values.id ?? '', returnTo: values })}>
                            See what {values.name.trim() || 'it'} remembers
                        </Button>
                    </section>
                )}

                {values.id && (
                    <section>
                        <h2 className="text-14 font-semibold">Routines it runs</h2>
                        {own.length > 0 && <p className="mt-1 text-14 text-muted-foreground">{own.map((routine) => routine.name).join(', ')}</p>}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                                setRoutinesView({ page: 'form', values: blankForm('', '', values.id) })
                                void window.chromeAPI.browser.openPage('routines')
                            }}
                        >
                            New routine for {values.name.trim() || 'it'}
                        </Button>
                    </section>
                )}

                {error && <ChatError message={error} />}

                <div className="flex items-center gap-3">
                    <Button type="submit">{values.id ? 'Save' : 'Add to flock'}</Button>
                    <Button type="button" variant="ghost" onClick={() => onDone()}>Cancel</Button>
                    {values.id && <Button type="button" variant="ghost" className="ml-auto text-destructive" onClick={() => void remove()}>Delete</Button>}
                </div>
            </form>

            <Preview values={values} mood={picked ?? typing ?? 'rest'} onMood={setPicked} flying={flying} />
        </div>
    )
}

export const FlockPage: React.FC<{ tabId: string }> = ({ tabId }) => {
    const [view, setViewState] = useState<FlockView>(() => flockViewFor(tabId))

    // The perch on a composer can start a new mascot from elsewhere.
    useEffect(() => {
        const follow = () => setViewState(flockView())
        setFlockShowing(true)
        window.addEventListener(FLOCK_VIEW_EVENT, follow)
        return () => {
            window.removeEventListener(FLOCK_VIEW_EVENT, follow)
            setFlockShowing(false)
        }
    }, [])

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-5xl mx-auto px-8 py-10">
                {view.page === 'form' ? (
                    <Form
                        key={view.values.id ?? 'new'}
                        values={view.values}
                        onChange={(values) => setFlockView({ page: 'form', values })}
                        onDone={(landed) => setFlockView({ page: 'list', landed })}
                    />
                ) : view.page === 'publish' ? (
                    <PublishMascot
                        key={view.mascotId}
                        mascotId={view.mascotId}
                        values={view.values}
                        onChange={(values) => setFlockView({ page: 'publish', mascotId: view.mascotId, values })}
                        onBack={() => setFlockView({ page: 'list' })}
                    />
                ) : view.page === 'memory' ? (
                    <MascotMemory mascotId={view.mascotId} onBack={() => setFlockView(view.returnTo ? { page: 'form', values: view.returnTo } : { page: 'list' })} />
                ) : (
                    <List
                        landed={view.landed}
                        onNew={() => setFlockView({ page: 'form', values: blankMascot() })}
                        onEdit={(mascot) => setFlockView({ page: 'form', values: mascotForm(mascot) })}
                        onPublish={(mascot) => setFlockView({ page: 'publish', mascotId: mascot.id, values: blankPublish() })}
                        onMemory={(mascot) => setFlockView({ page: 'memory', mascotId: mascot.id })}
                    />
                )}
            </div>
        </div>
    )
}
