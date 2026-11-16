import React, { useEffect, useRef } from 'react'
import { Clock, Download, LayoutGrid, LogOut, Monitor, Moon, Repeat, SlidersHorizontal, Sun, User, type LucideIcon } from 'lucide-react'
import type { AccountState, Appearance } from '@shared/ipc'
import { SHORTCUTS, shortcutWords } from '@shared/shortcuts'
import { Choice } from '@common/components/Controls'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import { useShell } from '../contexts/ShellContext'
import { openSettings } from '../openSettings'
import { useAccount } from '../useAccount'
import { Berry } from './Berry'

// DESIGN.md section 10, The account menu: who you are, the theme, and the one way in to those pages that's always on
// screen. Beside the dock in the sidebar, after it in the horizontal toolbar.

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-focus'

// The first letter of the name, or of the email with no name. Spread, so a letter outside the basic plane stays whole.
const initialOf = (name: string | null, email: string | null): string => ([...(name ?? email ?? '')][0] ?? '').toLocaleUpperCase()

// The letter in a circle on `sheet-2`, for a menu or a group, which are already on a sheet.
export const Avatar: React.FC<{ name: string | null; email: string | null; large?: boolean }> = ({ name, email, large = false }) => (
    <span
        aria-hidden
        className={cn(
            'shrink-0 rounded-full flex items-center justify-center bg-sheet-2 font-medium text-ink',
            large ? 'size-9 text-13' : 'size-[30px] text-12'
        )}
    >
        {initialOf(name, email)}
    </span>
)

const PersonGlyph: React.FC<{ className?: string }> = ({ className }) => (
    <span aria-hidden className={cn('shrink-0 rounded-full flex items-center justify-center bg-tray text-ink-3', className)}>
        <User className="size-4" strokeWidth={1.5} />
    </span>
)

