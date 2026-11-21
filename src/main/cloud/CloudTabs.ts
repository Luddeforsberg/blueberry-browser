import { dirname, join } from "path";
import { safeStorage, type WebContents } from "electron";
import type { CloudState, CloudView } from "../../shared/ipc";
import { isLiveView } from "./browserbase";
import { forgetBefore, MAX_FIELD_LENGTH, NO_KEY, readCloud, sessionsFile, writeCloudIds, writeCloudKey, type Key } from "./cloudFile";
import { CloudKeys } from "./cloudKeys";
import type { CdpTab } from "../tools/CdpTab";
import type { ChatCloud } from "../chats/Chats";
import { CloudSessions } from "./cloudBrowser";
import type { CloudBrowser, CloudIds, Handle, Released } from "./cloudProvider";
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
const NOT_SEALED = "This computer couldn't keep the key encrypted, so nothing in the cloud can start. Open Blueberry again.";
const NOT_SAVED = "The key couldn't be saved.";
// Nothing is written, and no session started, while the cloud's files may say more than was read, until the user forgets
// the key and what couldn't be read with it.
const UNREADABLE =
  "Blueberry couldn't read its cloud settings, so nothing in the cloud can start. Open it again, or forget the key to start over.";
const NO_WINDOW = "Blueberry has no window open.";
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
  // Asking first, before Forget drops what couldn't be read, and the sessions only that could end.
  confirmForget: () => Promise<boolean>;
}

// One window's time with the cloud. Anything that finishes late acts only through the one it started in, and only while
// that window is still the one attached, since a reopened window's tabs have the same ids as the last one's.
type Attachment = { hooks: CloudTabsHooks };

export class CloudTabs implements ChatCloud {
  private key: Key;
  private readonly sessions: CloudSessions;
  private attached: Attachment | null = null;
  private problem: string | null = null;
  private unreadable: string | null;
  // The ids as last told, and whether `cloud.json` still has what an app before this one kept there.
  private ids: CloudIds;
  private before: boolean;
  // The key each session was made with.
  private readonly keys: CloudKeys;
  private readonly pictures: CloudPictures;
  // Settings > Cloud > Signed in to, and the tabs open to check it.
  readonly signedIn: SignedInTo;
  private quitting: Promise<void> | null = null;

  constructor(
    private readonly file: string,
    // The browser a saved key makes: Browserbase, a Chrome on this computer where an unpackaged app asked for one, or none.
    provider: (key: Key) => CloudBrowser | null,
    // That one site's cookies from this browser's own session. Nothing else.
    readCookies: (site: string) => Promise<StoredCookie[]>,
  ) {
    const read = readCloud(file);
    this.key = read.key;
    this.unreadable = read.unreadable ? UNREADABLE : null;
    this.ids = read.ids;
    this.before = read.fromBefore;
    this.keys = new CloudKeys(read.keys, provider);
    const browser = this.keys.browserOf(this.key);
    if (this.key.apiKey && !browser) this.problem = NOT_SEALED;
    this.sessions = new CloudSessions(browser, read.ids, {
      onChange: () => this.changed(),
      onIds: (ids) => this.keepIds(ids),
      browserFor: (handle) => this.keys.browserFor(handle),
    });
    this.pictures = new CloudPictures({
      page: (id) => this.page(id),
      working: (id) => !!this.sessions.usedBy(id) && !this.sessions.heldByUser(id),
      chrome: () => this.hooks?.chrome() ?? null,
    });
    this.signedIn = new SignedInTo(
      join(dirname(file), "cloud-logins.json"),
      {
        sessions: this.sessions,
        window: () => {
          const at = this.attached;
          return at && { ...at.hooks, still: () => this.still(at) !== null, retitle: (id) => this.retitle(at, id) };
        },
        page: (id) => this.page(id),
        confirm: (site) => this.hooks?.confirmLogin(site) ?? Promise.resolve(false),
        readCookies,
        onChange: () => this.changed(),
      },
      read.oldLoginsIn,
    );
    // Only now, with the sign-ins decided, what came from an app before this one goes into the sessions' file, and a
    // session pruned or a key no session names leaves it, so nothing sealed stays on disk for a session that has gone.
    const { handles } = this.sessions.ids;
    const named = new Set(handles.flatMap(({ keyId }) => (keyId ? [keyId] : [])));
    const stale = handles.length < read.ids.handles.length || Object.keys(read.keys).some((id) => !named.has(id));
    if (this.before || stale) this.keepIds(this.sessions.ids);
    this.shareKey(browser);
  }

  // A window opened. Its tabs show the cloud's pages, and its chrome hears about every change. What comes back is for its
  // close, and does nothing once another window has attached since.
  attach(hooks: CloudTabsHooks): () => Promise<Released> {
    const at: Attachment = { hooks };
    this.attached = at;
    this.changed();
    return () => (this.still(at) ? this.detach() : Promise.resolve("running"));
  }

