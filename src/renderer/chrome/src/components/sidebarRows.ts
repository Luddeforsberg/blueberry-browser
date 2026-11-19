import { useEffect, useState } from "react";
import type { ChatThreadSummary, Routine } from "@shared/library";
import { cn } from "@common/lib/utils";
import { openRoutines } from "../routinesView";

// Part of the sidebar (Sidebar.tsx): the classes, tick and links its rows share.

export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-focus";
export const ROW = cn(
  "w-full h-8 px-2 flex items-center gap-2.5 rounded-[10px] text-14 text-ink text-left transition-colors app-region-no-drag",
  FOCUS,
);
// A row's own slot for its icon or face, so titles line up whatever starts the row.
export const LEAD = "size-5 shrink-0 flex items-center justify-center text-ink-2";
export const ICON = "size-4 shrink-0";
// A site's icon in a row.
export const SITE_ICON = "size-[18px] rounded-[5px] text-[10px]";
// The row in front, and the favourite whose site it is: a sheet lifted with `up`.
export const CURRENT = "bg-sheet text-ink shadow-up";

// A tick for rows that say when: every second while something is going, since that counts seconds, and otherwise
// often enough for minutes.
export const useTick = (going: boolean) => {
  const [, setNow] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), going ? 1000 : 30_000);
    return () => window.clearInterval(timer);
  }, [going]);
};

export const openChat = (chat: Pick<ChatThreadSummary, "id" | "title">) =>
  void window.chromeAPI.browser.openPage("chat", { param: chat.id, title: chat.title });
// Named in the page's param, which also works from Chats over a page, where this runs in the overlay's view.
export const openRoutine = (routine: Pick<Routine, "id">) => openRoutines({ page: "routine", id: routine.id });
