import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CloudLogins, cookieDomainPattern, cookiesForSite, loginSite, parseLogins, suggestLoginSites, type CloudCookie, type CookieJar, type StoredCookie } from "./cloudLogins";

const cookie = (domain: string, name = "sid", more: Partial<StoredCookie> = {}): StoredCookie => ({ name, value: `value-of-${name}-at-${domain}`, domain, path: "/", ...more });

describe("loginSite", () => {
  it("takes a host from whatever is typed, without www, path or port", () => {
    expect(loginSite("github.com")).toBe("github.com");
    expect(loginSite(" https://www.GitHub.com/login?x=1 ")).toBe("github.com");
    expect(loginSite("http://127.0.0.1:4000/")).toBe("127.0.0.1");
    expect(loginSite("mail.google.com")).toBe("mail.google.com");
  });

  it("refuses what isn't a site", () => {
    ["", "localhost", "not a site", "a..b", "file:///etc", 5, null].forEach((input) => expect(loginSite(input)).toBeNull());
  });
});

describe("cookiesForSite", () => {
  const jar = [
    cookie("example.com", "host", { hostOnly: true, secure: true }),
    cookie(".example.com", "domain"),
    cookie("shop.example.com", "sub", { hostOnly: true }),
    cookie(".deep.shop.example.com", "deep"),
    cookie("notexample.com", "other1", { hostOnly: true }),
    cookie(".example.com.evil.net", "other2"),
    cookie(".evil-example.com", "other3"),
    cookie("github.com", "other4", { hostOnly: true }),
  ];

  it("takes the site and its subdomains, and nothing from other sites", () => {
    const names = cookiesForSite(jar, "example.com").map(({ name }) => name);
    expect(names).toEqual(["host", "domain", "sub", "deep"]);
  });

  it("for a subdomain, takes cookies its parent domain set for it, but not the parent's host-only ones", () => {
    const names = cookiesForSite(jar, "shop.example.com").map(({ name }) => name);
    expect(names).toEqual(["domain", "sub", "deep"]);
  });

  it("sets a host-only cookie by address and a domain cookie by domain", () => {
    const [host, domain] = cookiesForSite(jar, "example.com");
    expect(host).toMatchObject({ url: "https://example.com/", httpOnly: false, secure: true });
    expect(host.domain).toBeUndefined();
    expect(domain).toMatchObject({ domain: ".example.com", path: "/" });
  });

  it("keeps a host-only cookie host-only when Electron gives its domain a dot", () => {
    expect(cookiesForSite([cookie(".127.0.0.1", "sid", { hostOnly: true })], "127.0.0.1")[0]).toMatchObject({ url: "http://127.0.0.1/" });
  });

  it("carries HttpOnly, expiry and SameSite, and leaves out what has expired", () => {
    const now = 1_000_000_000_000;
    const [kept, ...rest] = cookiesForSite(
      [
        cookie(".example.com", "kept", { httpOnly: true, secure: true, sameSite: "no_restriction", expirationDate: now / 1000 + 60.5 }),
        cookie(".example.com", "gone", { expirationDate: now / 1000 - 1 }),
      ],
      "example.com",
      now
    );
    expect(rest).toEqual([]);
    expect(kept).toMatchObject({ httpOnly: true, secure: true, sameSite: "None", expires: now / 1000 + 60 });
  });

  it("takes nothing from an empty jar", () => {
    expect(cookiesForSite([], "example.com")).toEqual([]);
  });
});

describe("cookieDomainPattern", () => {
  it("never reaches a parent of an address", () => {
    expect(cookieDomainPattern("127.0.0.1").test(".0.0.1")).toBe(false);
    expect(cookieDomainPattern("127.0.0.1").test("127.0.0.1")).toBe(true);
  });

  it("stops at the last label, so a parent is never a bare suffix", () => {
    expect(cookieDomainPattern("a.example.com").test(".com")).toBe(false);
  });
});

describe("suggestLoginSites", () => {
  it("names the most visited sites first, leaving out those already brought along and anything that isn't a web page", () => {
    const urls = ["https://github.com/a", "https://www.github.com/b", "https://mail.google.com/", "https://news.ycombinator.com/", "https://news.ycombinator.com/item", "file:///tmp/x.html", "http://127.0.0.1:3000/", "blueberry://settings"];
    expect(suggestLoginSites(urls, ["mail.google.com"])).toEqual(["github.com", "news.ycombinator.com"]);
    expect(suggestLoginSites(urls, [], 1)).toEqual(["github.com"]);
    expect(suggestLoginSites([], [])).toEqual([]);
  });
});

// Playwright's own matching for `clearCookies`: a string must equal the domain, a RegExp must match it.
const fakeContext = (): CookieJar & { cookies: CloudCookie[] } => {
  const context = {
    cookies: [] as CloudCookie[],
    addCookies: async (cookies: CloudCookie[]) => {
      context.cookies.push(...cookies);
    },
    clearCookies: async (options?: { domain?: RegExp }) => {
      const domainOf = (one: CloudCookie) => one.domain ?? new URL(one.url!).hostname;
      context.cookies = context.cookies.filter((one) => options?.domain && !options.domain.test(domainOf(one)));
    },
  };
  return context;
};

