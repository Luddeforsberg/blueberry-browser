import type React from "react";
import { createContext, useContext, useEffect } from "react";
import type { TabInfo } from "@shared/ipc";
import type { TipEvent } from "@common/components/tooltipState";

// Blueberry's own pages have their name whole in the row, and the tab in front is already on screen.
const getsPreview = (tab: Pick<TabInfo, "isActive" | "page">): boolean => !tab.isActive && tab.page === null;

interface PreviewApi {
  send: (event: TipEvent, row?: HTMLElement) => void;
}

export const PreviewContext = createContext<PreviewApi | null>(null);

// What a tab's own button takes to show its card, or nothing for a tab that gets none, which keeps its tooltip.
export const useTabPreview = (tab: TabInfo, off = false) => {
  const api = useContext(PreviewContext);
  const id = tab.id;
  const gets = !!api && !off && getsPreview(tab);
  // A tab that stops getting one, such as the one just pressed, lets its card go.
  useEffect(() => {
    if (gets) return;
    api?.send({ type: "leave", id, now: true });
  }, [api, id, gets]);
  if (!api || !gets) return undefined;
  return {
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
      // A drag, or anything else with a button held, isn't resting on the tab.
      if (event.pointerType === "touch" || event.buttons !== 0) return;
      api.send({ type: "enter", id, via: "pointer" }, event.currentTarget);
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => api.send({ type: "leave", id, now: event.relatedTarget === null }),
    onPointerDown: () => api.send({ type: "press", id }),
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (event.currentTarget.matches(":focus-visible")) api.send({ type: "enter", id, via: "keyboard" }, event.currentTarget);
    },
    onBlur: () => api.send({ type: "leave", id, now: true }),
  };
};
