import { useCallback, useEffect, useRef, useState } from 'react'
import { ATTACHMENT_WORDS, MAX_FILE_BYTES, type FileChip, type TabChoice } from '@shared/attachments'
import { useBrowser } from './contexts/BrowserContext'

// What a prompt box has been given to read. Main decides what each file is and whether it may go, and decides again as
// the message goes: this only keeps the chips and says, for the place the job will run, what can't go along.

// Where the job runs: here, in a cloud tab whose model is still called from here, or on the runner with this computer off.
export type JobPlace = 'here' | 'cloud' | 'runner'

export interface Attached {
    files: string[]
    tabs: string[]
}

let localIds = 0

export const useAttachments = (place: JobPlace) => {
    const [files, setFiles] = useState<FileChip[]>([])
    const [tabs, setTabs] = useState<TabChoice[]>([])
    const filesRef = useRef(files)
    filesRef.current = files
    const { tabs: open } = useBrowser()

    // A tab that closed simply goes from the box.
    useEffect(() => {
        setTabs((current) => {
            const still = current.filter((tab) => open.some(({ id }) => id === tab.id))
            return still.length === current.length ? current : still
        })
    }, [open])

    // Files main is keeping for this box. Anything left when the box goes is let go of there too.
    const kept = () => filesRef.current.filter((file) => !file.problem).map((file) => file.id)
    useEffect(
        () => () => {
            kept().forEach((id) => void window.chromeAPI.attachments.discard(id))
        },
        []
    )

    const chooseFiles = useCallback(async () => {
        const chips = await window.chromeAPI.attachments.chooseFiles(kept())
        if (chips.length > 0) setFiles((current) => [...current, ...chips])
    }, [])

    // A drop or a paste. Only the bytes go, never a path, and no more of a file than it takes to say it's too big.
    const addFiles = useCallback(async (list: File[]) => {
        if (list.length === 0) return
        const read = await Promise.all(
            list.map(async (file) => {
                try {
                    return { name: file.name, bytes: new Uint8Array(await file.slice(0, MAX_FILE_BYTES + 1).arrayBuffer()) }
                } catch {
                    // A folder, or a file that went while it was read.
                    return { name: file.name, bytes: null }
                }
            })
        )
        const readable = read.flatMap(({ name, bytes }) => (bytes ? [{ name, bytes }] : []))
        const unread: FileChip[] = read
            .filter((file) => file.bytes === null)
            .map((file) => ({ id: `unread-${++localIds}`, kind: null, name: file.name, fact: null, factInFull: null, thumbnail: null, problem: ATTACHMENT_WORDS.unreadable }))
        const chips = readable.length > 0 ? await window.chromeAPI.attachments.addFiles(readable, kept()) : []
        setFiles((current) => [...current, ...chips, ...unread])
    }, [])

    const addTab = useCallback((tab: TabChoice) => {
        setTabs((current) => (current.some(({ id }) => id === tab.id) ? current : [...current, tab]))
    }, [])

    const remove = useCallback((id: string) => {
        setTabs((current) => current.filter((tab) => tab.id !== id))
        setFiles((current) => current.filter((file) => file.id !== id))
        void window.chromeAPI.attachments.discard(id)
    }, [])

    // Main has let go of what went. Anything that didn't go is let go of with it, as its chip is.
    const clear = useCallback(() => {
        kept().forEach((id) => void window.chromeAPI.attachments.discard(id))
        setFiles([])
        setTabs([])
    }, [])

    // The tab chips again, for a mascot chosen since: one it may not have says why.
    const recheckTabs = useCallback((choices: TabChoice[], missing: (tab: TabChoice) => string | null) => {
        setTabs((current) => current.map((tab) => {
            const listed = choices.find(({ id }) => id === tab.id)
            return { ...tab, problem: listed ? listed.problem : missing(tab) }
        }))
    }, [])

    const fileProblem = (file: FileChip) => file.problem ?? (place === 'runner' ? ATTACHMENT_WORDS.fileToCloud : null)
    const tabProblem = (tab: TabChoice) => (place !== 'here' ? ATTACHMENT_WORDS.tabToCloud : tab.problem)

    // What goes with the message: everything that has no reason not to.
    const sendable = (): Attached => ({
        files: files.filter((file) => !fileProblem(file)).map((file) => file.id),
        tabs: tabs.filter((tab) => !tabProblem(tab)).map((tab) => tab.id),
    })

    return { files, tabs, chooseFiles, addFiles, addTab, remove, clear, recheckTabs, fileProblem, tabProblem, sendable, empty: files.length === 0 && tabs.length === 0 }
}

export type AttachmentBox = ReturnType<typeof useAttachments>
