import { randomUUID } from "crypto";
import { existsSync, mkdirSync, promises as fs, readFileSync, renameSync, writeFileSync } from "fs";
import { basename, dirname, extname, isAbsolute, join } from "path";
import type { DownloadItem } from "electron";
import type { DownloadAction, DownloadInfo, DownloadState, Settings } from "../shared/ipc";

type Item = Pick<
  DownloadItem,
  | "getFilename" | "getURL" | "getSavePath" | "setSavePath" | "setSaveDialogOptions"
  | "getReceivedBytes" | "getTotalBytes" | "isPaused" | "canResume" | "pause" | "resume" | "cancel"
> & {
  on(event: "updated", listener: (event: unknown, state: "progressing" | "interrupted") => void): unknown;
  once(event: "done", listener: (event: unknown, state: "completed" | "cancelled" | "interrupted") => void): unknown;
};

export interface DownloadsDeps {
  settings: () => Pick<Settings, "downloadFolder" | "askWhereToSave">;
  systemFolder: () => string;
  openPath: (path: string) => Promise<string>;
  showItemInFolder: (path: string) => void;
}

// Keeps the saved list and the page short. The oldest finished downloads drop off first.
const MAX_DOWNLOADS = 200;
// Most file systems allow 255 bytes in a name, which leaves room for " (123)".
const MAX_NAME_BYTES = 200;
// Progress arrives many times a second, far more often than anyone can read it.
const PROGRESS_INTERVAL_MS = 200;

const STATES: readonly DownloadState[] = ["progressing", "paused", "completed", "cancelled", "interrupted"];

// A site picks the suggested name, so nothing in it may leave the folder or hide what the file is.
export const safeFilename = (raw: string): string => {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "");
  const ext = extname(cleaned);
  const stem = Array.from(cleaned.slice(0, cleaned.length - ext.length));
  while (stem.length > 0 && Buffer.byteLength(stem.join("") + ext) > MAX_NAME_BYTES) stem.pop();
  const name = stem.join("") + ext;
  return stem.length > 0 && Buffer.byteLength(name) <= MAX_NAME_BYTES ? name : "download";
};

// "report (1).pdf", and "backup (1).tar.gz" rather than "backup.tar (1).gz".
export const uniquePath = (folder: string, name: string, isTaken: (path: string) => boolean): string => {
  const ext = /\.tar\.[^.]+$/i.exec(name)?.[0] ?? extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = join(folder, name);
  for (let n = 1; isTaken(candidate); n++) candidate = join(folder, `${stem} (${n})${ext}`);
  return candidate;
};

// Only the site is kept, because a download's full address can carry tokens or a whole data: file.
const sourceOf = (url: string): string | null => {
  try {
    const { protocol, host } = new URL(url);
    if (protocol === "blob:") return sourceOf(url.slice("blob:".length));
    return /^https?:$/.test(protocol) ? host : null;
  } catch {
    return null;
  }
};

// Anything running when the app last closed has stopped for good, since its item is gone.
const readSaved = (raw: unknown): DownloadInfo | null => {
  const entry = (raw && typeof raw === "object" ? raw : {}) as Partial<DownloadInfo>;
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
  if (typeof entry.id !== "string" || typeof entry.filename !== "string" || typeof entry.path !== "string") return null;
  if (entry.path !== "" && !isAbsolute(entry.path)) return null;
  if (!STATES.includes(entry.state as DownloadState)) return null;
  return {
    id: entry.id,
    filename: entry.filename,
    path: entry.path,
    source: typeof entry.source === "string" ? entry.source : null,
    state: entry.state === "progressing" || entry.state === "paused" ? "interrupted" : (entry.state as DownloadState),
    receivedBytes: number(entry.receivedBytes),
    totalBytes: number(entry.totalBytes),
    startedAt: number(entry.startedAt),
    canResume: false,
    missing: false,
  };
};

