import React, { createContext, useContext, useEffect, useState } from 'react'
import type { LibrarySnapshot } from '@shared/library'

const EMPTY: LibrarySnapshot = { account: { name: '', email: '' }, pinned: [], bookmarks: [], chats: [], routines: [] }

const LibraryContext = createContext<LibrarySnapshot>(EMPTY)

export const useLibrary = () => useContext(LibraryContext)

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [library, setLibrary] = useState<LibrarySnapshot>(EMPTY)

    useEffect(() => {
        const api = window.chromeAPI.library
        api.getLibrary().then(setLibrary).catch((error) => console.error('Failed to load library:', error))
        return api.onLibraryUpdated(setLibrary)
    }, [])

    return <LibraryContext.Provider value={library}>{children}</LibraryContext.Provider>
}