  private get hooks(): CloudTabsHooks | null {
    return this.attached?.hooks ?? null;
  }

  // The window `at` is, if it's still the one attached.
  private still(at: Attachment): CloudTabsHooks | null {
    return at === this.attached ? at.hooks : null;
  }

  // The window closed, so the session ends, at the provider if need be. Its pages and tabs went with the window.
  private detach(): Promise<Released> {
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
      unreadable: this.unreadable !== null,
      problem: this.unreadable ?? this.problem ?? sessions.problem,
      logins: this.signedIn.list,
    };
  }

  private changed(): void {
    const chrome = this.hooks?.chrome();
    if (chrome && !chrome.isDestroyed()) sendToRenderer(chrome, "cloud:updated", this.state);
  }

  async saveKey(apiKey: unknown, projectId: unknown): Promise<CloudState> {
    const key = typeof apiKey === "string" ? apiKey.trim() : "";
    const project = typeof projectId === "string" ? projectId.trim() : "";
    this.problem = null;
    if (!key || !project || key.length > MAX_FIELD_LENGTH || project.length > MAX_FIELD_LENGTH) {
      this.problem = "Both the API key and the project id are needed.";
    } else if (!safeStorage.isEncryptionAvailable()) {
      this.problem = NOT_SAFE;
    } else if (!this.unreadable) {
      const next: Key = { apiKey: key, projectId: project };
      // Sealed before anything stops, so a key that can't be leaves the work in the cloud going.
      const browser = this.keys.browserOf(next);
      if (!browser) this.problem = NOT_SAFE;
      else await this.replaceWith(next, browser);
    }
    this.changed();
    return this.state;
  }

  // A session still running stays, with the key it was made with, so the new key never waits for it. Each project's
  // Context stays with it too. The sessions the key ends are kept with it first, since this writes over the key
  // `cloud.json` has now, which may be the only one that can end them.
  private async replaceWith(next: Key, browser: CloudBrowser): Promise<void> {
    this.letGoOfTabs();
    await this.sessions.replace(() => {
      if (this.shareKey(browser) && this.keep(next)) return { browser };
      this.problem = NOT_SAVED;
      return null;
    });
  }

  // A session of this browser's project with no key of its own that opens, as after the system's keychain changed, takes
  // this one, whether it was saved or brought from an app before this one, so a key for another project later doesn't
  // leave it with nothing to end it. Those that took it on a try whose write failed are written again with it. False if
  // that couldn't be kept.
  private shareKey(browser: CloudBrowser | null): boolean {
    const keyId = browser?.keyId;
    if (!keyId) return true;
    const takes = (handle: Handle) => handle.keyId === null || handle.keyId === keyId || this.keys.unopenable(handle);
    return this.sessions.giveKey((handle) => handle.by === browser.origin && takes(handle), keyId);
  }

  // Sessions still running stay, each with the key it was made with, until they've ended. What couldn't be read, and a
  // session whose key can't be opened, go only once the user has said so, since nothing here could end those.
  async forget(): Promise<CloudState> {
    const lost = (handle: Handle) => this.keys.unopenable(handle);
    if (this.unreadable || this.ids.handles.some(lost)) {
      if (!(await (this.hooks?.confirmForget() ?? Promise.resolve(false)))) return this.state;
      // The same load as a launch, from the files alone, so what reads now is kept, and only what still doesn't goes. The
      // sign-ins are decided first, as on a launch, before anything written takes the Context from before away.
      const again = readCloud(this.file);
      this.signedIn.load(again.oldLoginsIn);
      this.keys.load(again.keys);
      this.before = again.fromBefore;
      this.unreadable = null;
      this.sessions.load(again.ids);
    }
    this.letGoOfTabs();
    this.problem = null;
    await this.sessions.replace((released) => {
      this.problem = released === "refused" ? LEFT_RUNNING : null;
      if (!this.sessions.letGoOf(lost) || !this.keep(NO_KEY)) {
        this.problem = NOT_SAVED;
        return null;
      }
      return { browser: this.keys.browserOf(this.key) };
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
    if (this.unreadable || !writeCloudIds(sessionsFile(this.file), ids, this.keys.all)) return false;
    if (this.before) this.before = !forgetBefore(this.file);
    return true;
  }

  // On disk first, and only once the sessions' file has everything kept here, since this writes over the key in
  // `cloud.json`: what came from before, and a key given to a session whose own write failed, for which that key may be
  // the only one on disk. A key that couldn't be saved isn't used.
  private keep(key: Key): boolean {
    if (this.unreadable || !this.keepIds(this.ids) || !writeCloudKey(this.file, key)) {
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
