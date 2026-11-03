import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Lock, LockOpen, Search } from 'lucide-react'
import type { GalleryListing, GalleryMascot, MascotExample, MascotProfile } from '@shared/library'
import { MAX_MASCOT_NAME, permissionsInWords } from '@shared/mascots'
import { Button } from '@common/components/Button'
import { QuietChoice } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { useFlock } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { Berry } from '../components/Berry'
import { ChatError, Markdown } from '../components/ChatMessage'
import { CopyLink } from '../components/CopyLink'
import { filterGallery, freeName, GALLERY_VIEW_EVENT, galleryView, setGalleryView, sortGallery, type GallerySort, type GalleryView } from '../galleryView'

const asMascot = (entry: GalleryMascot): MascotProfile => ({ ...entry.draft, id: entry.id, deletedAt: null })

const startChat = (id: string, choose: (id: string) => void) => {
    choose(id)
    void window.chromeAPI.browser.createTab()
}

// The page's main idea: what a mascot may do, in words, read from its real limits. Open means it isn't limited.
export const Permissions: React.FC<{ draft: GalleryMascot['draft']; large?: boolean }> = ({ draft, large }) => (
    <ul aria-label="What it’s allowed to do" className={cn("flex", large ? "flex-col gap-1.5 text-14" : "flex-wrap gap-x-4 gap-y-0.5 text-12 text-muted-foreground")}>
        {permissionsInWords(draft).map(({ text, open }) => {
            const Icon = open ? LockOpen : Lock
            return (
                <li key={text} className={cn("flex items-start [overflow-wrap:anywhere]", large ? "gap-2" : "gap-1.5")}>
                    <Icon aria-hidden className={cn("shrink-0", large ? "mt-[3px] size-4" : "mt-[2px] size-3")} />
                    {text}
                </li>
            )
        })}
    </ul>
)

// What strangers wrote. The question stays as typed, and the answer reads as it did in the chat, but can't fetch an
// image or dress up a link.
export const ExampleText: React.FC<{ example: MascotExample }> = ({ example }) => (
    <>
        <h3 className="text-12 text-muted-foreground">I asked this</h3>
        <p className="mt-1 text-14 whitespace-pre-wrap [overflow-wrap:anywhere]">{example.prompt}</p>
        <h3 className="mt-4 text-12 text-muted-foreground">And here’s what it gave me</h3>
        <Markdown content={example.answer} fromStranger className="mt-1 text-14 [overflow-wrap:anywhere]" />
    </>
)

const InFlock: React.FC = () => (
    <span className="flex items-center gap-1 text-12 text-success">
        <Check aria-hidden className="size-3.5" />
        In your flock
    </span>
)

const ROW_BIRD = 88
const REVIEW_BIRD = 148
const HIDDEN_ICON = 32
// How far down the standing drawing its feet reach, so its toes grip the line under the row.
const FEET_Y = 113 / 120
const FEET_X = 57 / 120

// One line of the Gallery, with the bird standing on the divider under it. With no `onReview`, it's only a picture of one.
export const GalleryCard: React.FC<{ entry: GalleryMascot; copy: MascotProfile | null; onReview?: () => void }> = ({ entry, copy, onReview }) => {
    const { choose } = useFlock()
    const { showBerry } = useShell().settings
    const [near, setNear] = useState(false)
    const { name } = entry.draft
    return (
        <li
            aria-label={name}
            onMouseEnter={() => setNear(true)}
            onMouseLeave={() => setNear(false)}
            onFocus={() => setNear(true)}
            onBlur={() => setNear(false)}
            className="relative flex items-stretch gap-4 border-b"
        >
            <div className="relative shrink-0 self-end" style={{ width: showBerry ? ROW_BIRD : HIDDEN_ICON, height: showBerry ? ROW_BIRD * FEET_Y : HIDDEN_ICON, marginBottom: showBerry ? 0 : 16 }}>
                <Berry mood={near ? 'curious' : 'rest'} size={showBerry ? ROW_BIRD : HIDDEN_ICON} mascot={asMascot(entry)} />
            </div>
            <div className="min-w-0 flex-1 py-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="min-w-[240px] flex-1 [overflow-wrap:anywhere]">
                    <h2 className="inline text-16 font-semibold">{name}</h2>
                    <span className="ml-2 text-12 text-muted-foreground">By {entry.author}{entry.example && ' · with an example'}</span>
                    <p className="mt-0.5 text-14">{entry.description}</p>
                    <div className="mt-1.5"><Permissions draft={entry.draft} /></div>
                </div>
                <div className="ml-auto shrink-0 flex items-center gap-3">
                    {entry.addCount !== undefined && !copy && <span className="text-12 text-muted-foreground tabular-nums">{entry.addCount === 1 ? '1 add' : `${entry.addCount} adds`}</span>}
                    {!onReview ? null : copy ? (
                        <>
                            <InFlock />
                            <Button size="sm" variant="ghost" aria-label={`Details of ${name}`} onClick={onReview}>Details</Button>
                            <Button size="sm" variant="outline" aria-label={`Chat with ${copy.name}`} onClick={() => startChat(copy.id, choose)}>Chat</Button>
                        </>
                    ) : (
                        <Button size="sm" variant="outline" aria-label={`Add ${name}`} onClick={onReview}>Add</Button>
                    )}
                </div>
            </div>
        </li>
    )
}

