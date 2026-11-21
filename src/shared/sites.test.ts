import { describe, expect, it } from "vitest";
import { NO_SITE, siteName, siteOf } from "./sites";
import { registrableSite, siteWord } from "./siteDomains";
import { normaliseSite, siteAllowed } from "./mascots";

describe("siteOf", () => {
  it.each<[string, string | null]>([
    ["https://www.svt.se/nyheter?inlagg=1", "svt.se"],
    ["https://WWW.Example.COM/", "example.com"],
    ["http://localhost:5173/", "localhost"],
    ["http://127.0.0.1:8080/x", "127.0.0.1"],
    ["http://[::1]:3000/", "[::1]"],
    ["https://bücher.de/", "xn--bcher-kva.de"],
    ["https://example.com./", "example.com."],
    ["https://www.www.example.com/", "www.example.com"],
    ["https://alice:pw@example.com/", "example.com"],
    ["https://www./", null],
    ["file:///C:/notes.txt", null],
    ["about:blank", null],
    ["blueberry://settings", null],
    ["data:text/html,hi", null],
    ["mailto:someone@example.com", null],
    ["ws://example.com/", null],
    ["not an address", null],
    ["", null],
  ])("%s is %s", (url, site) => {
    expect(siteOf(url)).toBe(site);
  });

  it("words a page with no site, and never decides with them", () => {
    expect(siteName("https://www.klm.com/flights")).toBe("klm.com");
    expect(siteName("about:blank")).toBe(NO_SITE);
    expect(siteAllowed("https://example.com/", [NO_SITE])).toBe(false);
    expect(normaliseSite(NO_SITE)).toBeNull();
  });
});

// What the limits said for each of these before they went through siteOf, and still say.
describe("a mascot's limits at the edges", () => {
  it.each<[string, string | null, boolean]>([
    ["example.com", "example.com", true],
    ["https://WWW.Example.com/path?q=1", "example.com", true],
    ["*.example.com", "example.com", true],
    ["shop.example.com", "shop.example.com", true],
    ["bücher.de", "xn--bcher-kva.de", false],
    ["localhost", "localhost", false],
    ["localhost:5173", "localhost", false],
    ["127.0.0.1", "127.0.0.1", false],
    ["example.com.", "example.com.", false],
    ["com", null, false],
    ["www.", null, false],
    ["file:///etc", null, false],
    ["blueberry://settings", null, false],
    ["", null, false],
  ])("%s is the site %s, and on example.com: %s", (typed, site, onExample) => {
    expect(normaliseSite(typed)).toBe(site);
    expect(site !== null && siteAllowed(`https://${site}/`, ["example.com"])).toBe(onExample);
  });

  it.each<[string, boolean]>([
    ["https://example.com/", true],
    ["http://shop.example.com:8080/", true],
    ["https://WWW.EXAMPLE.COM/", true],
    ["https://example.com./", false],
    ["https://notexample.com/", false],
    ["https://example.com.evil.test/", false],
    ["https://127.0.0.1/", false],
    ["file:///example.com", false],
    ["blueberry://example.com", false],
    ["about:blank", false],
  ])("%s is on example.com: %s", (url, allowed) => {
    expect(siteAllowed(url, ["example.com"])).toBe(allowed);
  });
});

describe("registrableSite", () => {
  it.each<[string, string]>([
    ["www.shop.example.co.uk", "example.co.uk"],
    ["old.reddit.com", "reddit.com"],
    ["myshop.herokuapp.com", "myshop.herokuapp.com"],
    ["someone.github.io", "someone.github.io"],
    ["github.io", "github.io"],
    ["co.uk", "co.uk"],
    ["xn--bcher-kva.de", "xn--bcher-kva.de"],
    ["Shop.Example.com", "example.com"],
    ["shop.example.com.", "example.com"],
    ["127.0.0.1", "127.0.0.1"],
    ["[::1]", "[::1]"],
    ["localhost", "localhost"],
  ])("%s is %s", (host, site) => {
    expect(registrableSite(host)).toBe(site);
  });

  it("names a site the way people write it", () => {
    expect(["bbc.co.uk", "old.reddit.com", "someone.github.io"].map(siteWord)).toEqual(["bbc", "reddit", "someone"]);
    expect(siteWord("127.0.0.1")).toBeNull();
  });
});
