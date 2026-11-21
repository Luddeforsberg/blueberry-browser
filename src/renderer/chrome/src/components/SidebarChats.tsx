import React, { useRef, useState } from "react";
import { ChevronRight, Cloud, Ellipsis, Plus } from "lucide-react";
import type { ChatThreadSummary } from "@shared/library";
import type { MenuAnchor } from "@shared/ipc";
import { atPointer, underBox } from "./menuAnchors";
import { holdWhile } from "../menuHold";
import { useBrowser } from "../contexts/useBrowser";
import { useMascots, useLibrary } from "../contexts/useLibrary";
import { Pips } from "@common/components/Pips";
import { cn } from "@common/lib/utils";
import { Berry } from "./Berry";
import { useAssistantName } from "./useAssistantName";
import { rowTime } from "../shortWords";
import { Tooltip } from "@common/components/Tooltip";
import { FOCUS, ROW, LEAD, ICON, CURRENT, useTick, openChat, openRoutine } from "./sidebarRows";
import { Label, LabelButton } from "./SidebarLabels";
import { isEnter } from "@common/lib/keys";

// --- Chats ----------------------------------------------------------------------------------------------------------

const EARLIER_SHOWN = 8;

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
  const { find } = useMascots();
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
            if (isEnter(event)) finish(event.currentTarget.value);
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
  const { find } = useMascots();
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
      <button type="button" onClick={() => void createTab()} className={cn(ROW, "text-ink-2 hover:bg-hover hover:text-ink")}>
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
                    {/* A time is the machine's words, in mono. A state, news or paused, is a word, so it isn't. */}
                    {routine.unseen ? (
                      <span className="shrink-0 text-12 font-medium text-ink">
                        News<span className="sr-only">. Has news</span>
                      </span>
                    ) : routine.paused ? (
                      <span className="shrink-0 text-12 text-ink-3">Paused</span>
                    ) : (
                      <span className="shrink-0 font-mono text-11.5 text-ink-3 tabular-nums">
                        {routine.nextRunAt ? rowTime(routine.nextRunAt) : ""}
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
