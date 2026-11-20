import type { LayoutMode, Look, Theme } from "./map";

// What scripts/drive.mjs hands to shots.drive.ts, and what each picture is called and recorded as.

export interface Request {
  out: string;
  commit: string;
  feature?: string;
  state?: string;
  theme?: Theme;
  layout?: LayoutMode;
  width?: number;
}

export interface Entry {
  feature: string;
  state: string;
  theme: Theme;
  layout: LayoutMode | null;
  width: number;
  file: string;
  // Where the window kept changing when it never came to rest, so the picture may differ from run to run. Null when it
  // rested.
  restless: string | null;
  design: string;
}

// Where each picture's entry waits until the manifest is written.
export const ENTRIES = ".entries";

export const readRequest = (): Request => {
  const raw = process.env.BLUEBERRY_DRIVE;
  if (!raw) throw new Error("Run this with `pnpm run drive` or `pnpm run baseline`.");
  return JSON.parse(raw) as Request;
};

export const shotFile = ({
  feature,
  state,
  look,
  layouts,
  width,
}: {
  feature: string;
  state: string;
  look: Look;
  layouts: string;
  width: number | null;
}): string =>
  [feature, state, look.theme, layouts === "none" ? null : look.layout, width ? `w${width}` : null].filter(Boolean).join("--") + ".png";
