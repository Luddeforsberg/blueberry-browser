import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { InternalPage } from "../shared/ipc";

export interface SavedEntry {
  url: string;
  title: string;
}

export interface SavedWebTab {
  url: string;
  title: string;
  favicon: string | null;
  // The tab's back and forward pages, with `index` the current one.
  entries: SavedEntry[];
  index: number;
}

export interface SavedPageTab {
  page: InternalPage;
  param: string | null;
  title: string;
}

export type SavedTab = SavedWebTab | SavedPageTab;

export interface Session {
  tabs: SavedTab[];
  active: number;
  sidebarOpen: boolean;
  chatOpen: boolean;
  width: number;
  height: number;
}

const PAGES: readonly InternalPage[] = ["new-tab", "chat", "routines", "settings", "downloads", "gallery", "history", "flock"];
const MAX_ENTRIES = 50;
const WRITE_DELAY_MS = 500;

// Anything else, such as chrome://crash, could do something every time it was opened again.
const canRestore = (url: unknown): url is string => typeof url === "string" && /^(https?|file):/i.test(url);

// No size means the usual one.
const size = (value: unknown): number => (typeof value === "number" && value > 0 && Number.isFinite(value) ? value : 0);

const text = (value: unknown): string => (typeof value === "string" ? value : "");

// Only the address and title are kept. A page's saved state can hold what was posted to it, passwords included.
export const savedEntries = (
  entries: ReadonlyArray<{ url?: unknown; title?: unknown }>,
  index: number
): { entries: SavedEntry[]; index: number } => {
  const kept = entries.flatMap(({ url, title }, at) =>
    canRestore(url) ? [{ at, entry: { url, title: text(title) } }] : []
  );
  const current = kept.findIndex(({ at }) => at === index);
  if (current === -1) return { entries: [], index: 0 };
  const start = Math.max(0, current - Math.floor(MAX_ENTRIES / 2));
  return { entries: kept.slice(start, start + MAX_ENTRIES).map(({ entry }) => entry), index: current - start };
};

const sanitizeTab = (raw: unknown): SavedTab | null => {
  const tab = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (PAGES.includes(tab.page as InternalPage)) {
    return {
      page: tab.page as InternalPage,
      param: typeof tab.param === "string" ? tab.param : null,
      title: text(tab.title),
    };
  }
  if (!canRestore(tab.url)) return null;
  return {
    url: tab.url,
    title: text(tab.title),
    favicon: typeof tab.favicon === "string" ? tab.favicon : null,
    ...savedEntries(Array.isArray(tab.entries) ? tab.entries : [], Number(tab.index)),
  };
};

// Whatever is on disk, only what can really be opened again gets through.
export const sanitizeSession = (raw: unknown): Session | null => {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!Array.isArray(input.tabs)) return null;
  // Tabs that are dropped mustn't shift which one was active.
  const active = input.tabs[Number(input.active)];
  const sanitized = input.tabs.map((tab) => ({ tab: sanitizeTab(tab), wasActive: tab === active }));
  const kept = sanitized.filter(({ tab }) => tab !== null);
  if (kept.length === 0) return null;
  return {
    tabs: kept.flatMap(({ tab }) => (tab ? [tab] : [])),
    active: Math.max(0, kept.findIndex(({ wasActive }) => wasActive)),
    sidebarOpen: input.sidebarOpen !== false,
    chatOpen: input.chatOpen === true,
    width: size(input.width),
    height: size(input.height),
  };
};

// The open tabs and layout, written soon after each change so a crash loses very little.
export class SessionStore {
  private read: (() => Session | null) | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string) {}

  load(): Session | null {
    try {
      return sanitizeSession(JSON.parse(readFileSync(this.file, "utf8")));
    } catch {
      return null;
    }
  }

  // Null from `read` means there's nothing to keep, so the file goes.
  saveSoon(read: () => Session | null): void {
    this.read = read;
    this.timer ??= setTimeout(() => this.flush(), WRITE_DELAY_MS);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const read = this.read;
    this.read = null;
    if (!read) return;
    try {
      const session = read();
      if (!session) {
        rmSync(this.file, { force: true });
        return;
      }
      mkdirSync(dirname(this.file), { recursive: true });
      // Writing beside the file and renaming means a crash never leaves half a file.
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify(session));
      renameSync(temp, this.file);
    } catch (error) {
      console.error("Failed to save the open tabs:", error);
    }
  }
}
