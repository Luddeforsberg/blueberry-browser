import type { ChatThread } from '@shared/library'

// What following a chat needs from the chrome's API.
export interface ChatFeed {
    onChatUpdated: (listener: (thread: ChatThread) => void) => () => void
    onChatChunk: (listener: (chunk: { chatId: string; content: string }) => void) => () => void
    getChat: (chatId: string) => Promise<ChatThread | null>
}

// How one chat's thread changes: from what's shown now, or undefined while nothing is, to what to show.
export type ThreadChange = (current: ChatThread | undefined) => ChatThread | undefined

// Keeps each of `ids` current: the whole thread whenever main sends it, the words of a reply as they stream, and the
// saved thread fetched once to start from. The fetch can come back after a whole thread that's newer than it, so it only
// goes in while none has come.
export const followChats = (ids: ReadonlySet<string>, feed: ChatFeed, apply: (id: string, change: ThreadChange) => void): (() => void) => {
    const updated = new Set<string>()
    const unsubscribeThread = feed.onChatUpdated((thread) => {
        if (!ids.has(thread.id)) return
        updated.add(thread.id)
        apply(thread.id, () => thread)
    })
    const unsubscribeChunks = feed.onChatChunk(({ chatId, content }) => {
        if (ids.has(chatId)) apply(chatId, (current) => current && { ...current, partial: (current.partial ?? '') + content })
    })
    ids.forEach((id) =>
        void feed.getChat(id).then((thread) => {
            if (!updated.has(id)) apply(id, () => thread ?? undefined)
        })
    )
    return () => {
        unsubscribeThread()
        unsubscribeChunks()
    }
}
