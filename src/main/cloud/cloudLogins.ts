import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CloudLogin, CloudLoginStatus } from "../../shared/ipc";
import { fieldsOf } from "../../shared/fields";
import { Latest } from "../../shared/lateWork";

// Sites the user has brought into the cloud browser, signed in. Plain Node, so a runner without a window can use it.
// Cookie values pass through here on their way into the cloud browser and are never kept: the list on disk has each
// site's name and dates and nothing else. Each project has its own list, as it has its own Context, which is where the
// sign-ins are.

export const MAX_SITES = 50;
export const MAX_PROJECTS = 100;
const MAX_SITE_LENGTH = 253;
const STATUSES: CloudLoginStatus[] = ["brought", "checked", "signed-out"];

const isIp = (host: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

// What the user typed or picked, as the host it names: no scheme, path, port or "www.". Null if it isn't one.
export const loginSite = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  const text = input.trim().toLowerCase();
  if (!text || text.length > MAX_SITE_LENGTH + 20) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (!host.includes(".") || host.length > MAX_SITE_LENGTH || !/^[a-z0-9.-]+$/.test(host) || host.split(".").some((label) => !label))
    return null;
  return host;
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Which cookie domains belong to a site: the site itself and its subdomains, whether only for that host ("example.com")
// or for it and below (".example.com"), and cookies a parent domain set for all its subdomains (".example.com" for
// "mail.example.com"), which the site gets anyway. A parent never reaches a public suffix, because browsers refuse
// cookies there. Nothing else, so another site's cookies can't match.
// The domains above a site that can set cookies for it, nearest first: "example.com" for "shop.example.com".
export const parentDomains = (site: string): string[] => {
  const labels = site.split(".");
  return isIp(site) ? [] : labels.slice(1, -1).map((_, index) => labels.slice(index + 1).join("."));
};

export const cookieDomainPattern = (site: string): RegExp => {
  const parents = parentDomains(site);
  const own = `\\.?(?:[^.]+\\.)*${escape(site)}`;
  return new RegExp(`^(?:${[own, ...parents.map((parent) => `\\.${escape(parent)}`)].join("|")})$`, "i");
};

// A cookie as Electron's session gives it, with only what's needed to set it again.
export interface StoredCookie {
  name: string;
  value: string;
  domain?: string;
  hostOnly?: boolean;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: "unspecified" | "no_restriction" | "lax" | "strict";
}

// As Playwright's `context.addCookies` takes it.
export interface CloudCookie {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

const SAME_SITE: Record<string, CloudCookie["sameSite"]> = { no_restriction: "None", lax: "Lax", strict: "Strict" };

// Only this site's cookies, ready to set in the cloud browser. Anything for another site, or already expired, is left out.
export const cookiesForSite = (cookies: StoredCookie[], site: string, now = Date.now()): CloudCookie[] => {
  const pattern = cookieDomainPattern(site);
  return cookies.flatMap((cookie): CloudCookie[] => {
    const domain = (cookie.domain ?? "").toLowerCase();
    if (!domain || !pattern.test(domain)) return [];
    // Electron can give a host-only cookie's domain with a dot in front, and it goes back as host-only all the same.
    const hostOnly = cookie.hostOnly ?? !domain.startsWith(".");
    const host = domain.replace(/^\./, "");
    // A host-only cookie from a parent domain never reaches this site.
    if (hostOnly && host !== site && !host.endsWith(`.${site}`)) return [];
    if (cookie.expirationDate !== undefined && cookie.expirationDate * 1000 <= now) return [];
    const path = cookie.path || "/";
    const sameSite = cookie.sameSite ? SAME_SITE[cookie.sameSite] : undefined;
    return [
      {
        name: cookie.name,
        value: cookie.value,
        // An undotted domain keeps a cookie to that host, and a dotted one takes in its subdomains. Never an address,
        // from which Playwright would take a wider path.
        domain: hostOnly ? host : `.${host}`,
        path,
        ...(cookie.expirationDate !== undefined ? { expires: Math.floor(cookie.expirationDate) } : {}),
        httpOnly: !!cookie.httpOnly,
        secure: !!cookie.secure,
        // Chrome refuses SameSite=None without Secure, so that one is left to the browser's default.
        ...(sameSite && !(sameSite === "None" && !cookie.secure) ? { sameSite } : {}),
      },
    ];
  });
};

// Sites to suggest from addresses in history and bookmarks, most visited first, leaving out any already brought along.
export const suggestLoginSites = (urls: string[], already: string[], max = 8): string[] => {
  const counts = new Map<string, number>();
  urls.forEach((url) => {
    if (!/^https?:\/\//i.test(url)) return;
    const site = loginSite(url);
    if (site && !isIp(site) && !already.includes(site)) counts.set(site, (counts.get(site) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([site]) => site);
};

const time = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

// Only the fields a login has, so nothing else can be read from or written to the file.
export const parseLogins = (data: unknown): CloudLogin[] => {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  return data.slice(0, MAX_SITES).flatMap((entry): CloudLogin[] => {
    const { site: rawSite, addedAt, checkedAt, status } = fieldsOf(entry);
    const site = loginSite(rawSite);
    const added = time(addedAt);
    if (!site || site !== rawSite || !added || seen.has(site)) return [];
    seen.add(site);
    return [
      {
        site,
        addedAt: added,
        checkedAt: time(checkedAt),
        status: STATUSES.includes(status as CloudLoginStatus) ? (status as CloudLoginStatus) : "brought",
      },
    ];
  });
};

// Each project's list, by the origin its Context is kept under, every one of them. A list from before there was one per
// project is an array, and goes to each of the projects in `upgradeTo` it may be in.
const parseLists = (data: unknown, upgradeTo: string[]): Record<string, CloudLogin[]> => {
  if (Array.isArray(data)) return Object.fromEntries(upgradeTo.map((origin) => [origin, parseLogins(data)]));
  const lists = Object.entries(fieldsOf(fieldsOf(data).projects));
  return Object.fromEntries(lists.map(([origin, list]) => [origin, parseLogins(list)]));
};

// Bringing a site along again starts its check over.
const withLogin = (logins: CloudLogin[], site: string, now = Date.now()): CloudLogin[] => {
  const added: CloudLogin = { site, addedAt: now, checkedAt: null, status: "brought" };
  return [added, ...logins.filter((login) => login.site !== site)];
};

const withoutLogin = (logins: CloudLogin[], site: string): CloudLogin[] => logins.filter((login) => login.site !== site);

const withCheck = (logins: CloudLogin[], site: string, signedIn: boolean, now = Date.now()): CloudLogin[] =>
  logins.map(
    (login): CloudLogin => (login.site === site ? { ...login, checkedAt: now, status: signedIn ? "checked" : "signed-out" } : login),
  );

// The part of a Playwright browser context this needs.
export interface CookieJar {
  addCookies(cookies: CloudCookie[]): Promise<void>;
  clearCookies(options?: { domain?: RegExp }): Promise<void>;
}

export interface CloudLoginsHooks {
  // Runs `act` on the cloud browser's context, starting it if need be. `account` is who the provider is, a new one with
  // each key, and `origin` the project whose Context it is. Null while the cloud is off.
  jar: () => {
    readonly account: object;
    readonly origin: string | null;
    withContext<T>(act: (jar: CookieJar) => Promise<T>): Promise<T>;
  } | null;
  // Touch ID, or a plain confirm where there's none. Asked before any cookie is read.
  confirm: (site: string) => Promise<boolean>;
  // This site's cookies from the user's own browser, and nobody else's.
  readCookies: (site: string) => Promise<StoredCookie[]>;
  onChange: () => void;
}

const NOT_TAKEN = "The cloud browser didn't take that. Try again.";
const BROWSER_GONE = "Nothing was brought along, because the cloud browser ended or its key changed meanwhile.";
const KEY_CHANGED = "Nothing was taken out, because the cloud browser's key changed meanwhile. Try again.";

// Bringing a site's sign-in into the cloud browser, one site at a time, and taking it out again. Only main calls this,
// from Settings, and the list of sites goes to `cloud-logins.json` with names and dates only, one list for each project.
// Each act is on the project of the browser it started with. A cookie lives only in memory on its way to the cloud
// browser, and no error that might quote one is passed on.
export class CloudLogins {
  private lists: Record<string, CloudLogin[]> = {};
  // A list from before there was one per project, while it can't be told whose it is, which nothing may write over.
  private undecided = false;
  private busy = false;
  // The cloud browser as it is now. It ends or is replaced with a new one, so a copy still waiting on the user never lands
  // in it.
  private readonly browsers = new Latest();
  private browser = this.browsers.next();

  constructor(
    private readonly file: string,
    private readonly hooks: CloudLoginsHooks,
    // The projects a list from before there was one per project may be in, or null while that can't be told.
    upgradeTo: string[] | null = [],
  ) {
    this.load(upgradeTo);
  }

  // What the file lists, read as a launch reads it, in place of what's kept: on a launch, and when the cloud's files are
  // read again on Forget. A list from before there was one per project goes to the projects in `upgradeTo` and is kept
  // as theirs at once, so a key saved later can't take it, or stays as it is while that's null.
  load(upgradeTo: string[] | null): void {
    let data: unknown = null;
    try {
      data = JSON.parse(readFileSync(this.file, "utf8"));
    } catch {
      // Nothing listed.
    }
    this.undecided = Array.isArray(data) && upgradeTo === null;
    this.lists = parseLists(data, upgradeTo ?? []);
    if (Array.isArray(data) && upgradeTo) this.write();
  }

  // The current project's.
  get logins(): CloudLogin[] {
    return this.listOf(this.hooks.jar()?.origin ?? null);
  }

  private listOf(origin: string | null): CloudLogin[] {
    return origin ? (this.lists[origin] ?? []) : [];
  }

  // The cloud browser ended, or its key was forgotten or changed. Anything still waiting copies nothing.
  cancelPending(): void {
    this.browser = this.browsers.next();
  }

  // Says what went wrong, or null once it's in.
  async bring(site: string): Promise<string | null> {
    const jar = this.hooks.jar();
    if (!jar) return "The cloud browser is off.";
    // What the user confirms is for this browser and this account, so nothing lands after either has changed.
    const { browser } = this;
    const { account, origin } = jar;
    if (!origin) return "The cloud browser is off.";
    const list = () => this.listOf(origin);
    // Every site on the list needs its Remove, so a full list takes no more until one comes off.
    if (list().length >= MAX_SITES && !list().some((login) => login.site === site))
      return `There are already ${MAX_SITES} sites in the cloud browser. Remove one first.`;
    if (!this.lists[origin] && Object.keys(this.lists).length >= MAX_PROJECTS)
      return `Sign-ins are kept for ${MAX_PROJECTS} projects already. Forget all cloud logins under another project's key first.`;
    return this.oneAtATime(async () => {
      if (!(await this.hooks.confirm(site))) return "Nothing was brought along, because it wasn't confirmed.";
      const stored = await this.hooks.readCookies(site).catch(() => null);
      if (!stored) return "Blueberry couldn't read its own sign-in to that site. Try again.";
      const cookies = cookiesForSite(stored, site);
      if (cookies.length === 0)
        return `Blueberry isn't signed in to ${site}, so there's nothing to bring along. Sign in there in a tab first.`;
      // The user took a while to confirm, and the browser it was for may have gone meanwhile, even while it was starting.
      const gone = () => !browser.current || this.hooks.jar() !== jar || jar.account !== account;
      if (gone()) return BROWSER_GONE;
      try {
        const copied = await jar.withContext(async (context) => {
          if (gone()) return false;
          await context.addCookies(cookies);
          return true;
        });
        if (!copied || gone()) return BROWSER_GONE;
      } catch {
        return NOT_TAKEN;
      }
      if (!this.save(origin, withLogin(list(), site)))
        return `The sign-in to ${site} is in the cloud browser, but the list here couldn't be saved, so it may not show after a restart. Try again, or use Forget all cloud logins.`;
      return null;
    });
  }

  revoke(site: string): Promise<string | null> {
    return this.takeOut({ domain: cookieDomainPattern(site) }, (list) => withoutLogin(list, site));
  }

  // Every cookie in the cloud browser, including any a job or a sign-in there left, and the whole list for its project.
  // Another project's Context keeps its own.
  forgetAll(): Promise<string | null> {
    return this.takeOut(undefined, () => []);
  }

  // Clears cookies in the cloud browser of the account the user asked under, and nothing once its key has changed, even
  // while it was starting, since the list it changes is that account's project's.
  private takeOut(cookies: { domain: RegExp } | undefined, next: (list: CloudLogin[]) => CloudLogin[]): Promise<string | null> {
    const jar = this.hooks.jar();
    if (!jar?.origin) return Promise.resolve("The cloud browser is off.");
    const { account, origin } = jar;
    const gone = () => this.hooks.jar() !== jar || jar.account !== account;
    return this.oneAtATime(async () => {
      try {
        const cleared = await jar.withContext(async (context) => {
          if (gone()) return false;
          await context.clearCookies(cookies);
          return true;
        });
        if (!cleared || gone()) return KEY_CHANGED;
      } catch {
        return NOT_TAKEN;
      }
      this.save(origin, next(this.listOf(origin)));
      return null;
    });
  }

  mark(site: string, signedIn: boolean): void {
    const origin = this.hooks.jar()?.origin ?? null;
    const list = this.listOf(origin);
    if (origin && list.some((login) => login.site === site)) this.save(origin, withCheck(list, site, signedIn));
  }

  private async oneAtATime(act: () => Promise<string | null>): Promise<string | null> {
    if (this.busy) return "Another site is being brought along or taken out. Try again in a moment.";
    this.busy = true;
    try {
      return await act();
    } finally {
      this.busy = false;
    }
  }

  // False if it couldn't be written, though the list in memory has changed. A project with nothing listed goes.
  private save(origin: string, next: CloudLogin[]): boolean {
    const { [origin]: _old, ...others } = this.lists;
    const list = parseLogins(next);
    this.lists = list.length ? { ...others, [origin]: list } : others;
    const saved = this.write();
    this.hooks.onChange();
    return saved;
  }

  private write(): boolean {
    if (this.undecided) return false;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify({ projects: this.lists }), { mode: 0o600 });
      renameSync(temp, this.file);
      return true;
    } catch {
      console.error("Couldn't save the list of cloud logins.");
      return false;
    }
  }
}
