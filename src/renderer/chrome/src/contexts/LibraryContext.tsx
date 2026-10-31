import React, { createContext, useContext, useEffect, useState } from 'react'
import type { LibrarySnapshot } from '@shared/library'

const EMPTY: LibrarySnapshot = { pinned: [], bookmarks: [], chats: [], routines: [] }

const LibraryContext = createContext<LibrarySnapshot>(EMPTY)

export const useLibrary = () => useContext(LibraryContext)

// What the bookmark cluster and bar show when there's nothing saved yet.
export const NO_SAVED_SITES = 'Pin or bookmark a page to keep it here.'

// Pinned sites first, then bookmarks. A site saved both ways shows once, as a pin.
export const useSavedSites = () => {
    const { pinned, bookmarks } = useLibrary()
    return [...pinned, ...bookmarks.filter((bookmark) => !pinned.some((pin) => pin.url === bookmark.url))]
}

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [library, setLibrary] = useState<LibrarySnapshot>(EMPTY)

    useEffect(() => {
        const api = window.chromeAPI.library
        api.getLibrary().then(setLibrary).catch((error) => console.error('Failed to load library:', error))
        return api.onLibraryUpdated(setLibrary)
    }, [])

    return <LibraryContext.Provider value={library}>{children}</LibraryContext.Provider>
}
