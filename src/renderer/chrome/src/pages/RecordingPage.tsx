import React, { useState } from 'react'
import type { TabInfo } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Berry, useAssistantName } from '../components/Berry'
import { ChatError, SHIMMER_TEXT } from '../components/ChatMessage'
import { TrailNotes, useRecording } from '../components/ShowBerry'
import { recordedForm, setRoutinesView } from '../routinesView'

const api = () => window.chromeAPI.recording

// What it saw, for the user to go through. Nothing has left the computer until they press the button here.
export const RecordingPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { status, steps, cut, error } = useRecording()
    const name = useAssistantName()
    const isBerry = name !== 'Assistant'
    const browser = window.chromeAPI.browser
    const [failed, setFailed] = useState<string | null>(null)
    const drafting = status === 'drafting'
    const empty = steps.length === 0

    const writeUp = async () => {
        setFailed(null)
        const result = await api().draft()
        if (!result.ok) {
            setFailed(result.error)
            return
        }
        setRoutinesView({ page: 'form', values: recordedForm(result.draft) })
        await browser.openPage('routines')
        await browser.closeTab(tab.id)
    }

    const throwAway = async () => {
        await api().discard()
        // Closing the last tab closes the window, and this shouldn't do that.
        if ((await browser.getTabs()).length === 1) await browser.openPage('new-tab')
        await browser.closeTab(tab.id)
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="max-w-[672px] mx-auto px-8 pt-10 pb-8">
                    <div className="flex items-end justify-between gap-6 border-b">
                        <div className="min-w-0 pb-4">
                            <h1 className="text-20 font-semibold">{isBerry ? 'What I watched' : 'What was recorded'}</h1>
                            <p className="mt-1 text-14 text-muted-foreground">
                                {empty
                                    ? 'Nothing here. Scrolling and looking around don’t leave notes.'
                                    : `${steps.length === 1 ? 'One note' : `${steps.length} notes`} on ${[...new Set(steps.map(({ site }) => site))].join(', ')}. None of it has left this computer, and none of it is saved.`}
                            </p>
                            {cut && (
                                <p className="mt-2 text-14 text-warning">
                                    {cut === 'full' ? 'That’s as much as can be kept in one go, so recording stopped there.' : 'It’s been half an hour, so recording stopped by itself.'}
                                </p>
                            )}
                        </div>
                        <Berry mood={drafting ? 'thinking' : 'curious'} size={88} className="shrink-0 -mb-px" />
                    </div>

                    {!empty && <TrailNotes steps={steps} onRemove={drafting ? undefined : (id) => void api().removeStep(id)} />}
                    {(failed || error) && <ChatError message={failed || error || ''} />}
                </div>
            </div>

            <div className="shrink-0 border-t py-4">
                <div className="max-w-[672px] mx-auto px-8">
                    {drafting ? (
                        <p role="status" className="h-9 flex items-center gap-2 text-14">
                            <span className={SHIMMER_TEXT}>Writing it up as a routine</span>
                        </p>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button disabled={empty} title={empty ? 'There’s nothing left to use' : undefined} onClick={() => void writeUp()}>
                                    Turn this into a routine
                                </Button>
                                <Button variant="ghost" onClick={() => void throwAway()}>
                                    {empty ? 'Close' : 'Throw it all away'}
                                </Button>
                            </div>
                            {!empty && (
                                <p className="mt-2 text-12 text-muted-foreground">
                                    This sends these notes as words to the model that writes it up, and you check what comes back before anything runs. It never gets pictures, or anything typed in a password, code or card field.
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
