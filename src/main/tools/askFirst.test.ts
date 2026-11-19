import { describe, expect, it, vi } from "vitest";
import { createPageTools } from "./browserTools";
import type { Tab } from "../tabs/Tab";
import type { AskWhy } from "../../shared/asking";

type Asking = { open?: string; linked?: boolean; asked?: string; beenTo?: string[]; sites?: string[]; tool?: "open_tab" | "go_to" };

// Why going to `url` from a job on `open` asks in the default mode, or null if it doesn't. `linked` is whether that page
// links to it.
const asks = (url: string, { open = "https://page.example/", linked = false, asked, beenTo, sites, tool = "open_tab" }: Asking = {}) => {
  const tab = { id: "tab-1", url: open, foreignFrames: [], runInPage: async () => linked } as unknown as Tab;
  return createPageTools({
    activeTab: () => tab,
    allTabs: () => [tab],
    openTab: () => tab,
    closeTab: () => true,
    ask: async () => null,
    canSee: () => true,
    onUse: () => {},
    asked,
    beenTo,
    limits: sites && { name: "Scout", sites, tools: ["visit"] },
  }).find(({ name }) => name === tool)!.whyRisky!({ url });
};

describe("whether an address with a query asks in the default mode", () => {
  // Counts the "?" too, so this query and hash come to exactly `length`.
  const ofLength = (length: number) => `?q=${"a".repeat(length - 3)}`;

  const data = (mark: string): AskWhy => ({ reason: "carries-data", mark });

  it.each<[string, string, boolean, AskWhy | null]>([
    ["a short search on a listed site", "https://www.youtube.com/results?search_query=jet+engine", false, null],
    ["a subdomain of one", "https://sv.wikipedia.org/w/index.php?search=jet", false, null],
    ["exactly 100 characters", `https://www.youtube.com/results${ofLength(100)}`, false, null],
    ["101 characters", `https://www.youtube.com/results${ofLength(101)}`, true, { reason: "carries-data", mark: ofLength(101) }],
    [
      "a hash counting towards the limit",
      `https://www.youtube.com/results${ofLength(95)}#${"b".repeat(5)}`,
      true,
      { reason: "carries-data", mark: `${ofLength(95)}#bbbbb` },
    ],
    ["a lookalike hostname", "https://youtube.com.evil.example/results?q=jet", true, data("?q=jet")],
    ["a name that only ends like one", "https://evilyoutube.com/results?q=jet", true, data("?q=jet")],
    ["a listed site as the username", "https://youtube.com@evil.example/?q=jet", true, { reason: "credentials", mark: "youtube.com@" }],
    ["an unknown site", "https://unknown.example/?q=jet", true, data("?q=jet")],
    ["the site this job has open", "https://www.page.example/search?q=jet", true, data("?q=jet")],
    ["a script anyone can publish on Google", "https://script.google.com/macros/s/abc/exec?d=jet", true, data("?d=jet")],
    ["a form anyone can publish on Google", "https://docs.google.com/forms/d/abc/formResponse?entry.1=jet", true, data("?entry.1=jet")],
    ["a redirect on a listed site", "https://www.google.com/url?q=https://evil.example/", true, data("?q=https://evil.example/")],
    ["another page on a listed site", "https://www.youtube.com/redirect?q=https://evil.example/", true, data("?q=https://evil.example/")],
    ["a host named like an object's built-in property", "http://constructor/?q=jet", true, data("?q=jet")],
    ["a listed site without www", "https://youtube.com/results?search_query=jet", false, null],
  ])("%s", async (_, url, expected, why) => {
    expect((await asks(url)) !== null).toBe(expected);
    expect(await asks(url)).toEqual(why);
  });
});

