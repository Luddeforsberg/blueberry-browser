import { describe, expect, it } from 'vitest'
import type { ChatThread } from '@shared/library'
import { followChats, type ChatFeed } from './followChats'

const thread = (id: string, content: string, partial: string | null = null) =>
    ({ id, messages: [{ role: 'assistant', content }], partial, statusLine: null, steps: [], approval: null, error: null }) as unknown as ChatThread

// A feed whose fetch comes back only when the test says, and the threads as `followChats` leaves them.
const setup = (ids: string[]) => {
    let updated: (thread: ChatThread) => void = () => {}
    let chunk: (chunk: { chatId: string; content: string }) => void = () => {}
    const fetches = new Map<string, (thread: ChatThread | null) => void>()
    const feed: ChatFeed = {
        onChatUpdated: (listener) => ((updated = listener), () => {}),
        onChatChunk: (listener) => ((chunk = listener), () => {}),
        getChat: (id) => new Promise((resolve) => fetches.set(id, resolve))
    }
    const shown: Record<string, ChatThread | undefined> = {}
    const stop = followChats(new Set(ids), feed, (id, change) => (shown[id] = change(shown[id])))
    const fetched = async (id: string, saved: ChatThread | null) => {
        fetches.get(id)!(saved)
        await Promise.resolve()
    }
    return { shown, fetched, stop, update: (next: ChatThread) => updated(next), chunk: (chatId: string, content: string) => chunk({ chatId, content }) }
}

describe('followChats', () => {
    it('starts from the saved thread, then adds the words that stream', async () => {
        const { shown, fetched, chunk } = setup(['a'])
        chunk('a', 'lost before there is a thread')
        await fetched('a', thread('a', 'Hi', 'Wor'))
        chunk('a', 'king')
        expect(shown.a?.partial).toBe('Working')
    })

    it('never lets a fetch that comes back late replace a newer thread, or the words streamed onto it', async () => {
        const { shown, fetched, update, chunk } = setup(['a', 'b'])
        update(thread('a', 'Newer', ''))
        chunk('a', 'Still going')
        await fetched('a', thread('a', 'Older'))
        expect(shown.a?.messages[0].content).toBe('Newer')
        expect(shown.a?.partial).toBe('Still going')
        // Another chat's fetch still goes in.
        await fetched('b', thread('b', 'Saved'))
        expect(shown.b?.messages[0].content).toBe('Saved')
    })

    it('drops a fetch that comes back after it stopped, since a newer thread may have reached what followed on', async () => {
        const { shown, fetched, stop } = setup(['a'])
        stop()
        shown.a = thread('a', 'Newer, from the next subscription')
        await fetched('a', thread('a', 'Older'))
        expect(shown.a?.messages[0].content).toBe('Newer, from the next subscription')
    })

    it('ignores chats it was not asked to follow', async () => {
        const { shown, update } = setup(['a'])
        update(thread('c', 'Someone else'))
        expect(shown.c).toBeUndefined()
    })
})
