import React from 'react'
import { CircleAlert, Compass, Download, History, LayoutGrid, MessageCircle, RefreshCw, Settings } from 'lucide-react'
import type { InternalPage, TabInfo } from '@shared/ipc'
import { BerryDot } from '@common/components/Mascot'
import { Favicon } from './Favicon'

const PAGE_ICONS: Record<InternalPage, React.FC<{ className?: string }>> = {
    'new-tab': Compass,
    chat: MessageCircle,
    routines: RefreshCw,
    settings: Settings,
    downloads: Download,
    gallery: LayoutGrid,
    history: History
}

// Internal pages have no favicon, so they show the same icon as their place in the sidebar.
export const TabIcon: React.FC<{ tab: Pick<TabInfo, 'page' | 'favicon' | 'isLoading' | 'berryWorking' | 'trouble'> }> = ({ tab }) => {
    if (tab.trouble) return <CircleAlert aria-label={tab.trouble === 'crashed' ? 'Page crashed' : 'Page not responding'} className="size-4 shrink-0 text-warning" />
    if (tab.isLoading || tab.berryWorking) return <span className="size-4 shrink-0 flex items-center justify-center"><BerryDot working /></span>
    if (!tab.page) return <Favicon src={tab.favicon} />
    const Icon = PAGE_ICONS[tab.page]
    return <Icon className="size-4 shrink-0 text-muted-foreground" />
}
