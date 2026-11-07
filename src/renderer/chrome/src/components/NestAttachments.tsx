import React, { useState } from 'react'
import { FileText, Image, Paperclip, StickyNote, X } from 'lucide-react'
import type { NestAttachTarget } from '@shared/ipc'
import type { NestAttachment } from '@shared/library'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'
import type { AddItem } from './Composer'
import { formatBytes } from './downloadStatus'

// The names on a card's one quiet line: each file's, then "your note", or "2 notes".
export const attachedNames = (attachments: readonly NestAttachment[]): string => {
    const files = attachments.filter((each) => each.kind === 'file').map((each) => each.name)
    const notes = attachments.filter((each) => each.kind === 'note').length
    return [...files, ...(notes === 1 ? ['your note'] : notes > 1 ? [`${notes} notes`] : [])].join(', ')
}

export interface Attaching {
    // The + menu's items, or none where nothing can be added.
    items: AddItem[] | undefined
    problems: string[]
    writing: boolean
    stopWriting: () => void
    setProblems: (problems: string[]) => void
}

// Adding to a card, or to the Nest's composer, while it can still change. A file is picked in main, which reads it.
export const useAttaching = (target: NestAttachTarget | null): Attaching => {
    const [problems, setProblems] = useState<string[]>([])
    const [writing, setWriting] = useState(false)
    const items = target
        ? [
              {
                  label: 'Add a file',
                  icon: <Paperclip />,
                  onSelect: async () => {
                      setProblems([])
                      setProblems((await window.chromeAPI.nests.attachFiles(target)).problems)
                  }
              },
              {
                  label: 'Add a note',
                  icon: <StickyNote />,
                  onSelect: () => {
                      setProblems([])
                      setWriting(true)
                  }
              }
          ]
        : undefined
    return { items, problems, writing, stopWriting: () => setWriting(false), setProblems }
}

const FIELD =
    "nowheel block w-full px-2 py-1.5 resize-none rounded-control border bg-surface text-13 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground"

// A note being written or changed in place. Done keeps it, Esc leaves it as it was.
const NoteField: React.FC<{ initial: string; onDone: (text: string) => void; onCancel: () => void; action: string }> = ({ initial, onDone, onCancel, action }) => {
    const [text, setText] = useState(initial)
    return (
        <div className="flex flex-col gap-1.5">
            <textarea
                aria-label="Note"
                placeholder="A note for this card, such as who it’s for or what to keep in mind"
                value={text}
                rows={3}
                autoFocus
                maxLength={4000}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.stopPropagation()
                        onCancel()
                    }
                }}
                className={FIELD}
            />
            <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={onCancel}>
                    Cancel
                </Button>
                <Button size="sm" disabled={!text.trim()} onClick={() => onDone(text)}>
                    {action}
                </Button>
            </div>
        </div>
    )
}

const RemoveButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        className="size-6 shrink-0 flex items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
        <X className="size-3.5" />
    </button>
)

// A card's files and notes: one quiet line with a paperclip and their names, which opens the list. Before the card is
// sent, a note opens to be changed and either can be removed. After, they only show.
export const Attachments: React.FC<{ attachments: NestAttachment[]; target: NestAttachTarget | null; attaching?: Attaching; className?: string }> = ({
    attachments,
    target,
    attaching,
    className
}) => {
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState<string | null>(null)
    const api = window.chromeAPI.nests
    const writing = !!attaching?.writing && !!target
    const problems = attaching?.problems ?? []
    if (attachments.length === 0 && !writing && problems.length === 0) return null
    const editable = !!target
    const shown = open || writing
    // From a planned card, one of the composer's it points at is only taken off this card.
    const remove = (each: NestAttachment) =>
        void api.removeAttachment(each.id, each.shared && target && 'cardId' in target ? target.cardId : undefined)

    return (
        <div className={cn("nodrag cursor-auto flex flex-col gap-1.5", className)}>
            {attachments.length > 0 && (
                <button
                    type="button"
                    aria-expanded={shown}
                    aria-label={`With: ${attachedNames(attachments)}`}
                    onClick={() => setOpen(!open)}
                    className="self-start max-w-full -mx-1.5 px-1.5 h-6 rounded-control flex items-center gap-1.5 text-12 text-muted-foreground outline-none transition-colors hover:text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Paperclip className="size-3.5 shrink-0" />
                    <span className="truncate">With: {attachedNames(attachments)}</span>
                </button>
            )}
            {shown && attachments.length > 0 && (
                <ul aria-label="Files and notes" className="flex flex-col rounded-control border divide-y">
                    {attachments.map((each) =>
                        each.kind === 'note' ? (
                            <li key={each.id} className="px-2 py-1.5 flex items-start gap-2">
                                <StickyNote className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                                {editing === each.id ? (
                                    <div className="flex-1 min-w-0">
                                        <NoteField
                                            initial={each.text ?? ''}
                                            action="Save"
                                            onCancel={() => setEditing(null)}
                                            onDone={(text) => {
                                                setEditing(null)
                                                void api.editNote(each.id, text)
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            disabled={!editable}
                                            onClick={() => setEditing(each.id)}
                                            aria-label={editable ? 'Change your note' : 'Your note'}
                                            className="flex-1 min-w-0 -my-0.5 py-0.5 rounded-control text-left text-13 outline-none enabled:hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-text select-text"
                                        >
                                            <span className="block text-12 text-muted-foreground">Your note</span>
                                            <span className="nowheel block max-h-48 overflow-y-auto whitespace-pre-wrap">{each.text}</span>
                                        </button>
                                        {editable && <RemoveButton label="Remove your note" onClick={() => remove(each)} />}
                                    </>
                                )}
                            </li>
                        ) : (
                            <li key={each.id} className="px-2 h-9 flex items-center gap-2">
                                {each.type.startsWith('image/') ? (
                                    <Image className="size-4 shrink-0 text-muted-foreground" />
                                ) : (
                                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                                )}
                                <span className="flex-1 min-w-0 truncate text-13">{each.name}</span>
                                <span className="shrink-0 text-12 text-muted-foreground">{formatBytes(each.size)}</span>
                                {editable && <RemoveButton label={`Remove ${each.name}`} onClick={() => remove(each)} />}
                            </li>
                        )
                    )}
                </ul>
            )}
            {writing && target && (
                <NoteField
                    initial=""
                    action="Add note"
                    onCancel={() => attaching?.stopWriting()}
                    onDone={async (text) => {
                        const result = await api.addNote(target, text)
                        if (result.ok) attaching?.stopWriting()
                        else attaching?.setProblems([result.error])
                    }}
                />
            )}
            {problems.length > 0 && (
                <div role="alert" className="flex flex-col gap-0.5 text-12 text-destructive">
                    {problems.map((problem) => (
                        <p key={problem}>{problem}</p>
                    ))}
                </div>
            )}
        </div>
    )
}
