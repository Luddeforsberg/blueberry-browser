import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, ExternalLink } from 'lucide-react'
import type { PublishChoices } from '@shared/library'
import { GALLERY_CATEGORIES, MAX_AUTHOR, MAX_DESCRIPTION, MAX_EXAMPLE_ANSWER, MAX_EXAMPLE_PROMPT, parsePublicDraft, parsePublishChoices, publishWarnings } from '@shared/publishing'
import { ACCESSORIES, PALETTES } from '@shared/mascots'
import { Button } from '@common/components/Button'
import { QuietChoice } from '@common/components/Controls'
import { cn } from '@common/lib/utils'
import { AccountForm } from '../components/AccountForm'
import { Berry } from '../components/Berry'
import { CopyLink } from '../components/CopyLink'
import { ChatError } from '../components/ChatMessage'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { lastExchange, type PublishValues } from '../flockView'
import { useAccount } from '../useAccount'
import { ExampleText, GalleryCard, Permissions } from './MascotGalleryPage'

const INPUT = "w-full px-3 rounded-card border bg-surface text-14 outline-none focus-visible:ring-2 focus-visible:ring-ring"
const ROW = "py-5 border-b"
const BIRD = 148
// How far down the standing drawing its feet reach, so its toes grip the line under it.
const FEET_Y = 113 / 120

const Field: React.FC<{ title: string; hint?: string; htmlFor?: string; children: React.ReactNode }> = ({ title, hint, htmlFor, children }) => (
    <div className={ROW}>
        {htmlFor ? <label htmlFor={htmlFor} className="block text-14 font-semibold">{title}</label> : <p className="text-14 font-semibold">{title}</p>}
        {hint && <p className="mt-0.5 text-13 text-muted-foreground">{hint}</p>}
        <div className="mt-2">{children}</div>
    </div>
)

const Line: React.FC<{ term: string; children: React.ReactNode }> = ({ term, children }) => (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-3 border-b last:border-b-0">
        <dt className="text-13 text-muted-foreground">{term}</dt>
        <dd className="min-w-0 text-14 [overflow-wrap:anywhere]">{children}</dd>
    </div>
)

// A radio or a checkbox in our own colours. The real one lies over its whole line, unseen, so the pointer, the keyboard
// and labels work as ever.
const REAL_INPUT = "peer absolute inset-0 m-0 size-full opacity-0"
const Mark: React.FC<{ round?: boolean }> = ({ round = false }) => (
    <span aria-hidden className={cn(
        "size-4 shrink-0 flex items-center justify-center border bg-surface transition-colors text-primary-foreground",
        round ? "rounded-full" : "rounded-[4px]",
        "peer-checked:bg-primary peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-canvas [&>*]:opacity-0 peer-checked:[&>*]:opacity-100"
    )}>
        {round ? <span className="size-1.5 rounded-full bg-primary-foreground" /> : <Check className="size-3" strokeWidth={3} />}
    </span>
)

const ExampleChoice: React.FC<{ checked: boolean; onPick?: () => void; children: React.ReactNode }> = ({ checked, onPick, children }) => (
    <li>
        <label className="relative flex items-center gap-2 py-2 text-14">
            <input type="radio" name="publish-example" className={REAL_INPUT} checked={checked} readOnly={!onPick} onChange={onPick} />
            <Mark round />
            {children}
        </label>
    </li>
)

const labelOf = (list: { id: string; label: string }[], id: string) => list.find((item) => item.id === id)?.label ?? id

