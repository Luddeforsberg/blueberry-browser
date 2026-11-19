import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, PanelRight, RotateCw, X } from "lucide-react";
import type { Popover } from "@shared/ipc";
import type { MascotProfile } from "@shared/library";
import { cn } from "@common/lib/utils";
import { useBrowser } from "../contexts/useBrowser";
import { useMascots, useLibrary } from "../contexts/useLibrary";
import { useShell } from "../contexts/useShell";
import { dockFaces, openMascots } from "../mascotsView";
import { AccountButton } from "./AccountMenu";
import { AddressBar } from "./AddressBar";
import { DownloadsButton } from "./DownloadsButton";
import { Favicon } from "./Favicon";
import { siteIcon } from "./siteIcon";
import { RecordingNotice } from "./ShowBerry";
import { DockMascot, SiteDragGhost } from "./Sidebar";
import { useMascotState } from "./useMascotState";
import { sameSite, savedSiteMenu } from "./savedSites";
import { ToolBarButton } from "./ToolBarButton";
import { SHORTCUTS } from "@shared/shortcuts";
import { ZoomButton } from "./Toolbar";
import { useSiteDrag, type SiteLayouts } from "./useSiteDrag";
import { Tooltip } from "@common/components/Tooltip";

// DESIGN.md section 10, Horizontal layout: one toolbar from edge to edge, then the bookmarks bar when anything's saved.

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-focus";
// The toolbar's buttons here are 28px, a little smaller than the vertical toolbar's.
const BUTTON = "size-7";
// The address field never gets narrower than this to make room for the dock's faces.
const ADDRESS_MIN = 320;
// A face's place in the dock and the space between two, and the dock's own padding.
const DOCK_FACE = 24;
const DOCK_GAP = 4;
const DOCK_PADDING = 16;

// What's open over the page, as main says. What opened it gets the keyboard back when it closes with Escape.
let opener: HTMLElement | null = null;
const usePopover = (): Popover | null => {
  const [shown, setShown] = useState<Popover | null>(null);
  useEffect(
    () =>
      window.chromeAPI.layout.onPopover(({ shown: next, refocus }) => {
        setShown(next);
        if (!next && refocus) opener?.focus();
      }),
    [],
  );
  return shown;
};

const toggle = (isThis: boolean, button: HTMLElement, open: () => Popover) => {
  if (isThis) return void window.chromeAPI.layout.closePopover(true);
  opener = button;
  void window.chromeAPI.layout.openPopover(open());
};

const anchorOf = (element: HTMLElement) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
};

// The sidebar's Chats face, opened over the page. The dot says something needs you.
const ChatsPill: React.FC<{ shown: Popover | null }> = ({ shown }) => {
  const waiting = useLibrary().needsYou.length;
  const open = shown?.kind === "chats";
  return (
    <button
      type="button"
      data-popover-opener
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => toggle(open, event.currentTarget, () => ({ kind: "chats", anchor: anchorOf(event.currentTarget) }))}
      className={cn(
        "press h-[30px] ml-1 px-[11px] shrink-0 flex items-center gap-[7px] rounded-row text-13 text-ink app-region-no-drag",
        open ? "bg-sheet shadow-rim font-medium" : "bg-tray hover:bg-press",
        FOCUS,
      )}
    >
      Chats
      {waiting > 0 && <span aria-hidden className="size-1.5 rounded-full bg-ask" />}
      {waiting > 0 && (
        <span className="sr-only">
          , {waiting} {waiting === 1 ? "needs" : "need"} you
        </span>
      )}
    </button>
  );
};

