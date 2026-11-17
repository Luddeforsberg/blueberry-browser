import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, Lock, UserRound, X } from 'lucide-react'
import type { TabInfo } from '@shared/ipc'
import type { GalleryLinked, GalleryListing, GalleryMascot, MascotProfile } from '@shared/library'
import { MAX_MASCOT_NAME, permissionsInWords } from '@shared/mascots'
import { galleryParam, galleryPlace } from '@shared/galleryPlaces'
import { Button } from '@common/components/Button'
import { BERRY_KIND, type Mood } from '@common/components/Mascot'
import { Pips } from '@common/components/Pips'
import { Tooltip } from '@common/components/Tooltip'
import { useStill } from '@common/components/motion'
import { cn } from '@common/lib/utils'
import { useFlock } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Berry } from '../components/Berry'
import { ChatError, Markdown } from '../components/ChatMessage'
import { EmptyPage, PageHeader, SearchField } from '../components/PageFrame'
import { openMascots, startMascot } from '../flockView'
import {
    BERRY_NAMES,
    freeName,
    fromPeople,
    GALLERY_VIEW_EVENT,
    galleryGroups,
    galleryKinds,
    galleryLinkAsks,
    galleryView,
    linkCame,
    mostAdded,
    neighbour,
    setGalleryView,
    type GalleryView
} from '../galleryView'

// DESIGN.md section 10, Gallery: the whole Gallery with no page open, or a list down the left beside one mascot's page.
// Which one is open lives in the tab's param. Everything from the server is text: what it's told is plain text, and the
// example's answer is markdown that can't load anything or go anywhere.

// From the start, not only while the page shows, so a link that comes while another tab is in front isn't missed.
window.chromeAPI.mascots.onLinked(linkCame)

// Below this the page shows one thing at a time: the whole Gallery, or a mascot's page with a way back.
const NARROW = 720
// Five tiles to a row, fewer as the page narrows, and three at the narrowest.
const tileColumns = (width: number) => (width >= 900 ? 5 : width >= NARROW ? 4 : 3)

const asMascot = (entry: GalleryMascot): MascotProfile => ({ ...entry.draft, id: entry.id, deletedAt: null })

const openPlace = (param: string) => void window.chromeAPI.browser.openPage('mascot-gallery', { param })
const openEntry = (id: string) => openPlace(galleryParam({ page: 'mascot', id }))

const startChat = (id: string, choose: (id: string) => void) => {
    choose(id)
    void window.chromeAPI.browser.createTab()
}

const addsWords = (count: number) => `${count.toLocaleString()} added`
// "by" and the author, and for a person's the number of adds, which a starter doesn't have.
const byLine = (entry: GalleryMascot) => (fromPeople(entry) ? `by ${entry.author} · ${addsWords(entry.addCount ?? 0)}` : `by ${entry.author}`)

const tint = (entry: GalleryMascot) => BERRY_KIND[entry.draft.look.palette]

// Its face, or with mascots hidden the pips glyph, so a tile or swatch keeps its colour and still holds something.
const Face: React.FC<{ entry: GalleryMascot; size: number; copy?: MascotProfile | null; mood?: Mood; className?: string }> = ({ entry, size, copy, mood = 'rest', className }) => {
    const { showBerry } = useShell().settings
    if (!showBerry) {
        return (
            <span role="img" aria-label={entry.draft.name} className={cn('shrink-0 grid place-items-center text-ink-2', className)} style={{ width: size, height: size }}>
                <span className="grid place-items-center" style={{ transform: `scale(${Math.max(1, size / 26)})` }}>
                    <Pips pattern="think" still />
                </span>
            </span>
        )
    }
    return <Berry mood={mood} size={size} mascot={copy ?? asMascot(entry)} className={className} />
}

const BerryName: React.FC<{ entry: GalleryMascot; className?: string }> = ({ entry, className }) => (
    <span className={cn('berry-ink font-mono text-[10.5px] lowercase', className)}>{BERRY_NAMES[entry.draft.look.palette]}</span>
)

const Yours: React.FC<{ className?: string }> = ({ className }) => (
    <span className={cn('flex items-center gap-[3px] whitespace-nowrap', className)}>
        <Check aria-hidden className="size-3" strokeWidth={1.75} />
        Yours
    </span>
)

