import React from 'react'
import { File, FileText, Image, X } from 'lucide-react'
import type { FileChip as FileChipInfo, SentAttachment, TabChoice } from '@shared/attachments'
import { cn } from '@common/lib/utils'
import { Favicon, siteIcon } from './Favicon'

// DESIGN.md section 10, The prompt box: what a mascot is given to read is chips at the top of the card, each with its ×,
// and once sent, the same chips over the message without one. Mock: docs/design/mocks/the-plus.html.

// The quiet fill follows the card it's on: `card-2` on a chat's card, `sheet-2` on the new tab's and over a message.
const QUIET = 'bg-card-2 group-data-[sheet]/box:bg-sheet-2'

const Chip: React.FC<{
    icon: React.ReactNode
    name: string
    fact?: string | null
    // Said in full where `fact` is a shortening.
    factInFull?: string | null
    problem?: string | null
    label: string
    onRemove?: () => void
    removeLabel?: string
    sheet?: boolean
}> = ({ icon, name, fact, factInFull, problem, label, onRemove, removeLabel, sheet }) => {
    const said = problem ?? fact
    return (
        <span
            role="group"
            aria-label={problem ? `${label}, not added: ${problem}` : factInFull || fact ? `${label}, ${factInFull ?? fact}` : label}
            title={problem ?? factInFull ?? undefined}
            className={cn(
                'h-7 max-w-[240px] pl-1.5 inline-flex items-center gap-[7px] rounded-row text-12 whitespace-nowrap',
                onRemove ? 'pr-0.5' : 'pr-2',
                problem ? 'bg-ask-bg text-ask' : cn('text-ink', sheet ? 'bg-sheet-2' : QUIET)
            )}
        >
            {icon}
            <span className="min-w-0 truncate">{name}</span>
            {said && <span className={cn('shrink-0', problem ? 'text-ask' : 'text-ink-3', problem && 'min-w-0 truncate')}>{said}</span>}
            {onRemove && (
                <button
                    type="button"
                    aria-label={removeLabel ?? `Remove ${name}`}
                    title={removeLabel ?? `Remove ${name}`}
                    onClick={onRemove}
                    className={cn(
                        'size-6 shrink-0 flex items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus',
                        problem ? 'text-ask hover:bg-hover' : 'text-ink-3 hover:bg-hover hover:text-ink'
                    )}
                >
                    <X className="size-[11px]" strokeWidth={1.5} />
                </button>
            )}
        </span>
    )
}

const iconClass = (problem: string | null | undefined) => cn('size-[13px] shrink-0', problem ? 'text-ask' : 'text-ink-3')

// The page in front, marked as that.
export const PageChip: React.FC<{ title: string; host: string; favicon?: string | null; onRemove: () => void }> = ({ title, host, favicon, onRemove }) => (
    <Chip icon={<Favicon src={favicon} site={host} />} name={host} fact="this page" label={`The page in front, ${title}`} onRemove={onRemove} removeLabel="Remove this page" />
)

export const TabChip: React.FC<{ tab: Pick<TabChoice, 'title' | 'site' | 'favicon'>; problem?: string | null; onRemove?: () => void; sheet?: boolean }> = ({ tab, problem, onRemove, sheet }) => (
    <Chip
        icon={<Favicon src={tab.favicon} site={tab.site} />}
        name={tab.title}
        fact={tab.site}
        problem={problem}
        label={`The tab ${tab.title}, on ${tab.site}`}
        onRemove={onRemove}
        sheet={sheet}
    />
)

const FileIcon: React.FC<{ kind: FileChipInfo['kind']; thumbnail: string | null; problem?: string | null }> = ({ kind, thumbnail, problem }) => {
    if (thumbnail && !problem) return <img src={thumbnail} alt="" className="size-[18px] shrink-0 rounded-[5px] object-cover" />
    if (kind === 'picture') return <Image aria-hidden className={iconClass(problem)} strokeWidth={1.5} />
    if (kind === 'text') return <FileText aria-hidden className={iconClass(problem)} strokeWidth={1.5} />
    return <File aria-hidden className={iconClass(problem)} strokeWidth={1.5} />
}

const KIND_WORDS: Record<NonNullable<FileChipInfo['kind']>, string> = { picture: 'The picture', pdf: 'The PDF', text: 'The file' }

export const FileChip: React.FC<{ file: Pick<FileChipInfo, 'kind' | 'name' | 'fact' | 'thumbnail'> & Partial<Pick<FileChipInfo, 'factInFull'>>; problem?: string | null; onRemove?: () => void; sheet?: boolean }> = ({ file, problem, onRemove, sheet }) => (
    <Chip
        icon={<FileIcon kind={file.kind} thumbnail={file.thumbnail} problem={problem} />}
        name={file.name}
        fact={file.fact}
        factInFull={file.factInFull}
        problem={problem}
        label={`${file.kind ? KIND_WORDS[file.kind] : 'The file'} ${file.name}`}
        onRemove={onRemove}
        sheet={sheet}
    />
)

// What went with a message, over it.
export const SentAttachments: React.FC<{ attached: readonly SentAttachment[] }> = ({ attached }) => (
    <ul aria-label="Sent with it" className="flex flex-wrap justify-end gap-1.5">
        {attached.map((item, index) => (
            <li key={index} className="flex min-w-0">
                {item.kind === 'tab' ? (
                    <TabChip tab={{ title: item.title, site: item.site, favicon: siteIcon(`https://${item.site}`) }} sheet />
                ) : (
                    <FileChip file={item} sheet />
                )}
            </li>
        ))}
    </ul>
)

// The chips at the top of the card.
export const ChipRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div role="group" aria-label="Given to read" className="flex flex-wrap gap-1.5 [&>*]:max-w-full">
        {children}
    </div>
)