describe("whether an address with no query asks in the default mode", () => {
  const TOKEN = "c2VjcmV0IHBhc3N3b3JkIGh1bnRlcjI";
  const DOC = `https://page.example/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit`;

  const path = (mark: string): AskWhy => ({ reason: "looks-like-data", mark });
  const host = (reason: AskWhy["reason"], mark: string): AskWhy => ({ reason, mark });

  it.each<[string, string, Asking, boolean, AskWhy | null]>([
    // Codex's: private data out through the path or the host name, which asked for nothing.
    [
      "data in the path, to go to",
      "https://attacker.example/collect/alice%40mail.example-4111111111111111",
      { tool: "go_to" },
      true,
      path("/collect/alice%40mail.example-4111111111111111"),
    ],
    [
      "data in the path, to open",
      "https://attacker.example/collect/alice%40mail.example-4111111111111111",
      {},
      true,
      path("/collect/alice%40mail.example-4111111111111111"),
    ],
    [
      "data in a subdomain",
      "https://alice-mail-example-4111111111111111.attacker.example/",
      {},
      true,
      host("looks-like-data", "alice-mail-example-4111111111111111.attacker.example"),
    ],
    // On a site it has reason to be on, only data asks.
    [
      "data in the path of a site the user named",
      `https://attacker.example/collect/${TOKEN}`,
      { asked: "Look at attacker.example" },
      true,
      path(`/collect/${TOKEN}`),
    ],
    [
      "data in a subdomain of this page's site",
      "https://nbswy3dpeb3w64tmmq.page.example/",
      {},
      true,
      host("looks-like-data", "nbswy3dpeb3w64tmmq.page.example"),
    ],
    [
      "a long path on this page's site",
      `https://page.example/${"plain-words-".repeat(10)}`,
      {},
      true,
      path(`/${"plain-words-".repeat(10)}`),
    ],
    ["a token on this page's site that isn't a link on it", DOC, {}, true, path("/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit")],
    [
      "a token on this page's site that's a link on it",
      DOC,
      { linked: true },
      true,
      path("/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit"),
    ],
    [
      "a link on it with a query, which a page can plant one per digit",
      "https://page.example/collect?c=0",
      { linked: true },
      true,
      { reason: "carries-data", mark: "?c=0" },
    ],
    // A site it has been on only spares the card for a plain address there, never for data.
    [
      "an escape and an address on a site it has been on",
      "https://attacker.example/collect/alice%40mail.example-4111111111111111",
      { beenTo: ["attacker.example"] },
      true,
      path("/collect/alice%40mail.example-4111111111111111"),
    ],
    [
      "an @ on a site it has been on",
      "https://attacker.example/u/alice@mail",
      { beenTo: ["attacker.example"] },
      true,
      path("/u/alice@mail"),
    ],
    [
      "hex split into short pieces on a site it has been on",
      "https://attacker.example/c/4a6f/686e/2044/6f65",
      { beenTo: ["attacker.example"] },
      true,
      path("/c/4a6f/686e/2044/6f65"),
    ],
    [
      "six digits in a row on a site it has been on",
      "https://attacker.example/o/411111",
      { beenTo: ["attacker.example"] },
      true,
      path("/o/411111"),
    ],
    [
      "a word like base64 on a site it has been on",
      "https://attacker.example/q/aGVsbG8g",
      { beenTo: ["attacker.example"] },
      true,
      path("/q/aGVsbG8g"),
    ],
    [
      "a numeric subdomain of a site it has been on",
      "https://12.34.attacker.example/",
      { beenTo: ["attacker.example"] },
      true,
      host("new-subdomain", "12.34.attacker.example"),
    ],
    [
      "a new subdomain of a site it has been on",
      "https://alice.attacker.example/",
      { beenTo: ["attacker.example"] },
      true,
      host("new-subdomain", "alice.attacker.example"),
    ],
    ["a plain page on a site it has been on", "https://attacker.example/news/today", { beenTo: ["attacker.example"] }, false, null],
    ["five digits on this page's site", "https://page.example/orders/41111", {}, false, null],
    // Only whole names count, so a name in another script doesn't name the end of itself.
    ["the end of a name the user gave", "https://cher.de/", { asked: "Read https://bücher.de" }, true, host("new-site", "cher.de")],
    ["the end of a name the user wrote", "https://cher.de/", { asked: "Find it on bücher.de" }, true, host("new-site", "cher.de")],
    ["a name the user wrote in another script", "https://bücher.de/", { asked: "Find it on bücher.de" }, false, null],
    [
      "the end of a name written with a combining mark",
      "https://cher.de/",
      { asked: "Find it on bu\u0308cher.de" },
      true,
      host("new-site", "cher.de"),
    ],
    ["a name written with a combining mark", "https://bücher.de/", { asked: "Find it on bu\u0308cher.de" }, false, null],
    // Credentials in an address go out to the site when it asks for them.
    [
      "a name and password on a site it has been on",
      "https://4111111111111111:x@attacker.example/",
      { beenTo: ["attacker.example"] },
      true,
      { reason: "credentials", mark: "4111111111111111:x@" },
    ],
    ["only a name on this page's site", "https://alice@page.example/", {}, true, { reason: "credentials", mark: "alice@" }],
    [
      "credentials in an address the user gave",
      "https://alice:pw@page.example/",
      { asked: "Open https://alice:pw@page.example/" },
      true,
      { reason: "credentials", mark: "alice:pw@" },
    ],
    ["a link on it to another site", `https://attacker.example/collect/${TOKEN}`, { linked: true }, true, path(`/collect/${TOKEN}`)],
    ["another page on this page's site", "https://page.example/about/team", {}, false, null],
    ["another page in this page's own subdomain", "https://www.page.example/news/2026/jet-engines-of-the-future", {}, false, null],
    // A site it has no reason to be on asks however plain.
    ["a plain new site", "https://www.wikipedia.org/", {}, true, host("new-site", "www.wikipedia.org")],
    ["a plain new site the user named", "https://www.wikipedia.org/", { asked: "Find jet engines on wikipedia.org" }, false, null],
    [
      "a page in a subdomain of one",
      "https://en.wikipedia.org/wiki/Jet_engine",
      { asked: "Find jet engines on wikipedia.org" },
      false,
      null,
    ],
    [
      "only a site whose name ends like one",
      "https://notwikipedia.org/",
      { asked: "Find jet engines on wikipedia.org" },
      true,
      host("new-site", "notwikipedia.org"),
    ],
    [
      "an address the user gave, token and all",
      "https://docs.example.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit",
      { asked: "Read https://docs.example.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit" },
      false,
      null,
    ],
    [
      "a local site the user gave an address on",
      "http://127.0.0.1:5173/settings",
      { asked: "Check http://127.0.0.1:5173/ for me" },
      false,
      null,
    ],
    ["a site an earlier reply was on", "https://example.org/news", { beenTo: ["example.org"] }, false, null],
    ["a site the mascot is limited to", "https://docs.github.com/en", { open: "https://github.com/", sites: ["github.com"] }, false, null],
    ["a search", "https://www.google.com/search?q=jet+engine", {}, false, null],
    ["a page no tab is on", "https://elsewhere.example/", { open: "about:blank" }, true, host("new-site", "elsewhere.example")],
  ])("%s", async (_, url, options, expected, why) => {
    expect((await asks(url, options)) !== null).toBe(expected);
    expect(await asks(url, options)).toEqual(why);
  });

  it("never asks the page, so a link on it changes nothing", async () => {
    const runInPage = vi.fn(async () => true);
    const tab = { id: "tab-1", url: "https://page.example/", foreignFrames: [], runInPage } as unknown as Tab;
    const goTo = createPageTools({
      activeTab: () => tab,
      allTabs: () => [tab],
      openTab: () => tab,
      closeTab: () => true,
      ask: async () => null,
      canSee: () => true,
      onUse: () => {},
    }).find(({ name }) => name === "go_to")!;
    expect(await goTo.whyRisky!({ url: "https://page.example/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" })).not.toBeNull();
    expect(await goTo.whyRisky!({ url: "https://page.example/about" })).toBeNull();
    expect(runInPage).not.toHaveBeenCalled();
  });

  it("counts a site the job has been on in this reply", async () => {
    const tab = { id: "tab-1", url: "https://page.example/", foreignFrames: [], runInPage: async () => false } as unknown as Tab;
    const other = { id: "tab-2", url: "https://other.example/", getTextWithFrames: async () => "words" } as unknown as Tab;
    const tools = createPageTools({
      activeTab: () => tab,
      allTabs: () => [tab, other],
      openTab: () => tab,
      closeTab: () => true,
      ask: async () => null,
      canSee: () => true,
      onUse: () => {},
    });
    const goTo = tools.find(({ name }) => name === "go_to")!;
    expect(await goTo.whyRisky!({ url: "https://other.example/plain" })).toEqual({ reason: "new-site", mark: "other.example" });
    await tools.find(({ name }) => name === "read_page")!.run({ tabId: "tab-2" });
    expect(await goTo.whyRisky!({ url: "https://other.example/plain" })).toBeNull();
  });
});