// Every mascot's face, as in the sidebar's dock. Pressing one opens its card over the page. When they don't all fit,
// the dock folds to the chosen one, any that are asking or working, and a count of the rest, which opens the mascots' page.
const Dock: React.FC<{ shown: Popover | null; room: number }> = ({ shown, room }) => {
  const { mascots, chosen } = useMascots();
  const stateOf = useMascotState();
  const busy = (mascot: MascotProfile) => stateOf(mascot).mood !== "rest";
  const others = mascots.filter((mascot) => mascot.id !== chosen.id);
  const faces = room >= mascots.length ? { shown: mascots, more: 0 } : dockFaces([chosen, ...others], 2 + others.filter(busy).length, busy);
  return (
    <ul aria-label="Your mascots" className="h-[34px] ml-1 mr-0.5 px-2 shrink-0 flex items-center gap-1 rounded-tile bg-tray">
      {faces.shown.map((mascot) => {
        const open = shown?.kind === "mascot" && shown.mascotId === mascot.id;
        return (
          <li key={mascot.id} className="shrink-0" data-popover-opener>
            <DockMascot
              small
              mascot={mascot}
              mood={stateOf(mascot).mood}
              open={open}
              onPress={(button) => toggle(open, button, () => ({ kind: "mascot", mascotId: mascot.id, anchor: anchorOf(button) }))}
            />
          </li>
        );
      })}
      {faces.more > 0 && (
        <li className="shrink-0">
          <Tooltip words="All your mascots">
            <button
              type="button"
              aria-label={`${faces.more} more ${faces.more === 1 ? "mascot" : "mascots"}`}
              onClick={() => openMascots({ page: "list" })}
              className={cn(
                "press h-6 px-1 flex items-center rounded-[7px] font-mono text-11 text-ink-3 hover:bg-hover hover:text-ink app-region-no-drag",
                FOCUS,
              )}
            >
              +{faces.more}
            </button>
          </Tooltip>
        </li>
      )}
    </ul>
  );
};

const BAR_LAYOUTS: SiteLayouts = { favourites: "tiles", bookmarks: "tiles" };

// A saved site on the bar: its icon and its name, cut where a long one would crowd the rest.
const SAVED_SITE =
  "press h-7 max-w-[180px] px-2 flex items-center gap-2 rounded-row text-13 whitespace-nowrap app-region-no-drag hover:bg-hover hover:text-ink";

