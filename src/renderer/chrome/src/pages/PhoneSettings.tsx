import React, { useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Button } from '@common/components/Button'
import { Switch } from '@common/components/Controls'
import { SettingsRow } from '../components/SettingsRow'
import { useShell } from '../contexts/ShellContext'
import { usePhone } from '../usePhone'

const WHO_READS = 'Telegram can read these messages: what’s being asked, the site and any code you send. Passwords are never sent this way.'

// White around it whatever the theme, because a phone's camera needs that.
const PairingCode: React.FC<{ link: string }> = ({ link }) => {
    const { size, cells } = useMemo(() => {
        const { modules } = QRCode.create(link, { errorCorrectionLevel: 'M' })
        return { size: modules.size, cells: Array.from(modules.data) }
    }, [link])
    return (
        <svg role="img" aria-label="Code to scan with your phone" viewBox={`-2 -2 ${size + 4} ${size + 4}`} className="size-40 shrink-0 rounded-control" shapeRendering="crispEdges">
            <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="#fff" />
            {cells.map((on, at) => (on ? <rect key={at} x={at % size} y={Math.floor(at / size)} width={1} height={1} fill="#000" /> : null))}
        </svg>
    )
}

// Your own Telegram bot, off until you connect one. The token leaves this page once, and never comes back to it.
export const PhoneSettings: React.FC = () => {
    const { settings, updateSettings } = useShell()
    const [phone, setPhone] = usePhone()
    const [token, setToken] = useState('')
    const [busy, setBusy] = useState(false)
    const api = window.chromeAPI.phone

    const connect = async (event: React.FormEvent) => {
        event.preventDefault()
        setBusy(true)
        const state = await api.connect(token)
        setBusy(false)
        setPhone(state)
        if (!state.problem) setToken('')
    }

    return (
        <>
            <SettingsRow
                id="setting-phone"
                title="Replies from your phone"
                description="When a job needs you and you’re away, your own Telegram bot asks you, and your reply goes straight to the job."
                more="It runs from this computer, so it only works while Blueberry is open."
            />
            <SettingsRow id="setting-phone-reads" title="What Telegram sees" description={WHO_READS} />

            {phone.status === 'off' && (
                <div className="py-4">
                    <h3 id="setting-phone-token" className="text-14 font-semibold">Connect a bot</h3>
                    <p className="mt-0.5 text-13 text-muted-foreground">In Telegram, message @BotFather, send /newbot and paste the token it gives you. It’s kept encrypted on this computer.</p>
                    <form className="mt-3 flex items-center gap-2" onSubmit={(event) => void connect(event)}>
                        <input
                            aria-labelledby="setting-phone-token"
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                            placeholder="Bot token"
                            className="min-w-0 flex-1 h-8 rounded-card border bg-canvas px-3 text-13 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <Button type="submit" disabled={busy || !token.trim()}>{busy ? 'Checking…' : 'Connect'}</Button>
                    </form>
                    {phone.problem && <p role="alert" className="mt-2 text-13 text-destructive">{phone.problem}</p>}
                </div>
            )}

            {phone.status === 'pairing' && (
                <>
                    <SettingsRow id="setting-phone-link" title={`Now connect @${phone.botName}`} description="Scan this with your phone’s camera, open it in Telegram and press Start." more="That chat is the only one Blueberry will listen to. It works once, for ten minutes.">
                        <Button variant="outline" onClick={() => void api.newLink().then(setPhone)}>New link</Button>
                    </SettingsRow>
                    <div className="py-4 border-b last:border-b-0">
                        {phone.pairLink && (
                            <div className="flex items-center gap-5">
                                <PairingCode link={phone.pairLink} />
                                <div className="min-w-0">
                                    <p className="text-13 text-muted-foreground">Telegram on this computer instead?</p>
                                    <Button variant="outline" className="mt-2" onClick={() => void api.openLink()}>Open in my browser</Button>
                                </div>
                            </div>
                        )}
                    </div>
                    <SettingsRow id="setting-phone-cancel" title="Changed your mind?" description="This forgets the token.">
                        <Button variant="outline" onClick={() => void api.disconnect().then(setPhone)}>Disconnect</Button>
                    </SettingsRow>
                </>
            )}

            {phone.status === 'connected' && (
                <>
                    <SettingsRow id="setting-phone-bot" title={`Connected to @${phone.botName}`} description="Disconnecting forgets the token and the chat." more="To stop the bot for good, revoke it with @BotFather too.">
                        <Button variant="outline" onClick={() => void api.disconnect().then(setPhone)}>Disconnect</Button>
                    </SettingsRow>
                    <SettingsRow id="setting-phone-always" title="Send even when I’m here" description="Normally it only sends when the Blueberry window isn’t in front, or after a minute with no input." more="This is for trying it out or filming.">
                        <Switch labelledBy="setting-phone-always" checked={settings.phoneAlways} onChange={(phoneAlways) => updateSettings({ phoneAlways })} />
                    </SettingsRow>
                </>
            )}

            {phone.status !== 'off' && phone.problem && (
                <div className="py-4">
                    <p role="alert" className="text-13 text-warning">{phone.problem}</p>
                </div>
            )}
        </>
    )
}
