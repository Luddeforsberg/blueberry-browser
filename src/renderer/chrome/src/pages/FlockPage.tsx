import React, { useEffect, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import type { TabInfo } from '@shared/ipc'
import type { MascotProfile } from '@shared/library'
import { flockParam, flockPlace, type MascotPart } from '@shared/flockPlaces'
import { ACCESSORIES, BERRY_ID, PALETTES } from '@shared/mascots'
import { Pips } from '@common/components/Pips'
import { Button } from '@common/components/Button'
import { Switch } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { Berry, useAssistantName } from '../components/Berry'
import { ChatError } from '../components/ChatMessage'
import { BackButton, BETWEEN, SettingsGroup, SettingsLink, SettingsRow } from '../components/SettingsRow'
import { useMascotState } from '../components/Sidebar'
import { limitsInBrief } from '../shortWords'
import { useAccount } from '../useAccount'
import { useCloud } from '../useCloud'
import { useRunner } from '../useRunner'
import { PublishMascot } from './PublishMascot'
import { MascotMemory } from './MascotMemory'
import { ChangePart, LimitTags, NewMascot } from './MascotSteps'
import { blankPublish, forgetTabDraftElsewhere, keepTabDraft, mascotForm, openMascots, startMascot, tabDraft, toMascotDraft, type PublishValues } from '../flockView'
import { blankForm, setRoutinesView } from '../routinesView'

// DESIGN.md section 10, Your mascots: a page in a tab, built like Settings, with the list, each mascot's own page, making
// one in steps, changing one part, and what each remembers. Where it is lives in the tab's param (flockPlaces.ts).

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'
const BERRY_LINE = 'Does whatever you ask, wherever you let it.'

const PART_NAMES: Record<MascotPart, string> = { look: 'Look', name: 'Name', purpose: 'What it’s for', limits: 'Limits' }

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const useOwn = (mascot: MascotProfile) => {
    const { routines, memory } = useLibrary()
    const own = (id: string | null) => (id ?? BERRY_ID) === mascot.id
    return {
        routines: routines.filter((routine) => own(routine.mascotId)),
        remembers: memory.facts.filter((fact) => fact.mascotId === mascot.id).length
    }
}

// Where a working mascot is, from the tabs it's working in. A job with no tab open says only that it's working.
const useWorkingSite = () => {
    const { tabs } = useBrowser()
    return (mascot: MascotProfile): string | null => {
        const tab = tabs.find((each) => each.berryWorking && (each.workingMascotId ?? BERRY_ID) === mascot.id)
        if (!tab) return null
        try {
            const { hostname, protocol } = new URL(tab.url)
            return protocol === 'http:' || protocol === 'https:' ? hostname.replace(/^www\./, '') : null
        } catch {
            return null
        }
    }
}

const chatWith = (choose: (id: string) => void, mascot: MascotProfile) => {
    choose(mascot.id)
    void window.chromeAPI.browser.createTab()
}

// One row per mascot. The whole row opens its page, and Chat, above it, starts a new chat with it.
export const MascotRow: React.FC<{ mascot: MascotProfile }> = ({ mascot }) => {
    const { choose } = useFlock()
    const stateOf = useMascotState()
    const siteOf = useWorkingSite()
    const name = useAssistantName(mascot)
    const { routines, remembers } = useOwn(mascot)
    const { mood } = stateOf(mascot)
    const site = mood === 'fetching' ? siteOf(mascot) : null
    const brief = [limitsInBrief(mascot), routines.length > 0 && count(routines.length, 'routine'), remembers > 0 && `remembers ${remembers}`].filter(Boolean).join(' · ')
    return (
        <li className={cn(BETWEEN, 'before:left-[66px] relative min-h-[66px] py-[9px] pl-4 pr-3.5 flex items-center gap-3.5 transition-colors hover:bg-hover first:rounded-t-sheet last:rounded-b-sheet')}>
            {/* Still, as only the words beside its pips move on this page. */}
            <Berry mood={mood} size={36} mascot={mascot} still />
            <div className="flex-1 min-w-0">
                <button
                    type="button"
                    onClick={() => openMascots({ page: 'mascot', id: mascot.id })}
                    className={cn("block max-w-full truncate text-left text-13 font-medium text-ink before:content-[''] before:absolute before:inset-0 before:rounded-[inherit]", FOCUS, 'focus-visible:ring-0 focus-visible:before:ring-2 focus-visible:before:ring-focus')}
                >
                    {name}
                </button>
                <p className="mt-0.5 truncate text-12 text-ink-2">{mascot.id === BERRY_ID ? BERRY_LINE : mascot.instructions}</p>
                <p className="mt-1 truncate font-mono text-11 text-ink-3">{brief}</p>
            </div>
            {mood === 'asking' ? (
                <span className="font-mono text-11 text-ask whitespace-nowrap">needs you</span>
            ) : mood === 'fetching' ? (
                <span className="flex items-center gap-[7px] font-mono text-11 text-ink-2 whitespace-nowrap">
                    <Pips pattern="think" className="text-ink" />
                    {site ? `on ${site}` : 'working'}
                </span>
            ) : null}
            <Button size="sm" variant="outline" className="relative" aria-label={`Chat with ${name}`} onClick={() => chatWith(choose, mascot)}>Chat</Button>
            <ChevronRight aria-hidden className="size-[13px] shrink-0 -ml-1 text-faint" strokeWidth={1.5} />
        </li>
    )
}

const List: React.FC = () => {
    const { flock } = useFlock()
    return (
        <>
            <div className="mx-3 mb-3.5 flex items-center gap-2.5">
                <h1 className="flex-1 text-18 font-medium">Your mascots</h1>
                <Button variant="outline" onClick={() => void window.chromeAPI.browser.openPage('mascot-gallery')}>Gallery</Button>
                <Button onClick={() => startMascot()}>
                    <Plus strokeWidth={1.5} />
                    New mascot
                </Button>
            </div>
            <p className="-mt-2 mx-3 mb-4 max-w-[520px] text-13 leading-[1.45] text-ink-2">Each has its own job and its own limits. They all ask before anything risky.</p>
            <ul aria-label="Your mascots" className="rounded-sheet bg-sheet shadow-rim">
                {flock.map((mascot) => <MascotRow key={mascot.id} mascot={mascot} />)}
            </ul>
        </>
    )
}

const lookInWords = ({ look }: MascotProfile) => {
    const berry = PALETTES.find(({ id }) => id === look.palette)?.label ?? ''
    const wearing = look.accessory === 'none' ? null : ACCESSORIES.find(({ id }) => id === look.accessory)?.label.toLowerCase()
    return wearing ? `${berry}, ${wearing}` : berry
}

// A mascot's own page: who it is, a row for each part you can change, its things, and Delete.
const MascotPage: React.FC<{ mascot: MascotProfile }> = ({ mascot }) => {
    const { choose } = useFlock()
    const stateOf = useMascotState()
    const name = useAssistantName(mascot)
    const { routines, remembers } = useOwn(mascot)
    const [account] = useAccount()
    const [cloud] = useCloud()
    const [runner] = useRunner()
    const [error, setError] = useState<string | null>(null)
    const isBerry = mascot.id === BERRY_ID
    const canWorkInCloud = !isBerry && (cloud.status !== 'off' || runner.status === 'linked')
    const part = (which: MascotPart) => () => openMascots({ page: 'part', id: mascot.id, part: which })

    const setWorksInCloud = async (worksInCloud: boolean) => {
        const result = await window.chromeAPI.mascots.save(mascot.id, { ...toMascotDraft(mascotForm(mascot)), worksInCloud })
        setError(result.ok ? null : result.error)
    }

    const remove = async () => {
        if (await window.chromeAPI.mascots.delete(mascot.id)) openMascots({ page: 'list' })
    }

    return (
        <>
            <BackButton back="Your mascots" onBack={() => openMascots({ page: 'list' })} />
            <section aria-label={name} className="rounded-sheet bg-sheet shadow-rim pt-5 pr-[18px] pb-5 pl-[22px] flex items-start gap-5">
                <Berry mood={stateOf(mascot).mood} size={64} mascot={mascot} className="mt-0.5" still />
                <div className="flex-1 min-w-0">
                    <h1 className="mb-1 text-18 font-medium [overflow-wrap:anywhere]">{name}</h1>
                    <p className="text-13 leading-[1.45] text-ink-2 line-clamp-3 [overflow-wrap:anywhere]">{isBerry ? BERRY_LINE : mascot.instructions}</p>
                    <LimitTags mascot={mascot} className="mt-3" />
                </div>
                <Button className="h-7" aria-label={`Chat with ${name}`} onClick={() => chatWith(choose, mascot)}>Chat</Button>
            </section>

            {!isBerry && (
                <SettingsGroup label="change">
                    <SettingsLink title={PART_NAMES.look} value={<><Berry size={20} mascot={mascot} still /><span>{lookInWords(mascot)}</span></>} onOpen={part('look')} />
                    <SettingsLink title={PART_NAMES.name} value={<span>{mascot.name}</span>} onOpen={part('name')} />
                    <SettingsLink title={PART_NAMES.purpose} value={<span>{mascot.instructions}</span>} onOpen={part('purpose')} />
                    <SettingsLink title={PART_NAMES.limits} value={<span>{limitsInBrief(mascot)}</span>} onOpen={part('limits')} />
                </SettingsGroup>
            )}

            <SettingsGroup label="its things">
                <SettingsLink title="What it remembers" value={<span>{remembers > 0 ? count(remembers, 'thing') : 'Nothing yet'}</span>} onOpen={() => openMascots({ page: 'memory', id: mascot.id })} />
                <SettingsRow id="mascot-routines" title="Routines" description={routines.length > 0 ? routines.map((routine) => routine.name).join(', ') : undefined}>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            setRoutinesView({ page: 'form', values: blankForm('', '', isBerry ? null : mascot.id) })
                            void window.chromeAPI.browser.openPage('routines')
                        }}
                    >
                        New routine
                    </Button>
                </SettingsRow>
                {!isBerry && account.status !== 'not-set-up' && (
                    mascot.galleryId ? (
                        <SettingsRow id="mascot-gallery" title="In the Gallery" description="It’s a copy from the Gallery, so only its author can publish it.">
                            <span className="font-mono text-11 text-ink-3 whitespace-nowrap">a copy</span>
                        </SettingsRow>
                    ) : (
                        <SettingsLink
                            title="In the Gallery"
                            description="Others can add a copy of it. They never get what it remembers."
                            state={mascot.publishedId ? 'published' : 'not published'}
                            stateOn={!!mascot.publishedId}
                            onOpen={() => openMascots({ page: 'publish', id: mascot.id })}
                        />
                    )
                )}
                {canWorkInCloud && (
                    <SettingsRow id="mascot-works-in-cloud" title="Works in the cloud" description="Choosing it turns on Do this in the cloud. You can still turn that off for one message.">
                        <Switch labelledBy="mascot-works-in-cloud" checked={!!mascot.worksInCloud} onChange={(on) => void setWorksInCloud(on)} />
                    </SettingsRow>
                )}
            </SettingsGroup>
            {error && <div className="mt-3 mx-3"><ChatError message={error} /></div>}

            {!isBerry && (
                <Button size="sm" variant="ghost" className="mt-5 text-ask hover:text-ask" onClick={() => void remove()}>
                    Delete {mascot.name}
                </Button>
            )}
        </>
    )
}

