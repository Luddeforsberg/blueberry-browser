// Part of the IPC contract (ipc.ts): what the browser keeps: downloads, site permissions and history.
// Types only, like ipc.ts: the sandboxed preload can't load shared runtime code, so nothing here may survive compilation.

export type DownloadState = "progressing" | "paused" | "completed" | "cancelled" | "interrupted";

export type DownloadAction = "pause" | "resume" | "cancel" | "open" | "show" | "remove";

export interface DownloadInfo {
  id: string;
  filename: string;
  // Empty until the user has chosen where to save, if they're asked.
  path: string;
  // The site it came from. Null for a data: address or anything else with no site.
  source: string | null;
  state: DownloadState;
  receivedBytes: number;
  // 0 when the server didn't say.
  totalBytes: number;
  startedAt: number;
  // Interrupted, but it can carry on from where it stopped.
  canResume: boolean;
  // Finished, and the file isn't there any more.
  missing: boolean;
}

// What a site can ask for. Electron's many names for these only exist in main.
export type SitePermission =
  | "camera"
  | "microphone"
  | "location"
  | "notifications"
  | "midi"
  | "screen"
  | "clipboard-read"
  | "idle-detection"
  | "window-management"
  | "local-fonts"
  | "speaker-selection"
  | "local-network"
  | "open-external";

export type SiteDecision = "allow" | "block";

export interface SavedSitePermission {
  origin: string;
  permission: SitePermission;
  decision: SiteDecision;
}

export interface PermissionPrompt {
  id: string;
  origin: string;
  permissions: SitePermission[];
}

// A page the user really visited, newest first.
export interface Visit {
  url: string;
  title: string;
  favicon: string | null;
  visitedAt: number;
}

// One visit in the saved history.
export interface HistoryEntry extends Visit {
  id: number;
}

// A browser whose history can be brought in. Main knows where it lives, so a renderer only ever names it by id.
export interface ImportSource {
  id: string;
  name: string;
  profiles: number;
  // A picture of its app on this computer, as a data address, or null where it couldn't be read.
  icon: string | null;
}

export type HistoryImportResult = { ok: true; added: number } | { ok: false };

export interface HistoryCursor {
  visitedAt: number;
  id: number;
}

// A page of history, and where the next one starts, if there is one.
export interface HistoryPage {
  entries: HistoryEntry[];
  next: HistoryCursor | null;
}

// One page in the history, for the address field: its newest visit and how many there were.
export interface VisitedPage {
  url: string;
  title: string;
  favicon: string | null;
  lastVisit: number;
  visits: number;
}
