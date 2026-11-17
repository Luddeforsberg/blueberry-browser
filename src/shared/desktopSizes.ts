// The sizes of the mascot on the desktop (DESIGN.md, On your desktop), for Layout.ts, which places its windows, and the
// views, which draw in them. Runtime code, so a preload may only import its types.

// The drop: one shape attached to the edge, 32px along it and 28px out of it at rest, with a fillet on each side where it
// meets the edge.
export const DESKTOP_DROP = { along: 32, out: 28 };
export const DESKTOP_FILLET = 10;
// How thick the drop is: pointed at, and with something that needs you.
export const DESKTOP_POINTED = 36;
export const DESKTOP_ASKING = 44;
// Room for the shadow, on every side but the edge's.
export const DESKTOP_SHADOW = 24;
// The most the drop grows to by itself: how long, out of a side edge or along the top or bottom, and how thick.
export const DESKTOP_DROP_MOST = { long: 360, thick: 64 };
// The prompt box is the drop grown, still attached to the edge: 440 long and 52 thick, taller with more lines. Over and
// under it there's room for the chips of jobs sent before and the keys.
export const DESKTOP_BOX = { long: 440, thick: 52, around: 48 };
// The tray and the ask, beside the drop.
export const DESKTOP_SHEET = { width: 324, gap: 12 };
