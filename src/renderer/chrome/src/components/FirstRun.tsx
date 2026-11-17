import React, { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff, HardDrive, ShieldOff } from 'lucide-react'
import type { Appearance, ImportSource, LayoutMode } from '@shared/ipc'
import { BERRY } from '@shared/mascots'
import { firstJobsFor, firstRunStart, firstRunSteps, type FirstRunStep } from '@shared/firstRun'
import { Button } from '@common/components/Button'
import { BIG_CARD, BIG_SHELL } from '@common/components/cardShell'
import { Choice, Switch } from '@common/components/Controls'
import { LABEL, StatusPill } from '@common/components/StatusPill'
import { cn } from '@common/lib/utils'
import { useShell } from '../contexts/ShellContext'
import { AiServiceRows, useKeyTry } from './AiKeyForm'
import { Berry, BerrySpot } from './Berry'
import { Favicon } from './Favicon'
import { useHistoryImport } from './HistoryImport'
import { FIELD, StepCard, StepNav } from './StepCard'
import { WindowPicture } from './WindowPicture'

// DESIGN.md section 10, First run: Berry and one card in an empty window, a step at a time, in the card that makes a
// mascot. Every step's answer is real: an account on the server, the look, a key the service has answered with, history
// brought in, and the settings themselves. Leaving part way keeps what's done, and the next launch starts at the first
// step that isn't.

const api = window.chromeAPI

const LINK = 'text-ink underline decoration-line underline-offset-[3px] rounded-row outline-none hover:decoration-ink-3 focus-visible:ring-2 focus-visible:ring-focus'

