// When a tooltip shows and where (DESIGN.md section 8), with no DOM, so it can be tested on its own. `Tooltip.tsx` runs
// it with real timers and draws what it says.

import motion from "../motion.json";

// The pointer rests this long before the first tooltip shows. The keyboard shows one at once.
export const REST_MS = motion.tipRestMs;
// A tab's preview card is bigger, so it waits longer. Along the tabs it follows with no wait, as a tooltip does.
export const PREVIEW_REST_MS = motion.previewRestMs;
// Leaving a control, a neighbour has this long to take the tooltip over before it goes, so moving along a row has no
// blink.
export const GRACE_MS = 90;

export interface TipState {
  // The control whose tooltip is showing.
  shown: string | null;
  // The control the pointer is resting on, waiting for REST_MS.
  waiting: string | null;
  // Showing, but the pointer has left: it goes after GRACE_MS unless a neighbour takes it.
  leaving: boolean;
  // Pressed or dismissed while the pointer is still on it: it stays away until the pointer leaves.
  quiet: string | null;
}

export const IDLE: TipState = { shown: null, waiting: null, leaving: false, quiet: null };

export type TipEvent =
  // The pointer reached a control, or the keyboard did.
  | { type: "enter"; id: string; via: "pointer" | "keyboard" }
  // The pointer or the keyboard left it. `now` when it left the whole view, so no neighbour can take it.
  | { type: "leave"; id: string; now?: boolean }
  | { type: "rested" }
  | { type: "grace-over" }
  // A press on a control, which never shows its tooltip afterwards while the pointer stays.
  | { type: "press"; id: string }
  // Escape, a scroll, or the window going to the back.
  | { type: "dismiss" };

// What the timer should do after a step: start counting the rest, start the grace, stop, or carry on as it was.
export type TipTimer = "rest" | "grace" | "stop" | "keep";

export const stepTip = (state: TipState, event: TipEvent): { state: TipState; timer: TipTimer } => {
  switch (event.type) {
    case "enter": {
      if (state.quiet === event.id) return { state, timer: "keep" };
      // One is showing, or just leaving: it moves to this one, with no wait.
      if (state.shown) return { state: { ...state, shown: event.id, waiting: null, leaving: false }, timer: "stop" };
      if (event.via === "keyboard") return { state: { ...state, shown: event.id, waiting: null }, timer: "stop" };
      return { state: { ...state, waiting: event.id }, timer: "rest" };
    }
    case "leave": {
      const quiet = state.quiet === event.id ? null : state.quiet;
      if (state.waiting === event.id) return { state: { ...state, quiet, waiting: null }, timer: "stop" };
      if (state.shown === event.id && !state.leaving) {
        if (event.now) return { state: { ...state, quiet, shown: null }, timer: "stop" };
        return { state: { ...state, quiet, leaving: true }, timer: "grace" };
      }
      return { state: { ...state, quiet }, timer: "keep" };
    }
    case "rested":
      return state.waiting ? { state: { ...state, shown: state.waiting, waiting: null }, timer: "stop" } : { state, timer: "keep" };
    case "grace-over":
      return state.leaving ? { state: { ...state, shown: null, leaving: false }, timer: "stop" } : { state, timer: "keep" };
    case "press":
      return { state: { shown: null, waiting: null, leaving: false, quiet: event.id }, timer: "stop" };
    case "dismiss":
      return { state: { shown: null, waiting: null, leaving: false, quiet: state.shown ?? state.waiting ?? state.quiet }, timer: "stop" };
  }
};

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 7px from its control, and at least this far in from the window's edges.
export const TIP_GAP = 7;
export const TIP_EDGE = 6;
export const TIP_HEIGHT = 26;

// Under its control, in the middle of it, or over it where there's no room under. Kept inside the window side to side,
// which only ever moves it along, so it never covers the control, and never wider than the window: longer words, such
// as an address, are cut.
export const placeTip = (control: Box, natural: number, room: { width: number; height: number }): Box => {
  const width = Math.max(Math.min(natural, room.width - 2 * TIP_EDGE), 0);
  const under = control.y + control.height + TIP_GAP;
  const over = control.y - TIP_GAP - TIP_HEIGHT;
  const fitsUnder = under + TIP_HEIGHT <= room.height - TIP_EDGE;
  const y = fitsUnder || over < TIP_EDGE ? under : over;
  const centred = control.x + control.width / 2 - width / 2;
  const x = Math.max(TIP_EDGE, Math.min(room.width - TIP_EDGE - width, centred));
  return { x: Math.round(x), y: Math.round(y), width: Math.ceil(width), height: TIP_HEIGHT };
};

// Between neighbours it slides. A control further off gets its tooltip where it is, with no journey across the window.
const NEIGHBOURS_WITHIN = 240;
export const slidesFrom = (from: Box | null, to: Box): boolean =>
  !!from && Math.hypot(from.x + from.width / 2 - (to.x + to.width / 2), from.y - to.y) <= NEIGHBOURS_WITHIN;
