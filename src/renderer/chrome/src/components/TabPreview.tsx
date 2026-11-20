import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { GRACE_MS, IDLE, PREVIEW_REST_MS, stepTip, type TipEvent, type TipState } from "@common/components/tooltipState";
import { useBrowser } from "../contexts/useBrowser";
import { PreviewContext } from "./useTabPreview";

// DESIGN.md section 8, A tab's preview: resting on a tab that isn't the one in front shows a card of it, which follows
// the pointer along the tabs with no wait. It runs the tooltip's own steps with a longer rest, and takes the tab's
// tooltip's place. The chrome only says which tab and where its row is: main draws the card, in a view over the page.

// Where a tab's row is in this view, which is where main places the card from. Both views that draw tabs start at the
// window's top left corner.
const rowOf = (element: HTMLElement) => {
  const { x, y, width, height } = (element.closest("li") ?? element).getBoundingClientRect();
  return { x, y, width, height };
};

export const TabPreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useRef<TipState>(IDLE);
  const timer = useRef<number>(undefined);
  const rows = useRef(new Map<string, HTMLElement>());
  const { activeTab } = useBrowser();

  const send = useCallback((event: TipEvent, row?: HTMLElement) => {
    if (row && event.type === "enter") rows.current.set(event.id, row);
    const before = state.current;
    const step = stepTip(before, event);
    state.current = step.state;
    const { shown } = step.state;
    if (shown !== before.shown) {
      const element = shown ? rows.current.get(shown) : undefined;
      if (shown && element?.isConnected) {
        void window.chromeAPI.preview.show({ tabId: shown, row: rowOf(element), slide: before.shown !== null });
      } else {
        void window.chromeAPI.preview.hide();
      }
    }
    if (!shown && !step.state.waiting) rows.current.clear();
    if (step.timer === "keep") return;
    window.clearTimeout(timer.current);
    if (step.timer === "rest") timer.current = window.setTimeout(() => send({ type: "rested" }), PREVIEW_REST_MS);
    if (step.timer === "grace") timer.current = window.setTimeout(() => send({ type: "grace-over" }), GRACE_MS);
  }, []);

  // The tab in front changing, Escape, a scroll, a menu, the window going to the back, or the pointer leaving the view.
  const dismiss = useCallback(() => {
    if (state.current.shown || state.current.waiting) send({ type: "dismiss" });
  }, [send]);
  useEffect(dismiss, [activeTab?.id, dismiss]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && dismiss();
    const left = () => {
      const id = state.current.shown ?? state.current.waiting;
      if (id) send({ type: "leave", id, now: true });
    };
    const root = document.documentElement;
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("contextmenu", dismiss, true);
    window.addEventListener("blur", dismiss);
    root.addEventListener("mouseleave", left);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("contextmenu", dismiss, true);
      window.removeEventListener("blur", dismiss);
      root.removeEventListener("mouseleave", left);
      window.clearTimeout(timer.current);
      if (state.current.shown) void window.chromeAPI.preview.hide();
    };
  }, [send, dismiss]);

  const api = useMemo(() => ({ send }), [send]);
  return <PreviewContext.Provider value={api}>{children}</PreviewContext.Provider>;
};
