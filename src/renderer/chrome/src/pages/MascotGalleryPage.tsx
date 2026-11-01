import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Lock, LockOpen, Search } from 'lucide-react'
import type { GalleryListing, GalleryMascot, MascotExample, MascotProfile } from '@shared/library'
import { MAX_MASCOT_NAME, permissionsInWords } from '@shared/mascots'
import { Button } from '@common/components/Button'
import { Choice } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { useFlock } from '../contexts/LibraryContext'
import { Berry } from '../components/Berry'
import { ChatError } from '../components/ChatMessage'
import { CopyLink } from '../components/CopyLink'
import { filterGallery, freeName, GALLERY_VIEW_EVENT, galleryView, setGalleryView, sortGallery, type GallerySort, type GalleryView } from '../galleryView'

const asMascot = (entry: GalleryMascot): MascotProfile => ({ ...entry.draft, id: entry.id, deletedAt: null })

const startChat = (id: string, choose: (id: string) => void) => {
    choose(id)
    void window.chromeAPI.browser.openPage('chat')
}

// The page's main idea: what a mascot may do, in words, read from its real limits. Open means it isn't limited.
export const Permissions: React.FC<{ draft: GalleryMascot['draft']; large?: boolean }> = ({ draft, large }) => (
    <ul aria-label="What it’s allowed to do" className={cn("flex flex-col gap-1.5", large ? "text-14" : "text-13")}>
        {permissionsInWords(draft).map(({ text, open }) => {
            const Icon = open ? LockOpen : Lock
            return (
                <li key={text} className="flex items-start gap-2 [overflow-wrap:anywhere]">
                    <Icon aria-hidden className={cn("shrink-0", large ? "mt-[3px] size-4" : "mt-[2px] size-3.5")} />
                    {text}
                </li>
            )
        })}
    </ul>
)

// What strangers wrote, so it's plain text wherever it shows. Markdown could fetch an image or dress up a link.
export const ExampleText: React.FC<{ example: MascotExample }> = ({ example }) => (
    <>
        <h3 className="text-12 text-muted-foreground">I asked this</h3>
        <p className="mt-1 text-14 whitespace-pre-wrap [overflow-wrap:anywhere]">{example.prompt}</p>
        <h3 className="mt-4 text-12 text-muted-foreground">And here’s what it gave me</h3>
        <p className="mt-1 text-14 whitespace-pre-wrap [overflow-wrap:anywhere]">{example.answer}</p>
    </>
)

const InFlock: React.FC = () => (
    <span className="flex items-center gap-1 text-12 text-success">
        <Check aria-hidden className="size-3.5" />
        In your flock
    </span>
)

export const GalleryCard: React.FC<{ entry: GalleryMascot; copy: MascotProfile | null; onReview: () => void }> = ({ entry, copy, onReview }) => {
    const { choose } = useFlock()
    const [near, setNear] = useState(false)
    const { name } = entry.draft
    return (
        <li
            aria-label={name}
            onMouseEnter={() => setNear(true)}
            onMouseLeave={() => setNear(false)}
            onFocus={() => setNear(true)}
            onBlur={() => setNear(false)}
            className="relative flex flex-col p-4 pt-10 rounded-panel bg-surface shadow-raised"
        >
            <div className="absolute left-1/2 -translate-x-1/2 -top-[68px]">
                <Berry mood={near ? 'curious' : 'sitting'} size={96} mascot={asMascot(entry)} />
            </div>
            <h2 className="text-14 font-semibold text-center [overflow-wrap:anywhere]">{name}</h2>
            <p className="text-12 text-muted-foreground text-center [overflow-wrap:anywhere]">
                By {entry.author}
                {entry.addCount !== undefined && <span className="tabular-nums"> · {entry.addCount === 1 ? '1 add' : `${entry.addCount} adds`}</span>}
            </p>
            <p className="mt-2 text-13 text-center [overflow-wrap:anywhere]">{entry.description}</p>
            <div className="mt-3 p-3 rounded-card bg-card">
                <Permissions draft={entry.draft} />
            </div>
            {copy && <div className="mt-3 flex justify-center"><InFlock /></div>}
            <div className="mt-auto pt-4 flex items-center justify-center gap-2">
                {copy ? (
                    <>
                        <Button size="sm" aria-label={`Chat with ${copy.name}`} onClick={() => startChat(copy.id, choose)}>Chat</Button>
                        <Button size="sm" variant="outline" aria-label={`Details of ${name}`} onClick={onReview}>Details</Button>
                    </>
                ) : (
                    <Button size="sm" aria-label={`Add ${name}`} onClick={onReview}>Add</Button>
                )}
            </div>
        </li>
    )
}