const setup = ({ confirmed = true, cookies = [] as StoredCookie[] } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "cloud-logins-"));
  const file = join(dir, "cloud-logins.json");
  const context = fakeContext();
  const readCookies = vi.fn(async (site: string) => cookies.filter((one) => cookieDomainPattern(site).test(one.domain!)));
  const confirm = vi.fn(async () => confirmed);
  const logins = new CloudLogins(file, { jar: () => ({ withContext: (act) => act(context) }), confirm, readCookies, onChange: () => {} });
  return { file, context, readCookies, confirm, logins };
};

describe("CloudLogins", () => {
  const signedIn = [cookie(".example.com", "session", { httpOnly: true, value: "secret-session-value" }), cookie("github.com", "gh", { hostOnly: true, value: "secret-github-value" })];

  it("asks first and reads nothing when the user says no", async () => {
    const { logins, readCookies, context } = setup({ confirmed: false, cookies: signedIn });
    expect(await logins.bring("example.com")).toMatch(/wasn't confirmed/);
    expect(readCookies).not.toHaveBeenCalled();
    expect(context.cookies).toEqual([]);
    expect(logins.logins).toEqual([]);
  });

  it("brings one site along, and its list on disk holds no cookie values", async () => {
    const { logins, readCookies, context, file } = setup({ cookies: signedIn });
    expect(await logins.bring("example.com")).toBeNull();
    expect(readCookies).toHaveBeenCalledWith("example.com");
    expect(context.cookies.map(({ name }) => name)).toEqual(["session"]);
    expect(logins.logins).toEqual([expect.objectContaining({ site: "example.com", status: "brought" })]);
    const saved = readFileSync(file, "utf8");
    expect(saved).not.toContain("secret-session-value");
    expect(saved).not.toContain("session");
    expect(Object.keys(JSON.parse(saved)[0]).sort()).toEqual(["addedAt", "checkedAt", "site", "status"]);
  });

  it("says so when Blueberry isn't signed in there, and lists nothing", async () => {
    const { logins } = setup({ cookies: signedIn });
    expect(await logins.bring("nowhere.org")).toMatch(/isn't signed in to nowhere.org/);
    expect(logins.logins).toEqual([]);
  });

  it("revoking takes out only that site's cookies, and only that site from the list", async () => {
    const { logins, context } = setup({ cookies: signedIn });
    await logins.bring("example.com");
    await logins.bring("github.com");
    // One a job left there, on a site that was never brought along.
    await context.addCookies([{ name: "other", value: "x", domain: ".other.org", path: "/" }]);
    expect(await logins.revoke("example.com")).toBeNull();
    expect(context.cookies.map(({ name }) => name)).toEqual(["gh", "other"]);
    expect(logins.logins.map(({ site }) => site)).toEqual(["github.com"]);
  });

  it("forgetting all clears the whole cloud browser and the list", async () => {
    const { logins, context } = setup({ cookies: signedIn });
    await logins.bring("example.com");
    await context.addCookies([{ name: "other", value: "x", domain: ".other.org", path: "/" }]);
    expect(await logins.forgetAll()).toBeNull();
    expect(context.cookies).toEqual([]);
    expect(logins.logins).toEqual([]);
  });

  it("keeps what the user saw, and starts over when brought along again", async () => {
    const { logins } = setup({ cookies: signedIn });
    await logins.bring("example.com");
    logins.mark("example.com", false);
    expect(logins.logins[0]).toMatchObject({ status: "signed-out", checkedAt: expect.any(Number) });
    logins.mark("example.com", true);
    expect(logins.logins[0].status).toBe("checked");
    await logins.bring("example.com");
    expect(logins.logins[0]).toMatchObject({ status: "brought", checkedAt: null });
  });

  it("does one site at a time", async () => {
    const { logins } = setup({ cookies: signedIn });
    const first = logins.bring("example.com");
    expect(await logins.bring("github.com")).toMatch(/Try again in a moment/);
    expect(await first).toBeNull();
  });

  it("does nothing with the cloud off", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "cloud-logins-")), "cloud-logins.json");
    const confirm = vi.fn(async () => true);
    const logins = new CloudLogins(file, { jar: () => null, confirm, readCookies: async () => signedIn, onChange: () => {} });
    expect(await logins.bring("example.com")).toBe("The cloud browser is off.");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("reads back only names and dates, whatever else is in the file", () => {
    const { file } = setup();
    writeFileSync(file, JSON.stringify([{ site: "example.com", addedAt: 5, checkedAt: null, status: "checked", value: "leaked" }, { site: "EXAMPLE.com", addedAt: 5 }, { site: "x", addedAt: 5 }]));
    const logins = new CloudLogins(file, { jar: () => null, confirm: async () => true, readCookies: async () => [], onChange: () => {} });
    expect(logins.logins).toEqual([{ site: "example.com", addedAt: 5, checkedAt: null, status: "checked" }]);
    expect(parseLogins("nope")).toEqual([]);
  });
});
