import React, { useState } from 'react'
import { Button } from '@common/components/Button'
import { CardInShell } from '@common/components/ApprovalCard'
import { openRoutines, scheduleSentence, sentenceText, toDraft, type RoutineFormValues } from '../routinesView'
import { WhenAnswer } from '../pages/RoutineSteps'
import { ChatError } from './ChatMessage'

// DESIGN.md section 10, Routines: Save as routine never leaves the chat. A card under the reply asks only when, because
// what to do and who does it come from the chat. Saved, it becomes one line that opens the routine.
export const SaveAsRoutineCard: React.FC<{ from: RoutineFormValues; onClose: () => void }> = ({ from, onClose }) => {
    const [values, setValues] = useState(from)
    const [saved, setSaved] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const save = async () => {
        if (saving) return
        setSaving(true)
        const result = await window.chromeAPI.routines.save(null, toDraft(values))
        setSaving(false)
        if (!result.ok) setError(result.error)
        else setSaved(result.id)
    }

    if (saved) {
        return (
            <CardInShell label="Saved as a routine">
                <div className="-my-1 flex items-center gap-3">
                    <p className="flex-1 min-w-0 text-15 text-ink">Saved. {sentenceText(scheduleSentence(values))}.</p>
                    <Button variant="raised" size="sm" onClick={() => openRoutines({ page: 'routine', id: saved })}>Open routine</Button>
                </div>
            </CardInShell>
        )
    }

    return (
        <CardInShell label="Save as routine" note="What to do and who does it come from this chat. Change them later on the routine’s page.">
            <h3 className="mb-3 text-15 font-medium text-ink">When should I do this again?</h3>
            <WhenAnswer values={values} set={(patch) => setValues({ ...values, ...patch })} often={['daily', 'weekdays', 'weekly', 'monthly']} centred={false} cloud={false} />
            {error && <div className="mt-3"><ChatError message={error} /></div>}
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <Button disabled={saving} onClick={() => void save()}>Save routine</Button>
                <Button variant="raised" onClick={onClose}>Not now</Button>
            </div>
        </CardInShell>
    )
}