// Everything the mascot would be told and allowed, before there's a copy of it. Nothing is added until Add is pressed.
const Review: React.FC<{ entry: GalleryMascot; copy: MascotProfile | null; onBack: () => void }> = ({ entry, copy, onBack }) => {
    const { flock, choose } = useFlock()
    const { name } = entry.draft
    const taken = flock.map((mascot) => mascot.name)
    const clash = !copy && taken.some((other) => other.toLowerCase() === name.toLowerCase())
    const [ownName, setOwnName] = useState(() => freeName(name, taken))
    const [error, setError] = useState<string | null>(null)
    const added = copy !== null

    // Once it's added there's nothing left to review, so coming back to the page shows the Gallery.
    useEffect(() => {
        if (added) return () => setGalleryView({ reviewing: null })
        return undefined
    }, [added])

    const add = async () => {
        const result = await window.chromeAPI.mascots.addFromGallery(entry.id, clash ? ownName : null)
        setError(result.ok ? null : result.error)
    }

    return (
        <div className="flex flex-col-reverse lg:flex-row items-start gap-8">
            <div className="flex-1 min-w-0 w-full">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft />
                    Gallery
                </Button>
                <h1 className="mt-3 text-20 font-semibold [overflow-wrap:anywhere]">{copy ? `${copy.name} is in your flock` : `Add ${name} to your flock?`}</h1>
                <p className="mt-1 text-14 text-muted-foreground [overflow-wrap:anywhere]">{entry.description} By {entry.author}.</p>
                {entry.publishedAt !== undefined && (
                    <p className="mt-1 text-14 text-muted-foreground">Someone using Blueberry wrote this, and we haven’t checked it, so read what it’s told.</p>
                )}

                <section className="mt-6 p-4 rounded-panel bg-surface shadow-raised">
                    <h2 className="text-14 font-semibold">What it’s allowed to do</h2>
                    <div className="mt-3"><Permissions draft={entry.draft} large /></div>
                    <p className="mt-3 text-12 text-muted-foreground">
                        {entry.draft.sites.length > 0 && 'A site includes its subdomains, and anywhere else is refused before anything happens. '}
                        Your Ask before acting setting applies to it as it does to Berry, with the same approval cards.
                    </p>
                </section>

                <section className="mt-4 p-4 rounded-panel bg-surface shadow-raised">
                    <h2 className="text-14 font-semibold">What it’s told, word for word</h2>
                    <p className="mt-2 text-14 whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.draft.instructions}</p>
                </section>

                {entry.example && (
                    <section aria-label="Example" className="mt-4 p-4 rounded-panel bg-surface shadow-raised">
                        <ExampleText example={entry.example} />
                    </section>
                )}

                {entry.link && (
                    <p className="mt-4 flex flex-wrap items-center gap-2 text-13 text-muted-foreground">
                        <span className="[overflow-wrap:anywhere]">{entry.link}</span>
                        <CopyLink link={entry.link} />
                    </p>
                )}

                {clash && (
                    <section className="mt-4">
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

                <div className="mt-6 flex items-center gap-3">
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
            </div>

            <aside aria-label="Preview" className="w-full lg:w-[288px] lg:sticky lg:top-0 shrink-0 p-4 rounded-panel bg-surface shadow-raised text-center">
                <div className="h-[184px] flex items-center justify-center">
                    <div key={copy ? 'added' : 'reviewing'} className={cn(copy && "motion-safe:animate-berry-hop")}>
                        <Berry mood={copy ? 'delivered' : 'asking'} size={160} mascot={copy ?? asMascot(entry)} />
                    </div>
                </div>
                <p className="text-14 font-semibold [overflow-wrap:anywhere]">{copy?.name ?? name}</p>
                {copy && <div className="mt-1 flex justify-center"><InFlock /></div>}
            </aside>
        </div>
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
                            <div>
                                <h1 className="text-20 font-semibold">Gallery</h1>
                                <p className="mt-1 text-14 text-muted-foreground">Mascots made for one job, some by people you don’t know. Every card says exactly what it can and can’t do, and adding one gives you your own copy.</p>
                            </div>
                            <Button variant="outline" size="sm" className="shrink-0" onClick={() => void window.chromeAPI.browser.openPage('flock')}>Your flock</Button>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px] max-w-xs">
                                <Search aria-hidden className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                                <input
                                    type="search"
                                    aria-label="Search the Gallery"
                                    placeholder="Search mascots or sites"
                                    value={view.query}
                                    onChange={(event) => setGalleryView({ query: event.target.value })}
                                    className="w-full h-9 pl-9 pr-3 rounded-card border bg-surface text-14 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                            </div>
                            {listing?.status === 'live' && (
                                <Choice<GallerySort>
                                    label="Sort"
                                    value={view.sort}
                                    onChange={(sort) => setGalleryView({ sort })}
                                    options={[{ value: 'newest', label: 'Newest' }, { value: 'added', label: 'Most added' }]}
                                />
                            )}
                            {categories.length > 0 && (
                                <div className="max-w-full overflow-x-auto rounded-full">
                                    <Choice
                                        label="Category"
                                        value={view.category ?? 'all'}
                                        onChange={(choice) => setGalleryView({ category: choice === 'all' ? null : choice })}
                                        options={[{ value: 'all', label: 'All' }, ...categories.map((category) => ({ value: category, label: category }))]}
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
                            <ul aria-label="Gallery" className="mt-6 pt-[68px] grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-x-4 gap-y-[84px]">
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