// The kinds of job as chips, each with its count, All first, and only the kinds that have any.
const Kinds: React.FC<{ entries: GalleryMascot[]; chosen: string | null; inList?: boolean }> = ({ entries, chosen, inList }) => {
    const kinds = [{ kind: null, label: 'All', count: entries.length }, ...galleryKinds(entries).map(({ kind, count }) => ({ kind, label: kind, count }))]
    return (
        <div
            role="group"
            aria-label="Kinds of job"
            className={cn(
                'flex gap-0.5',
                inList ? '-mx-1 mt-2.5 mb-1 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(90deg,#000_85%,transparent)]' : '-mx-2.5 mt-4 flex-wrap'
            )}
        >
            {kinds.map(({ kind, label, count }) => (
                <button
                    key={label}
                    type="button"
                    aria-pressed={chosen === kind}
                    onClick={() => setGalleryView({ category: kind })}
                    className={cn(
                        'press shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap text-ink-2 hover:bg-hover outline-none focus-visible:ring-2 focus-visible:ring-focus',
                        inList ? 'h-[26px] px-2 rounded-row text-[12.5px]' : 'h-[30px] px-2.5 rounded-[10px] text-13',
                        chosen === kind && 'bg-sheet-2 hover:bg-sheet-2 text-ink font-medium'
                    )}
                >
                    {label}
                    <span className="font-mono text-11 font-regular text-faint">{count}</span>
                </button>
            ))}
        </div>
    )
}

// The server couldn't be read, so only Blueberry's own are here.
const Unreachable: React.FC<{ onRetry: () => void; className?: string }> = ({ onRetry, className }) => (
    <div role="status" className={cn('px-3 py-2.5 rounded-tile bg-sheet-2 flex items-center gap-3 text-13 text-ink-2', className)}>
        <span className="flex-1 min-w-0">Can’t reach the Gallery, so only Blueberry’s own are here.</span>
        <Button variant="raised" size="sm" onClick={onRetry}>Try again</Button>
    </div>
)

const GroupLabel: React.FC<{ label: string; count?: number; note?: string; className?: string }> = ({ label, count, note, className }) => (
    <h2 className={cn('flex items-baseline gap-2 text-13 font-medium text-ink-2', className)}>
        {label}
        {count !== undefined && <span className="font-mono text-11 font-regular text-faint">{count}</span>}
        {note && <span className="ml-auto text-[12.5px] font-regular text-ink-3">{note}</span>}
    </h2>
)

// One of the most added, in its colour, with the mascot leaning out past the card's edge.
const AddedCard: React.FC<{ entry: GalleryMascot; place: number; onPick: () => void }> = ({ entry, place, onPick }) => (
    <button
        type="button"
        data-tint={tint(entry)}
        aria-label={`${entry.draft.name}, ${addsWords(entry.addCount ?? 0)}`}
        onClick={onPick}
        className="press group berry-tint relative h-[150px] rounded-[22px] px-[18px] py-3.5 overflow-hidden flex flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-sheet"
    >
        <span aria-hidden className="text-20 font-semibold leading-none opacity-[.35]">{place}</span>
        <span className="mt-2 max-w-[60%] text-[16.5px] leading-tight font-semibold [overflow-wrap:anywhere]">{entry.draft.name}</span>
        <span className="mt-0.5 max-w-[58%] text-[12.5px] leading-[1.4] text-ink-2 line-clamp-2">{entry.description}</span>
        <span className="berry-ink mt-auto font-mono text-11 truncate max-w-[60%]">{addsWords(entry.addCount ?? 0)} · by {entry.author}</span>
        <span className="absolute -right-1 -bottom-3.5 -rotate-6 drop-shadow-[0_12px_14px_rgb(0_0_0/.16)] transition-transform duration-move ease-crisp group-hover:-rotate-2 group-hover:-translate-y-1.5">
            <Face entry={entry} size={112} />
        </span>
    </button>
)