// Everything the mascot would be told and allowed, before there's a copy of it. Nothing is added until Add is pressed.
const Review: React.FC<{ entry: GalleryMascot; copy: MascotProfile | null; onBack: () => void }> = ({ entry, copy, onBack }) => {
    const { flock, choose } = useFlock()
    const { settings } = useShell()
    const { showBerry } = settings
    const reviewBird = showBerry ? REVIEW_BIRD : HIDDEN_ICON
    const { name } = entry.draft
    const taken = flock.map((mascot) => mascot.name)
    const clash = !copy && taken.some((other) => other.toLowerCase() === name.toLowerCase())
    const [ownName, setOwnName] = useState(() => freeName(name, taken))
    const [error, setError] = useState<string | null>(null)
    const added = copy !== null

    const page = useRef<HTMLElement>(null)

    // Once it's added there's nothing left to review, so coming back to the page shows the Gallery. Add is at the bottom
    // of a long page, so it goes back up to where the bird lands.
    useEffect(() => {
        if (!added) return undefined
        page.current?.scrollIntoView({ block: 'start' })
        return () => setGalleryView({ reviewing: null })
    }, [added])

    const add = async () => {
        const result = await window.chromeAPI.mascots.addFromGallery(entry.id, clash ? ownName : null)
        setError(result.ok ? null : result.error)
    }

    return (
        <article ref={page} className="max-w-2xl mx-auto">
            <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
                <ArrowLeft />
                Gallery
            </Button>
            {/* The bird stands on the line under the heading, and the page carries on below it. */}
            <header className="mt-3 flex items-end gap-6 border-b">
                <div className="min-w-0 flex-1 pb-5 [overflow-wrap:anywhere]">
                    <h1 className="text-20 font-semibold">{copy ? `${copy.name} is in your flock` : `Add ${name} to your flock?`}</h1>
                    <p className="mt-1 text-14">{entry.description}</p>
                    <p className="mt-1 text-13 text-muted-foreground">
                        By {entry.author}.
                        {entry.publishedAt !== undefined && ' Someone using Blueberry wrote this, and we haven’t checked it, so read what it’s told.'}
                    </p>
                    {copy && <div className="mt-2"><InFlock /></div>}
                </div>
                <div aria-label="Preview" role="group" className="relative shrink-0" style={{ width: reviewBird, height: reviewBird * (showBerry ? FEET_Y : 1) }}>
                    <div key={copy ? 'added' : 'reviewing'} className={cn(copy && !settings.keepBerryStill && "motion-safe:animate-berry-hop")} style={{ transformOrigin: `${FEET_X * 100}% ${FEET_Y * 100}%` }}>
                        <Berry mood={copy ? 'delivered' : 'asking'} size={reviewBird} mascot={copy ?? asMascot(entry)} />
                    </div>
                </div>
            </header>

            <section className="py-5 border-b">
                <h2 className="text-14 font-semibold">What it’s allowed to do</h2>
                <div className="mt-2"><Permissions draft={entry.draft} large /></div>
                <p className="mt-2 text-13 text-muted-foreground">
                    {entry.draft.sites.length > 0 && 'A site includes its subdomains, and it can’t use any other site. '}
                    Your Ask before acting setting applies to it as it does to Berry, with the same approval cards.
                </p>
            </section>

            <section className="py-5 border-b">
                <h2 className="text-14 font-semibold">What it’s told, word for word</h2>
                <p className="mt-2 text-14 whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.draft.instructions}</p>
            </section>

            {entry.example && (
                <section aria-label="Example" className="py-5 border-b">
                    <ExampleText example={entry.example} />
                </section>
            )}

            {entry.link && (
                <p className="py-3 border-b flex flex-wrap items-center gap-2 text-13 text-muted-foreground">
                    <span className="[overflow-wrap:anywhere]">{entry.link}</span>
                    <CopyLink link={entry.link} />
                </p>
            )}

            {clash && (
                <section className="pt-5">
                    <label htmlFor="gallery-own-name" className="text-14 font-semibold">You already have a {name}. Name this one</label>
                    <input
                        id="gallery-own-name"
                        maxLength={MAX_MASCOT_NAME}
                        value={ownName}
                        onChange={(event) => setOwnName(event.target.value)}
                        className="mt-2 block w-full max-w-xs h-9 px-3 rounded-card border bg-surface text-14 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                </section>
            )}

            {error && <div className="mt-4"><ChatError message={error} /></div>}

            <div className="mt-5 flex items-center gap-3">
                {copy ? (
                    <>
                        <Button aria-label={`Start a chat with ${copy.name}`} onClick={() => startChat(copy.id, choose)}>Start a chat</Button>
                        <Button variant="ghost" onClick={onBack}>Back to the Gallery</Button>
                    </>
                ) : (
                    <>
                        <Button onClick={() => void add()}>Add to flock</Button>
                        <Button variant="ghost" onClick={onBack}>Cancel</Button>
                    </>
                )}
            </div>
            <p className="mt-3 text-12 text-muted-foreground">
                {copy ? 'It’s your own copy. Nothing in the Gallery can change it, and in your flock you can edit it or take off its limits.' : 'You get your own copy. Nothing in the Gallery can change it later, and in your flock you can edit it or take off its limits.'}
            </p>
        </article>
    )
}

