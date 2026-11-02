import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import { safeStorage, type WebContents } from "electron";
import type { CloudState, CloudView } from "../shared/ipc";
import { browserbase, type BrowserbaseSaved } from "./browserbase";
import type { CdpTab } from "./CdpTab";
import type { ChatCloud } from "./Chats";
import { CloudSessions, type CloudBrowser } from "./cloudBrowser";
import { sendToRenderer } from "./ipc";
import { localChrome } from "./localChrome";

// Settings > Cloud and the cloud tabs in the window. The Browserbase key and project id are kept with `safeStorage` and
// never leave main once saved. The live view, or the pictures standing in for it, go to the chrome and nowhere else: not
// to a tool, a chat or the disk. A cloud tab is an internal page in the window, drawn by the chrome, with its page in
// the cloud browser behind it.

const MAX_FIELD_LENGTH = 200;
const NOT_SAFE = "This computer can't keep the key encrypted, so it wasn't saved.";
const NOT_SAVED = "The key couldn't be saved.";

interface Saved extends BrowserbaseSaved {
  apiKey: string | null;
  projectId: string | null;
}

const EMPTY: Saved = { apiKey: null, projectId: null, contextId: null, sessionId: null };

export interface CloudTabsHooks {
  chrome: () => WebContents;
  // A tab in the window for a cloud page, behind the user. Says its id.
  openTab: (title: string) => string;
  updateTab: (id: string, title: string) => void;
  closeTab: (id: string) => void;
  // The user has taken this tab from the job that opened it.
  takenOver: (id: string) => void;
}

export class CloudTabs implements ChatCloud {
  private saved: Saved = EMPTY;
  private sessions: CloudSessions | null = null;
  private problem: string | null = null;
  private readonly taken = new Set<string>();
  private watching: CdpTab | null = null;

  constructor(
    private readonly file: string,
    private readonly hooks: CloudTabsHooks,
    // Only an unpackaged app gets these, like the other test hooks: a Chrome on this computer instead of Browserbase.
    private readonly local: { endpoint?: string; executable?: string } | null
  ) {}

  start(): void {
    this.saved = this.load();
    this.sessions = this.makeSessions();
  }

  private makeSessions(): CloudSessions | null {
    const browser: CloudBrowser | null = this.local
      ? localChrome(this.local)
      : this.saved.apiKey && this.saved.projectId
        ? browserbase({
            apiKey: this.saved.apiKey,
            projectId: this.saved.projectId,
            saved: { contextId: this.saved.contextId, sessionId: this.saved.sessionId },
            onSaved: ({ contextId, sessionId }) => {
              this.saved = { ...this.saved, contextId, sessionId };
              this.save();
            },
          })
        : null;
    return browser && new CloudSessions(browser, () => this.changed());
  }

  get state(): CloudState {
    const { sessions } = this;
    return {
      provider: sessions?.provider ?? null,
      configured: !!this.saved.apiKey && !!this.saved.projectId,
      status: sessions ? sessions.status : "off",
      busy: !!sessions?.busyWith,
      problem: this.problem ?? sessions?.problem ?? null,
    };
  }

  private changed(): void {
    const chrome = this.hooks.chrome();
    if (!chrome.isDestroyed()) sendToRenderer(chrome, "cloud:updated", this.state);
  }

  async saveKey(apiKey: unknown, projectId: unknown): Promise<CloudState> {
    const key = typeof apiKey === "string" ? apiKey.trim() : "";
    const project = typeof projectId === "string" ? projectId.trim() : "";
    this.problem = null;
    if (!key || !project || key.length > MAX_FIELD_LENGTH || project.length > MAX_FIELD_LENGTH) {
      this.problem = "Both the API key and the project id are needed.";
    } else if (!safeStorage.isEncryptionAvailable()) {
      this.problem = NOT_SAFE;
    } else {
      await this.end();
      // A new key may be a new account, where the old context and session don't exist.
      this.saved = { apiKey: key, projectId: project, contextId: null, sessionId: null };
      this.save();
      if (!this.local) this.sessions = this.makeSessions();
    }
    this.changed();
    return this.state;
  }

  async forget(): Promise<CloudState> {
    await this.end();
    this.saved = EMPTY;
    this.problem = null;
    this.save();
    if (!this.local) this.sessions = null;
    this.changed();
    return this.state;
  }