export class Downloads {
  // Newest first.
  private records: DownloadInfo[] = [];
  private readonly live = new Map<string, Item>();
  private readonly listeners = new Set<(downloads: DownloadInfo[]) => void>();
  private progressTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly file: string,
    private readonly deps: DownloadsDeps
  ) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(raw)) {
        this.records = raw.map(readSaved).filter((entry): entry is DownloadInfo => entry !== null);
      }
    } catch {
      // A missing or unreadable file leaves the list empty, like settings.
    }
  }

  get list(): DownloadInfo[] {
    return this.records;
  }

  onChange(listener: (downloads: DownloadInfo[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Has to set the path before returning, or Electron shows its own save dialog.
  track(item: Item): void {
    const { askWhereToSave } = this.deps.settings();
    const name = safeFilename(item.getFilename());
    const folder = this.folder();
    let path = "";
    if (askWhereToSave) {
      item.setSaveDialogOptions({ defaultPath: join(folder, name) });
    } else {
      path = uniquePath(folder, name, (candidate) => existsSync(candidate) || this.isReserved(candidate));
      item.setSavePath(path);
    }

    const record: DownloadInfo = {
      id: randomUUID(),
      filename: path ? basename(path) : name,
      path,
      source: sourceOf(item.getURL()),
      state: "progressing",
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      startedAt: Date.now(),
      canResume: false,
      missing: false,
    };
    this.live.set(record.id, item);
    this.records = [record, ...this.records];
    this.trim();
    this.saved();

    item.on("updated", (_, state) => {
      this.sync(record.id, item, state === "interrupted" ? "interrupted" : item.isPaused() ? "paused" : "progressing");
    });
    item.once("done", (_, state) => {
      this.live.delete(record.id);
      // Cancelling the save dialog cancels the download before it ever had a file.
      if (state === "cancelled" && !item.getSavePath()) {
        this.records = this.records.filter((entry) => entry.id !== record.id);
        this.saved();
        return;
      }
      this.sync(record.id, item, state);
    });
  }

  async act(id: string, action: DownloadAction): Promise<boolean> {
    const record = this.records.find((entry) => entry.id === id);
    if (!record) return false;
    const item = this.live.get(id);

    switch (action) {
      case "pause":
        if (!item || record.state !== "progressing") return false;
        item.pause();
        this.sync(id, item, "paused");
        return true;
      case "resume":
        if (!item || !item.canResume()) return false;
        item.resume();
        this.sync(id, item, "progressing");
        return true;
      case "cancel":
        if (!item) return false;
        item.cancel();
        return true;
      case "open":
      case "show": {
        if (record.state !== "completed" || !(await this.checkFile(record))) return false;
        if (action === "show") {
          this.deps.showItemInFolder(record.path);
          return true;
        }
        const error = await this.deps.openPath(record.path);
        if (error) console.error("Failed to open a download:", error);
        return !error;
      }
      case "remove":
        if (item) return false;
        this.records = this.records.filter((entry) => entry.id !== id);
        this.saved();
        return true;
      default:
        return false;
    }
  }

  // Files can go at any time without telling us, so this looks whenever someone is about to see the list.
  async refresh(): Promise<DownloadInfo[]> {
    await Promise.all(this.records.filter((entry) => entry.state === "completed").map((entry) => this.checkFile(entry)));
    return this.records;
  }

  private async checkFile(record: DownloadInfo): Promise<boolean> {
    const exists = await fs.access(record.path).then(() => true, () => false);
    if (exists === !record.missing) return exists;
    this.records = this.records.map((entry) => (entry.id === record.id ? { ...entry, missing: !exists } : entry));
    this.notify();
    return exists;
  }

  private folder(): string {
    const chosen = this.deps.settings().downloadFolder;
    const system = this.deps.systemFolder();
    // The chosen folder can be on a drive that's gone. The file still has to land somewhere the user can find it.
    for (const folder of chosen ? [chosen, system] : [system]) {
      try {
        mkdirSync(folder, { recursive: true });
        return folder;
      } catch (error) {
        console.error(`Failed to use ${folder} for downloads:`, error);
      }
    }
    return system;
  }

  // An unfinished file isn't at its final path yet, and two can want the same name at once.
  private isReserved(path: string): boolean {
    const wanted = path.toLowerCase();
    return this.records.some((entry) => this.live.has(entry.id) && entry.path.toLowerCase() === wanted);
  }

  private sync(id: string, item: Item, state: DownloadState): void {
    const before = this.records.find((entry) => entry.id === id);
    if (!before) return;
    const path = item.getSavePath();
    const after: DownloadInfo = {
      ...before,
      state,
      path: path || before.path,
      filename: path ? basename(path) : before.filename,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      canResume: this.live.has(id) && state === "interrupted" && item.canResume(),
    };
    this.records = this.records.map((entry) => (entry.id === id ? after : entry));
    if (after.state !== before.state || after.path !== before.path) this.saved();
    else this.notifySoon();
  }

  private trim(): void {
    let extra = this.records.length - MAX_DOWNLOADS;
    if (extra <= 0) return;
    this.records = [...this.records].reverse().filter((entry) => {
      if (extra <= 0 || this.live.has(entry.id)) return true;
      extra -= 1;
      return false;
    }).reverse();
  }

  // Only changes of state reach the disk, so progress never writes the file many times a second.
  private saved(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify(this.records, null, 2));
      renameSync(temp, this.file);
    } catch (error) {
      console.error("Failed to save the downloads list:", error);
    }
    this.notify();
  }

  private notify(): void {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = null;
    this.listeners.forEach((listener) => listener(this.records));
  }

  private notifySoon(): void {
    if (this.progressTimer) return;
    this.progressTimer = setTimeout(() => this.notify(), PROGRESS_INTERVAL_MS);
  }
}
