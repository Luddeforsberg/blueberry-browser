// What the address bar and new tab input do with typed text: open it as an address, or search for it.
export const looksLikeUrl = (input: string): boolean => {
    const text = input.trim()
    return /^https?:\/\//i.test(text) || (text.includes('.') && !text.includes(' '))
}

export const toUrl = (input: string): string => {
    const text = input.trim()
    if (/^https?:\/\//i.test(text)) return text
    if (text.includes('.') && !text.includes(' ')) return `https://${text}`
    return `https://www.google.com/search?q=${encodeURIComponent(text)}`
}
