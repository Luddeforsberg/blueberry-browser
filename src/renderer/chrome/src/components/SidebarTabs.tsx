import React, { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Favicon } from "./Favicon";
import { siteIcon } from "./siteIcon";
import { useBrowser } from "../contexts/useBrowser";
import { useLibrary } from "../contexts/useLibrary";
import { Tabs } from "./Tabs";
import { useSiteDrag } from "./useSiteDrag";
import { cn } from "@common/lib/utils";
import { SHORTCUTS } from "@shared/shortcuts";
import { Tooltip } from "@common/components/Tooltip";
import { sameSite, savedSiteMenu } from "./savedSites";
import { FOCUS, ROW, LEAD, SITE_ICON, CURRENT } from "./sidebarRows";
import { Label, LabelButton, Rule } from "./SidebarLabels";

// --- Tabs -----------------------------------------------------------------------------------------------------------

export type SiteDragging = ReturnType<typeof useSiteDrag>;

// Bookmarks kept on top, as tiles four to a row. The one whose site is in front looks selected, like the tab, and
// pressing one goes to its tab if it's open. With none, there's nothing here, until a bookmark is dragged up.
const Favourites: React.FC<{ dragging: SiteDragging }> = ({ dragging: { drag, start, zone } }) => {
  const { pinned } = useLibrary();
  const { activeTab, tabs, createTab, switchTab } = useBrowser();

  if (pinned.length === 0) {
    if (drag?.from !== "bookmarks") return null;
    return (
      <div
        ref={zone("favourites")}
        className={cn(
          "h-10 mb-1.5 flex items-center justify-center rounded-tile border border-dashed text-13 transition-colors",
          drag.over?.list === "favourites" ? "border-ink-3 bg-hover text-ink" : "border-line text-ink-3",
        )}
      >
        Drop to keep on top
      </div>
    );
  }

  return (
    <ul ref={zone("favourites")} aria-label="Favourites" className="grid grid-cols-4 gap-1.5 mb-1.5">
      {pinned.map((site) => {
        const selected = !!activeTab && !activeTab.page && sameSite(activeTab.url, site.url);
        return (
          <li key={site.id} data-saved-site={site.id} onDragStart={(event) => event.preventDefault()}>
            <Tooltip words={site.title}>
              <button
                type="button"
                aria-label={site.title}
                aria-current={selected ? "page" : undefined}
                onPointerDown={(event) => start(event, site, "favourites")}
                onClick={() => {
                  const open = tabs.find((tab) => !tab.page && sameSite(tab.url, site.url));
                  if (open) void switchTab(open.id);
                  else void createTab(site.url);
                }}
                onContextMenu={(event) => savedSiteMenu(event, site)}
                className={cn(
                  "press w-full h-10 flex items-center justify-center rounded-tile app-region-no-drag",
                  selected ? CURRENT : "bg-tray hover:bg-press",
                  drag?.site.id === site.id && "opacity-40",
                  FOCUS,
                )}
              >
                <Favicon src={site.favicon ?? siteIcon(site.url)} site={site.url} className="size-[22px] rounded-[6px] text-[12px]" />
              </button>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
};

// Bookmarks not kept on top, in a section that folds. With nothing saved it keeps its place and says so.
const Bookmarks: React.FC<{ dragging: SiteDragging }> = ({ dragging: { drag, start, zone } }) => {
  const { pinned, bookmarks } = useLibrary();
  const { createTab } = useBrowser();
  const [open, setOpen] = useState(true);
  const shown = bookmarks.filter((bookmark) => !pinned.some((pin) => pin.url === bookmark.url));

  return (
    <section ref={zone("bookmarks")} aria-labelledby="sidebar-bookmarks">
      <Label
        id="sidebar-bookmarks"
        trailing={
          <LabelButton label={open ? "Fold bookmarks" : "Show bookmarks"} onClick={() => setOpen(!open)}>
            {open ? <ChevronDown className="size-3.5" strokeWidth={1.75} /> : <ChevronRight className="size-3.5" strokeWidth={1.75} />}
          </LabelButton>
        }
      >
        Bookmarks
      </Label>
      {open &&
        (shown.length === 0 ? (
          <ul aria-label="Bookmarks">
            <li className="h-8 px-2 flex items-center text-13 text-faint">Bookmark a page to keep it here.</li>
          </ul>
        ) : (
          <ul aria-label="Bookmarks">
            {shown.map((site) => (
              <li key={site.id} data-saved-site={site.id} onDragStart={(event) => event.preventDefault()}>
                <Tooltip words={site.title} whenCut>
                  <button
                    type="button"
                    onPointerDown={(event) => start(event, site, "bookmarks")}
                    onClick={() => createTab(site.url)}
                    onContextMenu={(event) => savedSiteMenu(event, site)}
                    className={cn(ROW, "hover:bg-hover", drag?.site.id === site.id && "opacity-40")}
                  >
                    <span className={LEAD}>
                      <Favicon src={site.favicon ?? siteIcon(site.url)} site={site.url} className={SITE_ICON} />
                    </span>
                    <span className="flex-1 truncate">{site.title}</span>
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
};

// What follows the pointer while a saved site is dragged, and the line where it would land. Fixed, so neither moves
// anything else.
export const SiteDragGhost: React.FC<{ drag: SiteDragging["drag"] }> = ({ drag }) => {
  const { pinned } = useLibrary();
  if (!drag) return null;
  // The empty place on top lights up instead.
  const mark = drag.over && !(drag.over.list === "favourites" && pinned.length === 0) ? drag.over.mark : null;
  return (
    <>
      {mark && (
        <div
          aria-hidden
          className="fixed z-50 rounded-full bg-ink pointer-events-none"
          style={{ left: mark.left, top: mark.top, width: mark.right - mark.left, height: mark.bottom - mark.top }}
        />
      )}
      <div
        aria-hidden
        className="fixed z-50 h-8 max-w-[200px] px-2 flex items-center gap-2.5 rounded-[10px] bg-sheet shadow-lift text-14 text-ink pointer-events-none"
        style={{ left: drag.x + 10, top: drag.y + 6 }}
      >
        <Favicon src={drag.site.favicon ?? siteIcon(drag.site.url)} site={drag.site.url} className={SITE_ICON} />
        <span className="truncate">{drag.site.title}</span>
      </div>
    </>
  );
};

export const TabsFace: React.FC = () => {
  const { tabs, createTab } = useBrowser();
  const dragging = useSiteDrag((id, list, index) => void window.chromeAPI.library.placeSavedSite(id, list, index));
  return (
    <>
      <Favourites dragging={dragging} />
      <Bookmarks dragging={dragging} />
      <SiteDragGhost drag={dragging.drag} />
      <Rule />
      <section aria-labelledby="sidebar-tabs">
        <Label
          id="sidebar-tabs"
          trailing={
            <>
              <span className="tabular-nums" aria-label={`${tabs.length} open`}>
                {tabs.length}
              </span>
              <LabelButton label="New tab" shortcut={SHORTCUTS.newTab} onClick={() => createTab()}>
                <Plus className="size-4" strokeWidth={1.75} />
              </LabelButton>
            </>
          }
        >
          Tabs
        </Label>
        <Tabs mode="vertical" label="Tabs" showNew={false} />
      </section>
    </>
  );
};