// Publishing keeps what's typed while the tab is away, as the steps do.
const Publish: React.FC<{ tabId: string; mascotId: string }> = ({ tabId, mascotId }) => {
    const param = flockParam({ page: 'publish', id: mascotId })
    const [values, setValues] = useState<PublishValues>(() => tabDraft(tabId, param, blankPublish))
    return (
        <PublishMascot
            mascotId={mascotId}
            values={values}
            onChange={(next) => {
                keepTabDraft(tabId, param, next)
                setValues(next)
            }}
            onBack={() => openMascots({ page: 'mascot', id: mascotId })}
        />
    )
}

// A mascot the page was left on that has since been deleted, or a place a restored session names that isn't there.
const Gone: React.FC = () => (
    <>
        <BackButton back="Your mascots" onBack={() => openMascots({ page: 'list' })} />
        <p className="mx-3 text-13 text-ink-2">This mascot isn’t here any more.</p>
    </>
)

export const FlockPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const place = flockPlace(tab.pageParam)
    const param = flockParam(place)
    const { flock } = useFlock()

    // Leaving part way keeps nothing: what was typed belongs to the place it was typed in.
    useEffect(() => forgetTabDraftElsewhere(tab.id, param), [tab.id, param])

    const mascot = place.page === 'list' || place.page === 'new' ? null : flock.find((each) => each.id === place.id) ?? null
    // Berry is always there once the library has come, so with nobody there it hasn't yet.
    if (flock.length === 0) return null
    const missing = place.page !== 'list' && place.page !== 'new' && !mascot

    if (place.page === 'publish' && mascot) {
        // Not redrawn yet (DESIGN.md section 11), so it keeps its own width.
        return (
            <div className="h-full overflow-y-auto">
                <div className="max-w-5xl mx-auto px-8 py-10">
                    <Publish key={param} tabId={tab.id} mascotId={mascot.id} />
                </div>
            </div>
        )
    }

    return (
        // The gutter stays when nothing scrolls, so the column doesn't move between a short page and a long one.
        <div className="h-full overflow-y-auto [scrollbar-gutter:stable_both-edges]">
            <div className="w-[620px] max-w-[calc(100%-32px)] mx-auto pt-[26px] pb-12">
                {missing ? (
                    <Gone />
                ) : place.page === 'new' ? (
                    <>
                        <BackButton back="Your mascots" onBack={() => openMascots({ page: 'list' })} />
                        <div className="mt-14">
                            <NewMascot tabId={tab.id} />
                        </div>
                    </>
                ) : place.page === 'part' && mascot ? (
                    <>
                        <BackButton back={mascot.name} onBack={() => openMascots({ page: 'mascot', id: mascot.id })} />
                        <div className="mt-2">
                            <ChangePart key={param} tabId={tab.id} mascot={mascot} part={place.part} />
                        </div>
                    </>
                ) : place.page === 'memory' && mascot ? (
                    <MascotMemory mascotId={mascot.id} onBack={() => openMascots({ page: 'mascot', id: mascot.id })} />
                ) : place.page === 'mascot' && mascot ? (
                    <MascotPage key={mascot.id} mascot={mascot} />
                ) : (
                    <List />
                )}
            </div>
        </div>
    )
}