// A tile in the whole Gallery: its colour, the mascot, the berry's name, and under it its name and line. With no
// `onPick` it's only a picture of one, as publishing shows.
export const GalleryTile: React.FC<{ entry: GalleryMascot; yours?: boolean; narrow?: boolean; onPick?: () => void }> = ({ entry, yours, narrow, onPick }) => {
    const line = useId()
    const body = (
        <>
            <span
                data-tint={tint(entry)}
                className="berry-tint relative aspect-[1/.9] rounded-[22px] grid place-items-center transition-[transform,box-shadow] duration-move ease-crisp group-hover:-translate-y-[3px] group-hover:shadow-[0_14px_26px_-14px_rgb(0_0_0/.4)] group-focus-visible:ring-2 group-focus-visible:ring-focus group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-sheet"
            >
                <span className={cn('drop-shadow-[0_8px_10px_rgb(0_0_0/.13)] transition-transform duration-move ease-crisp group-hover:-translate-y-[3px] group-hover:-rotate-[5deg]', !narrow && 'mb-3')}>
                    <Face entry={entry} size={70} />
                </span>
                {!narrow && <BerryName entry={entry} className="absolute inset-x-0 bottom-[9px] text-center text-[9.5px]" />}
                {yours && <Yours className="absolute right-2 top-2 h-5 pl-[5px] pr-[7px] rounded-full bg-sheet shadow-chip text-11 text-ink-2" />}
            </span>
            <span className="block mx-0.5 mt-[9px] text-[13.5px] font-medium [overflow-wrap:anywhere]">{entry.draft.name}</span>
            <span id={line} className="block mx-0.5 mt-0.5 text-[12.5px] leading-[1.4] text-ink-2 line-clamp-2">{entry.description}</span>
        </>
    )
    if (!onPick) return <div className="group">{body}</div>
    return (
        <button
            type="button"
            data-gallery-tile={entry.id}
            aria-label={yours ? `${entry.draft.name}, yours` : entry.draft.name}
            aria-describedby={line}
            onClick={onPick}
            className="group block w-full text-left outline-none"
        >
            {body}
        </button>
    )
}

// One row of the list beside a mascot's page.
const ListRow: React.FC<{ entry: GalleryMascot; picked: boolean; yours: boolean }> = ({ entry, picked, yours }) => {
    const by = useId()
    return (
        <button
            type="button"
            data-gallery-row={entry.id}
            aria-label={yours ? `${entry.draft.name}, yours` : entry.draft.name}
            aria-describedby={by}
            aria-current={picked || undefined}
            onClick={() => openEntry(entry.id)}
            className={cn(
                'w-full h-[50px] px-2 rounded-[11px] flex items-center gap-[11px] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus',
                picked ? 'bg-sheet-2' : 'hover:bg-hover'
            )}
        >
            <span data-tint={tint(entry)} className="berry-tint size-9 shrink-0 rounded-[11px] grid place-items-center">
                <Face entry={entry} size={28} />
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-medium truncate">{entry.draft.name}</span>
                <span id={by} className="block text-12 text-ink-3 truncate">{byLine(entry)}</span>
            </span>
            {yours && <Yours className="text-12 text-ink-3" />}
        </button>
    )
}

// Its limits as pills, in `permissionsInWords`' words, read from the sites and tools the tool layer enforces. Only a real
// limit has a padlock.
const LimitPills: React.FC<{ entry: GalleryMascot }> = ({ entry }) => (
    <ul aria-label="What it’s allowed to do" className="mt-3 flex flex-wrap gap-1.5">
        {permissionsInWords(entry.draft).map(({ text, open }) => (
            <li key={text} className={cn('min-h-[26px] px-2.5 py-[3px] rounded-full bg-sheet-2 inline-flex items-center gap-[5px] text-[12.5px] [overflow-wrap:anywhere]', open ? 'text-ink-2' : 'text-ink')}>
                {!open && <Lock aria-label="Limited" className="size-3 shrink-0" strokeWidth={1.75} />}
                {text}
            </li>
        ))}
    </ul>
)

