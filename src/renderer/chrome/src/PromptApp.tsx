import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PermissionPrompt, ThemeState } from '@shared/ipc'
import { PermissionCard } from '@common/components/PermissionCard'

const permissions = () => window.chromeAPI.permissions

// The view over the page that asks about a site's request. It's as tall as the card, so the rest of the page
// keeps its clicks.
export const PromptApp: React.FC = () => {
    const [prompt, setPrompt] = useState<PermissionPrompt | null>(null)
    const content = useRef<HTMLDivElement>(null)

    useEffect(() => {
        void permissions().current().then(setPrompt)
        return permissions().onPrompt(setPrompt)
    }, [])

    useEffect(() => {
        const apply = ({ isDark }: ThemeState) => document.documentElement.classList.toggle('dark', isDark)
        void window.chromeAPI.theme.getTheme().then(apply)
        return window.chromeAPI.theme.onThemeUpdated(apply)
    }, [])

    useLayoutEffect(() => {
        const element = content.current
        if (!element) return
        const observer = new ResizeObserver(() => void permissions().resizePrompt(element.offsetHeight))
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    return (
        <div ref={content} className="px-6 pt-4 pb-8">
            {prompt && (
                <PermissionCard
                    key={prompt.id}
                    prompt={prompt}
                    onDecide={(allow) => void permissions().decide(prompt.id, allow)}
                />
            )}
        </div>
    )
}
