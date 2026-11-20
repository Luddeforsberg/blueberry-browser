import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import motion from "../motion.json";
import { forgetGone, goneSince, rowsToDraw, type DrawnRow, type GoneRow, type Row } from "./comings";

// DESIGN.md section 7's durations, in ms, for timers that wait for something to finish moving. Tailwind's `duration-*`
// classes come from the same file.
export const MOTION = motion.ms;

// Keep Berry still, from the settings. The chrome provides it, so anything that moves can ask without being told.
export const StillContext = createContext(false);

const REDUCED = "(prefers-reduced-motion: reduce)";

const subscribe = (changed: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};

// Whether the system asks for less motion. The chrome's own motion follows this alone, and Keep Berry still only
// holds the mascots and the pips. Drawn outside a browser, as the site's pictures are, it's still.
export const useReducedMotion = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => true,
  );

// Whether to hold still: when asked to, with Keep Berry still on, or with the system asking for less motion.
export const useStill = (still?: boolean): boolean => {
  const kept = useContext(StillContext);
  const reduced = useReducedMotion();
  return !!still || kept || reduced;
};

// Something that goes away with a little motion, such as a menu closing: it stays drawn, `leaving`, until it's had the
// time to go, and comes straight back if it's opened again first.
export const usePresence = (open: boolean, ms: number = MOTION.fast): { shown: boolean; leaving: boolean } => {
  const [drawn, setDrawn] = useState(open);
  if (open && !drawn) setDrawn(true);
  useEffect(() => {
    if (open || !drawn) return;
    const timer = window.setTimeout(() => setDrawn(false), ms);
    return () => window.clearTimeout(timer);
  }, [open, drawn, ms]);
  return { shown: open || drawn, leaving: !open && drawn };
};

// The rows of a list the user is working in, as they come and go (DESIGN.md section 7): one that's new is `opening`,
// and one that's gone stays a moment where it was, `folding`. With less motion asked for, a row is simply there or gone.
// Each row moves itself with `useRowMotion`.
export const useComings = <T>(items: T[], keyOf: (item: T) => string): DrawnRow<T>[] => {
  const reduced = useReducedMotion();
  const here: Row<T>[] = items.map((item) => ({ key: keyOf(item), item }));
  const signature = here.map(({ key }) => key).join("\n");
  const [state, setState] = useState(() => ({ signature, keys: new Set(here.map(({ key }) => key)), gone: [] as GoneRow<T>[], opening: new Set<string>() }));
  // What was on screen after the last change, folding rows included, for where the next one to go was.
  const drawnBefore = useRef<Row<T>[]>(here);
  if (state.signature !== signature) {
    const now = new Set(here.map(({ key }) => key));
    const went = goneSince(drawnBefore.current, now, Date.now()).filter((row) => !state.gone.some(({ key }) => key === row.key));
    setState({
      signature,
      keys: now,
      gone: reduced ? [] : [...state.gone.filter(({ key }) => !now.has(key)), ...went],
      opening: reduced ? new Set() : new Set([...now].filter((key) => !state.keys.has(key))),
    });
  }
  // Each folding row goes for good once it has folded.
  useEffect(() => {
    if (state.gone.length === 0) return;
    const first = Math.min(...state.gone.map(({ at }) => at));
    const timer = window.setTimeout(
      () => setState((was) => ({ ...was, gone: forgetGone(was.gone, ({ at }) => Date.now() >= at + MOTION.slide) })),
      Math.max(first + MOTION.slide - Date.now(), 0) + 16,
    );
    return () => window.clearTimeout(timer);
  }, [state.gone]);
  const drawn = rowsToDraw(here, state.gone, state.opening);
  useLayoutEffect(() => {
    drawnBefore.current = drawn;
  });
  return drawn;
};

// Moves a row from `useComings`: opening from nothing, or folding to nothing from wherever it is, so one closed while
// still opening folds from there. `axis` is its height in a column and its width in a row, and the gap before it goes
// with it, and so does its padding along that axis, which its size can't go under, so nothing jumps when it's gone.
// It only ever leaves inline styles on a row that's folding away.
export const useRowMotion = (row: RefObject<HTMLElement | null>, phase: DrawnRow<unknown>["phase"], axis: "height" | "width"): void => {
  const settle = useRef<number>(undefined);
  useLayoutEffect(() => {
    const element = row.current;
    if (!element || phase === "here") return;
    window.clearTimeout(settle.current);
    const { style } = element;
    const size = axis === "height" ? element.offsetHeight : element.offsetWidth;
    const sizeName = axis === "height" ? "height" : "max-width";
    const gap = element.parentElement ? parseFloat(getComputedStyle(element.parentElement)[axis === "height" ? "rowGap" : "columnGap"]) || 0 : 0;
    const before = element.previousElementSibling !== null;
    const marginName = axis === "height" ? (before ? "margin-top" : "margin-bottom") : before ? "margin-left" : "margin-right";
    const opening = phase === "opening";
    const padNames = axis === "height" ? ["padding-top", "padding-bottom"] : ["padding-left", "padding-right"];
    const computed = getComputedStyle(element);
    const pads = padNames.map((name) => parseFloat(computed.getPropertyValue(name)) || 0);
    const set = (at: { size: number; margin: number; opacity: number; padded: number }) => {
      style.setProperty(sizeName, `${at.size}px`);
      style.setProperty(marginName, `${at.margin}px`);
      padNames.forEach((name, index) => style.setProperty(name, `${pads[index] * at.padded}px`));
      style.opacity = `${at.opacity}`;
    };
    style.transition = "none";
    style.overflow = "hidden";
    if (axis === "width") style.minWidth = "0px";
    set(opening ? { size: 0, margin: -gap, opacity: 0, padded: 0 } : { size, margin: parseFloat(style.getPropertyValue(marginName)) || 0, opacity: parseFloat(computed.opacity), padded: 1 });
    void element.offsetWidth;
    style.transition = [sizeName, marginName, ...padNames, "opacity"].map((name) => `${name} ${MOTION.slide}ms ${motion.ease}`).join(", ");
    set(opening ? { size, margin: 0, opacity: 1, padded: 1 } : { size: 0, margin: -gap, opacity: 0, padded: 0 });
    if (opening) {
      settle.current = window.setTimeout(() => {
        for (const name of ["transition", "overflow", "min-width", sizeName, marginName, ...padNames, "opacity"]) style.removeProperty(name);
      }, MOTION.slide);
    }
  }, [row, phase, axis]);
  useEffect(() => () => window.clearTimeout(settle.current), []);
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