export const PublishMascot: React.FC<{ mascotId: string; values: PublishValues; onChange: (values: PublishValues) => void; onBack: () => void }> = ({ mascotId, values, onChange, onBack }) => {
    const { flock } = useFlock()
    const { chats } = useLibrary()
    const [account, setAccount] = useAccount()
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [link, setLink] = useState<string | null>(null)
    const [loadTries, setLoadTries] = useState(0)
    const [loadFailed, setLoadFailed] = useState(false)
    // Once it's public this page is about sharing it, and the form is one press away.
    const [editing, setEditing] = useState(false)
    const [addCount, setAddCount] = useState(0)
    // What's public now, which the form's unsaved words aren't.
    const [listed, setListed] = useState<PublishChoices | null>(null)
    const { showBerry } = useShell().settings
    const latest = useRef(values)
    latest.current = values
    const mascot = flock.find(({ id }) => id === mascotId)
    const set = (patch: Partial<PublishValues>) => onChange({ ...values, ...patch })
    const own = chats.filter((chat) => chat.mascotId === mascotId)

    // Once, from what's already published, or the name they last used. It never starts from the account.
    useEffect(() => {
        if (values.filledIn || account.status !== 'signed-in') return
        let left = false
        void (async () => {
            const [mine, author] = await Promise.all([window.chromeAPI.mascots.published(), window.chromeAPI.mascots.lastAuthor()])
            if (left) return
            // Blank defaults here would take what's public away on the next update, so it waits until it knows.
            if (mine === null && mascot?.publishedId) {
                setLoadFailed(true)
                setError('Couldn’t get what’s already public, so it can’t be updated yet.')
                return
            }
            if (loadFailed) setError(null)
            setLoadFailed(false)
            const current = mine?.find(({ id }) => id === mascot?.publishedId)
            if (current?.link) setLink(current.link)
            if (current?.addCount !== undefined) setAddCount(current.addCount)
            // Whatever was typed or picked while this was on its way stays.
            const now = latest.current
            const keepExample = now.exampleChatId !== null
            onChange({
                ...now,
                filledIn: true,
                author: now.author || (current?.author ?? author),
                description: now.description || (current?.description ?? ''),
                category: now.category !== 'Other' ? now.category : (current?.category ?? 'Other'),
                prompt: keepExample ? now.prompt : (current?.example?.prompt ?? ''),
                answer: keepExample ? now.answer : (current?.example?.answer ?? ''),
                checked: keepExample ? now.checked : Boolean(current?.example),
                exampleChatId: keepExample ? now.exampleChatId : current?.example ? 'published' : null,
            })
        })()
        return () => {
            left = true
        }
        // Only when it's first possible, whatever's typed by then.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values.filledIn, account.status, loadTries])

    useEffect(() => {
        if (account.status !== 'signed-in' || !mascot?.publishedId) return
        let left = false
        void window.chromeAPI.mascots.published().then((mine) => {
            const current = mine?.find(({ id }) => id === mascot.publishedId)
            if (left || !current) return
            setListed({ author: current.author, description: current.description, category: current.category, example: current.example })
            if (current.link) setLink(current.link)
            setAddCount(current.addCount)
        })
        return () => {
            left = true
        }
    }, [account.status, mascot?.publishedId])

    const hasExample = values.exampleChatId !== null
    const typed: PublishChoices = {
        author: values.author,
        description: values.description,
        category: values.category,
        example: hasExample ? { prompt: values.prompt, answer: values.answer } : null,
    }
    const draft = useMemo(() => (mascot ? parsePublicDraft(mascot) : null), [mascot])
    const parsed = parsePublishChoices(typed)
    // The same clean text main will send, once what's typed is good enough to send.
    const choices = 'choices' in parsed ? parsed.choices : typed
    const warnings = mascot ? publishWarnings(mascot, choices) : []

    const pickChat = async (chatId: string | null) => {
        setError(null)
        if (chatId === null) return set({ exampleChatId: null, prompt: '', answer: '', checked: false })
        const exchange = lastExchange((await window.chromeAPI.library.getChat(chatId)) ?? { messages: [] })
        if (!exchange) return setError('That chat has no finished answer yet.')
        return set({ exampleChatId: chatId, ...exchange, checked: false })
    }

    const publish = async () => {
        if (hasExample && !values.checked) return setError('Read the example first, and tick the box to say it’s fine to go public.')
        if ('error' in parsed) return setError(parsed.error)
        setBusy(true)
        const result = await window.chromeAPI.mascots.publish(mascotId, parsed.choices)
        setBusy(false)
        setError(result.ok ? null : result.error)
        if (result.ok) {
            setLink(result.link)
            setListed(parsed.choices)
            setEditing(false)
            document.getElementById('publish-top')?.scrollIntoView()
        }
        return undefined
    }

    const unpublish = async () => {
        if (!mascot?.publishedId) return
        const result = await window.chromeAPI.mascots.unpublish(mascot.publishedId)
        if (result.ok) {
            setLink(null)
            setListed(null)
            setEditing(false)
        }
        else if (result.error) setError(result.error)
    }

    if (!mascot) {
        return (
            <>
                <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft />Your flock</Button>
                <p className="mt-4 text-14 text-muted-foreground">This mascot is no longer in your flock.</p>
            </>
        )
    }

    if (account.status === 'signed-in' && mascot.publishedId && !editing) {
        return (
            <div id="publish-top" className="max-w-2xl mx-auto">
                <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}><ArrowLeft />Your flock</Button>
                {/* It lands on the line under the heading with the job done, and the link is the next thing to do. */}
                <header className="mt-3 flex items-end gap-6 border-b">
                    <div className="min-w-0 flex-1 pb-5 [overflow-wrap:anywhere]">
                        <h1 className="text-20 font-semibold">{mascot.name} is in the Gallery</h1>
                        <p className="mt-1 text-14 text-muted-foreground">Anyone can read what it’s told and add their own copy. Send this to someone who’d like it.</p>
                    </div>
                    <div key={mascot.publishedId} className="relative shrink-0" style={{ width: showBerry ? BIRD : 32, height: showBerry ? BIRD * FEET_Y : 32 }}>
                        <Berry mood="delivered" size={showBerry ? BIRD : 32} mascot={mascot} />
                    </div>
                </header>

                <section aria-label="Published" className="py-5 border-b">
                    {link ? (
                        <>
                            <p className="text-16 font-semibold [overflow-wrap:anywhere]">{link}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <CopyLink link={link} main />
                                <Button variant="outline" size="sm" onClick={() => void window.chromeAPI.browser.createTab(link)}><ExternalLink />Open it</Button>
                            </div>
                        </>
                    ) : (
                        <p className="text-14 text-muted-foreground">Its public page isn’t set up yet, so there’s no link to share. It’s in the Gallery all the same.</p>
                    )}
                </section>

                {listed && (
                    <section aria-label="How it looks" className="pt-5">
                        <h2 className="text-14 font-semibold">How it looks in the Gallery</h2>
                        <ul aria-label="Preview of the Gallery" className="mt-1 border-b-0 [&>li:last-child]:border-b">
                            <GalleryCard
                                entry={{
                                    id: mascot.publishedId,
                                    draft: mascot,
                                    author: listed.author,
                                    description: listed.description,
                                    category: listed.category,
                                    example: listed.example ?? undefined,
                                    addCount
                                }}
                                copy={null}
                            />
                        </ul>
                    </section>
                )}

                {error && <div className="mt-4"><ChatError message={error} /></div>}

                <div className="mt-4 -ml-3 flex flex-wrap items-center gap-1">
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEditing(true)}>Edit the listing</Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void unpublish()}>Unpublish</Button>
                </div>
                <p className="mt-1 text-12 text-muted-foreground">What you save on the mascot itself stays out of this until you edit the listing and update it.</p>
            </div>
        )
    }

    return (
        <div id="publish-top" className="max-w-2xl mx-auto">
            <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}><ArrowLeft />Your flock</Button>
            <h1 className="mt-3 text-20 font-semibold [overflow-wrap:anywhere]">{mascot.publishedId ? `Edit ${mascot.name}’s listing` : `Publish ${mascot.name}`}</h1>

            {account.status === 'signed-out' && (
                <>
                    <p className="mt-1 mb-5 text-14 text-muted-foreground">Anyone can add a published mascot, so publishing needs an account. You’ll see everything that goes public before it does.</p>
                    <AccountForm problem={account.problem} onResult={setAccount} />
                </>
            )}

            {account.status === 'signed-in' && (
                <>
                    <p className="mt-1 pb-5 border-b text-14 text-muted-foreground">{mascot.publishedId ? 'Nothing here changes what’s public until you press Update.' : 'Anyone will be able to read this and add a copy.'}</p>

                    {draft && 'error' in draft && <div className="mt-4"><ChatError message={draft.error} /></div>}

                    <Field title="Your name, as the author" hint="Whatever you like. It’s the only thing that says who made this." htmlFor="publish-author">
                        <input id="publish-author" maxLength={MAX_AUTHOR} value={values.author} autoComplete="off" onChange={(event) => set({ author: event.target.value })} className={cn(INPUT, "h-9 max-w-xs")} />
                    </Field>
                    <Field title="What it does, in one line" htmlFor="publish-description">
                        <input id="publish-description" maxLength={MAX_DESCRIPTION} value={values.description} onChange={(event) => set({ description: event.target.value })} className={cn(INPUT, "h-9")} />
                    </Field>
                    <Field title="Category">
                        <QuietChoice
                            label="Category"
                            value={values.category}
                            onChange={(category) => set({ category })}
                            options={GALLERY_CATEGORIES.map((category) => ({ value: category, label: category }))}
                        />
                    </Field>

                    <div className={ROW}>
                        <h2 className="text-14 font-semibold">An example</h2>
                        <p className="mt-0.5 text-13 text-muted-foreground">Optional, and it shows people what it really does. Only these two pieces of text go, as you leave them. The rest of the chat, its pages, screenshots and steps stay here.</p>
                        <ul aria-label="Choose an example" className="mt-2 divide-y">
                            <ExampleChoice checked={!hasExample} onPick={() => void pickChat(null)}>No example</ExampleChoice>
                            {values.exampleChatId === 'published' && <ExampleChoice checked>The one already published</ExampleChoice>}
                            {own.map((chat) => (
                                <ExampleChoice key={chat.id} checked={values.exampleChatId === chat.id} onPick={() => void pickChat(chat.id)}>
                                    <span className="truncate">{chat.title}</span>
                                </ExampleChoice>
                            ))}
                        </ul>
                        {own.length === 0 && <p className="text-13 text-muted-foreground">{mascot.name} has no chats yet, so there’s nothing to pick. Chat with it first if you’d like an example.</p>}
                        {hasExample && (
                            <div className="mt-3 flex flex-col gap-3">
                                <label className="text-13">
                                    What you asked
                                    <textarea rows={3} maxLength={MAX_EXAMPLE_PROMPT} value={values.prompt} onChange={(event) => set({ prompt: event.target.value, checked: false })} className={cn(INPUT, "mt-1 py-2 resize-y")} />
                                </label>
                                <label className="text-13">
                                    What it gave you
                                    <textarea rows={8} value={values.answer} onChange={(event) => set({ answer: event.target.value, checked: false })} className={cn(INPUT, "mt-1 py-2 resize-y")} />
                                    <span className={cn("block mt-1 text-12 tabular-nums", values.answer.length > MAX_EXAMPLE_ANSWER ? "text-warning" : "text-muted-foreground")}>{values.answer.length} of {MAX_EXAMPLE_ANSWER} characters</span>
                                </label>
                                <label className="relative flex items-start gap-2 text-14">
                                    <input type="checkbox" className={REAL_INPUT} checked={values.checked} onChange={(event) => set({ checked: event.target.checked })} />
                                    <Mark />
                                    I’ve read both, and there’s nothing in them I wouldn’t show a stranger.
                                </label>
                            </div>
                        )}
                    </div>

                    <section aria-label="What goes public" className="mt-6">
                        <h2 className="text-14 font-semibold">Exactly what goes public</h2>
                        <p className="mt-0.5 text-13 text-muted-foreground">This and nothing else: never your chats, your history or your account’s email.</p>
                        <dl className="mt-2">
                            <Line term="Name and look">
                                <span className="flex items-center gap-2">
                                    <Berry size={32} mascot={mascot} />
                                    {mascot.name}, {labelOf(PALETTES, mascot.look.palette)}, {labelOf(ACCESSORIES, mascot.look.accessory).toLowerCase()}
                                </span>
                            </Line>
                            <Line term="Author">{choices.author.trim() || <span className="text-muted-foreground">Not chosen yet</span>}</Line>
                            <Line term="What it does">{choices.description.trim() || <span className="text-muted-foreground">Not written yet</span>}</Line>
                            <Line term="Category">{choices.category}</Line>
                            <Line term="Sites and tools"><Permissions draft={mascot} /></Line>
                            <Line term="Its instructions"><span className="whitespace-pre-wrap">{mascot.instructions}</span></Line>
                            <Line term="Example">{choices.example ? <ExampleText example={choices.example} /> : <span className="text-muted-foreground">None</span>}</Line>
                        </dl>
                    </section>

                    {warnings.length > 0 && (
                        <ul aria-label="Before you publish" className="mt-4 flex flex-col gap-1 text-14 text-warning">
                            {warnings.map((warning) => (
                                <li key={warning} className="flex items-start gap-2">
                                    <AlertTriangle aria-hidden className="mt-[3px] size-4 shrink-0" />
                                    {warning} Anyone could read it. You can still publish if that’s fine.
                                </li>
                            ))}
                        </ul>
                    )}

                    {error && <div className="mt-4"><ChatError message={error} /></div>}

                    <div className="mt-6 flex items-center gap-3">
                        {loadFailed && <Button variant="outline" onClick={() => setLoadTries((tries) => tries + 1)}>Try again</Button>}
                        <Button disabled={busy || (Boolean(mascot.publishedId) && !values.filledIn) || (draft !== null && 'error' in draft)} onClick={() => void publish()}>{busy ? 'Publishing…' : mascot.publishedId ? 'Update what’s public' : 'Publish for anyone to read'}</Button>
                        <Button variant="ghost" onClick={mascot.publishedId ? () => setEditing(false) : onBack}>Cancel</Button>
                    </div>
                </>
            )}
        </div>
    )
}
