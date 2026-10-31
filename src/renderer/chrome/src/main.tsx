import React from 'react'
import ReactDOM from 'react-dom/client'
import { ChromeApp } from './ChromeApp'
import { OverlayApp } from './OverlayApp'
import { FindApp } from './FindApp'
import { PromptApp } from './PromptApp'
import './index.css'

// Main loads this page into each chrome view, and `view` says which one it is.
const view = new URLSearchParams(window.location.search).get('view')

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {view === 'overlay' ? <OverlayApp /> : view === 'find' ? <FindApp /> : view === 'prompt' ? <PromptApp /> : <ChromeApp />}
    </React.StrictMode>
)
