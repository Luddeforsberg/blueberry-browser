import React from 'react'
import type { InternalPage, TabInfo } from '@shared/ipc'
import { CircleAlert, Cloud, Download, Eye, Feather, History, LayoutGrid, MessageCircle, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { BerryDot } from '@common/components/Mascot'
import { useFlock } from '../contexts/LibraryContext'
import { Berry } from './Berry'
import { Favicon } from './Favicon'
import { FlockIcon, ValleyIcon } from './icons'

const PAGE_ICONS: Record<InternalPage, React.FC<{ className?: string }>> = {
    'new-tab': ValleyIcon,
    chat: MessageCircle,
    routines: RefreshCw,
    settings: SlidersHorizontal,
    downloads: Download,
    gallery: LayoutGrid,
    history: History,
    flock: FlockIcon,
    'mascot-gallery': Feather,
    'needs-you': CircleAlert,
    recording: Eye,
    cloud: Cloud
}

// Every row in the sidebar starts with this, so their text lines up whatever the icon is, or with none.
export const LEADING_SLOT = 'size-5 shrink-0 flex items-center justify-center'

// Internal pages have no favicon, so they show the same icon as their place in the sidebar.
export const TabIcon: React.FC<{ tab: Pick<TabInfo, 'page' | 'favicon' | 'isLoading' | 'berryWorking' | 'trouble'> & { url?: string; workingMascotId?: string | null; loadError?: TabInfo['loadError'] } }> = ({ tab }) => {
    const { find } = useFlock()
    if (tab.trouble) return <CircleAlert aria-label={tab.trouble === 'crashed' ? 'Page crashed' : 'Page not responding'} className="size-4 shrink-0 text-warning" />
    if (tab.loadError) return <CircleAlert aria-label="Page couldn’t load" className="size-4 shrink-0 text-warning" />
    if (tab.berryWorking) return <Berry mood="fetching" size={18} mascot={find(tab.workingMascotId ?? null)} className="-m-px" />
    if (tab.isLoading) return <span className="size-4 shrink-0 flex items-center justify-center"><BerryDot working /></span>
    if (!tab.page) return <Favicon src={tab.favicon} site={tab.url} />
    const Icon = PAGE_ICONS[tab.page]
    return <Icon className="size-4 shrink-0 text-muted-foreground" />
}
