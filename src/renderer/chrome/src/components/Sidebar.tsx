import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Cloud, Ellipsis, PanelLeft, Plus } from "lucide-react";
import { Favicon } from "./Favicon";
import { siteIcon } from "./siteIcon";
import type { ChatThreadSummary, MascotProfile, Routine } from "@shared/library";
import type { MenuAnchor } from "@shared/ipc";
import { atPointer, underBox } from "./menuAnchors";
import { holdWhile } from "../menuHold";
import { useBrowser } from "../contexts/useBrowser";
import { useFlock, useLibrary } from "../contexts/useLibrary";
import { useShell } from "../contexts/useShell";
import { Tabs } from "./Tabs";
import { useSiteDrag } from "./useSiteDrag";
import { ToolBarButton } from "./ToolBarButton";
import { Pips } from "@common/components/Pips";
import { LABEL } from "@common/components/StatusPill";
import { buttonVariants } from "@common/components/buttonVariants";
import { cn } from "@common/lib/utils";
import { Berry } from "./Berry";
import { useAssistantName } from "./useAssistantName";
import { limitsInBrief, rowTime } from "../shortWords";
import { openRoutines } from "../routinesView";
import { dockFaces, openMascots } from "../flockView";
import { AccountButton, AccountMenu } from "./AccountMenu";
import { SegmentSwitch } from "./SegmentSwitch";
import { usePresence } from "@common/components/motion";
import { SHORTCUTS } from "@shared/shortcuts";
import { Tooltip } from "@common/components/Tooltip";
import { sameSite, savedSiteMenu } from "./savedSites";
import { useMascotState } from "./useMascotState";

// DESIGN.md section 10, Sidebar: straight on the ground, with two faces and the dock under both.

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-focus";
const ROW = cn(
  "w-full h-8 px-2 flex items-center gap-2.5 rounded-[10px] text-14 text-ink text-left transition-colors app-region-no-drag",
  FOCUS,
);
// A row's own slot for its icon or face, so titles line up whatever starts the row.
const LEAD = "size-5 shrink-0 flex items-center justify-center text-ink-2";
const ICON = "size-4 shrink-0";
// A site's icon in a row.
const SITE_ICON = "size-[18px] rounded-[5px] text-[10px]";
// The row in front, and the favourite whose site it is: a sheet lifted with `up`.
const CURRENT = "bg-sheet text-ink shadow-up";
const EARLIER_SHOWN = 8;

// Section labels: words with a capital, 12px medium in ink-2. `trailing` sits at the right, such as a count in mono or
// an arrow.
const Label: React.FC<{ id?: string; ask?: boolean; trailing?: React.ReactNode; children: React.ReactNode }> = ({
  id,
  ask,
  trailing,
  children,
}) => (
  <h2 id={id} className={cn("h-7 mt-1.5 mx-2 flex items-center gap-1.5", LABEL, ask && "text-ask")}>
    {children}
    {trailing && <span className="ml-auto flex items-center gap-2 font-mono text-11.5 font-regular text-ink-3">{trailing}</span>}
  </h2>
);

// A small icon button in a label, such as the new tab plus or the arrow that opens a page.
const LabelButton: React.FC<{ label: string; shortcut?: string; onClick: () => void; children: React.ReactNode }> = ({
  label,
  shortcut,
  onClick,
  children,
}) => (
  <Tooltip words={label} shortcut={shortcut}>
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "press size-6 -mr-1.5 flex items-center justify-center rounded-[7px] text-faint hover:bg-hover hover:text-ink app-region-no-drag",
        FOCUS,
      )}
    >
      {children}
    </button>
  </Tooltip>
);

const Rule: React.FC = () => <div aria-hidden className="h-px mx-1.5 my-2 bg-line" />;

// A tick for rows that say when: every second while something is going, since that counts seconds, and otherwise
// often enough for minutes.
const useTick = (going: boolean) => {
  const [, setNow] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), going ? 1000 : 30_000);
    return () => window.clearInterval(timer);
  }, [going]);
};

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
                  else createTab(site.url);
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

