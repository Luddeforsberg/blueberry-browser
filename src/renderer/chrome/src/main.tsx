import React from 'react'
import ReactDOM from 'react-dom/client'
import { ChromeApp } from './ChromeApp'
import { OverlayApp } from './OverlayApp'
import { FindApp } from './FindApp'
import { PromptApp } from './PromptApp'
import { DesktopApp, DesktopComposerApp } from './DesktopApp'
import './index.css'

// A scroll shows the thumb for a moment, as hovering does, since the keyboard can scroll with the pointer elsewhere.
const SHOW_THUMB_MS = 800
const scrolled = new WeakMap<Element, number>()
document.addEventListener('scroll', ({ target }) => {
    if (!(target instanceof Element)) return
    target.setAttribute('data-scrolling', '')
    window.clearTimeout(scrolled.get(target))
    scrolled.set(target, window.setTimeout(() => target.removeAttribute('data-scrolling'), SHOW_THUMB_MS))
}, { capture: true, passive: true })

// Main loads this page into each chrome view, and `view` says which one it is.
const view = new URLSearchParams(window.location.search).get('view')

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {view === 'overlay' ? <OverlayApp /> : view === 'find' ? <FindApp /> : view === 'prompt' ? <PromptApp /> : view === 'desktop' ? <DesktopApp /> : view === 'composer' ? <DesktopComposerApp /> : <ChromeApp />}
    </React.StrictMode>
)
