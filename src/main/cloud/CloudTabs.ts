import { dirname, join } from "path";
import { safeStorage, type WebContents } from "electron";
import type { CloudState, CloudView } from "../../shared/ipc";
import { browserbaseOrigin, isLiveView } from "./browserbase";
import { forgetBefore, MAX_FIELD_LENGTH, NO_KEY, readCloud, sessionsFile, writeCloudIds, writeCloudKey, type Key } from "./cloudFile";
import type { CdpTab } from "../tools/CdpTab";
import type { ChatCloud } from "../chats/Chats";
import { CloudSessions } from "./cloudBrowser";
import type { CloudBrowser, CloudIds, Released } from "./cloudProvider";
import type { StoredCookie } from "./cloudLogins";
import { SignedInTo } from "./signedInTo";
import { sendToRenderer } from "../window/ipc";
import { CloudPictures } from "./cloudPictures";

// Settings > Cloud and the cloud tabs in the window. One for the app's whole life, whichever window is open, with one
// `CloudSessions` that's never replaced. The Browserbase key and project id are kept with `safeStorage` and never leave
// main once saved. The live view, or the pictures standing in for it, go to the chrome and nowhere else: not to a tool, a
// chat or the disk. A cloud tab is an internal page in the window, drawn by the chrome, with its page in the cloud
// browser behind it.

const NOT_SAFE = "This computer can't keep the key encrypted, so it wasn't saved.";
const NOT_SAVED = "The key couldn't be saved.";
// Nothing is written, and no session started, while the cloud's files may say more than was read.
const UNREADABLE = "Blueberry couldn't read its cloud settings, so it won't change them or start a cloud session. Quit and open it again.";
const NO_WINDOW = "Blueberry has no window open.";
// The session's id is the only way to end it, and it goes with the key, unless Browserbase no longer takes that key.
const STILL_RUNNING = "The cloud session didn't confirm it ended, so the key was kept to end it with. Press End again first.";
const KEPT_FOR_OTHER = "A Browserbase session from before may still be running, so its key was kept to end it with.";
const LEFT_RUNNING = "Browserbase no longer takes that key, so its last session couldn't be ended. It ends on its own within an hour.";

// The open window's part.
export interface CloudTabsHooks {
  chrome: () => WebContents;
  // A tab in the window for a cloud page, behind the user. Says its id.
  openTab: (title: string) => string;
  updateTab: (id: string, title: string) => void;
  closeTab: (id: string) => void;
  // The user has taken this tab from the job that opened it.
  takenOver: (id: string) => void;
  // Puts a tab in front, for a site the user opened to check.
  showTab: (id: string) => void;
  // Touch ID, or a plain confirm where there's none, before a site's cookies are read.
  confirmLogin: (site: string) => Promise<boolean>;
}

// One window's time with the cloud. Anything that finishes late acts only through the one it started in, and only while
// that window is still the one attached, since a reopened window's tabs have the same ids as the last one's.
type Attachment = { hooks: CloudTabsHooks };

export class CloudTabs implements ChatCloud {
  private key: Key;
  private readonly sessions: CloudSessions;
  private attached: Attachment | null = null;
  private problem: string | null = null;
  private readonly unreadable: string | null;
  // The ids as last told, and whether `cloud.json` still has what an app before this one kept there.
  private ids: CloudIds;
  private before: boolean;
  // Forget or a new key kept the key, for a session the provider didn't confirm had ended or another provider made.
  private endFirst = false;
  private readonly pictures: CloudPictures;
  // Settings > Cloud > Signed in to, and the tabs open to check it.
  readonly signedIn: SignedInTo;
  private quitting: Promise<void> | null = null;

  constructor(
    private readonly file: string,
    // The browser a saved key makes: Browserbase, a Chrome on this computer where an unpackaged app asked for one, or none.
    private readonly provider: (key: Key) => CloudBrowser | null,
    // That one site's cookies from this browser's own session. Nothing else.
    readCookies: (site: string) => Promise<StoredCookie[]>,
  ) {
    const read = readCloud(file);
    this.key = read.key;
    this.unreadable = read.unreadable ? UNREADABLE : null;
    this.ids = read.ids;
    this.before = read.fromBefore;
    if (this.before) this.keepIds(read.ids);
    this.sessions = new CloudSessions(provider(this.key), read.ids, {
      onChange: () => this.changed(),
      onIds: (ids) => this.keepIds(ids),
    });
    this.pictures = new CloudPictures({
      page: (id) => this.page(id),
      working: (id) => !!this.sessions.usedBy(id) && !this.sessions.heldByUser(id),
      chrome: () => this.hooks?.chrome() ?? null,
    });
    this.signedIn = new SignedInTo(join(dirname(file), "cloud-logins.json"), {
      sessions: this.sessions,
      window: () => {
        const at = this.attached;
        return at && { ...at.hooks, still: () => this.still(at) !== null, retitle: (id) => this.retitle(at, id) };
      },
      page: (id) => this.page(id),
      confirm: (site) => this.hooks?.confirmLogin(site) ?? Promise.resolve(false),
      readCookies,
      onChange: () => this.changed(),
    });
  }