export const MascotGalleryPage: React.FC = () => {
    const { flock } = useFlock()
    const [view, setViewState] = useState<GalleryView>(galleryView)
    const [listing, setListing] = useState<GalleryListing | null>(null)
    const entries = listing?.entries ?? null
    // Publishing or unpublishing changes this, and that changes what the page should show.
    const ownPublished = flock.map((mascot) => mascot.publishedId ?? '').join()

    useEffect(() => {
        const follow = () => setViewState(galleryView())
        window.addEventListener(GALLERY_VIEW_EVENT, follow)
        return () => window.removeEventListener(GALLERY_VIEW_EVENT, follow)
    }, [])

    const load = useCallback(() => {
        window.chromeAPI.mascots.gallery().then(setListing).catch(() => setListing({ entries: [], status: 'unreachable' }))
    }, [])
    useEffect(load, [load, ownPublished])

    const categories = useMemo(() => [...new Set((entries ?? []).map((entry) => entry.category))], [entries])
    const shown = useMemo(() => sortGallery(filterGallery(entries ?? [], view.query, view.category), view.sort), [entries, view.query, view.category, view.sort])
    // Your own published one counts as in your flock, so it's never offered back to you.
    const copyOf = (entry: GalleryMascot) => flock.find((mascot) => mascot.galleryId === entry.id || mascot.publishedId === entry.id) ?? null
    const reviewing = entries?.find((entry) => entry.id === view.reviewing)

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-5xl mx-auto px-8 py-10">
                {reviewing ? (
                    <Review key={reviewing.id} entry={reviewing} copy={copyOf(reviewing)} onBack={() => setGalleryView({ reviewing: null })} />
                ) : (
                    <>
                        <div className="flex items-start justify-between gap-4">
                            <div className="max-w-2xl">
                                <h1 className="text-20 font-semibold">Gallery</h1>
                                <p className="mt-1 text-14 text-muted-foreground">
                                    {listing?.status === 'live'
                                        ? 'Birds made for one job. A few are ours. The rest were written by strangers and nobody has checked them, so each one shows you what it’s told, word for word, before you add it. What you add is your own copy.'
                                        : 'Birds made for one job. Each one shows you what it’s told, word for word, before you add it, and what you add is your own copy.'}
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void window.chromeAPI.browser.openPage('flock')}>Flock</Button>
                        </div>
                        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1">
                            <label className="flex-1 min-w-[200px] max-w-xs h-8 flex items-center gap-2 text-muted-foreground">
                                <Search aria-hidden className="size-4 shrink-0" />
                                <input
                                    type="search"
                                    aria-label="Search the Gallery"
                                    placeholder="Search mascots or sites"
                                    value={view.query}
                                    onChange={(event) => setGalleryView({ query: event.target.value })}
                                    className="min-w-0 flex-1 h-8 bg-transparent text-14 text-foreground placeholder:text-muted-foreground outline-none rounded-control focus-visible:ring-2 focus-visible:ring-ring"
                                />
                            </label>
                            {categories.length > 0 && (
                                <QuietChoice
                                    label="Category"
                                    value={view.category ?? 'all'}
                                    onChange={(choice) => setGalleryView({ category: choice === 'all' ? null : choice })}
                                    options={[{ value: 'all', label: 'All' }, ...categories.map((category) => ({ value: category, label: category }))]}
                                />
                            )}
                            {listing?.status === 'live' && (
                                <div className="ml-auto">
                                    <QuietChoice<GallerySort>
                                        label="Sort"
                                        value={view.sort}
                                        onChange={(sort) => setGalleryView({ sort })}
                                        options={[{ value: 'newest', label: 'Newest' }, { value: 'added', label: 'Most added' }]}
                                    />
                                </div>
                            )}
                        </div>
                        {listing?.status === 'unreachable' && (
                            <p role="status" className="mt-4 flex flex-wrap items-center gap-3 text-14 text-warning">
                                Couldn’t reach the Gallery’s server, so only the mascots that come with Blueberry are showing.
                                <Button variant="outline" size="sm" onClick={load}>Try again</Button>
                            </p>
                        )}
                        {entries && shown.length === 0 ? (
                            <p className="mt-16 text-14 text-muted-foreground text-center">
                                {entries.length === 0 ? 'The Gallery couldn’t be loaded.' : 'No mascot matches that. Try a site or another category.'}
                            </p>
                        ) : (
                            <ul aria-label="Gallery" className="mt-3 border-t">
                                {shown.map((entry) => (
                                    <GalleryCard key={entry.id} entry={entry} copy={copyOf(entry)} onReview={() => setGalleryView({ reviewing: entry.id })} />
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
