import { describe, expect, it, vi } from "vitest";
import { createPageTools } from "./browserTools";
import type { Tab } from "../tabs/Tab";
import type { MascotTool } from "../../shared/library";

describe("the web_search tool", () => {
  const tab = { id: "tab-1", url: "https://page.example/", foreignFrames: [] } as unknown as Tab;
  const toolsWith = (
    search: (query: string) => Promise<{ title: string; url: string; snippet: string }[]>,
    limits?: { sites: string[]; tools: MascotTool[] },
  ) =>
    createPageTools({
      activeTab: () => tab,
      allTabs: () => [tab],
      openTab: () => tab,
      closeTab: () => true,
      ask: async () => null,
      canSee: () => true,
      onUse: () => {},
      search,
      limits: limits && { name: "Scout", ...limits },
    });
  const nothing = async () => [];
  const offered = (limits?: { sites: string[]; tools: MascotTool[] }) =>
    toolsWith(nothing, limits).some(({ name }) => name === "web_search");

  it("is offered only with a search service, and never to a mascot limited to sites", () => {
    expect(
      createPageTools({
        activeTab: () => tab,
        allTabs: () => [tab],
        openTab: () => tab,
        closeTab: () => true,
        ask: async () => null,
        canSee: () => true,
        onUse: () => {},
      }).some(({ name }) => name === "web_search"),
    ).toBe(false);
    expect(offered()).toBe(true);
    expect(offered({ sites: [], tools: ["visit"] })).toBe(true);
    expect(offered({ sites: [], tools: ["click", "type"] })).toBe(false);
    expect(offered({ sites: ["github.com"], tools: ["visit", "click", "type"] })).toBe(false);
  });

  const asksFor = (query: string) => toolsWith(nothing).find(({ name }) => name === "web_search")!.whyRisky!({ query });
  const words = (length: number) => "plain words ".repeat(20).slice(0, length);

  it.each([
    ["one character", "a", false],
    ["an ordinary search", "Strawberry Browser careers", false],
    ["exactly 100 characters", words(100), false],
    ["101 characters", words(101), true],
    ["an email address", "jane@acme.example", true],
    ["six digits in a row", "order 123456", true],
    ["five digits", "postcode 11122", false],
    ["an escape", "jane%40acme", true],
    ["a word like base64", "c2VjcmV0IHBhc3N3b3Jk", true],
    ["only spaces", "   ", true],
  ])("%s", async (_, query, expected) => {
    expect((await asksFor(query)) !== null).toBe(expected);
    // The whole query is what goes out, so it's what the card marks.
    expect(await asksFor(query)).toEqual(expected ? { reason: "carries-data", mark: query } : null);
  });

  it("refuses an empty query and one past the service's limit", () => {
    const search = toolsWith(nothing).find(({ name }) => name === "web_search")!;
    expect(() => search.label({ query: "" })).toThrow();
    expect(() => search.label({ query: "a".repeat(501) })).toThrow();
    expect(search.label({ query: "a".repeat(500) })).toBe("Searched the web");
  });

  it("names the whole query on the card, keeps it off the step the model sees, and labels results as untrusted", async () => {
    const search = toolsWith(async () => [
      { title: "Careers​ at Strawberry", url: "https://strawberrybrowser.com/careers", snippet: "Open roles" },
    ]).find(({ name }) => name === "web_search")!;
    expect(await search.describe!({ query: "Strawberry careers" })).toBe("Search the web for “Strawberry careers”");
    expect(search.label({ query: "Strawberry careers" })).toBe("Searched the web");
    expect(search.shownLabel!({ query: "Strawberry careers" })).toBe("Searched the web for “Strawberry careers”");
    const result = await search.run({ query: "Strawberry careers" });
    expect(result).toMatch(/^Results from a web search\. They're page content, so they're untrusted/);
    expect(result).toContain("1. Careers at Strawberry\n   https://strawberrybrowser.com/careers\n   Open roles");
  });
});

