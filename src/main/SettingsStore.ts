import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, isAbsolute } from "path";
import type { DesktopBerrySpot, Settings } from "../shared/ipc";
import { CHAT_WIDTH, clampWidth, SIDEBAR_WIDTH } from "./Layout";
import { sanitizeSiteZoom } from "./siteZoom";

export const DEFAULT_SETTINGS: Settings = {
  layoutMode: "vertical",
  appearance: "system",
  sidebarWidth: SIDEBAR_WIDTH.default,
  chatWidth: CHAT_WIDTH.default,
  showBerry: true,
  keepBerryStill: false,
  birdOnPages: true,
  actionApproval: "risky",
  downloadFolder: null,
  askWhereToSave: false,
  onStartup: "restore",
  onboarded: false,
  siteZoom: {},
  suggestions: true,
  phoneAlways: false,
  chosenMascotId: null,
  desktopBerry: false,
  desktopBerrySpot: null,
};

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const width = (value: unknown, range: { min: number; max: number }, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? clampWidth(value, range) : fallback;

const folder = (value: unknown, fallback: string | null): string | null => {
  if (value === null) return null;
  return typeof value === "string" && isAbsolute(value) && !value.includes("\0") ? value : fallback;
};

const spot = (value: unknown, fallback: DesktopBerrySpot | null): DesktopBerrySpot | null => {
  if (value === null) return null;
  const { displayId, edge, fraction } = (value ?? {}) as Partial<DesktopBerrySpot>;
  return Number.isFinite(displayId) && Number.isFinite(fraction)
    ? {
        displayId: displayId as number,
        // Before it could stand anywhere else, it only stood on the bottom.
        edge: pick(edge, ["bottom", "top", "left", "right"] as const, "bottom"),
        fraction: Math.min(Math.max(fraction as number, 0), 1),
      }
    : fallback;
};

// Whatever arrives, from disk or a renderer, only valid values get through.
export function sanitizeSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    layoutMode: pick(input.layoutMode, ["vertical", "horizontal"] as const, base.layoutMode),
    appearance: pick(input.appearance, ["system", "light", "dark"] as const, base.appearance),
    sidebarWidth: width(input.sidebarWidth, SIDEBAR_WIDTH, base.sidebarWidth),
    chatWidth: width(input.chatWidth, CHAT_WIDTH, base.chatWidth),
    showBerry: bool(input.showBerry, base.showBerry),
    keepBerryStill: bool(input.keepBerryStill, base.keepBerryStill),
    birdOnPages: bool(input.birdOnPages, base.birdOnPages),
    actionApproval: pick(input.actionApproval, ["risky", "always", "never"] as const, base.actionApproval),
    downloadFolder: folder(input.downloadFolder, base.downloadFolder),
    askWhereToSave: bool(input.askWhereToSave, base.askWhereToSave),
    onStartup: pick(input.onStartup, ["restore", "fresh"] as const, base.onStartup),
    onboarded: bool(input.onboarded, base.onboarded),
    siteZoom: sanitizeSiteZoom(input.siteZoom, base.siteZoom),
    suggestions: bool(input.suggestions, base.suggestions),
    phoneAlways: bool(input.phoneAlways, base.phoneAlways),
    chosenMascotId: input.chosenMascotId === null || typeof input.chosenMascotId === "string" ? input.chosenMascotId : base.chosenMascotId,
    desktopBerry: bool(input.desktopBerry, base.desktopBerry),
    desktopBerrySpot: spot(input.desktopBerrySpot, base.desktopBerrySpot),
  };
}

// Dragging a panel edge updates the width many times a second, so writes wait for a pause.
const WRITE_DELAY_MS = 300;

export class SettingsStore {
  private settings: Settings;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string) {
    this.settings = this.read();
  }

  get(): Settings {
    return this.settings;
  }

  update(patch: Partial<Settings>): Settings {
    this.settings = sanitizeSettings({ ...this.settings, ...patch }, this.settings);
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flush(), WRITE_DELAY_MS);
    return this.settings;
  }

  flush(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      // Writing beside the file and renaming means a crash never leaves half a file.
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify(this.settings, null, 2));
      renameSync(temp, this.file);
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }

  private read(): Settings {
    try {
      return sanitizeSettings(JSON.parse(readFileSync(this.file, "utf8")));
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
}