  // A window opened. Its tabs show the cloud's pages, and its chrome hears about every change.
  attach(hooks: CloudTabsHooks): void {
    this.attached = { hooks };
    this.changed();
  }

  private get hooks(): CloudTabsHooks | null {
    return this.attached?.hooks ?? null;
  }

  // The window `at` is, if it's still the one attached.
  private still(at: Attachment): CloudTabsHooks | null {
    return at === this.attached ? at.hooks : null;
  }

  // The window closed, so the session ends, at the provider if need be. Its pages and tabs went with the window.
  detach(): Promise<Released> {
    this.attached = null;
    const ending = this.sessions.end();
    this.stopWork();
    return ending;
  }

  // The Browserbase Context the sites brought along are in, for the cloud runner. Only its id: the cookies stay there.
  get contextId(): string | null {
    return this.sessions.provider === "browserbase" ? this.sessions.contextId : null;
  }

  get state(): CloudState {
    const { sessions } = this;
    return {
      provider: sessions.provider,
      configured: !!this.key.apiKey && !!this.key.projectId,
      status: sessions.provider ? sessions.status : "off",
      busy: !!sessions.busyWith,
      canEnd: sessions.canEnd,
      unreleased: sessions.unreleased,
      problem: this.unreadable ?? this.problem ?? this.waitedFor ?? sessions.problem,
      logins: this.signedIn.list,
    };
  }

  // Why Forget or a new key kept the key, while that's still so.
  private get waitedFor(): string | null {
    if (!this.endFirst) return null;
    if (this.sessions.canEnd) return STILL_RUNNING;
    return this.keyNeeded ? KEPT_FOR_OTHER : null;
  }

  // Whether the saved key is the only way to end a session the browser now can't, as when a Chrome on this computer
  // stands in for Browserbase.
  private get keyNeeded(): boolean {
    const origin = this.key.projectId ? browserbaseOrigin(this.key.projectId) : null;
    return origin !== null && origin !== this.sessions.origin && this.sessions.keptBy(origin);
  }

  private changed(): void {
    // Once nothing is left to end, however it ended, there's nothing to wait for.
    if (!this.waitedFor) this.endFirst = false;
    const chrome = this.hooks?.chrome();
    if (chrome && !chrome.isDestroyed()) sendToRenderer(chrome, "cloud:updated", this.state);
  }

  async saveKey(apiKey: unknown, projectId: unknown): Promise<CloudState> {
    const key = typeof apiKey === "string" ? apiKey.trim() : "";
    const project = typeof projectId === "string" ? projectId.trim() : "";
    this.problem = null;
    this.endFirst = false;
    if (!key || !project || key.length > MAX_FIELD_LENGTH || project.length > MAX_FIELD_LENGTH) {
      this.problem = "Both the API key and the project id are needed.";
    } else if (!safeStorage.isEncryptionAvailable()) {
      this.problem = NOT_SAFE;
    } else if (!this.unreadable) {
      this.letGoOfTabs();
      await this.sessions.replace((released) => {
        const next: Key = { apiKey: key, projectId: project };
        const browser = this.provider(next);
        // The key that made a session still running is kept until it has ended, since a new one, even for the same
        // project, may not work. Each project's Context stays with it.
        if (released === "running" || this.keyNeeded) {
          this.endFirst = true;
          return null;
        }
        return this.keep(next) ? { browser } : null;
      });
    }
    this.changed();
    return this.state;
  }

  async forget(): Promise<CloudState> {
    if (this.unreadable) return this.state;
    this.letGoOfTabs();
    this.problem = null;
    this.endFirst = false;
    await this.sessions.replace((released) => {
      this.endFirst = released === "running" || this.keyNeeded;
      this.problem = released === "refused" ? LEFT_RUNNING : null;
      if (this.endFirst || !this.keep(NO_KEY)) return null;
      return { browser: this.provider(this.key) };
    });
    this.changed();
    return this.state;
  }

  // Ends the session at the provider and closes every cloud tab, whatever was working there.
  async end(): Promise<CloudState> {
    this.letGoOfTabs();
    await this.sessions.end();
    return this.state;
  }