// The button beside the dock: your letter on a sheet, or a person on `tray` when there's nobody signed in. While its menu
// is open it has an `ink` ring.
export const AccountButton: React.FC<{ open: boolean; onPress: (button: HTMLButtonElement) => void; small?: boolean }> = ({ open, onPress, small = false }) => {
    const [account] = useAccount()
    const { settings } = useShell()
    const signedIn = account.status === 'signed-in'
    const label = signedIn ? `Account, ${settings.accountName ?? account.email}` : account.status === 'signed-out' ? 'Account, not signed in' : 'Settings and more'
    return (
        <button
            type="button"
            aria-label={label}
            title={signedIn ? (settings.accountName ?? account.email ?? undefined) : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-account-button
            onClick={(event) => onPress(event.currentTarget)}
            className={cn(
                'shrink-0 rounded-full flex items-center justify-center app-region-no-drag transition-[box-shadow,transform] duration-fast active:scale-[.96]',
                small ? 'size-7' : 'size-[30px]',
                open && 'shadow-[0_0_0_2px_rgb(var(--ground)),0_0_0_3.5px_rgb(var(--ink))]',
                FOCUS
            )}
        >
            {signedIn ? (
                <span className="size-full rounded-full flex items-center justify-center bg-sheet shadow-rim text-12 font-medium text-ink">
                    {initialOf(settings.accountName, account.email)}
                </span>
            ) : (
                <PersonGlyph className="size-full hover:text-ink transition-colors" />
            )}
        </button>
    )
}

const Row: React.FC<{ Icon?: LucideIcon; lead?: React.ReactNode; shortcut?: string; onChoose: () => void; children: string }> = ({ Icon, lead, shortcut, onChoose, children }) => (
    <button
        type="button"
        data-menu-row
        onClick={onChoose}
        className={cn('w-full h-[30px] px-2 flex items-center gap-2.5 rounded-row text-13 text-ink text-left transition-colors hover:bg-hover active:bg-press', FOCUS)}
    >
        <span aria-hidden className="size-4 shrink-0 flex items-center justify-center text-ink-3">
            {lead ?? (Icon && <Icon className="size-4" strokeWidth={1.5} />)}
        </span>
        <span className="flex-1 truncate">{children}</span>
        {shortcut && (
            <kbd className="font-mono text-11 text-ink-3">
                <span className="sr-only">, shortcut </span>
                {shortcut}
            </kbd>
        )}
    </button>
)

const Rule: React.FC = () => <div aria-hidden className="h-px mx-2 my-1.5 bg-line" />

const Who: React.FC<{ account: AccountState; name: string | null; onClose: (refocus: boolean) => void }> = ({ account, name, onClose }) => {
    if (account.status === 'signed-in') {
        return (
            <div className="flex items-center gap-2.5 px-2 pt-[7px] pb-[11px]">
                <Avatar name={name} email={account.email} />
                <span className="min-w-0">
                    <span className="block truncate font-medium">{name ?? account.email}</span>
                    {name && <span className="block truncate mt-px text-12 text-ink-2">{account.email}</span>}
                </span>
            </div>
        )
    }
    return (
        <div className="flex items-center gap-2.5 px-2 pt-[7px] pb-[11px]">
            <PersonGlyph className="size-[30px]" />
            <span className="flex-1 min-w-0 truncate font-medium">Not signed in</span>
            <Button
                size="sm"
                data-menu-row
                onClick={() => {
                    openSettings('account')
                    onClose(false)
                }}
            >
                Sign in
            </Button>
        </div>
    )
}

// What opens from the button. `onClose` closes it, and `refocus` gives the keyboard back to the button, as after Escape
// or a press outside. Choosing a row closes it and leaves the keyboard with what the row opened.
export const AccountMenu: React.FC<{ onClose: (refocus: boolean) => void; className?: string }> = ({ onClose, className }) => {
    const [account] = useAccount()
    const { settings, updateSettings, theme } = useShell()
    const menu = useRef<HTMLDivElement>(null)
    const mac = theme.platform === 'mac'
    const choose = (act: () => void) => () => {
        act()
        onClose(false)
    }
    const page = (name: 'history' | 'downloads' | 'flock' | 'routines' | 'mascot-gallery') => choose(() => void window.chromeAPI.browser.openPage(name))

    // The keyboard starts on its first row.
    useEffect(() => {
        rows()[0]?.focus()
    }, [])

    // The rows the arrows move through: each button, with the theme's three as one row, at whichever is chosen.
    const rows = () =>
        [...(menu.current?.querySelectorAll<HTMLElement>('[data-menu-row], [role="radio"][tabindex="0"]') ?? [])]

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.stopPropagation()
            onClose(true)
            return
        }
        const by = { ArrowDown: 1, ArrowUp: -1 }[event.key]
        if (!by) return
        event.preventDefault()
        const list = rows()
        const at = list.findIndex((row) => row === document.activeElement || row.contains(document.activeElement))
        list[(at + by + list.length) % list.length]?.focus()
    }

    return (
        <div
            ref={menu}
            role="dialog"
            aria-label="Account"
            onKeyDown={onKeyDown}
            className={cn('p-1.5 rounded-sheet bg-sheet text-13 text-ink shadow-lift animate-[menu-in_150ms_cubic-bezier(.2,.8,.2,1)] app-region-no-drag', className)}
        >
            {account.status !== 'not-set-up' && <Who account={account} name={settings.accountName} onClose={onClose} />}
            <Choice<Appearance>
                label="Theme"
                value={settings.appearance}
                onChange={(appearance) => updateSettings({ appearance })}
                fill
                // In dark, a strip a step below the sheet, as sheet-2 on it would read as raised.
                className="mx-0.5 mb-1.5 rounded-[11px] [&>button]:rounded-[9px] dark:bg-ground dark:[&>button[aria-checked=true]]:bg-sheet-2"
                options={[
                    { value: 'light', label: 'Light', Icon: Sun },
                    { value: 'dark', label: 'Dark', Icon: Moon },
                    { value: 'system', label: 'System', Icon: Monitor }
                ]}
            />
            <Row Icon={SlidersHorizontal} shortcut={shortcutWords(SHORTCUTS.settings, mac)} onChoose={choose(() => openSettings('general'))}>Settings</Row>
            <Row Icon={Clock} shortcut={shortcutWords(SHORTCUTS.history, mac)} onChoose={page('history')}>History</Row>
            <Row Icon={Download} shortcut={shortcutWords(SHORTCUTS.downloads, mac)} onChoose={page('downloads')}>Downloads</Row>
            <Rule />
            <Row lead={<Berry size={16} still />} onChoose={page('flock')}>Your mascots</Row>
            <Row Icon={Repeat} onChoose={page('routines')}>Routines</Row>
            <Row Icon={LayoutGrid} onChoose={page('mascot-gallery')}>Gallery</Row>
            {account.status === 'signed-in' && (
                <>
                    <Rule />
                    <Row Icon={LogOut} onChoose={choose(() => void window.chromeAPI.account.signOut())}>Sign out</Row>
                </>
            )}
        </div>
    )
}
