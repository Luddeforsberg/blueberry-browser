import type React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AddressSuggestion } from '@shared/ipc'
import { useBrowser } from '../contexts/BrowserContext'
import { useFlock, useLibrary } from '../contexts/LibraryContext'
import { useShell } from '../contexts/ShellContext'
import { addressSuggestions } from '../addressSuggestions'
import { useAssistantName } from './Berry'

// The list under the address field while it's being edited (DESIGN.md, Toolbar and the address field). The rows come
// from this computer only: open tabs, saved sites and the history. Main draws them in a view over the page, and the
// keyboard stays here.

// Fast typing waits for a pause before the history is asked again.
const DEBOUNCE_MS = 50

interface Options {
    editing: boolean
    value: string
    setValue: (value: string) => void
    field: React.RefObject<HTMLElement | null>
    input: React.RefObject<HTMLInputElement | null>
    // The field has done its job: it goes back to showing the page.
    onDone: () => void
}

export const useAddressSuggestions = ({ editing, value, setValue, field, input, onDone }: Options) => {
    const { tabs, activeTab, switchTab, navigateToUrl } = useBrowser()
    const { bookmarks, pinned } = useLibrary()
    const { chosen } = useFlock()
    const { layout, settings } = useShell()
    const name = useAssistantName(chosen)

    // What the person typed, apart from a completion or a row's address put in the field. Null until they type.
    const [typed, setTyped] = useState<string | null>(null)
    const [rows, setRows] = useState<AddressSuggestion[]>([])
    const [selected, setSelected] = useState<number | null>(null)
    const [completion, setCompletion] = useState<string | null>(null)
    // False while deleting, or typing anywhere but the end, so a completion never puts back what was just taken out.
    const mayComplete = useRef(false)

    // Read when the history answers, so a change to the tabs alone doesn't ask it again.
    const sources = { tabs, saved: [...pinned, ...bookmarks], ask: { name, look: chosen.look, hidden: !settings.showBerry } }
    const latest = useRef(sources)
    latest.current = sources

    const reset = () => {
        setTyped(null)
        setRows([])
        setSelected(null)
        setCompletion(null)
    }

    useEffect(() => {
        if (!editing) reset()
    }, [editing])

    // Going somewhere else, in this tab or another, is done with the list.
    useEffect(() => {
        setRows([])
        setSelected(null)
        setCompletion(null)
    }, [activeTab?.id, activeTab?.url])

    // Asked again after a pause in typing. An answer for text that's since changed is dropped.
    useEffect(() => {
        if (!editing || typed === null || !typed.trim()) {
            setRows([])
            setCompletion(null)
            return
        }
        let live = true
        const timer = window.setTimeout(async () => {
            const history = await window.chromeAPI.address.suggestHistory(typed)
            if (!live) return
            const { tabs, saved, ask } = latest.current
            const found = addressSuggestions({ text: typed, tabs, saved, history, ask, complete: mayComplete.current, now: Date.now() })
            setRows(found.rows)
            setCompletion(found.completion)
            setSelected(found.completion ? 0 : null)
            if (found.completion) setValue(typed + found.completion.slice(typed.length))
        }, DEBOUNCE_MS)
        return () => {
            live = false
            window.clearTimeout(timer)
        }
    }, [editing, typed, setValue])

    // A completion is selected text after what was typed, so the next key replaces it.
    useLayoutEffect(() => {
        const element = input.current
        if (!element || !completion || typed === null || selected !== 0) return
        if (element.value.length > typed.length && element.value.toLowerCase().startsWith(typed.toLowerCase())) {
            element.setSelectionRange(typed.length, element.value.length, 'backward')
        }
    }, [completion, typed, selected, value, input])

    const open = editing && rows.length > 0

    // Main places the list from the field's place in the window, so it's sent again whenever the layout moves it.
    useEffect(() => {
        if (!open) {
            void window.chromeAPI.address.close()
            return
        }
        const box = field.current?.getBoundingClientRect()
        if (!box) return
        void window.chromeAPI.address.show({ rows, selected, field: { x: box.x, y: box.y, width: box.width, height: box.height } })
    }, [open, rows, selected, layout, field])

    useEffect(() => () => void window.chromeAPI.address.close(), [])

    // What a row does, the same as Enter on it. Asking is the new tab's path: a chat with no page, with the chosen mascot.
    const act = async (row: AddressSuggestion) => {
        onDone()
        if (row.kind === 'tab') await switchTab(row.tabId)
        else if (row.kind === 'ask') {
            const chat = await window.chromeAPI.chat.send(null, row.text, { seePage: false, mascotId: chosen.id })
            if (chat) await window.chromeAPI.browser.openPage('chat', { param: chat.id, title: chat.title })
        } else await navigateToUrl(row.url)
    }
    const actRef = useRef(act)
    actRef.current = act

    // A row pressed in the list, which main hands back.
    useEffect(() => window.chromeAPI.address.onPicked((row) => void actRef.current(row)), [])

    // Our own pages have no address worth showing, so they put their name in the field.
    const fill = (row: AddressSuggestion) => (row.kind === 'search' || row.kind === 'ask' ? row.text : row.url || row.title)

    const choose = (index: number | null) => {
        setSelected(index)
        setCompletion(null)
        setValue(index === null ? (typed ?? '') : fill(rows[index]))
    }

    const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = event.target.value
        const { inputType } = event.nativeEvent as InputEvent
        const atEnd = event.target.selectionStart === next.length
        mayComplete.current = atEnd && !inputType?.startsWith('delete')
        setTyped(next)
        // Typing on along the completion keeps it, so it doesn't flicker while the history is asked again.
        if (mayComplete.current && completion && next.length < completion.length && completion.toLowerCase().startsWith(next.toLowerCase())) {
            setValue(next + completion.slice(next.length))
            setSelected(0)
            return
        }
        setValue(next)
        setCompletion(null)
        setSelected(null)
    }

    // Keys the list takes. Returns true when it took one.
    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
        if (!open) return false
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const last = rows.length - 1
            const down = event.key === 'ArrowDown'
            choose(selected === null ? (down ? 0 : last) : down ? (selected < last ? selected + 1 : null) : selected > 0 ? selected - 1 : null)
            return true
        }
        // The first Escape closes the list and keeps the text, without a completion. The next one is the field's own.
        if (event.key === 'Escape') {
            event.preventDefault()
            if (completion && typed !== null) setValue(typed)
            setRows([])
            setSelected(null)
            setCompletion(null)
            return true
        }
        // Ctrl or ⌘ Enter asks, as it does in the new tab's box.
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            const ask = rows.find((row) => row.kind === 'ask')
            if (!ask) return false
            event.preventDefault()
            void act(ask)
            return true
        }
        return false
    }

    // Enter on a selected row acts on it. With nothing selected it's the field's own Enter, as it always was.
    const submit = (): boolean => {
        if (!open || selected === null || !rows[selected]) return false
        void act(rows[selected])
        return true
    }

    return { onChange, onKeyDown, submit }
}
