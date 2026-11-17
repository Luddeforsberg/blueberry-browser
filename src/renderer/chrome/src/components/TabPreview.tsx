import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import type { TabInfo } from '@shared/ipc'
import { GRACE_MS, IDLE, PREVIEW_REST_MS, stepTip, type TipEvent, type TipState } from '@common/components/tooltipState'
import { useBrowser } from '../contexts/BrowserContext'

// DESIGN.md section 8, A tab's preview: resting on a tab that isn't the one in front shows a card of it, which follows
// the pointer along the tabs with no wait. It runs the tooltip's own steps with a longer rest, and takes the tab's
// tooltip's place. The chrome only says which tab and where its row is: main draws the card, in a view over the page.

// Blueberry's own pages have their name whole in the row, and the tab in front is already on screen.
const getsPreview = (tab: Pick<TabInfo, 'isActive' | 'page'>): boolean => !tab.isActive && tab.page === null

interface PreviewApi {
    send: (event: TipEvent, row?: HTMLElement) => void
}

const PreviewContext = createContext<PreviewApi | null>(null)

// Where a tab's row is in this view, which is where main places the card from. Both views that draw tabs start at the
// window's top left corner.
const rowOf = (element: HTMLElement) => {
    const { x, y, width, height } = (element.closest('li') ?? element).getBoundingClientRect()
    return { x, y, width, height }
}

export const TabPreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const state = useRef<TipState>(IDLE)
    const timer = useRef<number>(undefined)
    const rows = useRef(new Map<string, HTMLElement>())
    const { activeTab } = useBrowser()

    const send = useCallback((event: TipEvent, row?: HTMLElement) => {
        if (row && event.type === 'enter') rows.current.set(event.id, row)
        const before = state.current
        const step = stepTip(before, event)
        state.current = step.state
        const { shown } = step.state
        if (shown !== before.shown) {
            const element = shown ? rows.current.get(shown) : undefined
            if (shown && element?.isConnected) {
                void window.chromeAPI.preview.show({ tabId: shown, row: rowOf(element), slide: before.shown !== null })
            } else {
                void window.chromeAPI.preview.hide()
            }
        }
        if (!shown && !step.state.waiting) rows.current.clear()
        if (step.timer === 'keep') return
        window.clearTimeout(timer.current)
        if (step.timer === 'rest') timer.current = window.setTimeout(() => send({ type: 'rested' }), PREVIEW_REST_MS)
        if (step.timer === 'grace') timer.current = window.setTimeout(() => send({ type: 'grace-over' }), GRACE_MS)
    }, [])

    // The tab in front changing, Escape, a scroll, a menu, the window going to the back, or the pointer leaving the view.
    const dismiss = useCallback(() => {
        if (state.current.shown || state.current.waiting) send({ type: 'dismiss' })
    }, [send])
    useEffect(dismiss, [activeTab?.id, dismiss])
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && dismiss()
        const left = () => {
            const id = state.current.shown ?? state.current.waiting
            if (id) send({ type: 'leave', id, now: true })
        }
        const root = document.documentElement
        window.addEventListener('keydown', onKey, true)
        window.addEventListener('scroll', dismiss, true)
        window.addEventListener('contextmenu', dismiss, true)
        window.addEventListener('blur', dismiss)
        root.addEventListener('mouseleave', left)
        return () => {
            window.removeEventListener('keydown', onKey, true)
            window.removeEventListener('scroll', dismiss, true)
            window.removeEventListener('contextmenu', dismiss, true)
            window.removeEventListener('blur', dismiss)
            root.removeEventListener('mouseleave', left)
            window.clearTimeout(timer.current)
            if (state.current.shown) void window.chromeAPI.preview.hide()
        }
    }, [send, dismiss])

    const api = useMemo(() => ({ send }), [send])
    return <PreviewContext.Provider value={api}>{children}</PreviewContext.Provider>
}

// What a tab's own button takes to show its card, or nothing for a tab that gets none, which keeps its tooltip.
export const useTabPreview = (tab: TabInfo, off = false) => {
    const api = useContext(PreviewContext)
    const id = tab.id
    const gets = !!api && !off && getsPreview(tab)
    // A tab that stops getting one, such as the one just pressed, lets its card go.
    useEffect(() => {
        if (gets) return
        api?.send({ type: 'leave', id, now: true })
    }, [api, id, gets])
    if (!api || !gets) return undefined
    return {
        onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
            // A drag, or anything else with a button held, isn't resting on the tab.
            if (event.pointerType === 'touch' || event.buttons !== 0) return
            api.send({ type: 'enter', id, via: 'pointer' }, event.currentTarget)
        },
        onPointerLeave: (event: React.PointerEvent<HTMLElement>) => api.send({ type: 'leave', id, now: event.relatedTarget === null }),
        onPointerDown: () => api.send({ type: 'press', id }),
        onFocus: (event: React.FocusEvent<HTMLElement>) => {
            if (event.currentTarget.matches(':focus-visible')) api.send({ type: 'enter', id, via: 'keyboard' }, event.currentTarget)
        },
        onBlur: () => api.send({ type: 'leave', id, now: true })
    }
}
