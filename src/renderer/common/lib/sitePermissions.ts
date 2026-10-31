import type { SitePermission } from '@shared/ipc'

// `ask` finishes the sentence "example.com wants to ...". `name` is the setting's name in Settings.
export const SITE_PERMISSION_WORDS: Record<SitePermission, { ask: string; name: string }> = {
    camera: { ask: 'use your camera', name: 'Camera' },
    microphone: { ask: 'use your microphone', name: 'Microphone' },
    location: { ask: 'know your location', name: 'Location' },
    notifications: { ask: 'show you notifications', name: 'Notifications' },
    midi: { ask: 'use your MIDI devices', name: 'MIDI devices' },
    screen: { ask: 'see your entire screen', name: 'Screen sharing' },
    'clipboard-read': { ask: 'read what you have copied', name: 'Reading the clipboard' },
    'idle-detection': { ask: "know when you're away from this computer", name: 'Knowing when you’re away' },
    'window-management': { ask: 'see your displays and place windows on them', name: 'Displays and windows' },
    'local-fonts': { ask: 'see the fonts on this computer', name: 'Fonts' },
    'speaker-selection': { ask: 'choose which speakers to use', name: 'Speakers' },
    'local-network': { ask: 'connect to devices on your local network', name: 'Local network' },
    'open-external': { ask: 'open another app on this computer', name: 'Opening other apps' }
}

// Allow only lasts for one request with these, and main refuses to save it.
export const ASKS_EVERY_TIME: readonly SitePermission[] = ['screen', 'open-external']

const joinWords = (words: string[]): string =>
    words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`

export const permissionQuestion = (permissions: SitePermission[]): string =>
    permissions.includes('camera') && permissions.includes('microphone')
        ? 'wants to use your camera and microphone'
        : `wants to ${joinWords(permissions.map((permission) => SITE_PERMISSION_WORDS[permission].ask))}`

// Plain https sites show their host. Anything else keeps its scheme, because it isn't the same site.
export const siteName = (origin: string): string => origin.replace(/^https:\/\//, '')
