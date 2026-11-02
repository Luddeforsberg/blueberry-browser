import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CloudLogin, CloudLoginStatus } from "../shared/ipc";

// Sites the user has brought into the cloud browser, signed in. Plain Node, so a runner without a window can use it.
// Cookie values pass through here on their way into the cloud browser and are never kept: the list on disk has each
// site's name and dates and nothing else.

const MAX_SITES = 50;
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
  if (!host.includes(".") || host.length > MAX_SITE_LENGTH || !/^[a-z0-9.-]+$/.test(host) || host.split(".").some((label) => !label)) return null;
  return host;
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Which cookie domains belong to a site: the site itself and its subdomains, whether only for that host ("example.com")
// or for it and below (".example.com"), and cookies a parent domain set for all its subdomains (".example.com" for
// "mail.example.com"), which the site gets anyway. A parent never reaches a public suffix, because browsers refuse
// cookies there. Nothing else, so another site's cookies can't match.
export const cookieDomainPattern = (site: string): RegExp => {
  const labels = site.split(".");
  const parents = isIp(site) ? [] : labels.slice(1, -1).map((_, index) => labels.slice(index + 1).join("."));
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
        // A host-only cookie is set by its address, which keeps it to that host. A domain cookie by its domain.
        ...(hostOnly ? { url: `${cookie.secure ? "https" : "http"}://${host}${path}` } : { domain: `.${host}`, path }),
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
    if (typeof entry !== "object" || entry === null) return [];
    const { site: rawSite, addedAt, checkedAt, status } = entry as Record<string, unknown>;
    const site = loginSite(rawSite);
    const added = time(addedAt);
    if (!site || site !== rawSite || !added || seen.has(site)) return [];
    seen.add(site);
    return [{ site, addedAt: added, checkedAt: time(checkedAt), status: STATUSES.includes(status as CloudLoginStatus) ? (status as CloudLoginStatus) : "brought" }];
  });
};

// Bringing a site along again starts its check over.
export const withLogin = (logins: CloudLogin[], site: string, now = Date.now()): CloudLogin[] => {
  const added: CloudLogin = { site, addedAt: now, checkedAt: null, status: "brought" };
  return [added, ...logins.filter((login) => login.site !== site)].slice(0, MAX_SITES);
};

export const withoutLogin = (logins: CloudLogin[], site: string): CloudLogin[] => logins.filter((login) => login.site !== site);

export const withCheck = (logins: CloudLogin[], site: string, signedIn: boolean, now = Date.now()): CloudLogin[] =>
  logins.map((login): CloudLogin => (login.site === site ? { ...login, checkedAt: now, status: signedIn ? "checked" : "signed-out" } : login));

// The part of a Playwright browser context this needs.
export interface CookieJar {
  addCookies(cookies: CloudCookie[]): Promise<void>;
  clearCookies(options?: { domain?: RegExp }): Promise<void>;
}

export interface CloudLoginsHooks {
  // Runs `act` on the cloud browser's context, starting it if need be. Null while the cloud is off.
  jar: () => { withContext<T>(act: (jar: CookieJar) => Promise<T>): Promise<T> } | null;
  // Touch ID, or a plain confirm where there's none. Asked before any cookie is read.
  confirm: (site: string) => Promise<boolean>;
  // This site's cookies from the user's own browser, and nobody else's.
  readCookies: (site: string) => Promise<StoredCookie[]>;
  onChange: () => void;
}

const NOT_TAKEN = "The cloud browser didn't take that. Try again.";

// Bringing a site's sign-in into the cloud browser, one site at a time, and taking it out again. Only main calls this,
// from Settings, and the list of sites goes to `cloud-logins.json` with names and dates only. A cookie lives only in
// memory on its way to the cloud browser, and no error that might quote one is passed on.
export class CloudLogins {
  private list: CloudLogin[] = [];
  private busy = false;

  constructor(
    private readonly file: string,
    private readonly hooks: CloudLoginsHooks
  ) {
    try {
      this.list = parseLogins(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      this.list = [];
    }
  }

  get logins(): CloudLogin[] {
    return this.list;
  }

  // Says what went wrong, or null once it's in.
  async bring(site: string): Promise<string | null> {
    const jar = this.hooks.jar();
    if (!jar) return "The cloud browser is off.";
    return this.oneAtATime(async () => {
      if (!(await this.hooks.confirm(site))) return "Nothing was brought along, because it wasn't confirmed.";
      const stored = await this.hooks.readCookies(site).catch(() => null);
      if (!stored) return "Blueberry couldn't read its own sign-in to that site. Try again.";
      const cookies = cookiesForSite(stored, site);
      if (cookies.length === 0) return `Blueberry isn't signed in to ${site}, so there's nothing to bring along. Sign in there in a tab first.`;
      try {
        await jar.withContext((context) => context.addCookies(cookies));
      } catch {
        return NOT_TAKEN;
      }
      this.save(withLogin(this.list, site));
      return null;
    });
  }

  async revoke(site: string): Promise<string | null> {
    const jar = this.hooks.jar();
    if (!jar) return "The cloud browser is off.";
    return this.oneAtATime(async () => {
      try {
        await jar.withContext((context) => context.clearCookies({ domain: cookieDomainPattern(site) }));
      } catch {
        return NOT_TAKEN;
      }
      this.save(withoutLogin(this.list, site));
      return null;
    });
  }

  // Every cookie in the cloud browser, including any a job or a sign-in there left, and the whole list.
  async forgetAll(): Promise<string | null> {
    const jar = this.hooks.jar();
    if (!jar) return "The cloud browser is off.";
    return this.oneAtATime(async () => {
      try {
        await jar.withContext((context) => context.clearCookies());
      } catch {
        return NOT_TAKEN;
      }
      this.save([]);
      return null;
    });
  }

  mark(site: string, signedIn: boolean): void {
    if (this.list.some((login) => login.site === site)) this.save(withCheck(this.list, site, signedIn));
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

  private save(next: CloudLogin[]): void {
    this.list = parseLogins(next);
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify(this.list), { mode: 0o600 });
      renameSync(temp, this.file);
    } catch {
      console.error("Couldn't save the list of cloud logins.");
    }
    this.hooks.onChange();
  }
}