// The filled button names its key while Enter presses it.
const Primary: React.FC<{ disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({ disabled, onClick, children }) => (
    <Button disabled={disabled} onClick={onClick}>
        {children}
        {!disabled && <kbd aria-hidden className="h-4 min-w-4 px-1 grid place-items-center rounded-[5px] bg-ground/15 font-mono text-[10.5px] font-medium text-ground/80">↵</kbd>}
    </Button>
)

// A link on one side of the shell and the filled button on the other, for the steps that have no Back.
const LinkNav: React.FC<{ link?: React.ReactNode; children: React.ReactNode }> = ({ link, children }) => (
    <div className="h-[46px] pl-3 pr-1.5 flex items-center justify-between text-13">
        <span>{link}</span>
        {children}
    </div>
)

// Under the card, outside its shell: a way past the step, and what that means.
const Under: React.FC<{ onPress: () => void; label: string; children: React.ReactNode }> = ({ onPress, label, children }) => (
    <p className="w-[520px] max-w-full mx-auto mt-2.5 px-2 flex justify-between gap-3.5 text-13 text-ink-3">
        <button type="button" onClick={onPress} className={LINK}>{label}</button>
        <span className="text-right">{children}</span>
    </p>
)

// Berry saying how something went, with a pill.
const Says: React.FC<{ pill?: string; children: React.ReactNode }> = ({ pill, children }) => (
    <p role="status" className="my-1 mx-0.5 flex items-center gap-2.5 text-14 text-left">
        <span aria-hidden className="flex shrink-0">
            <Berry size={20} mood="delivered" still />
        </span>
        <span className="flex-1">{children}</span>
        {pill && <StatusPill tone="on">{pill}</StatusPill>}
    </p>
)

const Field: React.FC<{ label: string; problem?: string | null; hint?: string; children: React.ReactNode }> = ({ label, problem, hint, children }) => (
    <div className="mt-3 text-left">
        <label className="block">
            <span className={cn('block mb-[5px] mx-0.5', LABEL)}>{label}</span>
            {children}
        </label>
        {problem ? <p role="alert" className="mt-[7px] mx-0.5 text-13 text-ask">{problem}</p> : hint && <p className="mt-[7px] mx-0.5 text-13 text-ink-3">{hint}</p>}
    </div>
)

const INPUT = cn(FIELD, 'h-10 px-3 text-14 shadow-[inset_0_0_0_1px_var(--line)]')

const Password: React.FC<{ value: string; onChange: (value: string) => void; isNew: boolean }> = ({ value, onChange, isNew }) => {
    const [shown, setShown] = useState(false)
    const Icon = shown ? EyeOff : Eye
    return (
        <span className="relative block">
            <input type={shown ? 'text' : 'password'} autoComplete={isNew ? 'new-password' : 'current-password'} value={value} onChange={(event) => onChange(event.target.value)} className={cn(INPUT, 'pr-10')} />
            <button
                type="button"
                aria-label={shown ? 'Hide the password' : 'Show the password'}
                onClick={() => setShown(!shown)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-row text-ink-3 hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
        </span>
    )
}

// A small drawing of the window as it is now, beside Make it yours. It follows the real window, which changes too.
const MiniWindow: React.FC<{ tabs: LayoutMode }> = ({ tabs }) => {
    const page = (
        <span className="flex-1 rounded-[8px] bg-sheet shadow-[0_0_0_1px_var(--line)] flex flex-col items-center justify-center gap-1.5">
            <span className="flex items-center gap-[5px]">
                <Berry size={12} still />
                <b className="w-[46px] h-[7px] rounded-[3px] bg-ink" />
            </span>
            <span className="w-[120px] h-[26px] rounded-[7px] bg-ground shadow-[0_0_0_1px_var(--line)]" />
            <span className="w-24 h-[5px] rounded-[2px] bg-dot" />
            <span className="w-[70px] h-[5px] rounded-[2px] bg-dot" />
        </span>
    )
    const bar = (on: number, count: number, className: string) =>
        Array.from({ length: count }, (_, index) => <i key={index} className={cn('h-2.5 rounded-[4px]', className, index === on ? 'bg-sheet shadow-chip' : 'bg-dot')} />)
    return (
        <div aria-hidden className="w-[270px] h-[178px] p-[7px] flex gap-[7px] rounded-[11px] bg-ground shadow-up">
            {tabs === 'vertical' ? (
                <>
                    <span className="w-[62px] flex flex-col gap-[5px]">
                        <span className="h-[11px] p-[1.5px] rounded-[4px] bg-tray"><i className="block w-[27px] h-full rounded-[3px] bg-sheet" /></span>
                        {bar(2, 4, '')}
                        <span className="mt-auto h-4 px-1 flex items-center gap-[3px] rounded-[6px] bg-tray">
                            {[0, 1, 2].map((index) => <Berry key={index} size={10} still />)}
                        </span>
                    </span>
                    {page}
                </>
            ) : (
                <span className="flex-1 flex flex-col gap-[5px]">
                    <span className="flex gap-1">{bar(2, 4, 'flex-1')}</span>
                    <span className="h-[11px] flex items-center gap-[3px]">
                        <i className="flex-1 h-[9px] rounded-[4px] bg-tray" />
                        <Berry size={10} still />
                        <Berry size={10} still />
                    </span>
                    {page}
                </span>
            )}
        </div>
    )
}

// What I can see: the rules as rows, two that always hold and the two settings that send something, as real switches.
const Rule: React.FC<{ id: string; title: string; line: string; children: React.ReactNode }> = ({ id, title, line, children }) => (
    <div className="relative py-[11px] px-3 flex items-center gap-3 text-left [&+&]:before:absolute [&+&]:before:left-3 [&+&]:before:right-0 [&+&]:before:top-0 [&+&]:before:h-px [&+&]:before:bg-line">
        <span className="flex-1 min-w-0">
            <span id={id} className="block text-14 font-medium text-ink">{title}</span>
            <span className="block text-13 text-ink-2">{line}</span>
        </span>
        {children}
    </div>
)

const SOURCE_FACTS = [
    { Icon: Check, text: 'Addresses, page titles and visit times, from the last 90 days' },
    { Icon: ShieldOff, text: 'Never passwords, cookies or what you typed' },
    { Icon: HardDrive, text: 'It stays on this computer. Suggestions send a short summary to the AI service, and you can turn that off next.' }
]

const SourceRows: React.FC<{ sources: ImportSource[]; chosen: string; choose: (id: string) => void }> = ({ sources, chosen, choose }) => (
    <div role="radiogroup" aria-label="Browser to bring history from" className="mt-3.5 -mx-1 flex flex-col gap-1">
        {sources.map(({ id, name, profiles }) => {
            const on = id === chosen
            return (
                <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => choose(id)}
                    className={cn('p-2.5 flex items-center gap-3 rounded-[14px] text-left shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-focus', on && 'bg-card-2')}
                >
                    <Favicon site={name} className="mx-1 size-6 rounded-[7px] text-12" />
                    <span className="flex-1 min-w-0">
                        <span className="block text-14 font-medium text-ink">{name}</span>
                        <span className="block text-13 text-ink-2">{profiles === 1 ? '1 profile' : `${profiles} profiles`}</span>
                    </span>
                    <span aria-hidden className={cn('mr-1 size-[18px] shrink-0 grid place-items-center rounded-full', on ? 'bg-ink text-ground' : 'shadow-[inset_0_0_0_1.5px_rgb(var(--faint))]')}>
                        {on && <Check className="size-[11px]" strokeWidth={2.6} />}
                    </span>
                </button>
            )
        })}
    </div>
)

interface Start {
    steps: FirstRunStep[]
    at: number
    browsers: boolean
}

const Steps: React.FC<{ start: Start }> = ({ start }) => {
    const { settings, updateSettings } = useShell()
    const { steps, browsers } = start
    const [at, setAt] = useState(start.at)
    const [from, setFrom] = useState<'next' | 'back'>('next')
    // Settings come back from main a moment later, so what's been passed is kept here as well.
    const passed = useRef(new Set(settings.firstRun))
    const step = steps[at]
    const numbered: FirstRunStep[] = steps.filter((each) => each !== 'meet')
    const label = step === 'meet' ? '' : `${numbered.indexOf(step) + 1} / ${numbered.length}`

    const keyTry = useKeyTry()
    const history = useHistoryImport()

    // The account step: Create account, or Welcome back once asked for.
    const [signingIn, setSigningIn] = useState(false)
    const [signedIn, setSignedIn] = useState<string | null>(null)
    const [name, setName] = useState(settings.accountName ?? '')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)
    const [problem, setProblem] = useState<{ text: string; about: 'email' | 'password' | null } | null>(null)
    useEffect(() => {
        void api.account.state().then((state) => setSignedIn(state.status === 'signed-in' ? state.email : null))
    }, [])

    const go = (to: number) => {
        setFrom(to > at ? 'next' : 'back')
        setAt(to)
    }
    const next = () => {
        passed.current.add(step)
        updateSettings({ firstRun: [...passed.current] })
        go(at + 1)
    }
    const back = at > 0 ? () => go(at - 1) : undefined
    const finish = () => updateSettings({ onboarded: true, firstJobs: firstJobsFor({ hasKey: keyTry.saved.service !== null, browsers }) })

    const account = async () => {
        if (busy) return
        setBusy(true)
        const state = await (signingIn ? api.account.signIn(email, password) : api.account.signUp(email, password))
        setBusy(false)
        // The password went to main once, and isn't kept here.
        setPassword('')
        if (state.status !== 'signed-in') {
            setProblem(state.problem ? { text: state.problem, about: state.problemAbout } : null)
            return
        }
        setProblem(null)
        setSignedIn(state.email)
        if (!signingIn) updateSettings({ accountName: name.trim() || null })
        next()
    }
    const accountReady = !!email.trim() && !!password && (signingIn || !!name.trim())

    // What the filled button does on this step, which Enter does too, or null while it's off.
    const primary: (() => void) | null =
        step === 'meet' || step === 'yours'
            ? next
            : step === 'account'
              ? signedIn ? next : accountReady && !busy ? () => void account() : null
              : step === 'brain'
                ? keyTry.works ? next : keyTry.canTry ? () => void keyTry.tryKey() : null
                : step === 'history'
                  ? history.done ? next : history.source && !history.busy ? () => void history.bringIn() : null
                  : finish
    const pressed = useRef(primary)
    useEffect(() => {
        pressed.current = primary
    })
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' || event.isComposing || event.defaultPrevented) return
            // A button, a link or a choice does its own thing with Enter.
            if ((event.target as HTMLElement).closest('button, a, [role="radio"]')) return
            event.preventDefault()
            pressed.current?.()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const nav = (button: React.ReactNode) => (
        <StepNav step={numbered.indexOf(step)} steps={numbered.length} onBack={back}>
            {button}
        </StepNav>
    )
    const card = { mascot: BERRY, mood: 'curious' as const, label, motionKey: step === 'account' ? `account-${signingIn}` : step, from, mascotSize: 64 }

    if (step === 'meet') {
        return (
            <section aria-label="Hi, I’m Berry." className="w-[520px] max-w-full mx-auto flex flex-col items-center">
                <div className="relative z-[1] -mb-1">
                    <BerrySpot size={88} mascot={BERRY} mood="rest" />
                </div>
                <div className={cn(BIG_SHELL, 'w-full')}>
                    <div className={cn(BIG_CARD, 'bg-card px-7 pt-[30px] pb-[26px] text-center')}>
                        <h1 className="mb-2 text-30 font-medium tracking-[-0.025em]">Hi, I’m Berry.</h1>
                        <p className="mx-auto max-w-[452px] text-14 leading-[1.5] text-ink-2">
                            I do things for you in this browser: look things up, fill things in, keep an eye on pages. I always ask before anything that matters.
                        </p>
                        <p className="mt-3 text-13 text-ink-3">Two minutes, and you can change all of it later.</p>
                    </div>
                    <LinkNav
                        link={
                            steps.includes('account') && (
                                <button
                                    type="button"
                                    className={LINK}
                                    onClick={() => {
                                        setSigningIn(true)
                                        next()
                                    }}
                                >
                                    I already have an account
                                </button>
                            )
                        }
                    >
                        <Primary onClick={next}>Get started</Primary>
                    </LinkNav>
                </div>
            </section>
        )
    }

    if (step === 'account' && signedIn) {
        return (
            <StepCard {...card} question="First, who are you?" nav={nav(<Primary onClick={next}>Continue</Primary>)}>
                <Says pill="Done">You’re signed in as {signedIn}.</Says>
            </StepCard>
        )
    }

    if (step === 'account' && signingIn) {
        return (
            <StepCard
                {...card}
                label=""
                question="Welcome back."
                nav={
                    <LinkNav
                        link={
                            <button type="button" className={LINK} onClick={() => { setSigningIn(false); setProblem(null) }}>
                                Make a new account
                            </button>
                        }
                    >
                        <Primary disabled={!primary} onClick={() => primary?.()}>Sign in</Primary>
                    </LinkNav>
                }
            >
                <Field label="Email" problem={problem?.about === 'email' ? problem.text : null}>
                    <input type="email" autoFocus autoComplete="username" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} className={INPUT} />
                </Field>
                <Field label="Password" problem={problem && problem.about !== 'email' ? problem.text : null}>
                    <Password value={password} onChange={setPassword} isNew={false} />
                </Field>
            </StepCard>
        )
    }

    if (step === 'account') {
        return (
            <StepCard
                {...card}
                question="First, who are you?"
                hint="Your account is how you publish mascots, run jobs in the cloud and answer from your phone. What you browse stays on this computer."
                nav={nav(<Primary disabled={!primary} onClick={() => primary?.()}>Create account</Primary>)}
            >
                <Field label="Your name">
                    <input autoFocus autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className={INPUT} />
                </Field>
                <Field label="Email" problem={problem?.about === 'email' ? problem.text : null}>
                    <input type="email" autoComplete="username" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} className={INPUT} />
                </Field>
                <Field label="Password" problem={problem && problem.about !== 'email' ? problem.text : null} hint="At least 8 characters.">
                    <Password value={password} onChange={setPassword} isNew />
                </Field>
            </StepCard>
        )
    }

    if (step === 'yours') {
        return (
            <StepCard
                {...card}
                question="Make it yours."
                hint="The window changes as you choose."
                nav={nav(<Primary onClick={next}>Continue</Primary>)}
                aside={
                    <div className="w-[322px] shrink-0 grid place-items-center bg-tray shadow-[inset_1px_0_0_var(--line)]">
                        <MiniWindow tabs={settings.layoutMode} />
                    </div>
                }
            >
                <p className={cn('mt-1 mb-2', LABEL)}>Theme</p>
                <Choice<Appearance>
                    label="Theme"
                    value={settings.appearance}
                    onChange={(appearance) => updateSettings({ appearance })}
                    options={[
                        { value: 'light', label: 'Light', picture: <WindowPicture mode="light" /> },
                        { value: 'dark', label: 'Dark', picture: <WindowPicture mode="dark" /> },
                        { value: 'system', label: 'System', picture: <WindowPicture mode="system" /> }
                    ]}
                />
                <p className={cn('mt-4 mb-2', LABEL)}>Tabs</p>
                <Choice<LayoutMode>
                    label="Tabs"
                    value={settings.layoutMode}
                    onChange={(layoutMode) => updateSettings({ layoutMode })}
                    options={[
                        { value: 'vertical', label: 'On the side', picture: <WindowPicture tabs="side" /> },
                        { value: 'horizontal', label: 'On top', picture: <WindowPicture tabs="top" /> }
                    ]}
                />
            </StepCard>
        )
    }

    if (step === 'brain') {
        return (
            <>
                <StepCard
                    {...card}
                    question="Give me a brain."
                    hint="I think with an AI service, using a key that’s yours. It’s kept encrypted on this computer, and you pay the service for what I use."
                    nav={nav(<Primary disabled={!primary} onClick={() => primary?.()}>{keyTry.works ? 'Continue' : 'Try the key'}</Primary>)}
                >
                    <div className="mt-3.5 -mx-1">
                        <AiServiceRows keyTry={keyTry} inCard />
                    </div>
                </StepCard>
                {!keyTry.works && <Under label="I’ll do this later" onPress={next}>Without a key I can’t answer, but everything else works.</Under>}
            </>
        )
    }

    if (step === 'history') {
        const failed = !!history.message && !history.done
        return (
            <>
                <StepCard
                    {...card}
                    question="Shall I bring your history over?"
                    hint={history.done ? undefined : 'Then I can suggest things from day one, and the address field knows where you’ve been.'}
                    nav={nav(<Primary disabled={!primary} onClick={() => primary?.()}>{history.done ? 'Continue' : failed ? 'Try again' : 'Bring it in'}</Primary>)}
                >
                    {history.done ? (
                        <Says pill="Done">{history.message}</Says>
                    ) : (
                        <>
                            {history.sources && history.source && <SourceRows sources={history.sources} chosen={history.source.id} choose={history.choose} />}
                            {failed ? (
                                <p role="alert" className="mt-3 mx-1 text-14 text-ask text-left">{history.message}</p>
                            ) : (
                                <ul className="mt-3.5 mx-1 flex flex-col gap-[7px] text-left">
                                    {SOURCE_FACTS.map(({ Icon, text }) => (
                                        <li key={text} className="flex gap-[9px] text-13 text-ink-2">
                                            <Icon aria-hidden className="mt-[3px] size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
                                            {text}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </StepCard>
                {!history.done && <Under label="Skip" onPress={next}>You can bring it in later, from Settings.</Under>}
            </>
        )
    }

    return (
        <StepCard
            {...card}
            question="What I can see."
            hint="These are the real settings, not a notice. Change them here or later."
            nav={nav(<Primary onClick={finish}>Start browsing</Primary>)}
        >
            <div className="mt-3.5 -mx-1.5 rounded-[14px] shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
                <Rule id="rule-read" title="I read a page only when you ask" line="And the chat always shows which one.">
                    <StatusPill>Always</StatusPill>
                </Rule>
                <Rule id="rule-ask" title="I ask before anything risky" line="Before I delete, send or buy. You can make me ask about everything, in Settings.">
                    <StatusPill>Always</StatusPill>
                </Rule>
                <Rule id="rule-suggestions" title="A summary of your history, for suggestions" line="It goes to the AI service. Everything else stays here.">
                    <Switch labelledBy="rule-suggestions" checked={settings.suggestions} onChange={(suggestions) => updateSettings({ suggestions })} />
                </Rule>
                <Rule id="rule-memory" title="Offers to remember what you tell me" line="Only what you say yes to is kept, on this computer.">
                    <Switch labelledBy="rule-memory" checked={settings.memoryOffers} onChange={(memoryOffers) => updateSettings({ memoryOffers })} />
                </Rule>
            </div>
        </StepCard>
    )
}

export const FirstRun: React.FC = () => {
    const { settings } = useShell()
    const [passed] = useState(settings.firstRun)
    const [start, setStart] = useState<Start | null>(null)

    // Which steps there are, and where to start, from what main says once. They don't change while it's open.
    useEffect(() => {
        void Promise.all([api.account.state(), api.aiKey.state(), api.browser.importSources()]).then(([account, key, sources]) => {
            const browsers = sources.length > 0
            const steps = firstRunSteps({ accounts: account.status !== 'not-set-up', browsers })
            setStart({ steps, browsers, at: firstRunStart(steps, { passed, signedIn: account.status === 'signed-in', hasKey: key.service !== null }) })
        })
    }, [passed])

    return (
        <div className="absolute inset-0 bg-well app-region-drag">
            {/* The well's dot grid, faded away from the middle where the card is read. */}
            <div
                aria-hidden
                className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,var(--dot)_1px,transparent_1.3px)] bg-[length:14px_14px] [mask-image:radial-gradient(ellipse_66%_84%_at_50%_50%,transparent_0,transparent_48%,#000_86%)]"
            />
            <main className="relative h-full overflow-y-auto flex flex-col items-center justify-center px-4 py-12">
                <div className="app-region-no-drag">{start && <Steps start={start} />}</div>
            </main>
        </div>
    )
}
