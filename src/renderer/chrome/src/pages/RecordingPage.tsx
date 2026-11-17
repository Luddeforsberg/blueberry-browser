import React, { useState } from 'react'
import type { TabInfo } from '@shared/ipc'
import { Button } from '@common/components/Button'
import { Pips } from '@common/components/Pips'
import { useAssistantName } from '../components/Berry'
import { ChatError, LiveWords } from '../components/ChatMessage'
import { PageFrame, PageHeader } from '../components/PageFrame'
import { RecordingNotice, TrailNotes, useRecording } from '../components/ShowBerry'
import { recordedForm, startRoutine } from '../routinesView'

const api = () => window.chromeAPI.recording

// What it saw, for the user to go through: the recorder on top while it watches, and the steps under the sites they
// were on. Nothing has left the computer until they press the button under them, after Done.
export const RecordingPage: React.FC<{ tab: TabInfo }> = ({ tab }) => {
    const { status, steps, cut, error } = useRecording()
    const isBerry = useAssistantName() !== 'Assistant'
    const browser = window.chromeAPI.browser
    const [failed, setFailed] = useState<string | null>(null)
    const watching = status === 'recording'
    const drafting = status === 'drafting'
    const empty = steps.length === 0

    const writeUp = async () => {
        setFailed(null)
        const result = await api().draft()
        if (!result.ok) {
            setFailed(result.error)
            return
        }
        startRoutine(recordedForm(result.draft))
        await browser.closeTab(tab.id)
    }

    const throwAway = async () => {
        await api().discard()
        // Closing the last tab closes the window, and this shouldn't do that.
        if ((await browser.getTabs()).length === 1) await browser.openPage('new-tab')
        await browser.closeTab(tab.id)
    }

    return (
        <PageFrame>
            <PageHeader title={isBerry ? 'What I watched' : 'What was recorded'}>
                {empty
                    ? `${watching ? 'Nothing yet' : 'Nothing here'}. Scrolling and looking around don’t leave steps.`
                    : `${steps.length === 1 ? 'One step' : `${steps.length} steps`} on ${[...new Set(steps.map(({ site }) => site))].join(', ')}. None of it has left this computer, and none of it is saved.`}
            </PageHeader>
            <RecordingNotice inPage className="mx-3 mb-6" />
            {cut && (
                <p className="mx-3 mb-4 text-14 text-ask">
                    {cut === 'full' ? 'That’s as much as can be kept in one go, so recording stopped there.' : 'It’s been half an hour, so recording stopped by itself.'}
                </p>
            )}

            {!empty && <TrailNotes steps={steps} onRemove={status === 'review' ? (id) => void api().removeStep(id) : undefined} />}
            {(failed || error) && <div className="mx-3 mt-4"><ChatError message={failed || error || ''} /></div>}

            {!watching && (
                <div className="mx-3 mt-8">
                    {drafting ? (
                        <p role="status" className="h-8 flex items-center gap-2.5 text-14">
                            <Pips pattern="think" />
                            <LiveWords>Writing it up as a routine</LiveWords>
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
                                <p className="mt-2 max-w-[520px] text-13 text-ink-2">
                                    This sends these steps as words to the model that writes it up, and you check what comes back before anything runs. It never gets pictures, or anything typed in a password, code or card field.
                                </p>
                            )}
                        </>
                    )}
                </div>
            )}
        </PageFrame>
    )
}
