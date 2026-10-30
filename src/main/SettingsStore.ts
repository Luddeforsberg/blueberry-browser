import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Settings } from "../shared/ipc";
import { CHAT_WIDTH, clampWidth, SIDEBAR_WIDTH } from "./Layout";

export const DEFAULT_SETTINGS: Settings = {
  layoutMode: "vertical",
  appearance: "system",
  sidebarWidth: SIDEBAR_WIDTH.default,
  chatWidth: CHAT_WIDTH.default,
  showBerry: true,
  keepBerryStill: false,
  onboarded: false,
};

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const width = (value: unknown, range: { min: number; max: number }, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? clampWidth(value, range) : fallback;

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
    onboarded: bool(input.onboarded, base.onboarded),
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
