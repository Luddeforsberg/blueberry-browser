import React, { useEffect, useRef, useState } from 'react'
import { Check, ClipboardPaste, Lock } from 'lucide-react'
import { AI_SERVICES, maskedKey, type AiKeyState, type AiKeyTried, type AiService } from '@shared/aiKey'
import { Button } from '@common/components/Button'
import { Pips } from '@common/components/Pips'
import { StatusPill } from '@common/components/StatusPill'
import { cn } from '@common/lib/utils'
import { useShell } from '../contexts/ShellContext'
import { Berry } from './Berry'

// DESIGN.md section 10, First run, Give me a brain, and Settings > Connections > AI service: the two services as rows,
// the chosen one opening a field for its key. The key is only ever in that field until it's sent to main, and the field
// is emptied once main has kept it. Main never sends it back, only the service and its last four characters.

const SERVICES: Record<AiService, { name: string; line: string }> = {
    openai: { name: 'OpenAI', line: 'GPT models. A key from platform.openai.com.' },
    anthropic: { name: 'Anthropic', line: 'Claude models. A key from console.anthropic.com.' }
}

const NONE: AiKeyState = { service: null, last4: null }

export const useAiKey = () => {
    const [state, setState] = useState(NONE)
    useEffect(() => {
        void window.chromeAPI.aiKey.state().then(setState)
        return window.chromeAPI.aiKey.onUpdated(setState)
    }, [])
    return state
}

export const aiServiceName = (service: AiService) => SERVICES[service].name

type Said = AiKeyTried | 'trying' | null

const PROBLEMS: Record<Exclude<AiKeyTried, 'works'>, (service: AiService) => string> = {
    refused: () => 'The service turned that key down. Check that it’s whole, and that the account behind it can still be charged.',
    unreachable: (service) => `I couldn’t reach ${SERVICES[service].name} to try it, so I can’t tell yet. Check your connection and try again.`,
    'not-a-key': () => 'That doesn’t look like a key. Paste the whole key, with nothing around it.',
    'not-safe': () => 'This computer can’t keep the key encrypted, so it wasn’t saved.',
    'not-saved': () => 'The key works, but it couldn’t be saved. Try again.'
}

// The chosen service, what's in the field, and how the last try went. `works` is true once a key is kept, whether it was
// just tried or saved before.
export const useKeyTry = () => {
    const saved = useAiKey()
    const [chosen, setChosen] = useState<AiService | null>(null)
    const service = chosen ?? saved.service ?? 'openai'
    const [key, setKey] = useState('')
    const [said, setSaid] = useState<Said>(null)
    const tryKey = async () => {
        if (!key.trim() || said === 'trying') return
        setSaid('trying')
        const { outcome } = await window.chromeAPI.aiKey.tryKey(service, key)
        // Kept in main now, so it goes from here.
        if (outcome === 'works') setKey('')
        setSaid(outcome)
    }
    return {
        saved,
        service,
        choose: (next: AiService) => {
            setChosen(next)
            setSaid(null)
        },
        key,
        setKey: (next: string) => {
            setKey(next)
            setSaid(null)
        },
        said,
        tryKey,
        works: saved.service === service && said !== 'trying' && !key,
        canTry: !!key.trim() && said !== 'trying'
    }
}

export type KeyTry = ReturnType<typeof useKeyTry>

const FIELD = 'h-10 mt-2.5 flex items-center gap-2 rounded-[12px] bg-sheet dark:bg-card pl-3 pr-1.5 text-14 shadow-[inset_0_0_0_1px_var(--line)]'

// The key as it shows once it's out of the field, with a lock.
const Masked: React.FC<{ service: AiService; last4: string }> = ({ service, last4 }) => (
    <div className={FIELD}>
        <Lock aria-hidden className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
        <span className="flex-1 min-w-0 truncate font-mono text-12 text-ink" aria-label={`${SERVICES[service].name} key ending in ${last4}`}>
            {maskedKey(service, last4)}
        </span>
    </div>
)

const Says: React.FC<{ tone?: 'ask'; children: React.ReactNode }> = ({ tone, children }) => (
    <p role={tone === 'ask' ? 'alert' : 'status'} className={cn('mt-2.5 mx-0.5 flex gap-2.5 text-14 text-left', tone === 'ask' ? 'items-start text-ask' : 'items-center')}>
        <span aria-hidden className="flex shrink-0">
            <Berry size={20} mood={tone === 'ask' ? 'oops' : 'delivered'} still />
        </span>
        {children}
    </p>
)

