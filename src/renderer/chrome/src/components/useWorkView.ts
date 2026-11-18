import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkView } from "@shared/library";

// Pictures arrive many times a second, so they go straight to the picture showing them, and nothing else draws again.
export interface WorkFrames {
  get: (tabId: string) => string | undefined;
  subscribe: (listener: () => void) => () => void;
}

// The working view for the chat on screen. `pictureWidth` of 0 means words only, and then nothing is captured at all.
export const useWorkView = (chatId: string | null, pictureWidth: number): { view: WorkView | null; frames: WorkFrames } => {
  const [view, setView] = useState<WorkView | null>(null);
  const pictures = useRef(new Map<string, string>());
  const listeners = useRef(new Set<() => void>());
  const frames = useMemo<WorkFrames>(
    () => ({
      get: (tabId) => pictures.current.get(tabId),
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    }),
    [],
  );

  useEffect(() => {
    const { work } = window.chromeAPI;
    const tell = () => listeners.current.forEach((listener) => listener());
    const offUpdated = work.onUpdated((next) => {
      setView(next);
      // Nothing of a tab that's stopped being pictured stays here, not even out of sight.
      const allowed = new Set(next?.tabs.filter(({ state }) => state === "picture").map(({ id }) => id));
      pictures.current.forEach((_, tabId) => {
        if (!allowed.has(tabId)) pictures.current.delete(tabId);
      });
      tell();
    });
    const offFrame = work.onFrame(({ chatId: id, tabId, picture }) => {
      if (id !== chatId) return;
      pictures.current.set(tabId, picture);
      tell();
    });
    return () => {
      offUpdated();
      offFrame();
      pictures.current.clear();
    };
  }, [chatId]);

  useEffect(() => {
    void window.chromeAPI.work.watch(chatId, pictureWidth);
  }, [chatId, pictureWidth]);
  // Only leaving the chat ends the watch: a new width on the same chat keeps what it's seen, or a finished job's view would go.
  useEffect(() => () => void window.chromeAPI.work.watch(null, 0), [chatId]);

  return { view: view?.chatId === chatId ? view : null, frames };
};
