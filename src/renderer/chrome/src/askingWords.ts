import type { AskReason, AskWhy } from '@shared/asking'

// DESIGN.md section 10, It says why it's asking: one sentence per reason, in the mascot's voice, chosen by the code the
// tool layer gave. Nothing a page or the model wrote is ever in it. `marked` is for a card that marks the piece of its
// exact words the reason is about, and only a reason whose rule marks something has one. A record, so a new code
// without words doesn't compile.
export const REASON_WORDS: Record<AskReason, { plain: string; marked?: string }> = {
    'always-ask': { plain: 'you’ve set me to ask before everything' },
    'tool-always-asks': { plain: 'a drag or a dropdown always needs your OK' },
    credentials: { plain: 'this address has a name or password in it', marked: 'this address has a name or password in it, marked above' },
    'carries-data': { plain: 'this could carry data', marked: 'this could carry data, marked above' },
    'looks-like-data': { plain: 'part of this address looks like data', marked: 'part of this address looks like data, marked above' },
    'new-subdomain': { plain: 'this is a part of the site I haven’t been to', marked: 'this is a part of the site I haven’t been to, marked above' },
    'new-site': { plain: 'this job hasn’t had a reason to be on this site', marked: 'this job hasn’t had a reason to be on this site, marked above' },
    'other-origin-frame': { plain: 'this part of the page comes from another site', marked: 'this part of the page comes from another site, marked above' },
    unnamed: { plain: 'this control has no name, so I can’t tell what it does' },
    'risky-word': { plain: 'this control’s name says it changes or sends something', marked: 'of the word marked above' },
    'secret-field': { plain: 'this is a password, code or card field' },
    hidden: { plain: 'this control isn’t visible on the page' },
    toggle: { plain: 'this switches something on or off' },
    'sends-form': { plain: 'this belongs to a form that sends what’s in it' },
    'not-search': { plain: 'this types somewhere other than a search box' },
    'long-text': { plain: 'this is more text than a search' },
    'risky-key': { plain: 'this key can send or change something' },
}

// "Asking because this could carry data, marked above." It says "marked above" only when the card marks something.
export const whyWords = ({ reason, mark }: AskWhy): string => {
    const words = REASON_WORDS[reason]
    return `Asking because ${mark && words.marked ? words.marked : words.plain}.`
}