const TabsFace: React.FC = () => {
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

// --- Chats ----------------------------------------------------------------------------------------------------------

const openChat = (chat: Pick<ChatThreadSummary, "id" | "title">) =>
  void window.chromeAPI.browser.openPage("chat", { param: chat.id, title: chat.title });
// Named in the page's param, which also works from Chats over a page, where this runs in the overlay's view.
const openRoutine = (routine: Pick<Routine, "id">) => openRoutines({ page: "routine", id: routine.id });

// A chat in the sidebar. The row is the button. Its menu, from a right click or the quiet ⋯ that takes the place of
// what's at its end on the row you're on, renames or deletes it.
export const ChatRow: React.FC<{
  chat: ChatThreadSummary;
  selected: boolean;
  onOpen: () => void;
  // What's said at the right: a time, the dot of a chat that's new, or nothing.
  trailing?: React.ReactNode;
  // Done and not opened yet: its name in medium.
  fresh?: boolean;
}> = ({ chat, selected, onOpen, trailing, fresh = false }) => {
  const [editing, setEditing] = useState(false);
  // Enter and Escape end editing before the input's blur arrives, and that blur mustn't save again.
  const finished = useRef(false);
  const api = window.chromeAPI.chat;
  const { find } = useFlock();
  const mascot = find(chat.mascotId);
  const name = useAssistantName(mascot);

  const showMenu = async (anchor: MenuAnchor) => {
    if ((await holdWhile(api.showMenu(chat.id, anchor))) === "rename") {
      finished.current = false;
      setEditing(true);
    }
  };

  const finish = (title: string | null) => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    if (title !== null && title.trim() !== chat.title) void api.rename(chat.id, title);
  };

  if (editing) {
    return (
      <li>
        <input
          aria-label="Chat name"
          defaultValue={chat.title}
          maxLength={100}
          autoFocus
          onFocus={(event) => event.target.select()}
          onBlur={(event) => finish(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") finish(event.currentTarget.value);
            if (event.key === "Escape") finish(null);
          }}
          className={cn(ROW, CURRENT)}
        />
      </li>
    );
  }

  return (
    <li
      className="group/chat relative"
      onContextMenu={(event) => {
        event.preventDefault();
        void showMenu(atPointer(event));
      }}
    >
      <Tooltip words={chat.title} whenCut>
        <button
          type="button"
          aria-current={selected ? "page" : undefined}
          onClick={onOpen}
          className={cn(ROW, "pr-8", selected ? CURRENT : "hover:bg-hover")}
        >
          {/* The row is named by its chat, so the face is left out of it and the mascot comes after. */}
          <span aria-hidden className={LEAD}>
            <Berry mood={chat.running ? "fetching" : "rest"} size={20} mascot={mascot} />
          </span>
          <span className={cn("flex-1 truncate", fresh && "font-medium")}>{chat.title}</span>
          <span className="sr-only">
            {chat.running ? `, ${name} is working` : `, with ${name}`}
            {fresh && ", new"}
          </span>
          {chat.cloud && <Cloud role="img" aria-label="In the cloud" className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />}
          {trailing && (
            <span className="-mr-6 shrink-0 flex items-center font-mono text-11.5 text-ink-3 tabular-nums group-hover/chat:invisible group-focus-within/chat:invisible">
              {trailing}
            </span>
          )}
        </button>
      </Tooltip>
      <Tooltip words="More options">
        <button
          type="button"
          aria-label={`More options for ${chat.title}`}
          onClick={(event) => void showMenu(underBox(event.currentTarget))}
          className={cn(
            "press absolute right-1 top-1 size-6 flex items-center justify-center rounded-[7px] text-ink-3 app-region-no-drag",
            "opacity-0 group-hover/chat:opacity-100 group-focus-within/chat:opacity-100 hover:bg-hover hover:text-ink",
            FOCUS,
          )}
        >
          <Ellipsis className={ICON} strokeWidth={1.75} />
        </button>
      </Tooltip>
    </li>
  );
};

