import React, { useEffect, useRef, useState } from 'react'
import { Dices } from 'lucide-react'
import type { MascotLook, MascotProfile } from '@shared/library'
import { BerryDot, MOOD_LABELS, type Mood } from '@common/components/Mascot'
import { Button } from '@common/components/Button'
import { Choice, Switch } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { ACCESSORIES, BERRY, BERRY_ID, MASCOT_TOOLS, MAX_MASCOT_INSTRUCTIONS, MAX_MASCOT_NAME, PALETTES, normaliseSite, sitesInWords, toolsInWords } from '@shared/mascots'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { Berry } from '../components/Berry'
import { ChatError } from '../components/ChatMessage'
import { blankMascot, FLOCK_VIEW_EVENT, flockView, mascotForm, setFlockView, sitesFrom, surprise, toMascotDraft, type FlockView, type MascotFormValues } from '../flockView'
import { blankForm, setRoutinesView } from '../routinesView'

const api = () => window.chromeAPI.mascots
const MOODS = Object.keys(MOOD_LABELS) as Mood[]
const INPUT = "w-full h-9 px-3 rounded-card border bg-surface text-14 outline-none focus-visible:ring-2 focus-visible:ring-ring"
const TAG = "px-2 py-0.5 rounded-full bg-muted text-12 text-muted-foreground"
// How long a saved mascot gets to fly off before the flock comes back.
const FLY_OFF_MS = 520

// A bird to press when choosing a look, named for what it's showing.
const wearing = (name: string, look: MascotLook): MascotProfile => ({ ...BERRY, id: name, name, look })

// One bird on its card. It sits on the edge, like Berry on the new tab composer, and looks up when you come near.
export const MascotCard: React.FC<{ mascot: MascotProfile; landed: boolean; onEdit: () => void }> = ({ mascot, landed, onEdit }) => {
    const { chats, routines } = useLibrary()
    const { choose } = useFlock()
    const [near, setNear] = useState(false)
    const isBerry = mascot.id === BERRY_ID
    const own = (id: string | null) => (id ?? BERRY_ID) === mascot.id
    const runs = routines.filter((routine) => own(routine.mascotId))
    const working = chats.some((chat) => own(chat.mascotId) && chat.running) || runs.some((routine) => routine.status === 'running' || routine.status === 'needs-approval')

    const chat = () => {
        choose(mascot.id)
        void window.chromeAPI.browser.openPage('chat')
    }

    return (
        <li
            onMouseEnter={() => setNear(true)}
            onMouseLeave={() => setNear(false)}
            onFocus={() => setNear(true)}
            onBlur={() => setNear(false)}
            className={cn("relative flex flex-col p-4 pt-10 rounded-panel bg-surface shadow-raised", landed && "motion-safe:animate-berry-hop")}
        >
            <div className="absolute left-1/2 -translate-x-1/2 -top-[68px]">
                <Berry mood={working ? 'fetching' : near ? 'curious' : 'sitting'} size={96} mascot={mascot} />
            </div>
            <h2 className="flex items-center justify-center gap-2 text-14 font-semibold text-center [overflow-wrap:anywhere]">
                {mascot.name}
                {working && <BerryDot working />}
            </h2>
            <p className="mt-1 min-h-[36px] text-12 text-muted-foreground text-center line-clamp-2">
                {isBerry ? 'The original. Always here, and it can do all you let it.' : mascot.instructions}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1">
                {!isBerry && <span className={TAG}>{sitesInWords(mascot.sites)}</span>}
                {!isBerry && <span className={TAG}>{toolsInWords(mascot.tools)}</span>}
                {runs.length > 0 && <span className={TAG}>{runs.length === 1 ? 'Runs a routine' : `Runs ${runs.length} routines`}</span>}
            </div>
            <div className="mt-auto pt-4 flex justify-center gap-2">
                <Button size="sm" onClick={chat}>Chat</Button>
                {!isBerry && <Button size="sm" variant="outline" aria-label={`Edit ${mascot.name}`} onClick={onEdit}>Edit</Button>}
            </div>
        </li>
    )
}

const List: React.FC<{ landed?: string; onNew: () => void; onEdit: (mascot: MascotProfile) => void }> = ({ landed, onNew, onEdit }) => {
    const { flock } = useFlock()
    return (
        <>
            <h1 className="text-20 font-semibold">Your flock</h1>
            <p className="mt-1 text-14 text-muted-foreground">Each one has its own look, its own job and its own limits. They all ask before anything risky.</p>
            <ul aria-label="Your flock" className="mt-6 pt-[68px] grid grid-cols-[repeat(auto-fill,minmax(216px,1fr))] gap-x-4 gap-y-[84px]">
                {flock.map((mascot) => (
                    <MascotCard key={mascot.id} mascot={mascot} landed={mascot.id === landed} onEdit={() => onEdit(mascot)} />
                ))}
                <li className="flex">
                    <button
                        type="button"
                        onClick={onNew}
                        className="group/new w-full min-h-[208px] flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed text-14 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <BerryDot size={44} className="motion-safe:transition-transform group-hover/new:-translate-y-1" />
                        New mascot
                    </button>
                </li>
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
        const result = await api().save(values.id, toMascotDraft(values))
        if (!result.ok) {
            setError(result.error)
            return
        }
        if (values.suggestionId) void window.chromeAPI.suggestions.dismiss(values.suggestionId)
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
                                    <Berry size={28} mascot={wearing(label, { palette: values.palette, accessory: id })} />
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
                        className={cn(INPUT, "mt-3 max-w-xs")}
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
                                {badSite ? `“${badSite}” doesn’t look like a site.` : 'Each one includes its subdomains. Anywhere else, it’s refused before anything happens.'}
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

export const FlockPage: React.FC = () => {
    const [view, setViewState] = useState<FlockView>(flockView)

    // The perch on a composer can start a new mascot from elsewhere.
    useEffect(() => {
        const follow = () => setViewState(flockView())
        window.addEventListener(FLOCK_VIEW_EVENT, follow)
        return () => window.removeEventListener(FLOCK_VIEW_EVENT, follow)
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
                ) : (
                    <List
                        landed={view.landed}
                        onNew={() => setFlockView({ page: 'form', values: blankMascot() })}
                        onEdit={(mascot) => setFlockView({ page: 'form', values: mascotForm(mascot) })}
                    />
                )}
            </div>
        </div>
    )
}
