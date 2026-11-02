import { beforeEach, describe, expect, it, vi } from "vitest";

// Electron's cookie store, with its own matching: `domain` takes that domain and its subdomains, and `url` only cookies
// that would go to that address, path included.
interface Cookie { name: string; value: string; domain: string; hostOnly: boolean; path: string }
const store: Cookie[] = [];
const reads: object[] = [];
const get = vi.fn(async (filter: { domain?: string; url?: string }) => {
  reads.push(filter);
  return store.filter((cookie) => {
    const host = cookie.domain.replace(/^\./, "");
    if (filter.domain) return host === filter.domain || host.endsWith(`.${filter.domain}`);
    const url = new URL(filter.url!);
    const sent = cookie.hostOnly ? url.hostname === host : url.hostname === host || url.hostname.endsWith(`.${host}`);
    return sent && url.pathname.startsWith(cookie.path);
  });
});
vi.mock("electron", () => ({ app: { isPackaged: true }, dialog: {}, systemPreferences: {}, session: { defaultSession: { cookies: { get } } } }));

const { readSiteCookies } = await import("./cloudLoginAccess");

const add = (domain: string, name: string, path = "/", hostOnly = !domain.startsWith(".")) => store.push({ name, value: `v-${name}`, domain, hostOnly, path });

describe("readSiteCookies", () => {
  beforeEach(() => {
    store.length = 0;
    reads.length = 0;
  });

  it("takes a parent domain's cookie whatever its path, and none of the parent's other subdomains", async () => {
    add(".example.com", "parent-account", "/account");
    add(".example.com", "parent-root");
    add("shop.example.com", "own", "/cart");
    add("example.com", "parent-host-only");
    add("other.example.com", "sibling");
    add(".other.example.com", "sibling-domain");
    add(".github.com", "elsewhere");
    const names = (await readSiteCookies("shop.example.com")).map(({ name }) => name).sort();
    expect(names).toEqual(["own", "parent-account", "parent-root"]);
    // Every lookup names the site or a parent of it.
    expect(reads).toEqual([{ domain: "shop.example.com" }, { domain: "example.com" }]);
  });

  it("reads only the site itself when it has no parent, and nothing when the store is empty", async () => {
    expect(await readSiteCookies("example.com")).toEqual([]);
    expect(reads).toEqual([{ domain: "example.com" }]);
  });
});