  // Before an ending, the tabs close, so nothing is left showing a page that's on its way out.
  private letGoOfTabs(): void {
    this.sessions.pageIds.forEach((id) => this.hooks?.closeTab(id));
    this.stopWork();
  }

  // Everything here that isn't the session: a copy waiting on the user copies nothing, and the pictures stop.
  private stopWork(): void {
    this.signedIn.stop();
    this.pictures.stop();
  }

  // ChatCloud

  available(): boolean {
    return this.attached !== null && this.sessions.provider !== null;
  }

  claim(jobId: string): boolean {
    return this.sessions.claim(jobId);
  }

  release(jobId: string): void {
    const pages = this.sessions.pagesOf(jobId).map(({ id }) => id);
    this.sessions.release(jobId);
    pages.forEach((id) => void this.pictures.applyFit(id));
  }

  async open(jobId: string, url: string, allows?: (url: string) => boolean): Promise<CdpTab> {
    const at = this.attached;
    if (!at) throw new Error(NO_WINDOW);
    const id = at.hooks.openTab(hostOf(url));
    try {
      return await this.sessions.open(jobId, id, url, { onChange: () => this.retitle(at, id) }, allows);
    } catch (error) {
      // Only a tab that's still in the window: one that closed with it is gone, and its id may be another tab's now.
      this.still(at)?.closeTab(id);
      throw error;
    }
  }

  // The tab in the window says where its page is.
  private retitle(at: Attachment, id: string): void {
    const page = this.sessions.page(id);
    if (page) this.still(at)?.updateTab(id, page.title || hostOf(page.url));
  }

  // After a handoff the user said they were done with, the job may use the page again.
  giveBack(id: string): void {
    if (!this.sessions.heldByUser(id)) return;
    this.sessions.letGo(id);
    this.changed();
  }

  pagesOf(jobId: string): CdpTab[] {
    return this.sessions.pagesOf(jobId).filter((tab) => !this.sessions.heldByUser(tab.id));
  }

  page(id: string): CdpTab | null {
    return this.sessions.page(id);
  }

  // From a tool, for a page the job opened. The tab in the window goes with it.
  close(id: string): boolean {
    if (!this.page(id) || !this.hooks) return false;
    this.hooks.closeTab(id);
    return true;
  }

  // The window closed the tab, so the page goes too, and the user has let go of it.
  tabClosed(id: string): void {
    this.signedIn.closed(id);
    this.pictures.forget(id);
    this.sessions.letGo(id);
    void this.sessions.close(id);
  }

  // For the chrome

  async view(id: unknown): Promise<CloudView> {
    const page = typeof id === "string" ? this.page(id) : null;
    if (!page) return { kind: "gone" };
    const takenOver = this.sessions.heldByUser(page.id);
    const live = await this.sessions.liveView(page.id);
    const checking = this.signedIn.siteOf(page.id);
    if (live === null) return { kind: "frames", takenOver, checking };
    // The chrome puts this in a frame, so it's only ever Browserbase's own page.
    return isLiveView(live) ? { kind: "live", url: live, takenOver, checking } : { kind: "gone" };
  }

  watch(id: unknown): Promise<void> {
    return this.pictures.watch(id);
  }

  fit(id: unknown, width: unknown, height: unknown): Promise<void> {
    return this.pictures.fit(id, width, height);
  }

  takeOver(id: unknown): boolean {
    if (typeof id !== "string" || !this.page(id) || !this.hooks) return false;
    this.sessions.holdForUser(id);
    this.hooks.takenOver(id);
    this.changed();
    void this.pictures.applyFit(id);
    return true;
  }

  // What an app before this one kept leaves `cloud.json` only once it's in the sessions' file.
  private keepIds(ids: CloudIds): boolean {
    this.ids = ids;
    if (this.unreadable || !writeCloudIds(sessionsFile(this.file), ids)) return false;
    if (this.before) this.before = !forgetBefore(this.file);
    return true;
  }

  // On disk first, and only once what came from before is in the sessions' file, since this writes over `cloud.json`. A
  // key that couldn't be saved isn't used.
  private keep(key: Key): boolean {
    if (this.unreadable || (this.before && !this.keepIds(this.ids)) || !writeCloudKey(this.file, key)) {
      this.problem = NOT_SAVED;
      return false;
    }
    this.key = key;
    return true;
  }

  // The app is quitting. The session ends at the provider, from its saved id, without waiting for a connection, and a
  // local browser closes. The same promise however often it's asked.
  quit(): Promise<void> {
    this.quitting ??= (async () => {
      this.stopWork();
      await this.sessions.quit();
    })().catch(() => {});
    return this.quitting;
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host || "Cloud tab";
  } catch {
    return "Cloud tab";
  }
};
