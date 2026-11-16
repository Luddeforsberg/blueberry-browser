import React from 'react'
import type { InternalPage, TabInfo } from '@shared/ipc'
import { CircleAlert, Cloud, Compass, Download, Eye, Feather, Hand, History, LayoutGrid, MessageCircle, RefreshCw, Settings } from 'lucide-react'
import { Pips } from '@common/components/Pips'
import { useFlock } from '../contexts/LibraryContext'
import { Berry } from './Berry'
import { Favicon } from './Favicon'

// Your mascots has no icon here: its tab shows Berry.
const PAGE_ICONS: Record<Exclude<InternalPage, 'flock'>, React.FC<{ className?: string }>> = {
    'new-tab': Compass,
    chat: MessageCircle,
    routines: RefreshCw,
    settings: Settings,
    downloads: Download,
    gallery: LayoutGrid,
    history: History,
    'mascot-gallery': Feather,
    'needs-you': Hand,
    recording: Eye,
    cloud: Cloud
}

// Every row in the sidebar starts with this, so their text lines up whatever the icon is, or with none.
export const LEADING_SLOT = 'size-5 shrink-0 flex items-center justify-center'

// Internal pages have no favicon, so they show the same icon as their place in the sidebar. `still` holds a working
// mascot's face, where its row somewhere else already moves.
export const TabIcon: React.FC<{ still?: boolean; tab: Pick<TabInfo, 'page' | 'favicon' | 'isLoading' | 'berryWorking' | 'trouble'> & { url?: string; workingMascotId?: string | null; loadError?: TabInfo['loadError'] } }> = ({ tab, still }) => {
    const { find } = useFlock()
    if (tab.trouble) return <CircleAlert aria-label={tab.trouble === 'crashed' ? 'Page crashed' : 'Page not responding'} className="size-4 shrink-0 text-ask" />
    if (tab.loadError) return <CircleAlert aria-label="Page couldn’t load" className="size-4 shrink-0 text-ask" />
    if (tab.berryWorking) return <Berry mood="fetching" size={18} mascot={find(tab.workingMascotId ?? null)} className="-m-px" still={still} />
    if (tab.isLoading) return <span className="size-4 shrink-0 flex items-center justify-center text-ink-2"><Pips pattern="think" /></span>
    if (!tab.page) return <Favicon src={tab.favicon} site={tab.url} />
    if (tab.page === 'flock') return <Berry size={18} className="-m-px" still />
    const Icon = PAGE_ICONS[tab.page]
    return <Icon className="size-4 shrink-0 text-ink-2" />
}