  // Ends the session at the provider and closes every cloud tab, whatever was working there.
  async end(): Promise<CloudState> {
    await this.watch(null);
    // The tabs go first, so nothing is left showing a page that's on its way out.
    (this.sessions?.pageIds ?? []).forEach((id) => this.hooks.closeTab(id));
    this.taken.clear();
    await this.sessions?.end();
    this.changed();
    return this.state;
  }

  // ChatCloud

  available(): boolean {
    return this.sessions !== null;
  }

  claim(jobId: string): boolean {
    return !!this.sessions?.claim(jobId);
  }

  release(jobId: string): void {
    this.sessions?.release(jobId);
  }

  async open(jobId: string, url: string): Promise<CdpTab> {
    const sessions = this.sessions;
    if (!sessions) throw new Error("The cloud browser is off.");
    const id = this.hooks.openTab(hostOf(url));
    try {
      return await sessions.open(jobId, id, url, {
        onChange: () => {
          const page = sessions.page(id);
          if (page) this.hooks.updateTab(id, page.title || hostOf(page.url));
        },
      });
    } catch (error) {
      this.hooks.closeTab(id);
      throw error;
    }
  }

  pagesOf(jobId: string): CdpTab[] {
    return this.sessions?.pagesOf(jobId).filter((tab) => !this.taken.has(tab.id)) ?? [];
  }

  page(id: string): CdpTab | null {
    return this.sessions?.page(id) ?? null;
  }

  // From a tool, for a page the job opened. The tab in the window goes with it.
  close(id: string): boolean {
    if (!this.page(id)) return false;
    this.hooks.closeTab(id);
    return true;
  }

  // The window closed the tab, so the page goes too.
  tabClosed(id: string): void {
    this.taken.delete(id);
    if (this.watching?.id === id) void this.watch(null);
    void this.sessions?.close(id);
  }

  // For the chrome

  async view(id: unknown): Promise<CloudView> {
    const page = typeof id === "string" ? this.page(id) : null;
    if (!page || !this.sessions) return { kind: "gone" };
    const takenOver = this.taken.has(page.id);
    const live = await this.sessions.liveView(page.id);
    if (live === null) return { kind: "frames", takenOver };
    // The chrome puts this in a frame, so it's only ever Browserbase's own page.
    return isLiveView(live) ? { kind: "live", url: live, takenOver } : { kind: "gone" };
  }

  async watch(id: unknown): Promise<void> {
    const page = typeof id === "string" ? this.page(id) : null;
    if (page === this.watching) return;
    const was = this.watching;
    this.watching = page;
    await was?.watch(null);
    await page?.watch((data) => {
      const chrome = this.hooks.chrome();
      if (this.watching === page && !chrome.isDestroyed()) sendToRenderer(chrome, "cloud:frame", { tabId: page.id, data });
    });
  }

  takeOver(id: unknown): boolean {
    if (typeof id !== "string" || !this.page(id)) return false;
    this.taken.add(id);
    this.hooks.takenOver(id);
    return true;
  }

  private load(): Saved {
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8"));
      const open = (value: unknown) => (typeof value === "string" && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value, "base64")) : null);
      const text = (value: unknown) => (typeof value === "string" && value.length <= MAX_FIELD_LENGTH ? value : null);
      return { apiKey: open(saved.apiKey), projectId: open(saved.projectId), contextId: text(saved.contextId), sessionId: text(saved.sessionId) };
    } catch {
      return EMPTY;
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const seal = (value: string | null) => value && safeStorage.encryptString(value).toString("base64");
      const temp = `${this.file}.tmp`;
      const { apiKey, projectId, contextId, sessionId } = this.saved;
      writeFileSync(temp, JSON.stringify({ apiKey: seal(apiKey), projectId: seal(projectId), contextId, sessionId }), { mode: 0o600 });
      renameSync(temp, this.file);
    } catch {
      this.problem = NOT_SAVED;
      console.error("Couldn't save the cloud settings.");
    }
  }

  destroy(): void {
    void this.end();
  }
}

const isLiveView = (url: string): boolean => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "browserbase.com" || hostname.endsWith(".browserbase.com"));
  } catch {
    return false;
  }
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).host || "Cloud tab";
  } catch {
    return "Cloud tab";
  }
};