// Favourites, then a hairline, then bookmarks, each its icon and its name with nothing behind it, as a bookmarks bar
// is anywhere. The favourite in front is in `ink`. Dragging between the two and the right-click menus work as in the
// sidebar.
const BookmarksBar: React.FC = () => {
  const { pinned, bookmarks } = useLibrary();
  const { activeTab, tabs, createTab, switchTab } = useBrowser();
  const dragging = useSiteDrag((id, list, index) => void window.chromeAPI.library.placeSavedSite(id, list, index), BAR_LAYOUTS);
  const { drag, start, zone } = dragging;
  const shown = bookmarks.filter((bookmark) => !pinned.some((pin) => pin.url === bookmark.url));
  const dropPlace = pinned.length === 0 && drag?.from === "bookmarks";

  return (
    <div
      // Too many still scroll, by trackpad or an ordinary wheel, and the one cut off at the edge says there's more.
      onWheel={(event) => {
        if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY;
      }}
      className="h-10 shrink-0 flex items-center gap-0.5 px-2 pb-2.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
    >
      {pinned.length > 0 ? (
        <ul ref={zone("favourites")} aria-label="Favourites" className="shrink-0 flex items-center gap-0.5">
          {pinned.map((site) => {
            const selected = !!activeTab && !activeTab.page && sameSite(activeTab.url, site.url);
            return (
              <li key={site.id} data-saved-site={site.id} onDragStart={(event) => event.preventDefault()}>
                <Tooltip words={site.title} whenCut>
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
                    className={cn(SAVED_SITE, selected ? "text-ink" : "text-ink-2", drag?.site.id === site.id && "opacity-40", FOCUS)}
                  >
                    <Favicon src={site.favicon ?? siteIcon(site.url)} site={site.url} className="size-4 rounded-[4px]" />
                    <span className="truncate">{site.title}</span>
                  </button>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      ) : (
        dropPlace && (
          <div
            ref={zone("favourites")}
            className={cn(
              "h-7 px-2 shrink-0 flex items-center rounded-row border border-dashed text-13 transition-colors",
              drag.over?.list === "favourites" ? "border-ink-3 bg-hover text-ink" : "border-line text-ink-3",
            )}
          >
            Drop to keep on top
          </div>
        )
      )}
      {(pinned.length > 0 || dropPlace) && shown.length > 0 && <span aria-hidden className="w-px h-3.5 mx-[7px] shrink-0 bg-line" />}
      <ul ref={zone("bookmarks")} aria-label="Bookmarks" className="min-w-0 flex items-center gap-0.5">
        {shown.map((site) => (
          <li key={site.id} data-saved-site={site.id} className="shrink-0" onDragStart={(event) => event.preventDefault()}>
            <Tooltip words={site.title} whenCut>
              <button
                type="button"
                onPointerDown={(event) => start(event, site, "bookmarks")}
                onClick={() => createTab(site.url)}
                onContextMenu={(event) => savedSiteMenu(event, site)}
                className={cn(SAVED_SITE, "text-ink-2", drag?.site.id === site.id && "opacity-40", FOCUS)}
              >
                <Favicon src={site.favicon ?? siteIcon(site.url)} site={site.url} className="size-4 rounded-[4px]" />
                <span className="truncate">{site.title}</span>
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
      <SiteDragGhost drag={drag} />
    </div>
  );
};

export const HorizontalToolbar: React.FC = () => {
  const { activeTab, goBack, goForward, reload, stop } = useBrowser();
  const { layout, toggleChat } = useShell();
  const shown = usePopover();
  const row = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(Infinity);

  // As many faces as fit with the address field at its narrowest: the row, less everything but the field and the dock.
  // Measured again after every render, since what's in the row changes, and whenever the row is resized.
  const measure = () => {
    const element = row.current;
    if (!element) return;
    const { paddingLeft, paddingRight, columnGap } = getComputedStyle(element);
    const children = [...element.children] as HTMLElement[];
    const fixed = children.filter((child) => !child.dataset.flex).reduce((sum, child) => sum + child.offsetWidth, 0);
    const gaps = (children.length - 1) * parseFloat(columnGap || "0");
    const spare = element.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight) - fixed - gaps - ADDRESS_MIN - DOCK_PADDING;
    setRoom(Math.max(1, Math.floor((spare + DOCK_GAP) / (DOCK_FACE + DOCK_GAP))));
  };
  useLayoutEffect(measure);
  useEffect(() => {
    const observer = new ResizeObserver(() => measure());
    if (row.current) observer.observe(row.current);
    return () => observer.disconnect();
  }, []);

  // A press anywhere else in the chrome closes what's open over the page. What opened it toggles it itself.
  useEffect(() => {
    if (!shown) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-popover-opener]")) void window.chromeAPI.layout.closePopover(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [shown]);

  return (
    <div className="h-full flex flex-col">
      {/* Off a Mac, the app's menu ends the row, where the layout puts it, so the row stops short of it. */}
      <div
        ref={row}
        className="h-11 shrink-0 flex items-center gap-1 pl-2 app-region-drag has-[input:focus]:[-webkit-app-region:no-drag]"
        style={{ paddingRight: layout.menuButton.width > 0 ? layout.toolbar.width - layout.menuButton.x + 4 : 8 }}
      >
        <ToolBarButton
          Icon={ChevronLeft}
          label="Back"
          shortcut={SHORTCUTS.back}
          onClick={goBack}
          active={activeTab?.canGoBack ?? false}
          className={BUTTON}
        />
        <ToolBarButton
          Icon={ChevronRight}
          label="Forward"
          shortcut={SHORTCUTS.forward}
          onClick={goForward}
          active={activeTab?.canGoForward ?? false}
          className={BUTTON}
        />
        {activeTab?.isLoading ? (
          <ToolBarButton Icon={X} label="Stop loading" onClick={stop} className={BUTTON} />
        ) : (
          <ToolBarButton
            Icon={RotateCw}
            label="Reload"
            shortcut={SHORTCUTS.reload}
            onClick={reload}
            active={activeTab !== null && !activeTab.page}
            className={BUTTON}
          />
        )}
        <div data-flex="address" className="flex-1 min-w-0 mx-1.5">
          <AddressBar />
        </div>
        <RecordingNotice className="mx-1 app-region-no-drag" />
        {activeTab && activeTab.zoomPercent !== 100 && (
          <ZoomButton percent={activeTab.zoomPercent} onReset={() => void window.chromeAPI.browser.resetZoom(activeTab.id)} />
        )}
        <DownloadsButton small />
        {activeTab?.page !== "chat" && activeTab?.page !== "new-tab" && (
          <ToolBarButton
            Icon={PanelRight}
            label={layout.chatOpen ? "Hide Berry" : "Show Berry"}
            shortcut={SHORTCUTS.chat}
            onClick={toggleChat}
            toggled={layout.chatOpen}
            className={BUTTON}
          />
        )}
        <ChatsPill shown={shown} />
        <div data-flex="dock" className="shrink-0 flex">
          <Dock shown={shown} room={room} />
        </div>
        <span data-popover-opener className="shrink-0 ml-1 flex">
          <AccountButton
            small
            open={shown?.kind === "account"}
            onPress={(button) => toggle(shown?.kind === "account", button, () => ({ kind: "account", anchor: anchorOf(button) }))}
          />
        </span>
      </div>
      {layout.toolbar.height > layout.addressRow.height && <BookmarksBar />}
    </div>
  );
};
