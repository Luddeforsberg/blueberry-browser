// A piece of a sentence, marked if it's the site an address was cut down to.
export type SitePart = { text: string; site: boolean }

// Addresses become site names, and everything else stays as written. Whoever shows this also shows the exact words,
// because that's what is being allowed.
export const siteParts = (text: string): SitePart[] => {
    const parts: SitePart[] = []
    let at = 0
    for (const match of text.matchAll(/https?:\/\/[^\s,”"<>]+/g)) {
        const found = match[0]
        const trailing = /[.)]+$/.exec(found)?.[0] ?? ''
        let hostname: string
        try {
            hostname = new URL(found.slice(0, found.length - trailing.length)).hostname
        } catch {
            continue
        }
        parts.push({ text: text.slice(at, match.index), site: false }, { text: hostname.replace(/^www\./, ''), site: true })
        at = match.index + found.length - trailing.length
    }
    parts.push({ text: text.slice(at), site: false })
    return parts.filter((part) => part.text)
}

export const withSiteNames = (text: string) => siteParts(text).map((part) => part.text).join('')

// "Open x" as the second half of "I'd like to open x". Only the first letter changes, and "URL" stays as it is.
export const asContinuation = (text: string) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text)
