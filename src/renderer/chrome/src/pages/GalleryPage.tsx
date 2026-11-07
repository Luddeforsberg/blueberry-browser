import React, { useState } from 'react'
import { Pin, Star } from 'lucide-react'
import type { GalleryMascot, MascotProfile, MemoryFact, NeedsYouItem, Suggestion, WorkTab, WorkView } from '@shared/library'
import type { DownloadInfo } from '@shared/ipc'
import { ToolBarButton } from '../components/ToolBarButton'
import { BerryDot, Mascot, MOOD_LABELS, WalkingBird, type Mood } from '@common/components/Mascot'
import { ApprovalCard } from '@common/components/ApprovalCard'
import { PermissionCard } from '@common/components/PermissionCard'
import { Button } from '@common/components/Button'
import { Choice, Switch } from '@common/components/Controls'
import { AssistantMessage, ChatError, StepTrail, ThinkingMessage, UserMessage } from '../components/ChatMessage'
import { ArtBlueberry } from '../components/ArtBlueberry'
import { ChatComposer } from '../components/Composer'
import { PageCard } from '../components/PageCard'
import { PageTrouble } from '../components/PageTrouble'
import { TabIcon } from '../components/TabIcon'
import { HistoryRow } from './HistoryPage'
import { ChatRow } from '../components/Sidebar'
import { MascotPerch } from '../components/MascotPerch'
import { MascotCard, Preview } from './FlockPage'
import { MascotMemoryView } from './MascotMemory'
import { MemoryOffersLine, RememberedFacts } from '../components/MemoryInChat'
import { GalleryCard } from './MascotGalleryPage'
import { mascotForm } from '../flockView'
import { ACCESSORIES, BERRY, BERRY_ID, PALETTES } from '@shared/mascots'
import { FindBarCard } from '../components/FindBarCard'
import { ZoomButton } from '../components/Toolbar'
import { RoutineForm } from '../components/RoutineForm'
import { BirdSuggestions } from '../components/BirdsOnFruit'
import { RoutineRunCard } from '../components/RoutineRunCard'
import { NeedsYouRow } from '../components/NeedsYou'
import { blankForm } from '../routinesView'
import { WorkingStrip, WorkingView, type WorkFrames } from '../components/WorkingView'
import type { RoutineRun } from '@shared/library'
import { DownloadRow } from '../components/DownloadRow'
import { RecordingNotice, TrailNotes } from '../components/ShowBerry'
import { DownloadsProgress } from '../components/DownloadsButton'
import { useShell } from '../contexts/ShellContext'
import { ReactFlow, ReactFlowProvider, ViewportPortal, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import type { ChatThread, NestCard } from '@shared/library'
import { CardView, LineView, NestBoardContext, type CardNode, type LineEdge, type NestBoardActions } from '../components/NestCard'
import { PlanGhosts } from './NestPage'

const MOODS = Object.keys(MOOD_LABELS) as Mood[]

const SAMPLE_FACTS: MemoryFact[] = [
    { id: 'gallery-fact-1', mascotId: 'gallery', text: 'You want prices in kronor.', site: null, savedAt: 1 },
    { id: 'gallery-fact-2', mascotId: 'gallery', text: 'You always choose the cheapest option that’s in stock.', site: null, savedAt: 2 }
]

const SAMPLE_MASCOT: MascotProfile = {
    id: 'gallery-mascot',
    name: 'Scout',
    look: { palette: 'kingfisher', accessory: 'cap' },
    instructions: 'Reads pull requests and tells me what needs me.',
    sites: ['github.com'],
    tools: ['visit'],
    deletedAt: null
}

const SAMPLE_GALLERY_ENTRY: GalleryMascot = {
    id: 'gallery-entry',
    author: 'Blueberry',
    category: 'Work',
    description: 'Tells you which pull requests need you, and why.',
    draft: SAMPLE_MASCOT
}

const SAMPLE_STEPS = [
    { text: 'Opened norrskenair.com', done: true },
    { text: 'Read norrskenair.com', done: true }
]

const SAMPLE_RUN: RoutineRun = {
    id: 'gallery-run',
    routineId: 'gallery',
    status: 'finished',
    startedAt: Date.now(),
    endedAt: Date.now(),
    lateFor: null,
    steps: SAMPLE_STEPS,
    result: 'Found three flights under €200.',
    error: null,
    approval: null,
    tokens: 4210,
    seen: true
}

const SAMPLE_APPROVAL = { id: 'gallery-approval', text: 'Click the button “Delete” on https://example.com/' }

const SAMPLE_RUNS: RoutineRun[] = [
    { ...SAMPLE_RUN, id: 'run-1', status: 'running', steps: [SAMPLE_STEPS[0], { text: 'Reading norrskenair.com', done: false }], result: null, tokens: null },
    { ...SAMPLE_RUN, id: 'run-2', status: 'needs-approval', approval: SAMPLE_APPROVAL, result: null, tokens: null },
    { ...SAMPLE_RUN, id: 'run-3', lateFor: Date.now() - 3_600_000 },
    { ...SAMPLE_RUN, id: 'run-4', status: 'failed', result: null, error: 'The model is rate limited right now. Try again in a moment.' },
    { ...SAMPLE_RUN, id: 'run-5', status: 'stopped', result: null },
    { ...SAMPLE_RUN, id: 'run-6', status: 'interrupted', approval: SAMPLE_APPROVAL, result: null, tokens: null }
]

const SAMPLE_DOWNLOAD: DownloadInfo = {
    id: 'gallery',
    filename: 'field-notes.pdf',
    path: '/Downloads/field-notes.pdf',
    source: 'example.com',
    state: 'progressing',
    receivedBytes: 3_400_000,
    totalBytes: 9_100_000,
    startedAt: 0,
    canResume: false,
    missing: false
}

const SAMPLE_DOWNLOADS: DownloadInfo[] = [
    SAMPLE_DOWNLOAD,
    { ...SAMPLE_DOWNLOAD, id: 'unknown-size', totalBytes: 0 },
    { ...SAMPLE_DOWNLOAD, id: 'paused', state: 'paused' },
    { ...SAMPLE_DOWNLOAD, id: 'stopped', state: 'interrupted', canResume: true },
    { ...SAMPLE_DOWNLOAD, id: 'finished', state: 'completed', receivedBytes: 9_100_000 },
    { ...SAMPLE_DOWNLOAD, id: 'missing', state: 'completed', missing: true, receivedBytes: 9_100_000 },
    { ...SAMPLE_DOWNLOAD, id: 'cancelled', state: 'cancelled' },
    { ...SAMPLE_DOWNLOAD, id: 'failed', state: 'interrupted' }
]

const waitingSample = (id: string, approval: Omit<NeedsYouItem['approval'], 'id'>, job: string): NeedsYouItem => ({
    id,
    approval: { id, ...approval },
    mascotId: BERRY_ID,
    job,
    routineId: null,
    from: null,
    lastStep: 'Opened example.com',
    tabId: null,
    askedAt: 0
})

const SAMPLE_WAITING: NeedsYouItem[] = [
    waitingSample('sample-allow', { text: 'Click the button “Send” on https://example.com/' }, 'Reply to Anna'),
    waitingSample('sample-question', { text: 'Which of the two flights did you mean?', question: true }, 'Book the flight'),
    waitingSample('sample-code', { text: 'Berry needs a code for linkedin.com', handoff: { need: 'code', tabId: 'none', site: 'linkedin.com' } }, 'Check my messages'),
    waitingSample('sample-handoff', { text: 'Berry needs you to sign in on example.com', handoff: { need: 'sign-in', tabId: 'none', site: 'example.com' } }, 'Check my orders')
]

const SAMPLE_SUGGESTIONS: Suggestion[] = [
    { id: 'sample-prompt', kind: 'prompt', title: 'This week’s cheapest Lisbon flights', why: 'You’ve asked something like this 3 times', prompt: 'Find the cheapest flights to Lisbon this week.' },
    {
        id: 'sample-routine',
        kind: 'routine',
        title: 'Top 5 stories, waiting at 8:15',
        why: 'You’ve opened Hacker News around 8:30 on 4 of the last 5 days',
        draft: { name: 'Morning stories', instructions: 'Read the front page and list the top 5.', schedule: { kind: 'daily', time: '08:15' } }
    },
    {
        id: 'sample-mascot',
        kind: 'mascot',
        title: 'Pip, your pull request runner',
        why: 'You’ve gone back and forth between GitHub and Linear on 4 of the last 5 days',
        draft: { name: 'Pip', look: { palette: 'kingfisher', accessory: 'glasses' }, instructions: 'Keep an eye on my pull requests.', sites: ['github.com', 'linear.app'], tools: ['visit'] }
    }
]

const SAMPLE_PICTURE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 70"><rect width="100" height="70" fill="#fbf6ee"/><rect x="8" y="8" width="40" height="5" fill="#2a2118"/><rect x="8" y="20" width="25" height="30" fill="#e8b98a"/><rect x="38" y="20" width="25" height="30" fill="#b8d3a6"/><rect x="68" y="20" width="25" height="30" fill="#b39a86"/></svg>')}`
const SAMPLE_FRAMES: WorkFrames = { get: () => SAMPLE_PICTURE, subscribe: () => () => {} }
const SAMPLE_ASKING = { id: 'sample', text: 'Click the button “Place order”' }
const sampleTab = (state: WorkTab['state'], site = 'alderandmoss.se', current = true): WorkTab => ({ id: site, site, title: site, favicon: null, state, current })
const sampleWork = (tabs: WorkTab[], rest: Partial<WorkView> = {}): WorkView => ({ chatId: 'sample', mascotId: BERRY_ID, tabs, doing: 'Clicking Add to cart', startedAt: 0, endedAt: 42_000, outcome: null, sites: ['alderandmoss.se'], ...rest })
const WORK_SAMPLES: Array<{ label: string; view: WorkView; asking?: boolean }> = [
    { label: 'Working', view: sampleWork([sampleTab('picture')]) },
    { label: 'Two tabs', view: sampleWork([sampleTab('picture'), sampleTab('picture', 'kaffekartan.se', false)], { sites: ['alderandmoss.se', 'kaffekartan.se'] }) },
    { label: 'Waiting for an answer', view: sampleWork([sampleTab('picture')]), asking: true },
    { label: 'Handed to the user', view: sampleWork([sampleTab('held')]), asking: true },
    { label: 'Taken over', view: sampleWork([sampleTab('yours')]) },
    { label: 'Off its sites', view: sampleWork([sampleTab('off-limits')]) },
    { label: 'Finished', view: sampleWork([sampleTab('picture')], { outcome: 'done' }) },
    { label: 'Stopped', view: sampleWork([sampleTab('picture')], { outcome: 'stopped' }) },
]

// A Nest's board as it stands, drawn by the real cards from sample threads: a finished card with its table, the row a
// For-each card is on, that card part way, a card working with nothing written yet, a plan being changed, and the
// shapes where a new plan will land.
const sampleThread = (id: string, extra: Partial<ChatThread>): ChatThread => ({
    id,
    title: id,
    updatedAt: 0,
    mascotId: null,
    from: null,
    messages: [],
    partial: null,
    statusLine: null,
    steps: [],
    approval: null,
    error: null,
    memoryIds: [],
    ...extra
})

const COMPANIES = [['Lindqvist Data', '84'], ['Fjällbo', '41'], ['Kvarnsten', '130'], ['Sjöström Labs', '62'], ['Brygga', '23']]

const SAMPLE_THREADS: Record<string, ChatThread> = {
    scout: sampleThread('scout', {
        messages: [
            { role: 'user', content: 'Find 5 Swedish B2B SaaS companies with 20 to 200 people.' },
            { role: 'assistant', content: ['Here they are.', '', '| Company | People |', '|---|---|', ...COMPANIES.map(([name, people]) => `| ${name} | ${people} |`)].join('\n') }
        ]
    }),
    'run-1': sampleThread('run-1', { messages: [{ role: 'user', content: 'Write' }, { role: 'assistant', content: 'Hej Sara, I saw you’re hiring two SDRs this quarter…' }] }),
    'run-2': sampleThread('run-2', { messages: [{ role: 'user', content: 'Write' }], partial: '', steps: [{ text: 'Reading kvarnsten.se', done: false }] }),
    working: sampleThread('working', { messages: [{ role: 'user', content: 'Which of these is hiring fastest?' }], partial: '' })
}

const sampleCard = (id: string, x: number, y: number, extra: Partial<NestCard> = {}): CardNode => ({
    id,
    type: 'card',
    position: { x, y },
    draggable: false,
    focusable: false,
    data: { card: { id, chatId: null, mascotId: null, x, y, autoPlaced: false, each: null, plan: null, table: null, attachments: [], ...extra } }
})

const SAMPLE_NODES: CardNode[] = [
    sampleCard('scout', 0, 60, { chatId: 'scout' }),
    sampleCard('writer', 560, 60, {
        each: {
            prompt: 'Write a short first email to whoever leads sales.',
            header: ['Company', 'People'],
            column: 'First email',
            runs: [
                { id: 'run-1', row: COMPANIES[0], chatId: 'run-1', state: 'started', cell: 'Hej Sara, I saw you’re hiring two SDRs' },
                { id: 'run-2', row: COMPANIES[2], chatId: 'run-2', state: 'started', cell: null },
                { id: 'run-3', row: COMPANIES[4], chatId: null, state: 'waiting', cell: null }
            ]
        }
    }),
    sampleCard('working', 0, 560, { chatId: 'working' }),
    sampleCard('planned', 560, 560, { plan: { state: 'planned', prompt: 'Find each lead’s latest LinkedIn post.', each: false, waits: false, table: null, note: null } })
]

const SAMPLE_EDGES: LineEdge[] = [{ id: 'line', source: 'scout', target: 'writer', sourceHandle: 'out', targetHandle: 'in', type: 'line', data: { draft: false } } as Edge<{ draft: boolean }, 'line'>]

const SAMPLE_BOARD: NestBoardActions = {
    openId: null,
    openRunId: null,
    setOpen: () => undefined,
    focusId: null,
    inputsOf: (cardId) => (cardId === 'writer' ? [{ line: { id: 'line', from: 'scout', to: 'writer', picked: null }, source: SAMPLE_NODES[0].data.card }] : []),
    inputCandidates: () => [],
    pullOut: () => undefined,
    remove: () => undefined,
    selection: null,
    clearSelection: () => undefined,
    pick: () => undefined,
    waitingOn: () => [],
    forEachFrom: (cardId) => (cardId === 'scout' ? [SAMPLE_NODES[1].data.card] : []),
    away: () => false,
    replanning: true,
    resizeStart: () => undefined,
    resizeEnd: () => undefined,
    samples: SAMPLE_THREADS
}

const NestSample: React.FC = () => {
    const { theme } = useShell()
    return (
        <NestBoardContext.Provider value={SAMPLE_BOARD}>
            <ReactFlowProvider>
                <div className="h-[1120px] rounded-card border overflow-hidden">
                    <ReactFlow<CardNode, LineEdge>
                        nodes={SAMPLE_NODES}
                        edges={SAMPLE_EDGES}
                        nodeTypes={{ card: CardView }}
                        edgeTypes={{ line: LineView }}
                        colorMode={theme.isDark ? 'dark' : 'light'}
                        defaultViewport={{ x: 32, y: 72, zoom: 0.78 }}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        elementsSelectable={false}
                        panOnDrag={false}
                        zoomOnScroll={false}
                        zoomOnPinch={false}
                        zoomOnDoubleClick={false}
                        preventScrolling={false}
                        proOptions={{ hideAttribution: true }}
                        className="nest-board"
                    >
                        <ViewportPortal>
                            <PlanGhosts at={{ x: 0, y: 1000 }} />
                        </ViewportPortal>
                    </ReactFlow>
                </div>
            </ReactFlowProvider>
        </NestBoardContext.Provider>
    )
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mt-10">
        <h2 className="text-20 font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
    </section>
)

// Every shared component in its states. Switch appearance in Settings to check light and dark.
export const GalleryPage: React.FC = () => {
    const [on, setOn] = useState(true)
    const [choice, setChoice] = useState<'one' | 'two'>('one')
    const [still, setStill] = useState(false)
    const [routineForm, setRoutineForm] = useState(() => blankForm('Flight price watch'))
    const { theme } = useShell()

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto px-8 py-10">
                <h1 className="text-20 font-semibold">Component gallery</h1>

                <Section title="Berry">
                    <label className="flex items-center gap-2 text-13">
                        <Switch label="Keep Berry still" checked={still} onChange={setStill} />
                        Keep Berry still
                    </label>
                    <div className="mt-4 grid grid-cols-4 gap-6">
                        {MOODS.map((mood) => (
                            <figure key={mood} className="flex flex-col items-center gap-2 p-4 rounded-card bg-muted">
                                <Mascot mood={mood} size={96} still={still} />
                                <div className="flex items-end gap-3">
                                    <Mascot mood={mood} size={32} still={still} />
                                    <Mascot mood={mood} size={24} still={still} />
                                    <Mascot mood={mood} size={16} still={still} />
                                </div>
                                <figcaption className="text-12 text-muted-foreground">{MOOD_LABELS[mood]}</figcaption>
                            </figure>
                        ))}
                    </div>
                    <div className="mt-4 flex items-center gap-3 text-12 text-muted-foreground">
                        <Mascot size={24} hidden /> Hide Berry replaces it with a plain icon.
                    </div>
                    <div className="mt-4 flex items-end gap-6 text-12 text-muted-foreground">
                        <WalkingBird size={40} foot={1} stepMs={0} />
                        <WalkingBird size={40} foot={0} stepMs={0} pecking />
                        <span>The small birds behind the new tab page, walking and pecking.</span>
                    </div>
                    <div className="mt-4 flex items-center gap-3 text-12 text-muted-foreground">
                        <BerryDot /> <BerryDot working /> The berry as a status marker, at rest and during real work.
                    </div>
                </Section>

                <Section title="The flock">
                    <div className="grid grid-cols-3 gap-4">
                        {PALETTES.map(({ id, label }, index) => {
                            const look = { palette: id, accessory: ACCESSORIES[index % ACCESSORIES.length].id }
                            return (
                                <figure key={id} className="flex flex-col items-center gap-2 p-4 rounded-card bg-muted">
                                    <Mascot look={look} size={96} still={still} />
                                    <div className="flex flex-wrap justify-center items-end gap-1">
                                        {MOODS.map((mood) => (
                                            <Mascot key={mood} look={look} mood={mood} size={36} still={still} />
                                        ))}
                                    </div>
                                    <div className="flex items-end gap-3">
                                        {ACCESSORIES.map(({ id: accessory }) => (
                                            <Mascot key={accessory} look={{ palette: id, accessory }} size={24} still={still} />
                                        ))}
                                    </div>
                                    <div className="flex items-end gap-3">
                                        {ACCESSORIES.map(({ id: accessory }) => (
                                            <Mascot key={accessory} look={{ palette: id, accessory }} size={16} still={still} />
                                        ))}
                                    </div>
                                    <figcaption className="text-12 text-muted-foreground">{label}</figcaption>
                                </figure>
                            )
                        })}
                    </div>
                    <div className="mt-4 max-w-xl p-2 rounded-composer border bg-surface">
                        <MascotPerch selectedId={BERRY_ID} onChoose={() => undefined} onClose={() => undefined} />
                    </div>
                    <div className="mt-6 max-w-[248px]">
                        <ul><MascotCard mascot={SAMPLE_MASCOT} landed={false} onEdit={() => undefined} /></ul>
                    </div>
                    <ul className="mt-6 border-t">
                        <GalleryCard entry={SAMPLE_GALLERY_ENTRY} copy={null} onReview={() => undefined} />
                        <GalleryCard entry={SAMPLE_GALLERY_ENTRY} copy={SAMPLE_MASCOT} onReview={() => undefined} />
                        <GalleryCard entry={{ ...SAMPLE_GALLERY_ENTRY, author: 'Ana', addCount: 12, publishedAt: 1 }} copy={null} onReview={() => undefined} />
                        <GalleryCard entry={{ ...SAMPLE_GALLERY_ENTRY, draft: { ...SAMPLE_MASCOT, sites: [], tools: ['visit', 'click', 'type'] } }} copy={null} onReview={() => undefined} />
                        <GalleryCard entry={{ ...SAMPLE_GALLERY_ENTRY, draft: { ...SAMPLE_MASCOT, sites: [], tools: [] } }} copy={null} onReview={() => undefined} />
                    </ul>
                    <div className="mt-4 max-w-[288px]">
                        <Preview values={mascotForm(SAMPLE_MASCOT)} mood="curious" onMood={() => undefined} flying={false} />
                    </div>
                </Section>

                <Section title="Suggestions">
                    <div className="relative h-[420px] rounded-panel overflow-hidden">
                        <ArtBlueberry dark={theme.isDark} className="absolute left-1/2 top-0 max-w-none -translate-x-1/2" />
                        <div className="relative max-w-[752px] mx-auto">
                            <BirdSuggestions suggestions={SAMPLE_SUGGESTIONS} onUse={() => undefined} onDismiss={() => undefined} />
                        </div>
                    </div>
                </Section>

                <Section title="Art blueberry">
                    <div className="relative h-72 rounded-panel overflow-hidden">
                        <ArtBlueberry dark={theme.isDark} className="absolute left-1/2 top-0 max-w-none -translate-x-1/2" />
                    </div>
                </Section>

                <Section title="Chat">
                    <div className="max-w-xl flex flex-col gap-5">
                        <UserMessage content="What did the Monday digest find?" />
                        <AssistantMessage content="Two things changed: **flight prices** and the studio invoice." />
                        <AssistantMessage
                            content=""
                            isStreaming
                            statusLine="I'll check their careers page and LinkedIn first."
                            steps={[{ text: 'Opened strawberrybrowser.com/careers', done: false }]}
                        />
                        <ThinkingMessage />
                        <ChatError message="The model is rate limited right now. Try again in a moment." />
                        <StepTrail
                            steps={[
                                { text: 'Looked through your history for Lisbon', done: true },
                                { text: 'Opened norrskenair.com', done: true },
                                { text: 'Comparing three weekends in November', done: false }
                            ]}
                        />
                        <div>
                            <ChatComposer onSend={() => undefined} placeholder="Ask Berry" />
                        </div>
                        <ChatComposer
                            onSend={() => undefined}
                            placeholder="With a page attached"
                            attachment={<PageCard title="Jackdaw" host="en.wikipedia.org" onRemove={() => undefined} />}
                        />
                        <ChatComposer onSend={() => undefined} placeholder="Disabled" disabled />
                        <ChatComposer onSend={() => undefined} onStop={() => undefined} placeholder="While replying" disabled />
                    </div>
                </Section>

                <Section title="Nest">
                    <NestSample />
                </Section>

                <Section title="Show Berry how">
                    <RecordingNotice state={{ status: 'recording', startedAt: Date.now() - 42_000, steps: [], cut: null, error: null }} />
                    <TrailNotes
                        onRemove={() => {}}
                        steps={[
                            { id: 'a', kind: 'went', text: 'Went to example.com', site: 'example.com', path: 'example.com/shop', label: '', value: '' },
                            { id: 'b', kind: 'searched', text: 'Searched for “usb-c cable” on example.com', site: 'example.com', path: 'example.com/search', label: '', value: 'usb-c cable' },
                            { id: 'c', kind: 'clicked', text: 'Clicked Add to cart', site: 'example.com', path: '', label: 'Add to cart', value: '' },
                            { id: 'd', kind: 'secret', text: 'Typed in the password field', site: 'example.com', path: '', label: '', value: '' }
                        ]}
                    />
                </Section>

                <Section title="Working view">
                    <div className="mt-16 flex flex-wrap items-start gap-x-8 gap-y-20">
                        {WORK_SAMPLES.map(({ label, view, asking }) => (
                            <div key={label} className="w-[320px]">
                                <WorkingView view={view} frames={SAMPLE_FRAMES} mascot={BERRY} approval={asking ? SAMPLE_ASKING : null} aspect={10 / 7} onStop={() => {}} onShowAsking={() => {}} />
                                <p className="mt-2 text-11 text-muted-foreground">{label}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-8 w-[560px]">
                        <WorkingStrip view={WORK_SAMPLES[0].view} mascot={BERRY} approval={null} />
                    </div>
                </Section>

                <Section title="Chat in the sidebar">
                    <ul className="max-w-xs">
                        <ChatRow chat={{ id: 'gallery-1', title: 'Long weekend in Lisbon', updatedAt: Date.now(), mascotId: null, from: null }} selected={false} onOpen={() => undefined} />
                        <ChatRow chat={{ id: 'gallery-2', title: 'The open chat', updatedAt: Date.now(), mascotId: null, from: null }} selected onOpen={() => undefined} />
                    </ul>
                </Section>

                <Section title="Memory">
                    <div className="max-w-xl flex flex-col gap-6">
                        <MemoryOffersLine offers={SAMPLE_FACTS} mascot={SAMPLE_MASCOT} kept={false} onAnswer={() => undefined} />
                        <MemoryOffersLine offers={SAMPLE_FACTS} mascot={SAMPLE_MASCOT} kept={false} startOpen errors={{ 'gallery-fact-1': 'This bird already remembers 30 things. Forget one in Flock first.' }} onAnswer={() => undefined} />
                        <MemoryOffersLine offers={[]} mascot={SAMPLE_MASCOT} kept onAnswer={() => undefined} />
                        <RememberedFacts used={SAMPLE_FACTS.slice(0, 1)} />
                        <RememberedFacts used={SAMPLE_FACTS} />
                        <RememberedFacts used={[...SAMPLE_FACTS, { ...SAMPLE_FACTS[0], id: 'gallery-fact-3', text: 'You never buy refurbished.' }]} />
                        <MascotMemoryView mascot={SAMPLE_MASCOT} facts={[]} onBack={() => undefined} />
                        <MascotMemoryView
                            mascot={SAMPLE_MASCOT}
                            facts={SAMPLE_FACTS}
                            onBack={() => undefined}
                        />
                    </div>
                </Section>

                <Section title="Routine runs">
                    <ol className="max-w-xl flex flex-col gap-3">
                        {SAMPLE_RUNS.map((run) => (
                            <RoutineRunCard key={run.id} run={run} onStop={() => undefined} onRunAgain={() => undefined} />
                        ))}
                    </ol>
                </Section>

                <Section title="Routine form">
                    <div className="max-w-xl">
                        <RoutineForm preview values={routineForm} onChange={setRoutineForm} onCancel={() => undefined} onSaved={() => undefined} />
                    </div>
                </Section>

                <Section title="History">
                    <ul className="max-w-xl rounded-panel border bg-surface p-2">
                        <HistoryRow
                            entry={{ id: 1, url: 'https://en.wikipedia.org/wiki/Jackdaw', title: 'Jackdaw', favicon: null, visitedAt: Date.now() }}
                            onOpen={() => undefined}
                            onDelete={() => undefined}
                        />
                    </ul>
                </Section>

                <Section title="A page in trouble">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="h-72 rounded-panel border"><PageTrouble trouble="crashed" onReload={() => undefined} /></div>
                        <div className="h-72 rounded-panel border"><PageTrouble trouble="unresponsive" onReload={() => undefined} /></div>
                        <div className="h-72 rounded-panel border"><PageTrouble trouble={{ url: 'https://example.com/missing', description: 'ERR_NAME_NOT_RESOLVED' }} onReload={() => undefined} /></div>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-12 text-muted-foreground">
                        <TabIcon tab={{ page: null, favicon: null, isLoading: false, berryWorking: false, trouble: 'crashed' }} /> Its tab shows this until it’s reloaded.
                    </div>
                </Section>

                <Section title="Approval card">
                    <div className="max-w-sm">
                        <ApprovalCard
                            avatar={<Mascot mood="asking" size={32} />}
                            question={<>I’d like to open <strong className="font-semibold">github.com</strong> in a new tab</>}
                            exactly="Open https://github.com/acme/checkout/pull/412?diff=split in a new tab"
                            onConfirm={() => undefined}
                            onDeny={() => undefined}
                        />
                    </div>
                </Section>

                <Section title="Needs you">
                    <ul className="border-y divide-y">
                        {SAMPLE_WAITING.map((item) => <NeedsYouRow key={item.approval.id} item={item} onAnswered={() => undefined} />)}
                    </ul>
                </Section>

                <Section title="Site permission card">
                    <div className="max-w-sm flex flex-col gap-4">
                        <PermissionCard prompt={{ origin: 'https://example.com', permissions: ['camera', 'microphone'] }} onDecide={() => undefined} />
                        <PermissionCard prompt={{ origin: 'http://example.com:8080', permissions: ['screen'] }} onDecide={() => undefined} />
                    </div>
                </Section>

                <Section title="Downloads">
                    <div className="flex items-center gap-3">
                        <DownloadsProgress downloads={[]} />
                        <DownloadsProgress downloads={SAMPLE_DOWNLOADS.slice(0, 1)} />
                        <DownloadsProgress downloads={SAMPLE_DOWNLOADS.slice(1, 2)} />
                    </div>
                    <ul className="mt-4 rounded-panel border bg-surface divide-y overflow-hidden">
                        {SAMPLE_DOWNLOADS.map((download) => (
                            <DownloadRow key={download.id} download={download} onAction={() => undefined} />
                        ))}
                    </ul>
                </Section>

                <Section title="Bookmark button">
                    <div className="flex items-center gap-3">
                        <ToolBarButton Icon={Star} label="Bookmark this page" onClick={() => undefined} />
                        <ToolBarButton label="Remove bookmark" toggled className="bg-transparent hover:bg-transparent" onClick={() => undefined}>
                            <Star className="size-4 fill-current text-bookmark" />
                        </ToolBarButton>
                        <ToolBarButton Icon={Star} label="Bookmark this page (unavailable on internal pages)" active={false} />
                    </div>
                </Section>

                <Section title="Pin button">
                    <div className="flex items-center gap-3">
                        <ToolBarButton Icon={Pin} label="Pin this page" onClick={() => undefined} />
                        <ToolBarButton label="Unpin this page" toggled onClick={() => undefined}>
                            <Pin className="size-4 fill-current" />
                        </ToolBarButton>
                        <ToolBarButton Icon={Pin} label="Pin this page (unavailable on internal pages)" active={false} />
                    </div>
                </Section>

                <Section title="Zoom level">
                    <ZoomButton percent={125} onReset={() => undefined} />
                </Section>

                <Section title="Find bar">
                    <div className="flex flex-col gap-3 max-w-sm">
                        <FindBarCard glass={false} value="" onChange={() => undefined} result={null} onStep={() => undefined} onClose={() => undefined} />
                        <FindBarCard glass={false} value="berry" onChange={() => undefined} result={{ active: 2, total: 14 }} onStep={() => undefined} onClose={() => undefined} />
                        <FindBarCard glass={false} value="blueberry" onChange={() => undefined} result={{ active: 0, total: 0 }} onStep={() => undefined} onClose={() => undefined} />
                    </div>
                </Section>

                <Section title="Buttons">
                    <div className="flex flex-wrap items-center gap-3">
                        <Button>Primary</Button>
                        <Button variant="outline">Outline</Button>
                        <Button variant="ghost" className="text-muted-foreground">Quiet</Button>
                        <Button disabled>Disabled</Button>
                        <Button variant="destructive">Stop recording</Button>
                    </div>
                </Section>

                <Section title="Controls">
                    <div className="flex items-center gap-6">
                        <Switch label="Example switch" checked={on} onChange={setOn} />
                        <Choice
                            label="Example choice"
                            value={choice}
                            onChange={setChoice}
                            options={[
                                { value: 'one', label: 'One' },
                                { value: 'two', label: 'Two' }
                            ]}
                        />
                    </div>
                </Section>

                <Section title="Status">
                    <ul className="flex gap-6 text-13">
                        <li className="text-accent-ink">Running now</li>
                        <li className="text-success">Finished</li>
                        <li className="text-warning">Needs your OK</li>
                        <li className="text-destructive">Failed</li>
                    </ul>
                </Section>
            </div>
        </div>
    )
}