// The question as the user's bubble, and the answer beside the mascot's face, its first lines fading out until it's read.
const Example: React.FC<{ entry: GalleryMascot; copy: MascotProfile | null }> = ({ entry, copy }) => {
    const answer = useRef<HTMLDivElement>(null)
    const [long, setLong] = useState(false)
    const [whole, setWhole] = useState(false)
    useLayoutEffect(() => {
        const box = answer.current
        if (!box) return undefined
        const measure = () => setLong(box.scrollHeight > box.clientHeight + 1)
        measure()
        const watch = new ResizeObserver(measure)
        watch.observe(box)
        if (box.firstElementChild) watch.observe(box.firstElementChild)
        return () => watch.disconnect()
    }, [entry.example])
    if (!entry.example) return null
    const clipped = long && !whole
    return (
        <section aria-label="An example">
            <h3 className="mt-[26px] mb-2.5 flex items-baseline gap-2 text-15 font-semibold">
                An example
                <span className="ml-auto font-mono text-11 font-regular text-ink-3">from a real run</span>
            </h3>
            <p className="ml-auto w-fit max-w-[78%] px-[13px] py-2 rounded-sheet rounded-br-[5px] bg-sheet-2 text-[13.5px] leading-[1.45] whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.example.prompt}</p>
            <div className="mt-3.5 flex gap-[11px]">
                <Face entry={entry} copy={copy} size={24} className="mt-px" />
                <div ref={answer} className={cn('relative flex-1 min-w-0', !whole && 'max-h-[150px] overflow-hidden')}>
                    <Markdown content={entry.example.answer} fromStranger className="text-[13.5px] leading-[1.55] [overflow-wrap:anywhere] prose-headings:mt-0 prose-headings:mb-2 prose-headings:text-15 prose-p:my-0 prose-p:mb-2" />
                    {clipped && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[70px] bg-gradient-to-b from-transparent to-sheet" />}
                </div>
            </div>
            {clipped && (
                <Button variant="raised" size="sm" className="ml-[35px] mt-1" onClick={() => setWhole(true)}>
                    Read the whole answer
                </Button>
            )}
        </section>
    )
}

// Add, or once it's yours, its page and Chat.
const Actions: React.FC<{ name: string; copy: MascotProfile | null; onAdd: () => void }> = ({ name, copy, onAdd }) => {
    const { choose } = useFlock()
    if (!copy) return <Button aria-label={`Add ${name}`} onClick={onAdd}>Add</Button>
    return (
        <>
            <Button variant="raised" onClick={() => openMascots({ page: 'mascot', id: copy.id })}>Its page</Button>
            <Button aria-label={`Chat with ${copy.name}`} onClick={() => startChat(copy.id, choose)}>Chat</Button>
        </>
    )
}

// Everything you need to decide, with Add on its first screen. Nothing is added until Add, and Add names the version
// shown, so main copies exactly that one.
const MascotPage: React.FC<{ entry: GalleryMascot; copy: MascotProfile | null; linked: boolean; narrow: boolean; onClose: () => void }> = ({ entry, copy, linked, narrow, onClose }) => {
    const { flock } = useFlock()
    const { name } = entry.draft
    const taken = flock.map((mascot) => mascot.name)
    const clash = !copy && taken.some((other) => other.toLowerCase() === name.toLowerCase())
    const [ownName, setOwnName] = useState(() => freeName(name, taken))
    const [error, setError] = useState<string | null>(null)
    const scroller = useRef<HTMLDivElement>(null)
    const top = useRef<HTMLDivElement>(null)
    const [pinned, setPinned] = useState(false)
    const ownPublished = copy !== null && copy.galleryId !== entry.id

    useEffect(() => {
        const root = scroller.current
        const mark = top.current
        if (!root || !mark) return undefined
        const watch = new IntersectionObserver(([seen]) => setPinned(!seen.isIntersecting && seen.boundingClientRect.top < (seen.rootBounds?.top ?? 0)), { root })
        watch.observe(mark)
        return () => watch.disconnect()
    }, [])

    const add = async () => {
        const result = await window.chromeAPI.mascots.addFromGallery(entry.id, entry.version ?? '', clash ? ownName : null)
        setError(result.ok ? null : result.error)
    }

    return (
        <article aria-label={name} data-tint={tint(entry)} className="relative h-full min-w-0">
            {pinned && (
                <div className="absolute inset-x-0 top-0 z-10 h-[54px] pl-6 pr-5 flex items-center gap-2.5 bg-sheet shadow-[0_1px_0_var(--line)]">
                    <span className="berry-tint size-8 shrink-0 rounded-[10px] grid place-items-center">
                        <Face entry={entry} copy={copy} size={24} />
                    </span>
                    <span className="min-w-0 truncate text-14 font-medium">{name}</span>
                    <span className="min-w-0 truncate text-[12.5px] text-ink-3">{byLine(entry)}</span>
                    <span className="ml-auto flex gap-1.5">
                        <Actions name={name} copy={copy} onAdd={() => void add()} />
                    </span>
                </div>
            )}
            <div ref={scroller} className="h-full overflow-y-auto">
                <div className="berry-tint relative h-[132px]">
                    {narrow ? (
                        <Button variant="ghost" size="sm" className="absolute left-3 top-3 bg-sheet/70 hover:bg-sheet text-ink-2" onClick={onClose}>
                            <ArrowLeft strokeWidth={1.75} />
                            Gallery
                        </Button>
                    ) : (
                        <>
                            <BerryName entry={entry} className="absolute left-8 top-[18px]" />
                            <Tooltip words="Close" shortcut="Esc">
                                <button
                                    type="button"
                                    aria-label="Close"
                                    onClick={onClose}
                                    className="press absolute right-4 top-3.5 size-[30px] rounded-full bg-sheet/75 hover:bg-sheet grid place-items-center text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                >
                                    <X aria-hidden className="size-3.5" strokeWidth={1.75} />
                                </button>
                            </Tooltip>
                        </>
                    )}
                </div>
                <div className={cn('relative max-w-[640px] -mt-[58px] pb-12', narrow ? 'pl-5 pr-[22px]' : 'pl-8 pr-9')}>
                    <div className="flex items-end gap-[18px]">
                        <span className="drop-shadow-[0_12px_14px_rgb(0_0_0/.16)]">
                            <Face entry={entry} copy={copy} size={108} mood={copy ? 'delivered' : 'rest'} />
                        </span>
                        <span className="ml-auto pb-1.5 flex gap-1.5">
                            <Actions name={name} copy={copy} onAdd={() => void add()} />
                        </span>
                    </div>
                    <div ref={top}>
                        {linked && <p className="mt-3.5 -mb-2.5 font-mono text-11 text-ink-3">from a link you opened</p>}
                        <h1 className="mt-3.5 text-[24px] leading-tight font-semibold tracking-[-.02em] [overflow-wrap:anywhere]">{name}</h1>
                    </div>
                    <p className="mt-0.5 text-13 text-ink-3 [overflow-wrap:anywhere]">{byLine(entry)}</p>
                    <p className="mt-2 text-[14.5px] leading-[1.45] text-ink-2 [overflow-wrap:anywhere]">{entry.description}</p>
                    <LimitPills entry={entry} />

                    {copy ? (
                        <p role="status" className="mt-3.5 flex items-start gap-[9px] text-13 text-ink-2">
                            <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
                            {ownPublished ? 'You published this one, so it’s already yours.' : 'Added to your mascots. It’s a copy, so nothing in the Gallery can change it from here on.'}
                        </p>
                    ) : clash ? (
                        <div className="mt-3.5 px-3.5 py-3 rounded-[14px] bg-sheet-2 flex flex-wrap items-center gap-3 text-13 text-ink-2">
                            <label htmlFor="gallery-own-name" className="flex-1 min-w-[200px]">You already have a {name}, so this one needs another name.</label>
                            <input
                                id="gallery-own-name"
                                maxLength={MAX_MASCOT_NAME}
                                value={ownName}
                                onChange={(event) => setOwnName(event.target.value)}
                                className="ml-auto h-8 w-[190px] px-2.5 rounded-[10px] bg-sheet shadow-rim text-[13.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            />
                        </div>
                    ) : fromPeople(entry) ? (
                        <p className="mt-3.5 px-[13px] py-[11px] rounded-tile bg-sheet-2 flex items-start gap-[9px] text-13 text-ink-2">
                            <UserRound aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
                            <span>
                                <span className="font-medium text-ink">{entry.author} wrote this, not Blueberry,</span> and nobody has checked it. Read what it’s told before you add it. Its limits
                                are real either way: they’re set here, not by what it says about itself.
                            </span>
                        </p>
                    ) : (
                        <p className="mt-3.5 flex items-start gap-[9px] text-13 text-ink-2">
                            <Copy aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
                            You get your own copy. It asks before anything risky, like all of yours, and you can change it any time.
                        </p>
                    )}
                    {error && <div className="mt-3"><ChatError message={error} /></div>}

                    <h2 className="mt-[26px] mb-2.5 text-15 font-semibold">What it’s told, word for word</h2>
                    <p className="px-4 py-3.5 rounded-[14px] bg-sheet-2 text-[13.5px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.draft.instructions}</p>

                    <Example entry={entry} copy={copy} />
                </div>
            </div>
        </article>
    )
}

// A mascot that can't be shown: gone from the Gallery, or the server can't be asked. Nothing was added either way.
const Missing: React.FC<{ status: GalleryListing['status']; onRetry: () => void; onClose: () => void; narrow: boolean }> = ({ status, onRetry, onClose, narrow }) => (
    <div className="relative h-full flex flex-col">
        {narrow && (
            <Button variant="ghost" size="sm" className="absolute left-3 top-3 text-ink-2" onClick={onClose}>
                <ArrowLeft strokeWidth={1.75} />
                Gallery
            </Button>
        )}
        <EmptyPage
            face={<Berry mood="oops" size={56} />}
            actions={status === 'unreachable' ? <Button variant="raised" onClick={onRetry}>Try again</Button> : undefined}
        >
            {status === 'live'
                ? 'That mascot isn’t in the Gallery any more, so nothing was added.'
                : status === 'unreachable'
                  ? 'Couldn’t reach the Gallery, so that mascot can’t be shown, and nothing was added.'
                  : 'This copy of Blueberry only has its own mascots, so that one can’t be shown, and nothing was added.'}
        </EmptyPage>
    </div>
)

const NothingFound: React.FC<{ query: string }> = ({ query }) => (
    <EmptyPage face={<Berry mood="oops" size={40} />} actions={<Button variant="raised" onClick={() => startMascot()}>New mascot</Button>} className="min-h-[200px] pb-0">
        Nothing in the Gallery for “{query.trim()}”. You can make one yourself.
    </EmptyPage>
)

export const MascotGalleryPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { flock } = useFlock()
    const still = useStill()
    const [view, setViewState] = useState<GalleryView>(galleryView)
    const [asks, setAsks] = useState(galleryLinkAsks)
    const [listing, setListing] = useState<GalleryListing | null>(null)
    // What the server said about the entry a link asked for, by which id and which ask.
    const [linkedAnswer, setLinkedAnswer] = useState<{ key: string; answer: GalleryLinked } | null>(null)
    const root = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(0)
    // The one open before, which keeps the keyboard when the tiles come back, however the page was closed.
    const lookedAt = useRef<string | null>(null)
    // Whether the keyboard was on a tile when one was picked, so it moves on to that one's row.
    const onTile = useRef(false)
    // Publishing or unpublishing changes this, and that changes what the page should show.
    const ownPublished = flock.map((mascot) => mascot.publishedId ?? '').join()

    const [retries, setRetries] = useState(0)
    const place = galleryPlace(tab.pageParam)
    const pickedId = place.page === 'all' ? null : place.id
    const linkedId = place.page === 'linked' ? place.id : null
    // Every link that comes asks again, even for the same one, and so does Try again.
    const linkKey = linkedId === null ? null : `${linkedId} ${asks} ${retries}`

    useEffect(() => {
        const follow = () => {
            setViewState(galleryView())
            setAsks(galleryLinkAsks())
        }
        window.addEventListener(GALLERY_VIEW_EVENT, follow)
        // A link can come between the first render and here.
        follow()
        return () => window.removeEventListener(GALLERY_VIEW_EVENT, follow)
    }, [])

    useLayoutEffect(() => {
        const element = root.current
        if (!element) return undefined
        setWidth(element.clientWidth)
        const watch = new ResizeObserver(() => setWidth(element.clientWidth))
        watch.observe(element)
        return () => watch.disconnect()
    }, [])

    const asked = useRef(0)
    const load = useCallback(() => {
        const ask = ++asked.current
        window.chromeAPI.mascots
            .gallery()
            .catch((): GalleryListing => ({ entries: [], status: 'unreachable' }))
            .then((answer) => ask === asked.current && setListing(answer))
    }, [])
    useEffect(load, [load, ownPublished])

    // A link's entry is asked of the server again, rather than taken from the list.
    useEffect(() => {
        if (linkedId === null || linkKey === null) return undefined
        let left = false
        window.chromeAPI.mascots
            .galleryLinked(linkedId)
            .catch((): GalleryLinked => ({ entry: null, status: 'unreachable' }))
            .then((answer) => {
                if (left) return
                setLinkedAnswer({ key: linkKey, answer })
                if (answer.entry || answer.status !== 'live') return
                // Gone: its row goes now, not when the list comes back.
                setListing((shown) => shown && { ...shown, entries: shown.entries.filter((entry) => entry.id !== linkedId) })
                load()
            })
        return () => {
            left = true
        }
    }, [linkedId, linkKey, load])

    const entries = listing?.entries ?? []
    const narrow = width > 0 && width < NARROW
    const groups = galleryGroups(entries, view.query, view.category)
    const listIds = groups.flatMap((group) => group.entries.map((entry) => entry.id))
    // Your own published one counts as yours, so it's never offered back to you.
    const copyOf = (entry: GalleryMascot) => flock.find((mascot) => mascot.galleryId === entry.id || mascot.publishedId === entry.id) ?? null
    const linked = place.page === 'linked' && linkedAnswer?.key === linkKey ? linkedAnswer.answer : null
    const picked = place.page === 'linked' ? (linked?.entry ?? null) : entries.find((entry) => entry.id === pickedId) ?? null
    // Still being asked, so nothing shows rather than something wrong.
    const waiting = pickedId !== null && !picked && (place.page === 'linked' ? !linked : !listing)

    const close = useCallback(() => openPlace(galleryParam({ page: 'all' })), [])
    // From the tiles or cards: with the keyboard in the page, it goes on to the picked one's row.
    const pick = (id: string) => {
        onTile.current = root.current?.contains(document.activeElement) ?? false
        openEntry(id)
    }

    // Esc closes the page, unless it's clearing a field that has words in it.
    useEffect(() => {
        if (pickedId === null) return undefined
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            const target = event.target
            if (target instanceof HTMLInputElement && target.type === 'search' && target.value) return
            event.preventDefault()
            close()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [pickedId, close])

    // Back on the tiles, the one looked at has the keyboard. Opened, the row picked has it, so ↑ and ↓ go on from there.
    useEffect(() => {
        const before = lookedAt.current
        lookedAt.current = pickedId
        if (pickedId === null) {
            if (before) root.current?.querySelector<HTMLElement>(`[data-gallery-tile="${CSS.escape(before)}"]`)?.focus()
            return
        }
        if (onTile.current) root.current?.querySelector<HTMLElement>(`[data-gallery-row="${CSS.escape(pickedId)}"]`)?.focus()
        onTile.current = false
    }, [pickedId])

    // The tiles fold into the list and back, unless the motion is held still, when they fade.
    const mode = pickedId === null ? 'all' : 'picked'
    const lastMode = useRef(mode)
    const moved = lastMode.current !== mode
    useEffect(() => {
        lastMode.current = mode
    }, [mode])
    const motion = (kind: 'list' | 'page' | 'tiles') => (moved ? (still ? 'animate-gallery-fade' : `animate-gallery-${kind}`) : undefined)

    const onListKey = (event: React.KeyboardEvent) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const next = neighbour(listIds, pickedId, event.key === 'ArrowDown' ? 1 : -1)
        if (!next || next === pickedId) return
        openEntry(next)
        root.current?.querySelector<HTMLElement>(`[data-gallery-row="${CSS.escape(next)}"]`)?.focus()
    }

    const search = (props: { fill?: boolean; folded?: boolean }) => (
        <SearchField label="Search the Gallery" placeholder="Search mascots or sites" value={view.query} onChange={(query) => setGalleryView({ query })} {...props} />
    )
    const yourMascots = (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => openMascots({ page: 'list' })}>
            Your mascots
        </Button>
    )
    const searching = view.query.trim() !== ''
    const nothingFound = searching && listIds.length === 0

    const page = !pickedId ? null : waiting ? (
        <p role="status" className="p-8 text-14 text-ink-2">Getting the mascot from the Gallery…</p>
    ) : picked ? (
        <MascotPage key={`${picked.id} ${picked.version ?? ''}`} entry={picked} copy={copyOf(picked)} linked={place.page === 'linked'} narrow={narrow} onClose={close} />
    ) : (
        <Missing
            status={linked?.status ?? (listing?.status === 'unreachable' ? 'unreachable' : 'live')}
            onRetry={() => (linkedId !== null ? setRetries((count) => count + 1) : load())}
            onClose={close}
            narrow={narrow}
        />
    )

    if (!listing && !pickedId) return <div ref={root} className="h-full" />

    // A mascot's page, with the list beside it, or alone on a narrow page.
    if (pickedId) {
        return (
            <div ref={root} className="h-full flex bg-sheet">
                {!narrow && (
                    <aside aria-label="Gallery" className={cn('w-[320px] shrink-0 h-full overflow-y-auto shadow-[1px_0_0_var(--line)] pt-5 pl-3.5 pr-3 pb-6', motion('list'))}>
                        <div className="mx-1.5 mb-3 min-h-[34px] flex items-center gap-2">
                            <h1 className="flex-1 text-20 font-semibold">Gallery</h1>
                            {yourMascots}
                        </div>
                        {search({ fill: true })}
                        <Kinds entries={entries} chosen={view.category} inList />
                        {listing?.status === 'unreachable' && <Unreachable onRetry={load} className="mx-1 mt-3" />}
                        {nothingFound ? (
                            <NothingFound query={view.query} />
                        ) : (
                            <div onKeyDown={onListKey}>
                                {groups.map((group) => (
                                    <section key={group.key} aria-label={group.label}>
                                        <GroupLabel label={group.label} count={group.key === 'found' ? undefined : group.entries.length} className="mx-2 mt-3.5 mb-1" />
                                        <ul>
                                            {group.entries.map((entry) => (
                                                <li key={entry.id}>
                                                    <ListRow entry={entry} picked={entry.id === pickedId} yours={copyOf(entry) !== null} />
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                ))}
                            </div>
                        )}
                    </aside>
                )}
                <div className={cn('flex-1 min-w-0 h-full', motion('page'))}>{page}</div>
            </div>
        )
    }

    // The whole Gallery.
    const shownCards = searching || view.category !== null ? [] : mostAdded(entries).slice(0, narrow ? 1 : 3)
    return (
        <div ref={root} className="h-full overflow-y-auto [scrollbar-gutter:stable_both-edges]">
            <div className={cn('max-w-[904px] mx-auto pt-[26px] pb-12', narrow ? 'px-5' : 'px-8', motion('tiles'))}>
                <PageHeader title="Gallery" search={search({ folded: narrow })} actions={yourMascots}>
                    Mascots made for one job. Pick one to read what it’s told, then add your own copy.
                </PageHeader>
                <Kinds entries={entries} chosen={view.category} />
                {listing?.status === 'unreachable' && <Unreachable onRetry={load} className="mt-4" />}
                {shownCards.length > 0 && (
                    <section aria-label="Most added">
                        <GroupLabel label="Most added" className="mt-6 mb-3" />
                        <div className={cn('grid gap-3.5', narrow ? 'grid-cols-1' : 'grid-cols-3')}>
                            {shownCards.map((entry, index) => (
                                <AddedCard key={entry.id} entry={entry} place={index + 1} onPick={() => pick(entry.id)} />
                            ))}
                        </div>
                    </section>
                )}
                {nothingFound ? (
                    <NothingFound query={view.query} />
                ) : (
                    groups.map((group) => (
                        <section key={group.key} aria-label={group.label}>
                            <GroupLabel
                                label={group.label}
                                count={group.key === 'found' ? undefined : group.entries.length}
                                note={group.key === 'people' && !narrow ? 'Written by people using Blueberry, and not checked by us.' : undefined}
                                className="mt-6 mb-3"
                            />
                            <ul className="grid gap-x-3.5 gap-y-[22px]" style={{ gridTemplateColumns: `repeat(${tileColumns(width)}, minmax(0, 1fr))` }}>
                                {group.entries.map((entry) => (
                                    <li key={entry.id}>
                                        <GalleryTile entry={entry} yours={copyOf(entry) !== null} narrow={narrow} onPick={() => pick(entry.id)} />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))
                )}
            </div>
        </div>
    )
}

