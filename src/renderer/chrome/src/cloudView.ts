import { useCallback, useEffect, useState } from "react";
import type { CloudView } from "@shared/ipc";
import { useLatest } from "@common/lib/latest";

// Until the user takes over, the live view takes neither the pointer nor the keyboard, so nothing they do reaches the
// page while a job works in it. `inert` is what keeps Tab out: no pointer events alone still lets the frame be focused.
export const liveFrameLock = (takenOver: boolean): { inert?: boolean; tabIndex?: number; className?: string } =>
  takenOver ? {} : { inert: true, tabIndex: -1, className: "pointer-events-none" };

// What a cloud tab shows, and its latest picture when the local test browser sends pictures instead of a live view.
// Only one cloud tab is watched at a time, so only one place on screen may use this.
export const useCloudView = (tabId: string): { view: CloudView | null; frame: string | null; refresh: () => void } => {
  const [view, setView] = useState<CloudView | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  // Asked again on every change, so answers can cross: only the newest counts.
  const asking = useLatest();
  const refresh = useCallback(() => {
    const turn = asking.next();
    void window.chromeAPI.cloud.view(tabId).then((next) => turn.current && setView(next));
  }, [tabId, asking]);
  useEffect(() => {
    refresh();
    return window.chromeAPI.cloud.onUpdated(refresh);
  }, [refresh]);

  const pictures = view?.kind === "frames";
  useEffect(() => {
    if (!pictures) return;
    const { cloud } = window.chromeAPI;
    const off = cloud.onFrame((next) => {
      if (next.tabId === tabId) setFrame(next.data);
    });
    void cloud.watch(tabId);
    return () => {
      off();
      void cloud.watch(null);
    };
  }, [pictures, tabId]);

  return { view, frame, refresh };
};
