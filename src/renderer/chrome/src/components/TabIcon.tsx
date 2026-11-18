import React from "react";
import type { InternalPage, TabInfo } from "@shared/ipc";
import {
  CircleAlert,
  Cloud,
  Compass,
  Component,
  Download,
  Eye,
  Hand,
  History,
  LayoutGrid,
  MessageCircle,
  RefreshCw,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Pips } from "@common/components/Pips";
import { useFlock } from "../contexts/LibraryContext";
import { Berry } from "./Berry";
import { Favicon } from "./Favicon";

// Your mascots has no icon here: its tab shows Berry.
const PAGE_ICONS: Record<Exclude<InternalPage, "flock">, LucideIcon> = {
  "new-tab": Compass,
  chat: MessageCircle,
  routines: RefreshCw,
  settings: Settings,
  downloads: Download,
  gallery: Component,
  history: History,
  "mascot-gallery": LayoutGrid,
  "needs-you": Hand,
  recording: Eye,
  cloud: Cloud,
};

// Every row in the sidebar starts with this, so their text lines up whatever the icon is, or with none.
export const LEADING_SLOT = "size-5 shrink-0 flex items-center justify-center";

// Internal pages have no favicon, so they show the same icon as their place in the sidebar. `still` holds a working
// mascot's face, where its row somewhere else already moves. `large` is a site's icon at 18px, as rows in the sidebar
// have it.
export const TabIcon: React.FC<{
  still?: boolean;
  large?: boolean;
  tab: Pick<TabInfo, "page" | "favicon" | "isLoading" | "berryWorking" | "trouble"> & {
    url?: string;
    workingMascotId?: string | null;
    loadError?: TabInfo["loadError"];
  };
}> = ({ tab, still, large }) => {
  const { find } = useFlock();
  if (tab.trouble)
    return (
      <CircleAlert
        aria-label={tab.trouble === "crashed" ? "Page crashed" : "Page not responding"}
        className="size-4 shrink-0 text-ask"
        strokeWidth={1.75}
      />
    );
  if (tab.loadError) return <CircleAlert aria-label="Page couldn’t load" className="size-4 shrink-0 text-ask" strokeWidth={1.75} />;
  if (tab.berryWorking)
    return <Berry mood="fetching" size={18} mascot={find(tab.workingMascotId ?? null)} className="-m-px" still={still} />;
  if (tab.isLoading)
    return (
      <span className="size-4 shrink-0 flex items-center justify-center text-ink-2">
        <Pips pattern="think" />
      </span>
    );
  if (!tab.page)
    return <Favicon src={tab.favicon} site={tab.url} className={large ? "size-[18px] rounded-[5px] text-[10px]" : undefined} />;
  if (tab.page === "flock") return <Berry size={18} className="-m-px" still />;
  const Icon = PAGE_ICONS[tab.page];
  return <Icon className="size-4 shrink-0 text-ink-2" strokeWidth={1.75} />;
};
