import type { CdpTab } from "../tools/CdpTab";
import type { CloudSessions } from "./cloudBrowser";
import { CloudLogins, loginSite, type CloudLoginsHooks } from "./cloudLogins";
import type { CloudLogin } from "../../shared/ipc";

// Settings > Cloud > Signed in to, from the chrome: only from Settings, so only the user starts any of it. `input` is
// what they picked or typed, which may be a whole address to open for the check. A check is a cloud tab in front, for the
// user to see whether they're signed in there. No job can reach one.

const NOT_A_SITE = "That isn't a site's address.";
const NO_WINDOW = "Blueberry has no window open.";

// The window something was asked from. Anything that finishes late acts on it only while it's still the one attached.
interface CheckWindow {
  openTab: (title: string) => string;
  closeTab: (id: string) => void;
  showTab: (id: string) => void;
  still: () => boolean;
  // The tab says where its page is.
  retitle: (id: string) => void;
}

export interface SignedInToHooks extends Pick<CloudLoginsHooks, "confirm" | "readCookies" | "onChange"> {
  sessions: CloudSessions;
  // The window attached now, if any.
  window: () => CheckWindow | null;
  page: (id: string) => CdpTab | null;
}

export class SignedInTo {
  private readonly logins: CloudLogins;
  // The tabs open to check, and the site each is for.
  private readonly checking = new Map<string, string>();

  constructor(
    file: string,
    private readonly hooks: SignedInToHooks,
    // The projects a list from before there was one per project may be in, or null while that can't be told.
    upgradeTo: string[] | null,
  ) {
    const { sessions, confirm, readCookies, onChange } = hooks;
    this.logins = new CloudLogins(file, { jar: () => (sessions.provider ? sessions : null), confirm, readCookies, onChange }, upgradeTo);
  }

  get list(): CloudLogin[] {
    return this.logins.logins;
  }

  // The list read again, as a launch reads it, with the projects a list from before may be in. False if what it decided
  // couldn't be kept.
  load(upgradeTo: string[] | null): boolean {
    return this.logins.load(upgradeTo);
  }

  // The site a tab is open to check, if it's one.
  siteOf(id: string): string | null {
    return this.checking.get(id) ?? null;
  }

  closed(id: string): void {
    this.checking.delete(id);
  }

  // A copy waiting on the user copies nothing, and the checks are no longer theirs.
  stop(): void {
    this.logins.cancelPending();
    this.checking.clear();
  }

  async bring(input: unknown): Promise<string | null> {
    const site = loginSite(input);
    if (!site) return NOT_A_SITE;
    const at = this.hooks.window();
    const problem = await this.logins.bring(site);
    // The check opens in the window it was asked from, or nowhere.
    return problem ?? (at?.still() ? await this.check(input) : NO_WINDOW);
  }

  async check(input: unknown): Promise<string | null> {
    const site = loginSite(input);
    if (!site) return NOT_A_SITE;
    const { sessions } = this.hooks;
    if (!sessions.provider) return "The cloud browser is off.";
    const at = this.hooks.window();
    if (!at) return NO_WINDOW;
    const url = typeof input === "string" && /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${site}/`;
    const id = at.openTab(site);
    // Noted before it opens, so the tab is the check's while it does.
    this.checking.set(id, site);
    try {
      // The user's from the start. Null if they closed the tab while it opened.
      if (!(await sessions.openForUser(id, url, { onChange: () => at.retitle(id) }))) return null;
    } catch {
      // A window that has closed took the tab and the check with it, and the next one's may have the same id.
      if (at.still()) {
        this.checking.delete(id);
        at.closeTab(id);
      }
      return "The cloud browser couldn't open it.";
    }
    if (at.still()) at.showTab(id);
    this.hooks.onChange();
    return null;
  }

  mark(input: unknown, signedIn: unknown): void {
    const site = loginSite(input);
    if (site) this.logins.mark(site, signedIn === true);
  }

  // A tab open to check that site loads again, so the user sees it signed out.
  async revoke(input: unknown): Promise<string | null> {
    const site = loginSite(input);
    if (!site) return NOT_A_SITE;
    const problem = await this.logins.revoke(site);
    if (!problem) this.reload((checked) => checked === site);
    return problem;
  }

  async forgetAll(): Promise<string | null> {
    const problem = await this.logins.forgetAll();
    if (!problem) this.reload(() => true);
    return problem;
  }

  private reload(which: (site: string) => boolean): void {
    this.checking.forEach((site, id) => {
      const page = this.hooks.page(id);
      if (page && which(site)) void page.loadURL(page.url).catch(() => {});
    });
  }
}
