import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ExternalLink } from 'lucide-react'
import type { PublishChoices } from '@shared/library'
import { GALLERY_CATEGORIES, MAX_AUTHOR, MAX_DESCRIPTION, MAX_EXAMPLE_ANSWER, MAX_EXAMPLE_PROMPT, parsePublicDraft, parsePublishChoices, publishWarnings } from '@shared/publishing'
import { ACCESSORIES, PALETTES } from '@shared/mascots'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { AccountForm } from '../components/AccountForm'
import { Berry } from '../components/Berry'
import { CopyLink } from '../components/CopyLink'
import { ChatError } from '../components/ChatMessage'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { lastExchange, type PublishValues } from '../flockView'
import { useAccount } from '../useAccount'
import { ExampleText, Permissions } from './MascotGalleryPage'

const INPUT = "w-full px-3 rounded-card border bg-surface text-14 outline-none focus-visible:ring-2 focus-visible:ring-ring"
const ROW = "py-5 border-b"

const Field: React.FC<{ title: string; hint?: string; htmlFor?: string; children: React.ReactNode }> = ({ title, hint, htmlFor, children }) => (
    <div className={ROW}>
        <label htmlFor={htmlFor} className="block text-14 font-semibold">{title}</label>
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
            document.getElementById('publish-top')?.scrollIntoView()
        }
        return undefined
    }

    const unpublish = async () => {
        if (!mascot?.publishedId) return
        const result = await window.chromeAPI.mascots.unpublish(mascot.publishedId)
        if (result.ok) setLink(null)
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

    return (
        <div id="publish-top" className="max-w-2xl mx-auto">
            <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft />Your flock</Button>
            <h1 className="mt-3 text-20 font-semibold [overflow-wrap:anywhere]">{mascot.publishedId ? `${mascot.name} is in the Gallery` : `Publish ${mascot.name}`}</h1>

            {account.status === 'signed-out' && (
                <>
                    <p className="mt-1 mb-5 text-14 text-muted-foreground">Anyone can add a published mascot, so publishing needs an account. You’ll see everything that goes public before it does.</p>
                    <AccountForm problem={account.problem} onResult={setAccount} />
                </>
            )}

            {account.status === 'signed-in' && (
                <>
                    {mascot.publishedId ? (
                        <section aria-label="Published" className="mt-2 pb-5 border-b">
                            {link ? (
                                <p className="text-14 [overflow-wrap:anywhere]">{link}</p>
                            ) : (
                                <p className="text-14 text-muted-foreground">Its public page isn’t set up yet, so there’s no link to share. It’s in the Gallery all the same.</p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                                {link && <CopyLink link={link} />}
                                {link && <Button variant="outline" size="sm" onClick={() => void window.chromeAPI.browser.createTab(link)}><ExternalLink />Open it</Button>}
                                <Button variant="outline" size="sm" onClick={() => void unpublish()}>Unpublish</Button>
                            </div>
                            <p className="mt-2 text-13 text-muted-foreground">What you save on the mascot itself stays here until you press Update below.</p>
                        </section>
                    ) : (
                        <p className="mt-1 pb-5 border-b text-14 text-muted-foreground">Anyone will be able to read this and add a copy.</p>
                    )}

                    {draft && 'error' in draft && <div className="mt-4"><ChatError message={draft.error} /></div>}

                    <Field title="Your name, as the author" hint="Whatever you like. It’s the only thing that says who made this." htmlFor="publish-author">
                        <input id="publish-author" maxLength={MAX_AUTHOR} value={values.author} autoComplete="off" onChange={(event) => set({ author: event.target.value })} className={cn(INPUT, "h-9 max-w-xs")} />
                    </Field>
                    <Field title="What it does, in one line" htmlFor="publish-description">
                        <input id="publish-description" maxLength={MAX_DESCRIPTION} value={values.description} onChange={(event) => set({ description: event.target.value })} className={cn(INPUT, "h-9")} />
                    </Field>
                    <Field title="Category" htmlFor="publish-category">
                        <select id="publish-category" value={values.category} onChange={(event) => set({ category: event.target.value })} className={cn(INPUT, "h-9 max-w-xs")}>
                            {GALLERY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                        </select>
                    </Field>

                    <div className={ROW}>
                        <h2 className="text-14 font-semibold">An example</h2>
                        <p className="mt-0.5 text-13 text-muted-foreground">Optional, and it shows people what it really does. Only these two pieces of text go, as you leave them. The rest of the chat, its pages, screenshots and steps stay here.</p>
                        <ul aria-label="Choose an example" className="mt-2 divide-y">
                            <li>
                                <label className="flex items-center gap-2 py-2 text-14">
                                    <input type="radio" name="publish-example" checked={!hasExample} onChange={() => void pickChat(null)} />
                                    No example
                                </label>
                            </li>
                            {values.exampleChatId === 'published' && (
                                <li>
                                    <label className="flex items-center gap-2 py-2 text-14">
                                        <input type="radio" name="publish-example" checked readOnly />
                                        The one already published
                                    </label>
                                </li>
                            )}
                            {own.map((chat) => (
                                <li key={chat.id}>
                                    <label className="flex items-center gap-2 py-2 text-14">
                                        <input type="radio" name="publish-example" checked={values.exampleChatId === chat.id} onChange={() => void pickChat(chat.id)} />
                                        <span className="truncate">{chat.title}</span>
                                    </label>
                                </li>
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
                                <label className="flex items-start gap-2 text-14">
                                    <input type="checkbox" className="mt-1" checked={values.checked} onChange={(event) => set({ checked: event.target.checked })} />
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
                        <Button variant="ghost" onClick={onBack}>Cancel</Button>
                    </div>
                </>
            )}
        </div>
    )
}
