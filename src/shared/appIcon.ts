import { BERRY_ID } from "./mascots";

// Settings > General > App icon (DESIGN.md section 10, Settings): whose face is on Blueberry's icon, and what's behind it.
// The chrome draws the picture and main sets it, so both go by these.

export const APP_ICON_GROUNDS = ["paper", "night", "colour", "glow"] as const;
export type AppIconGround = (typeof APP_ICON_GROUNDS)[number];

// The picture the chrome hands main, in pixels a side, and the one the app ships with.
export const APP_ICON_SIZE = 256;
export const SHIPPED_ICON_SIZE = 1024;

// The chosen mascot while it's still one of the mascots, and otherwise Berry, which is null. A deleted mascot hands the icon
// back to Berry this way, without anyone having to clear the setting.
export const iconMascotId = (id: string | null, mascots: readonly { id: string; deletedAt: number | null }[]): string | null =>
  id !== null && id !== BERRY_ID && mascots.some((mascot) => mascot.id === id && mascot.deletedAt === null) ? id : null;