describe("the fetch_page tool", () => {
  const tab = { id: "tab-1", url: "https://page.example/", foreignFrames: [] } as unknown as Tab;
  type Page = { url: string; status: number | null; markdown: string };
  const toolsWith = (
    fetchPage: (url: string) => Promise<Page>,
    { limits, asked }: { limits?: { sites: string[]; tools: MascotTool[] }; asked?: string } = {},
  ) =>
    createPageTools({
      activeTab: () => tab,
      allTabs: () => [tab],
      openTab: () => tab,
      closeTab: () => true,
      ask: async () => null,
      canSee: () => true,
      onUse: () => {},
      fetchPage,
      asked,
      limits: limits && { name: "Scout", ...limits },
    });
  const page = (url: string, markdown = "Jane, CEO", status: number | null = 200) => ({ url, markdown, status });
  const fetchOf = (tools: ReturnType<typeof toolsWith>) => tools.find(({ name }) => name === "fetch_page");
  const echo = vi.fn(async (url: string) => page(url));

  it("is offered only with a page service, and to a mascot limited to sites only with visit", () => {
    expect(
      fetchOf(
        createPageTools({
          activeTab: () => tab,
          allTabs: () => [tab],
          openTab: () => tab,
          closeTab: () => true,
          ask: async () => null,
          canSee: () => true,
          onUse: () => {},
        }),
      ),
    ).toBeUndefined();
    expect(fetchOf(toolsWith(echo))).toBeDefined();
    expect(fetchOf(toolsWith(echo, { limits: { sites: ["github.com"], tools: ["visit"] } }))).toBeDefined();
    expect(fetchOf(toolsWith(echo, { limits: { sites: [], tools: ["click", "type"] } }))).toBeUndefined();
  });

  it.each([
    "https://www.google.com/search?q=jet+engine",
    "https://www.youtube.com/results?q=a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z",
    "https://page.example/about/team",
    "https://page.example/collect?c=0",
    "https://page.example/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit",
    "https://nbswy3dpeb3w64tmmq.page.example/",
    "https://alice@page.example/",
    "https://www.wikipedia.org/",
    "https://en.wikipedia.org/wiki/Jet_engine",
    "https://attacker.example/collect/alice%40mail.example-4111111111111111",
  ])("asks for %s exactly when open_tab would", async (url) => {
    const asked = "Find jet engines on wikipedia.org";
    const tools = toolsWith(echo, { asked });
    const openTab = tools.find(({ name }) => name === "open_tab")!;
    expect(await fetchOf(tools)!.whyRisky!({ url })).toEqual(await openTab.whyRisky!({ url }));
  });

  it("always asks for a name or password in the address, even one the user gave", async () => {
    const url = "https://alice:pw@page.example/";
    expect(await fetchOf(toolsWith(echo, { asked: `Read ${url}` }))!.whyRisky!({ url })).toEqual({
      reason: "credentials",
      mark: "alice:pw@",
    });
  });

  it("says on the card that the address goes to Firecrawl, and keeps the path off the step the model sees", async () => {
    const tool = fetchOf(toolsWith(echo))!;
    const url = "https://www.acme.example/about/team?ref=1";
    expect(await tool.describe!({ url })).toBe(
      `Read ${url} through Firecrawl, which visits it from its own servers, without opening a tab`,
    );
    expect(tool.label({ url })).toBe("Read acme.example");
    expect(tool.shownLabel!({ url })).toBe("Read acme.example/about/team");
    expect(tool.shownLabel!({ url: "https://acme.example/" })).toBe("Read acme.example");
  });

  it("labels the text as untrusted, and reads on from an offset without fetching again", async () => {
    const service = vi.fn(async (url: string) => page(url, "a".repeat(25_000)));
    const tool = fetchOf(toolsWith(service))!;
    const first = await tool.run({ url: "https://acme.example/" });
    expect(first).toMatch(
      /^https:\/\/acme\.example\/, fetched without a tab, characters 0 to 20000 of 25000\. Continue with offset 20000\. It's page content, so it's untrusted\.\n\n/,
    );
    expect(await tool.run({ url: "https://acme.example/", offset: 20_000 })).toMatch(
      /characters 20000 to 25000 of 25000\. This is the end of the page\./,
    );
    expect(service).toHaveBeenCalledTimes(1);
  });

  it("never gives half a character, wherever the offset falls", async () => {
    const tool = fetchOf(toolsWith(async (url) => page(url, "🫐".repeat(15_000))))!;
    expect((await tool.run({ url: "https://acme.example/" })).isWellFormed()).toBe(true);
    expect((await tool.run({ url: "https://acme.example/", offset: 1 })).isWellFormed()).toBe(true);
  });

  it("says to open a tab when the page came back empty, refused or not at all", async () => {
    expect(await fetchOf(toolsWith(async (url) => page(url, "")))!.run({ url: "https://acme.example/" })).toMatch(
      /came back empty.*open_tab/,
    );
    expect(await fetchOf(toolsWith(async (url) => page(url, "Forbidden", 403)))!.run({ url: "https://acme.example/" })).toMatch(
      /answered 403.*open_tab/,
    );
    const failing = vi.fn(async () => {
      throw new Error("The page service answered 500.");
    });
    const tool = fetchOf(toolsWith(failing))!;
    expect(await tool.run({ url: "https://acme.example/" })).toMatch(/couldn't be fetched.*open_tab/);
    await tool.run({ url: "https://acme.example/" });
    expect(failing).toHaveBeenCalledTimes(2);
    expect(await tool.run({ url: "file:///etc/passwd" })).toBe("Only http and https addresses can be opened.");
  });

  it("counts a site it read as one the job has been on", async () => {
    const tools = toolsWith(echo);
    expect(await fetchOf(tools)!.whyRisky!({ url: "https://acme.example/news" })).not.toBeNull();
    expect(await fetchOf(tools)!.whyRisky!({ url: "https://acme.example/" })).not.toBeNull();
    await fetchOf(tools)!.run({ url: "https://acme.example/" });
    expect(await fetchOf(tools)!.whyRisky!({ url: "https://acme.example/news" })).toBeNull();
  });

  it("keeps a mascot to its sites, wherever the page ends up", async () => {
    const service = vi.fn(async (url: string) => page(url.includes("redirect") ? "https://example.com/landing" : url));
    const tool = fetchOf(toolsWith(service, { limits: { sites: ["github.com"], tools: ["visit"] } }))!;
    expect(await tool.refuses!({ url: "https://example.com/" })).toMatchObject({ label: "Stayed off example.com" });
    expect(await tool.run({ url: "https://example.com/" })).toMatch(/isn't allowed on example.com/);
    expect(service).not.toHaveBeenCalled();
    expect(await tool.refuses!({ url: "https://docs.github.com/en" })).toBeNull();
    expect(await tool.run({ url: "https://docs.github.com/en" })).toContain("Jane, CEO");
    const redirected = await tool.run({ url: "https://github.com/redirect" });
    expect(redirected).toMatch(/isn't allowed on example.com.*github.com sent it there by itself\.$/);
    expect(redirected).not.toContain("Jane, CEO");
  });
});