// What the chosen row holds: the field, or the key with a lock while it's tried and once it's kept, and what came of it.
const ChosenRow: React.FC<{ keyTry: KeyTry; name: string | null; onRemove?: () => void; tryButton?: boolean; inCard?: boolean }> = ({ keyTry, name, onRemove, tryButton, inCard }) => {
    const { saved, service, key, setKey, said, tryKey, works } = keyTry
    const { showBerry } = useShell().settings
    const field = useRef<HTMLInputElement>(null)
    if (said === 'trying') {
        return (
            <>
                <Masked service={service} last4={key.trim().slice(-4)} />
                {/* The face is the pips while it works, so the line has none of its own. With mascots hidden, they stand in. */}
                <p role="status" className="mt-2.5 mx-0.5 flex items-center gap-2.5 font-mono text-11.5 text-ink-2">
                    <span aria-hidden className="flex shrink-0">
                        {showBerry ? <Berry size={20} mood="thinking" /> : <Pips pattern="think" />}
                    </span>
                    Trying it..
                </p>
            </>
        )
    }
    if (works && saved.last4) {
        return (
            <>
                <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0"><Masked service={service} last4={saved.last4} /></div>
                    {onRemove && <Button variant="raised" size="sm" className="mt-2.5" onClick={onRemove}>Remove</Button>}
                </div>
                {said === 'works' && (
                    <Says>
                        <span className="flex-1">“Hello{name ? `, ${name}` : ''}. That works. I can think now.”</span>
                        <StatusPill tone="on">Works</StatusPill>
                    </Says>
                )}
            </>
        )
    }
    return (
        <>
            {/* In the first run's card, as in the cards that make a mascot, the caret marks focus. */}
            <div className={cn(FIELD, !inCard && 'focus-within:ring-2 focus-within:ring-focus')}>
                <input
                    ref={field}
                    type="password"
                    aria-label={`${SERVICES[service].name} key`}
                    placeholder="Paste your key"
                    autoComplete="off"
                    spellCheck={false}
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    onKeyDown={(event) => {
                        if (tryButton && event.key === 'Enter') {
                            event.preventDefault()
                            void tryKey()
                        }
                    }}
                    className="flex-1 min-w-0 h-full bg-transparent font-mono text-12 text-ink caret-ink outline-none placeholder:font-sans placeholder:text-14 placeholder:text-faint"
                />
                {/* Main pastes into the field, as the Edit menu does, so nothing here reads the clipboard. */}
                <Button
                    type="button"
                    variant="raised"
                    size="sm"
                    onClick={() => {
                        field.current?.focus()
                        void window.chromeAPI.aiKey.paste()
                    }}
                >
                    <ClipboardPaste aria-hidden strokeWidth={1.75} />
                    Paste
                </Button>
            </div>
            {said && said !== 'works' ? (
                <Says tone="ask">{PROBLEMS[said](service)}</Says>
            ) : (
                <p className="mt-2 mx-0.5 text-13 text-ink-3 text-left">
                    <button type="button" onClick={() => void window.chromeAPI.aiKey.find(service)} className="text-ink underline decoration-line underline-offset-[3px] rounded-row outline-none hover:decoration-ink-3 focus-visible:ring-2 focus-visible:ring-focus">
                        Where do I find a key?
                    </button>{' '}
                    It opens the service’s page for making one.
                </p>
            )}
            {tryButton && (
                <div className="mt-3 flex justify-end">
                    <Button disabled={!keyTry.canTry} onClick={() => void tryKey()}>Try the key</Button>
                </div>
            )}
        </>
    )
}

// The two services as rows, the chosen one open. `tryButton` puts Try the key in the row, for Settings, where the shell
// has no button for it. `onRemove` offers Remove beside a kept key.
export const AiServiceRows: React.FC<{ keyTry: KeyTry; onRemove?: () => void; tryButton?: boolean; inCard?: boolean }> = ({ keyTry, onRemove, tryButton, inCard }) => {
    const { accountName } = useShell().settings
    return (
        <div role="radiogroup" aria-label="AI service" className="flex flex-col gap-1">
            {AI_SERVICES.map((service) => {
                const on = keyTry.service === service
                return (
                    <div key={service} className={cn('rounded-[14px] p-2.5 shadow-[inset_0_0_0_1px_var(--line)]', on && 'bg-card-2')}>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => keyTry.choose(service)}
                            className="w-full flex items-center gap-3 rounded-row text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            <span aria-hidden className="ml-1 size-8 shrink-0 grid place-items-center rounded-[10px] bg-sheet-2 shadow-[inset_0_0_0_1px_var(--line)] text-13 font-semibold text-ink">
                                {SERVICES[service].name.charAt(0)}
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-14 font-medium text-ink truncate">{SERVICES[service].name}</span>
                                <span className="block text-13 text-ink-2 truncate">{SERVICES[service].line}</span>
                            </span>
                            <span aria-hidden className={cn('mr-1 size-[18px] shrink-0 grid place-items-center rounded-full', on ? 'bg-ink text-ground' : 'shadow-[inset_0_0_0_1.5px_rgb(var(--faint))]')}>
                                {on && <Check className="size-[11px]" strokeWidth={2.6} />}
                            </span>
                        </button>
                        {on && <ChosenRow keyTry={keyTry} name={accountName} onRemove={onRemove} tryButton={tryButton} inCard={inCard} />}
                    </div>
                )
            })}
        </div>
    )
}
