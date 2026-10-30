import React from 'react'
import ReactDOM from 'react-dom/client'
import { ChromeApp } from './ChromeApp'
import { OverlayApp } from './OverlayApp'
import './index.css'

// Main loads this page into each chrome view, and `view` says which one it is.
const view = new URLSearchParams(window.location.search).get('view')

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {view === 'overlay' ? <OverlayApp /> : <ChromeApp />}
    </React.StrictMode>
)
