import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MascotProfile } from "@shared/library";
import { useBrowser } from "../contexts/useBrowser";
import { useMascots } from "../contexts/useLibrary";
import { Pips } from "@common/components/Pips";
import { buttonVariants } from "@common/components/buttonVariants";
import { cn } from "@common/lib/utils";
import { Berry } from "./Berry";
import { useAssistantName } from "./useAssistantName";
import { limitsInBrief, rowTime } from "../shortWords";
import { dockFaces, openMascots } from "../mascotsView";
import { AccountButton, AccountMenu } from "./AccountMenu";
import { usePresence } from "@common/components/motion";
import { Tooltip } from "@common/components/Tooltip";
import { useMascotState } from "./useMascotState";
import { FOCUS, useTick, openChat, openRoutine } from "./sidebarRows";

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
  const { choose } = useMascots();
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
          void createTab();
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
// count that opens the mascots' page, so no face is ever cut in half. The tray is only as wide as its faces, so one
// face isn't a long empty pill, and how many fit is measured on the room it may grow into.
const Dock: React.FC<{ open: string | null; onPress: (id: string) => void }> = ({ open, onPress }) => {
  const { mascots } = useMascots();
  const stateOf = useMascotState();
  const space = useRef<HTMLDivElement>(null);
  const tray = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(Infinity);
  useLayoutEffect(() => {
    const element = space.current;
    if (!element || !tray.current) return;
    const { paddingLeft, paddingRight } = getComputedStyle(tray.current);
    const measure = () =>
      setRoom(Math.floor((element.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight) + DOCK_GAP) / (DOCK_FACE + DOCK_GAP)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const faces = dockFaces(mascots, room, (mascot) => stateOf(mascot).mood !== "rest");

  return (
    <div ref={space} className="flex-1 min-w-0 flex">
      <div ref={tray} className="max-w-full h-[46px] px-2 flex items-center rounded-tile bg-tray">
        <ul aria-label="Your mascots" className="min-w-0 -m-1.5 p-1.5 flex items-center gap-[7px] overflow-hidden">
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
    </div>
  );
};

// The dock and, beside it, the account button. A mascot's card or the account menu opens above both, inside the
// sidebar, one at a time. A press anywhere else closes it.
type FootOpen = { kind: "mascot"; id: string } | { kind: "account" } | null;

export const SidebarFoot: React.FC = () => {
  const { mascots } = useMascots();
  const [open, setOpen] = useState<FootOpen>(null);
  const foot = useRef<HTMLDivElement>(null);
  const mascotId = open?.kind === "mascot" ? open.id : null;
  const shown = mascots.find((mascot) => mascot.id === mascotId);
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