// Also what Chats opens over the page in the horizontal layout, so the two are one list. There it's on a sheet already,
// so what needs you sits on `sheet-2` rather than a sheet of its own. A group with nothing in it isn't shown.
export const ChatsFace: React.FC<{ onSheet?: boolean }> = ({ onSheet = false }) => {
  const library = useLibrary();
  const { find } = useFlock();
  const { activeTab, createTab } = useBrowser();
  const [allEarlier, setAllEarlier] = useState(false);
  const browser = window.chromeAPI.browser;

  const isOpen = (id: string) => activeTab?.page === "chat" && activeTab.pageParam === id;
  const asking = new Set(library.needsYou.map(({ id }) => id));
  const working = library.chats.filter((chat) => chat.running && !asking.has(chat.id));
  const ended = library.chats.filter((chat) => !chat.running && !asking.has(chat.id));
  // Finished while the user was somewhere else, until they open it.
  const done = ended.filter((chat) => chat.unseen);
  const earlier = ended.filter((chat) => !chat.unseen);
  // The next three by time: what runs soonest, then any paused.
  const routines = [...library.routines]
    .sort((a, b) => (a.paused ? Infinity : (a.nextRunAt ?? Infinity)) - (b.paused ? Infinity : (b.nextRunAt ?? Infinity)))
    .slice(0, 3);
  useTick(working.length > 0);

  return (
    <>
      <button type="button" onClick={() => createTab()} className={cn(ROW, "text-ink-2 hover:bg-hover hover:text-ink")}>
        <span className={LEAD}>
          <Plus className={ICON} strokeWidth={1.75} />
        </span>
        New chat
      </button>
      {library.chats.length === 0 && library.needsYou.length === 0 && (
        <p className="px-2 py-1.5 text-13 text-faint">Chats and jobs show up here.</p>
      )}

      {library.needsYou.length > 0 && (
        <section aria-labelledby="sidebar-needs-you">
          <Label
            id="sidebar-needs-you"
            ask
            trailing={
              <>
                <span className="tabular-nums">{library.needsYou.length}</span>
                <LabelButton label="Open Needs you" onClick={() => void browser.openPage("needs-you")}>
                  <ChevronRight className="size-3.5" strokeWidth={1.75} />
                </LabelButton>
              </>
            }
          >
            Needs you
          </Label>
          {/* Each row is the button that opens the job at its card, with the asking pips at its end. */}
          <ul className="flex flex-col gap-0.5">
            {library.needsYou.map((item) => {
              const mascot = find(item.mascotId);
              return (
                <li key={item.id}>
                  <Tooltip words={item.job} whenCut>
                    <button
                      type="button"
                      aria-label={`Review ${item.job}`}
                      onClick={() => (item.routineId ? openRoutine({ id: item.routineId }) : openChat({ id: item.id, title: item.job }))}
                      className={cn(
                        ROW,
                        "bridged",
                        onSheet
                          ? "bg-sheet-2 hover:bg-press"
                          : "bg-sheet shadow-chip hover:[background-image:linear-gradient(var(--hover),var(--hover))]",
                      )}
                    >
                      <span className={LEAD}>
                        <Berry mood="asking" size={20} mascot={mascot} />
                      </span>
                      <span className="flex-1 truncate">{item.job}</span>
                      <Pips pattern="waiting" className="text-ask" still />
                    </button>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {working.length > 0 && (
        <section aria-labelledby="sidebar-working">
          <Label id="sidebar-working">Working</Label>
          <ul>
            {working.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                selected={isOpen(chat.id)}
                onOpen={() => openChat(chat)}
                trailing={rowTime(chat.updatedAt, { going: true })}
              />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section aria-labelledby="sidebar-done">
          <Label id="sidebar-done" trailing={<span className="tabular-nums">{done.length} new</span>}>
            Done
          </Label>
          <ul>
            {done.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                selected={isOpen(chat.id)}
                onOpen={() => openChat(chat)}
                fresh
                trailing={<span aria-hidden className="size-1.5 mx-1 rounded-full bg-focus" />}
              />
            ))}
          </ul>
        </section>
      )}

      {routines.length > 0 && (
        <section aria-labelledby="sidebar-routines">
          <Label
            id="sidebar-routines"
            trailing={
              <LabelButton label="Open Routines" onClick={() => void browser.openPage("routines")}>
                <ChevronRight className="size-3.5" strokeWidth={1.75} />
              </LabelButton>
            }
          >
            Routines
          </Label>
          <ul>
            {routines.map((routine) => (
              <li key={routine.id}>
                <Tooltip words={routine.name} whenCut>
                  <button type="button" onClick={() => openRoutine(routine)} className={cn(ROW, "hover:bg-hover")}>
                    <span className={LEAD}>
                      <Berry mood={routine.status === "running" ? "fetching" : "rest"} size={20} mascot={find(routine.mascotId)} />
                    </span>
                    <span className="flex-1 truncate">{routine.name}</span>
                    {/* A run ended since Routines was last opened, which may be one that couldn't finish. */}
                    {routine.unseen ? (
                      <span className="shrink-0 font-mono text-11.5 text-ink">
                        news<span className="sr-only">. Has news</span>
                      </span>
                    ) : (
                      <span className="shrink-0 font-mono text-11.5 text-ink-3 tabular-nums">
                        {routine.paused ? "paused" : routine.nextRunAt ? rowTime(routine.nextRunAt) : ""}
                      </span>
                    )}
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        </section>
      )}

      {earlier.length > 0 && (
        <section aria-labelledby="sidebar-earlier">
          <Label id="sidebar-earlier">Earlier</Label>
          <ul>
            {(allEarlier ? earlier : earlier.slice(0, EARLIER_SHOWN)).map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                selected={isOpen(chat.id)}
                onOpen={() => openChat(chat)}
                trailing={rowTime(chat.updatedAt)}
              />
            ))}
          </ul>
          {!allEarlier && earlier.length > EARLIER_SHOWN && (
            <button type="button" onClick={() => setAllEarlier(true)} className={cn(ROW, "text-ink-2 hover:bg-hover hover:text-ink")}>
              <span className={LEAD} />
              Show more
            </button>
          )}
        </section>
      )}
    </>
  );
};

// --- The dock -------------------------------------------------------------------------------------------------------

// Pressing a mascot in the dock opens this: who it is, what it may do, what it's doing, and a way to start a chat with
// it. It shows, it doesn't choose. In the sidebar it sits above the dock; over the page, where `className` places it.
export const MascotCard: React.FC<{ mascot: MascotProfile; onClose: () => void; className?: string }> = ({
  mascot,
  onClose,
  className = "absolute inset-x-0 bottom-[54px] z-20",
}) => {
  const stateOf = useMascotState();
  const { mood, asking, running, recent } = stateOf(mascot);
  useTick(running.length > 0);
  const name = useAssistantName(mascot);
  const { choose } = useFlock();
  const { createTab } = useBrowser();
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    card.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);

  const line = "h-8 flex items-center gap-2.5 px-1 text-14 text-ink-2 rounded-row text-left w-full";
  return (
    <div
      ref={card}
      role="dialog"
      aria-label={name}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className={cn(
        className,
        "p-3 rounded-sheet bg-sheet text-ink shadow-lift animate-[fade-in_150ms_cubic-bezier(.2,.8,.2,1)] app-region-no-drag",
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* Still, as only the working mascot's own row moves in the sidebar. */}
        <Berry mood={mood} size={36} mascot={mascot} still />
        <span className="min-w-0">
          <span className="block font-medium truncate">{name}</span>
          <span className="block text-13 text-ink-2">{limitsInBrief(mascot)}</span>
        </span>
      </div>
      <div aria-hidden className="h-px mt-2.5 mb-1 bg-line" />
      <ul>
        {asking.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => (item.routineId ? openRoutine({ id: item.routineId }) : openChat({ id: item.id, title: item.job }))}
              className={cn(line, "text-ink hover:bg-hover", FOCUS)}
            >
              <Pips pattern="waiting" className="text-ask" still />
              <span className="flex-1 truncate">Needs you on {item.job}</span>
            </button>
          </li>
        ))}
        {running.map((chat) => (
          <li key={chat.id}>
            <button type="button" onClick={() => openChat(chat)} className={cn(line, "text-ink hover:bg-hover", FOCUS)}>
              <Pips pattern="think" still />
              <span className="flex-1 truncate">{chat.title}</span>
              <span className="font-mono text-11.5 text-ink-3 tabular-nums">{rowTime(chat.updatedAt, { going: true })}</span>
            </button>
          </li>
        ))}
        {recent.map((chat) => (
          <li key={chat.id}>
            <button type="button" onClick={() => openChat(chat)} className={cn(line, "hover:bg-hover hover:text-ink", FOCUS)}>
              <Pips pattern="read" />
              <span className="flex-1 truncate">{chat.title}</span>
              <span className="font-mono text-11.5 text-ink-3 tabular-nums">{rowTime(chat.updatedAt)}</span>
            </button>
          </li>
        ))}
        {asking.length + running.length + recent.length === 0 && <li className={cn(line, "text-faint")}>No chats yet.</li>}
      </ul>
      <button
        type="button"
        onClick={() => {
          choose(mascot.id);
          createTab();
          onClose();
        }}
        className={cn(buttonVariants({ variant: "raised" }), "mt-1.5 w-full min-w-0")}
      >
        {/* A long name ends in an ellipsis inside the button, rather than running past the card's edges. */}
        <span className="min-w-0 truncate">New chat with {name}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          openMascots({ page: "list" });
          onClose();
        }}
        className={cn("mt-1 w-full h-7 rounded-full text-13 text-ink-2 hover:text-ink", FOCUS)}
      >
        All your mascots
      </button>
    </div>
  );
};

// A face's button and the space between two, for working out how many fit.
const DOCK_FACE = 28;
const DOCK_GAP = 7;

// Every mascot with its mood for a face. It's how you see who is doing what at a glance. Those that don't fit become a
// count that opens the mascots' page, so no face is ever cut in half.
const Dock: React.FC<{ open: string | null; onPress: (id: string) => void }> = ({ open, onPress }) => {
  const { flock } = useFlock();
  const stateOf = useMascotState();
  const list = useRef<HTMLUListElement>(null);
  const [room, setRoom] = useState(Infinity);
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () => {
      const { paddingLeft, paddingRight } = getComputedStyle(element);
      setRoom(Math.floor((element.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight) + DOCK_GAP) / (DOCK_FACE + DOCK_GAP)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const faces = dockFaces(flock, room, (mascot) => stateOf(mascot).mood !== "rest");

  return (
    <div className="flex-1 min-w-0 h-[46px] px-2 flex items-center rounded-tile bg-tray">
      <ul ref={list} aria-label="Your mascots" className="flex-1 min-w-0 -m-1.5 p-1.5 flex items-center gap-[7px] overflow-hidden">
        {faces.shown.map((mascot) => (
          <li key={mascot.id} className="shrink-0">
            <DockMascot mascot={mascot} mood={stateOf(mascot).mood} open={open === mascot.id} onPress={() => onPress(mascot.id)} />
          </li>
        ))}
        {faces.more > 0 && (
          <li className="shrink-0">
            <Tooltip words="All your mascots">
              <button
                type="button"
                aria-label={`${faces.more} more ${faces.more === 1 ? "mascot" : "mascots"}`}
                onClick={() => openMascots({ page: "list" })}
                className={cn(
                  "press size-7 flex items-center justify-center rounded-row font-mono text-11 text-ink-3 hover:bg-hover hover:text-ink app-region-no-drag",
                  FOCUS,
                )}
              >
                +{faces.more}
              </button>
            </Tooltip>
          </li>
        )}
      </ul>
    </div>
  );
};

// The dock and, beside it, the account button. A mascot's card or the account menu opens above both, inside the
// sidebar, one at a time. A press anywhere else closes it.
type FootOpen = { kind: "mascot"; id: string } | { kind: "account" } | null;

const SidebarFoot: React.FC = () => {
  const { flock } = useFlock();
  const [open, setOpen] = useState<FootOpen>(null);
  const foot = useRef<HTMLDivElement>(null);
  const mascotId = open?.kind === "mascot" ? open.id : null;
  const shown = flock.find((mascot) => mascot.id === mascotId);
  const accountMenu = usePresence(open?.kind === "account");

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!foot.current?.contains(event.target as Node)) setOpen(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  // The keyboard goes back to what opened it.
  const close = (refocus: boolean) => {
    const was = open;
    setOpen(null);
    if (!refocus || !was) return;
    const opener = was.kind === "account" ? "[data-account-button]" : `[data-dock-mascot="${was.id}"]`;
    foot.current?.querySelector<HTMLElement>(opener)?.focus();
  };

  return (
    <div ref={foot} className="relative shrink-0 mx-0.5 flex items-center gap-2">
      {shown && <MascotCard key={shown.id} mascot={shown} onClose={() => close(true)} />}
      {accountMenu.shown && (
        <AccountMenu above leaving={accountMenu.leaving} onClose={close} className="absolute inset-x-0 bottom-[54px] z-20" />
      )}
      <Dock open={mascotId} onPress={(id) => setOpen(mascotId === id ? null : { kind: "mascot", id })} />
      <AccountButton open={open?.kind === "account"} onPress={() => setOpen(open?.kind === "account" ? null : { kind: "account" })} />
    </div>
  );
};

// In the sidebar's dock a face is 26px in a 28px place; in the horizontal toolbar's, 22px in 24px.
export const DockMascot: React.FC<{
  mascot: MascotProfile;
  mood: "asking" | "fetching" | "rest";
  open: boolean;
  onPress: (button: HTMLButtonElement) => void;
  small?: boolean;
}> = ({ mascot, mood, open, onPress, small = false }) => {
  const name = useAssistantName(mascot);
  return (
    <Tooltip words={name}>
      <button
        type="button"
        data-dock-mascot={mascot.id}
        aria-label={`${name}${mood === "asking" ? ", needs you" : mood === "fetching" ? ", working" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(event) => onPress(event.currentTarget)}
        className={cn(
          small ? "size-6 rounded-[7px]" : "size-7 rounded-row",
          "press flex items-center justify-center hover:bg-hover app-region-no-drag",
          open && "bg-press",
          FOCUS,
        )}
      >
        {/* The dock's faces stay still: in the sidebar only the working mascot's own row moves. */}
        <Berry mood={mood} size={small ? 22 : 26} mascot={mascot} still />
      </button>
    </Tooltip>
  );
};

// --- The sidebar ----------------------------------------------------------------------------------------------------

type Face = "tabs" | "chats";

// Tabs or Chats. A dot in `ask` on Chats while anything needs you, on either face.
const FaceSwitch: React.FC<{ face: Face; onChange: (face: Face) => void }> = ({ face, onChange }) => {
  const waiting = useLibrary().needsYou.length;
  return (
    <SegmentSwitch
      label="Sidebar"
      current={face}
      onChange={onChange}
      className="mx-0.5 mb-3 h-[30px] rounded-[10px] [&>button]:rounded-[8px] text-13"
      items={[
        { value: "tabs", label: "Tabs" },
        {
          value: "chats",
          label: "Chats",
          after: waiting > 0 && (
            <>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ask" />
              <span className="sr-only">
                , {waiting} {waiting === 1 ? "needs" : "need"} you
              </span>
            </>
          ),
        },
      ]}
    />
  );
};

// Whether a scrolling list has rows below what shows.
const useMoreBelow = () => {
  const list = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const check = () => {
    const element = list.current;
    if (element) setMoreBelow(element.scrollTop + element.clientHeight < element.scrollHeight - 1);
  };
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver(check);
    observer.observe(element);
    // The rows' own wrapper, since adding a tab changes what scrolls but not the list's size.
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return { list, moreBelow, check };
};

// `floating` is the collapsed sidebar shown over the page, where the button pins it open again.
export const Sidebar: React.FC<{ floating?: boolean }> = ({ floating = false }) => {
  const { layout, theme, toggleSidebar } = useShell();
  const [face, setFace] = useState<Face>("tabs");

  // The top row lines up with the toolbar, wherever this sidebar starts: the floating one is inset in its view.
  const nav = useRef<HTMLElement>(null);
  const [top, setTop] = useState(0);
  useLayoutEffect(() => setTop(nav.current?.getBoundingClientRect().top ?? 0), []);
  const above = layout.addressRow.y - (floating ? layout.floatingSidebar.y : layout.sidebar.y) - top;
  const { list, moreBelow, check } = useMoreBelow();

  return (
    <nav ref={nav} aria-label="Sidebar" className="h-full flex flex-col pl-3 pr-2.5 pb-2.5">
      <div
        className="shrink-0 -ml-1 flex items-center justify-end box-content app-region-drag"
        style={{
          // Padding, so the space above can still drag the window.
          paddingTop: Math.max(above, 0),
          marginTop: Math.min(above, 0),
          height: layout.addressRow.height,
          paddingLeft: theme.platform === "mac" ? layout.controls.width : undefined,
        }}
      >
        <ToolBarButton
          Icon={PanelLeft}
          label={floating ? "Keep sidebar open" : "Hide sidebar"}
          shortcut={SHORTCUTS.sidebar}
          onClick={toggleSidebar}
        />
      </div>

      <FaceSwitch face={face} onChange={setFace} />

      {/* While rows go on below, the cut one fades out, so none looks as if it's under the dock. */}
      <div
        ref={list}
        onScroll={check}
        role="tabpanel"
        aria-label={face === "tabs" ? "Tabs" : "Chats"}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-2",
          moreBelow && "[mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent)]",
        )}
      >
        <div>{face === "tabs" ? <TabsFace /> : <ChatsFace />}</div>
      </div>

      <SidebarFoot />
    </nav>
  );
};
