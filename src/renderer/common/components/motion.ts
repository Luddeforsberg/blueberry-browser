import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";

// Keep Berry still, from the settings. The chrome provides it, so anything that moves can ask without being told.
export const StillContext = createContext(false);

const REDUCED = "(prefers-reduced-motion: reduce)";

const subscribe = (changed: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};

// Whether to hold still: when asked to, with Keep Berry still on, or with the system asking for less motion.
// Drawn outside a browser, as the site's pictures are, it's still.
export const useStill = (still?: boolean): boolean => {
  const kept = useContext(StillContext);
  const reduced = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => true,
  );
  return !!still || kept || reduced;
};

// Which frame of a loop is showing. It only counts while it moves, so a still one stays on its first frame.
export const useFrame = (frames: number, ms: number, moving: boolean): number => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (!moving || frames < 2) return;
    const timer = window.setInterval(() => setFrame((at) => (at + 1) % frames), ms);
    return () => window.clearInterval(timer);
  }, [frames, ms, moving]);
  return frame % Math.max(frames, 1);
};
