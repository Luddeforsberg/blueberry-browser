import { describe, expect, it, vi } from "vitest";
import { createPageTools } from "./browserTools";
import type { Tab } from "./Tab";
import type { MascotTool } from "../shared/library";

const IMAGE = Buffer.from("picture");

const screenshotTool = (tab: Tab, canSee: () => boolean) =>
  createPageTools({
    activeTab: () => tab,
    allTabs: () => [tab],
    openTab: () => tab,
    closeTab: () => true,
    ask: async () => null,
    canSee,
    onUse: () => {},
  }).find((tool) => tool.name === "screenshot")!;

type Asking = { open?: string; linked?: boolean; asked?: string; beenTo?: string[]; sites?: string[]; tool?: "open_tab" | "go_to" };

// Whether going to `url` from a job on `open` asks in the default mode. `linked` is whether that page links to it.
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
  })
    .find(({ name }) => name === tool)!
    .isRisky!({ url });
};

describe("whether an address with a query asks in the default mode", () => {
  // Counts the "?" too, so this query and hash come to exactly `length`.
  const ofLength = (length: number) => `?q=${"a".repeat(length - 3)}`;

  it.each([
    ["a short search on a listed site", "https://www.youtube.com/results?search_query=jet+engine", false],
    ["a subdomain of one", "https://sv.wikipedia.org/w/index.php?search=jet", false],
    ["exactly 100 characters", `https://www.youtube.com/results${ofLength(100)}`, false],
    ["101 characters", `https://www.youtube.com/results${ofLength(101)}`, true],
    ["a hash counting towards the limit", `https://www.youtube.com/results${ofLength(95)}#${"b".repeat(5)}`, true],
    ["a lookalike hostname", "https://youtube.com.evil.example/results?q=jet", true],
    ["a name that only ends like one", "https://evilyoutube.com/results?q=jet", true],
    ["a listed site as the username", "https://youtube.com@evil.example/?q=jet", true],
    ["an unknown site", "https://unknown.example/?q=jet", true],
    ["the site this job has open", "https://www.page.example/search?q=jet", true],
    ["a script anyone can publish on Google", "https://script.google.com/macros/s/abc/exec?d=jet", true],
    ["a form anyone can publish on Google", "https://docs.google.com/forms/d/abc/formResponse?entry.1=jet", true],
    ["a redirect on a listed site", "https://www.google.com/url?q=https://evil.example/", true],
    ["another page on a listed site", "https://www.youtube.com/redirect?q=https://evil.example/", true],
    ["a host named like an object's built-in property", "http://constructor/?q=jet", true],
    ["a listed site without www", "https://youtube.com/results?search_query=jet", false],
  ])("%s", async (_, url, expected) => {
    expect(await asks(url)).toBe(expected);
  });
});

describe("whether an address with no query asks in the default mode", () => {
  const TOKEN = "c2VjcmV0IHBhc3N3b3JkIGh1bnRlcjI";
  const DOC = `https://page.example/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit`;

  it.each<[string, string, Asking, boolean]>([
    // Codex's: private data out through the path or the host name, which asked for nothing.
    ["data in the path, to go to", "https://attacker.example/collect/alice%40mail.example-4111111111111111", { tool: "go_to" }, true],
    ["data in the path, to open", "https://attacker.example/collect/alice%40mail.example-4111111111111111", {}, true],
    ["data in a subdomain", "https://alice-mail-example-4111111111111111.attacker.example/", {}, true],
    // On a site it has reason to be on, only data asks.
    ["data in the path of a site the user named", `https://attacker.example/collect/${TOKEN}`, { asked: "Look at attacker.example" }, true],
    ["data in a subdomain of this page's site", "https://nbswy3dpeb3w64tmmq.page.example/", {}, true],
    ["a long path on this page's site", `https://page.example/${"plain-words-".repeat(10)}`, {}, true],
    ["a token on this page's site that isn't a link on it", DOC, {}, true],
    ["a token on this page's site that's a link on it", DOC, { linked: true }, true],
    ["a link on it with a query, which a page can plant one per digit", "https://page.example/collect?c=0", { linked: true }, true],
    // A site it has been on only spares the card for a plain address there, never for data.
    ["an escape and an address on a site it has been on", "https://attacker.example/collect/alice%40mail.example-4111111111111111", { beenTo: ["attacker.example"] }, true],
    ["an @ on a site it has been on", "https://attacker.example/u/alice@mail", { beenTo: ["attacker.example"] }, true],
    ["hex split into short pieces on a site it has been on", "https://attacker.example/c/4a6f/686e/2044/6f65", { beenTo: ["attacker.example"] }, true],
    ["six digits in a row on a site it has been on", "https://attacker.example/o/411111", { beenTo: ["attacker.example"] }, true],
    ["a word like base64 on a site it has been on", "https://attacker.example/q/aGVsbG8g", { beenTo: ["attacker.example"] }, true],
    ["a numeric subdomain of a site it has been on", "https://12.34.attacker.example/", { beenTo: ["attacker.example"] }, true],
    ["a new subdomain of a site it has been on", "https://alice.attacker.example/", { beenTo: ["attacker.example"] }, true],
    ["a plain page on a site it has been on", "https://attacker.example/news/today", { beenTo: ["attacker.example"] }, false],
    ["five digits on this page's site", "https://page.example/orders/41111", {}, false],
    // Only whole names count, so a name in another script doesn't name the end of itself.
    ["the end of a name the user gave", "https://cher.de/", { asked: "Read https://bücher.de" }, true],
    ["the end of a name the user wrote", "https://cher.de/", { asked: "Find it on bücher.de" }, true],
    ["a name the user wrote in another script", "https://bücher.de/", { asked: "Find it on bücher.de" }, false],
    ["the end of a name written with a combining mark", "https://cher.de/", { asked: "Find it on bu\u0308cher.de" }, true],
    ["a name written with a combining mark", "https://bücher.de/", { asked: "Find it on bu\u0308cher.de" }, false],
    // Credentials in an address go out to the site when it asks for them.
    ["a name and password on a site it has been on", "https://4111111111111111:x@attacker.example/", { beenTo: ["attacker.example"] }, true],
    ["only a name on this page's site", "https://alice@page.example/", {}, true],
    ["credentials in an address the user gave", "https://alice:pw@page.example/", { asked: "Open https://alice:pw@page.example/" }, true],
    ["a link on it to another site", `https://attacker.example/collect/${TOKEN}`, { linked: true }, true],
    ["another page on this page's site", "https://page.example/about/team", {}, false],
    ["another page in this page's own subdomain", "https://www.page.example/news/2026/jet-engines-of-the-future", {}, false],
    // A site it has no reason to be on asks however plain.
    ["a plain new site", "https://www.wikipedia.org/", {}, true],
    ["a plain new site the user named", "https://www.wikipedia.org/", { asked: "Find jet engines on wikipedia.org" }, false],
    ["a page in a subdomain of one", "https://en.wikipedia.org/wiki/Jet_engine", { asked: "Find jet engines on wikipedia.org" }, false],
    ["only a site whose name ends like one", "https://notwikipedia.org/", { asked: "Find jet engines on wikipedia.org" }, true],
    ["an address the user gave, token and all", "https://docs.example.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit", { asked: "Read https://docs.example.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit" }, false],
    ["a local site the user gave an address on", "http://127.0.0.1:5173/settings", { asked: "Check http://127.0.0.1:5173/ for me" }, false],
    ["a site an earlier reply was on", "https://example.org/news", { beenTo: ["example.org"] }, false],
    ["a site the bird is limited to", "https://docs.github.com/en", { open: "https://github.com/", sites: ["github.com"] }, false],
    ["a search", "https://www.google.com/search?q=jet+engine", {}, false],
    ["a page no tab is on", "https://elsewhere.example/", { open: "about:blank" }, true],
  ])("%s", async (_, url, options, expected) => {
    expect(await asks(url, options)).toBe(expected);
  });

  it("never asks the page, so a link on it changes nothing", async () => {
    const runInPage = vi.fn(async () => true);
    const tab = { id: "tab-1", url: "https://page.example/", foreignFrames: [], runInPage } as unknown as Tab;
    const goTo = createPageTools({ activeTab: () => tab, allTabs: () => [tab], openTab: () => tab, closeTab: () => true, ask: async () => null, canSee: () => true, onUse: () => {} })
      .find(({ name }) => name === "go_to")!;
    expect(await goTo.isRisky!({ url: "https://page.example/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" })).toBe(true);
    expect(await goTo.isRisky!({ url: "https://page.example/about" })).toBe(false);
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
    expect(await goTo.isRisky!({ url: "https://other.example/plain" })).toBe(true);
    await tools.find(({ name }) => name === "read_page")!.run({ tabId: "tab-2" });
    expect(await goTo.isRisky!({ url: "https://other.example/plain" })).toBe(false);
  });
});

describe("the screenshot tool", () => {
  const settled = async () => {};

  it("returns the page as a picture", async () => {
    const tab = { settled, screenshotJpeg: async () => IMAGE } as unknown as Tab;
    expect(await screenshotTool(tab, () => true).run({})).toBe(`data:image/jpeg;base64,${Buffer.from("picture").toString("base64")}`);
  });

  it("takes nothing when Can see is off", async () => {
    let taken = false;
    const tab = {
      settled,
      screenshotJpeg: async () => {
        taken = true;
        return IMAGE;
      },
    } as unknown as Tab;
    expect(await screenshotTool(tab, () => false).run({})).toMatch(/turned off page access/);
    expect(taken).toBe(false);
  });

  it("returns nothing if Can see goes off while it's taken", async () => {
    let canSee = true;
    const tab = {
      settled,
      screenshotJpeg: async () => {
        canSee = false;
        return IMAGE;
      },
    } as unknown as Tab;
    expect(await screenshotTool(tab, () => canSee).run({})).toMatch(/turned off page access/);
  });

  it("is taken for Berry whatever frames are on screen", async () => {
    const tab = { settled, foreignFrames: [{ origin: "https://bank.example", isDestroyed: () => false }], runInPage: async () => true, screenshotJpeg: async () => IMAGE } as unknown as Tab;
    expect(await screenshotTool(tab, () => true).run({})).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("says so when there's nothing to see", async () => {
    const tab = { id: "tab-1", settled, screenshotJpeg: async () => null } as unknown as Tab;
    expect(await screenshotTool(tab, () => true).run({})).toMatch(/hasn't drawn/);
  });
});

describe("the ask_user tool", () => {
  const askTool = (ask: (question: string) => Promise<string | null>) =>
    createPageTools({
      activeTab: () => null,
      allTabs: () => [],
      openTab: () => {
        throw new Error("Not used");
      },
      closeTab: () => true,
      ask,
      canSee: () => true,
      onUse: () => {},
    }).find((tool) => tool.name === "ask_user")!;

  it.each(["What is your password?", "What is the code?", "What code did you receive?", "Vad är koden?", "Which card number?", "Your 2FA?"])(
    "never asks %s",
    async (question) => {
      const ask = vi.fn(async () => "secret");
      expect(await askTool(ask).run({ question })).toMatch(/never go through this chat/);
      expect(ask).not.toHaveBeenCalled();
    }
  );

  it.each(["Which colour?", "What is the postal code?", "Which of the two flights did you mean?"])("asks %s", async (question) => {
    expect(await askTool(async () => "Blue").run({ question })).toBe("The user answered: Blue");
  });

  it("says when the user skipped", async () => {
    expect(await askTool(async () => null).run({ question: "Which colour?" })).toMatch(/chose not to answer/);
  });

  it("shows one question at a time", async () => {
    const answers: Array<() => void> = [];
    const asked: string[] = [];
    const tool = askTool((question) => {
      asked.push(question);
      return new Promise((resolve) => answers.push(() => resolve("ok")));
    });
    const both = Promise.all([tool.run({ question: "First?" }), tool.run({ question: "Second?" })]);
    await vi.waitFor(() => expect(asked).toEqual(["First?"]));
    answers[0]();
    await vi.waitFor(() => expect(asked).toEqual(["First?", "Second?"]));
    answers[1]();
    await both;
  });
});

describe("a frame from another site", () => {
  const frame = { origin: "https://other.example", isDestroyed: () => false };
  const setUp = (runInFrame: () => Promise<unknown>) => {
    const tab = {
      id: "t1",
      url: "https://site.example/",
      foreignFrames: [frame],
      runInPage: async () => ({ total: 0, elements: [] }),
      runInFrame,
    } as unknown as Tab;
    const tools = createPageTools({
      activeTab: () => tab,
      allTabs: () => [tab],
      openTab: () => tab,
      closeTab: () => true,
      ask: async () => null,
      canSee: () => true,
      onUse: () => {},
    });
    return (name: string) => tools.find((tool) => tool.name === name)!;
  };
  const listing = { total: 100, elements: [{ ref: "e1", role: "button", name: "Go" }] };

  it.each([
    ["says nothing", async () => null],
    ["fails", async () => Promise.reject(new Error("gone"))],
  ])("still asks when it %s about an element", async (_, describing) => {
    const runInFrame = vi.fn<() => Promise<unknown>>(describing);
    runInFrame.mockResolvedValueOnce(listing);
    const tool = setUp(runInFrame);
    const { elements } = JSON.parse(await tool("list_elements").run({}));
    expect(await tool("click").isRisky!({ ref: elements[0].ref })).toBe(true);
    expect(await tool("type_text").isRisky!({ ref: elements[0].ref, text: "hi" })).toBe(true);
    expect(await tool("click").describe!({ ref: elements[0].ref })).toContain("https://other.example");
  });

  it("counts everything it found, not just what it returned", async () => {
    const tool = setUp(async () => listing);
    expect(JSON.parse(await tool("list_elements").run({})).total).toBe(100);
  });
});

describe("a mascot's limits", () => {
  const web = (id: string, url: string, extra: object = {}) =>
    ({
      id,
      url,
      title: `Title of ${url}`,
      foreignFrames: [],
      settled: async () => {},
      canGoBack: false,
      withNavigationLimit: async <T>(_: unknown, act: () => Promise<T>) => ({ result: await act(), refused: [] }),
      getTextWithFrames: vi.fn(async () => "page words"),
      loadURL: vi.fn(async () => {}),
      runInPage: vi.fn(async () => ({ total: 0, elements: [] })),
      ...extra,
    }) as unknown as Tab;
  const setUp = (tabs: Tab[], tools: MascotTool[] = ["visit", "click", "type"], openTab = vi.fn(() => tabs[0])) => {
    const list = createPageTools({
      activeTab: () => tabs[0],
      allTabs: () => tabs,
      openTab,
      closeTab: () => true,
      ask: async () => null,
      canSee: () => true,
      onUse: () => {},
      limits: { name: "Scout", sites: ["github.com"], tools },
    });
    return { list, tool: (name: string) => list.find((found) => found.name === name)!, openTab };
  };

  it("only hands over the tools it was given, plus reading and asking", () => {
    expect(setUp([], []).list.map(({ name }) => name).sort()).toEqual(
      ["ask_user", "find_in_page", "hand_to_user", "hover", "list_elements", "list_tabs", "read_page", "screenshot", "scroll_page", "wait"]
    );
    const canClick = setUp([], ["click"]).list.map(({ name }) => name);
    expect(canClick).toContain("click");
    expect(canClick).not.toContain("type_text");
    expect(canClick).not.toContain("go_to");
  });

  it.each([
    ["the site", "https://github.com/x", true],
    ["a subdomain", "https://docs.github.com/x", true],
    ["another site", "https://example.com/", false],
    ["a name that only ends the same", "https://notgithub.com/", false],
    ["the site as a login name", "https://github.com@example.com/", false],
    ["a blank page", "about:blank", false],
  ])("reads from %s only if it's allowed", async (_, url, reads) => {
    const tab = web("tab-1", url);
    const { tool } = setUp([tab]);
    const result = await tool("read_page").run({});
    expect(result.includes("page words")).toBe(reads);
    expect(vi.mocked(tab.getTextWithFrames).mock.calls.length).toBe(reads ? 1 : 0);
    expect((await tool("read_page").refuses!({})) === null).toBe(reads);
  });

  it("doesn't go to or open an address off its sites, or show one in the tab list", async () => {
    const allowed = web("tab-1", "https://github.com/");
    const other = web("tab-2", "https://example.com/");
    const { tool, openTab } = setUp([allowed, other]);
    expect(await tool("go_to").run({ url: "https://example.com/?secret=1" })).toMatch(/isn't allowed on example.com/);
    expect(allowed.loadURL).not.toHaveBeenCalled();
    expect(await tool("open_tab").run({ url: "https://example.com/" })).toMatch(/isn't allowed/);
    expect(openTab).not.toHaveBeenCalled();
    expect(await tool("click").run({ tabId: "tab-2", ref: "e1" })).toMatch(/isn't allowed/);
    expect(other.runInPage).not.toHaveBeenCalled();
    expect(JSON.parse(await tool("list_tabs").run({})).map(({ id }: { id: string }) => id)).toEqual(["tab-1"]);
  });

  it("leaves out frames from other sites, and refuses their refs", async () => {
    const frame = { origin: "https://example.com", isDestroyed: () => false };
    const runInFrame = vi.fn(async () => ({ total: 1, elements: [{ ref: "e1" }] }));
    const tab = web("tab-1", "https://github.com/", { foreignFrames: [frame], runInFrame });
    const { tool } = setUp([tab]);
    await tool("list_elements").run({});
    expect(runInFrame).not.toHaveBeenCalled();
    await tool("read_page").run({});
    const [allowsFrame] = vi.mocked(tab.getTextWithFrames).mock.calls[0] as unknown as [(origin: string) => boolean];
    expect(allowsFrame("https://example.com")).toBe(false);
    expect(allowsFrame("https://gist.github.com")).toBe(true);
  });

  describe("a screenshot", () => {
    const frame = (origin: string) => ({ origin, isDestroyed: () => false });
    // The page's own script sees no frame on screen, as it wouldn't for one in a shadow root.
    const shot = (foreignFrames: object[]) => {
      const screenshotJpeg = vi.fn(async () => IMAGE);
      const tab = web("tab-1", "https://github.com/", { foreignFrames, runInPage: vi.fn(async () => false), screenshotJpeg });
      return { tab, screenshotJpeg, run: () => setUp([tab]).tool("screenshot").run({}) };
    };

    it("isn't taken while the page has a frame from another site, whatever its script says is on screen", async () => {
      const { screenshotJpeg, run } = shot([frame("https://bank.example")]);
      expect(await run()).toMatch(/shows a frame from a site Scout isn't allowed on/);
      expect(screenshotJpeg).not.toHaveBeenCalled();
    });

    it("is dropped if one came in while it was taken", async () => {
      const frames: object[] = [];
      const { screenshotJpeg, run } = shot(frames);
      screenshotJpeg.mockImplementation(async () => {
        frames.push(frame("https://bank.example"));
        return IMAGE;
      });
      expect(await run()).toMatch(/isn't allowed on/);
    });

    it("is taken with only frames from its own sites", async () => {
      expect(await shot([frame("https://gist.github.com")]).run()).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  it("drops what came back if the page took the tab off its sites meanwhile", async () => {
    const tab = web("tab-1", "https://github.com/");
    (tab.getTextWithFrames as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      (tab as unknown as { url: string }).url = "https://example.com/";
      return "the other site's words";
    });
    expect(await setUp([tab]).tool("read_page").run({})).not.toContain("the other site's words");
  });
});

describe("the step for an allowed click", () => {
  const setUp = (name: string) => {
    const tab = {
      id: "t1",
      url: "https://shop.example/basket",
      foreignFrames: [],
      runInPage: async () => ({ role: "button", name, target: null, riskyClick: true, safeToType: false, frameUrl: null }),
    } as unknown as Tab;
    const tools = createPageTools({ activeTab: () => tab, allTabs: () => [tab], openTab: () => tab, closeTab: () => true, ask: async () => null, canSee: () => true, onUse: () => {} });
    return (tool: string) => tools.find(({ name: candidate }) => candidate === tool)!;
  };

  it("names what the card named, while the model's label stays the page's words free", async () => {
    const tool = setUp("Place order");
    expect(tool("click").allowedLabel!({ ref: "e1" })).toBeNull();
    expect(await tool("click").describe!({ ref: "e1" })).toBe("Click the button “Place order” on https://shop.example/basket");
    expect(tool("click").allowedLabel!({ ref: "e1" })).toBe("Clicked “Place order” on shop.example");
    expect(tool("click").label({ ref: "e1" })).toBe("Clicked something on shop.example");
    expect(tool("click").allowedLabel!({ ref: "e2" })).toBeNull();
    await tool("double_click").describe!({ ref: "e1" });
    expect(tool("double_click").allowedLabel!({ ref: "e1" })).toBe("Double-clicked “Place order” on shop.example");
  });

  it("cuts a long name short, takes out invisible characters, and says nothing for an unnamed element", async () => {
    const long = setUp(`Buy‮ now\n\n${"and then some ".repeat(10)}`);
    await long("click").describe!({ ref: "e1" });
    const shown = long("click").allowedLabel!({ ref: "e1" })!;
    expect(shown).toMatch(/^Clicked “Buy now and then some .*…” on shop\.example$/);
    expect(shown).not.toContain("‮");
    expect(shown.length).toBeLessThan(80);

    const unnamed = setUp("");
    await unnamed("click").describe!({ ref: "e1" });
    expect(unnamed("click").allowedLabel!({ ref: "e1" })).toBeNull();
  });
});

describe("the web_search tool", () => {
  const tab = { id: "tab-1", url: "https://page.example/", foreignFrames: [] } as unknown as Tab;
  const toolsWith = (search: (query: string) => Promise<{ title: string; url: string; snippet: string }[]>, limits?: { sites: string[]; tools: MascotTool[] }) =>
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
  const offered = (limits?: { sites: string[]; tools: MascotTool[] }) => toolsWith(nothing, limits).some(({ name }) => name === "web_search");

  it("is offered only with a search service, and never to a bird limited to sites", () => {
    expect(createPageTools({ activeTab: () => tab, allTabs: () => [tab], openTab: () => tab, closeTab: () => true, ask: async () => null, canSee: () => true, onUse: () => {} }).some(({ name }) => name === "web_search")).toBe(false);
    expect(offered()).toBe(true);
    expect(offered({ sites: [], tools: ["visit"] })).toBe(true);
    expect(offered({ sites: [], tools: ["click", "type"] })).toBe(false);
    expect(offered({ sites: ["github.com"], tools: ["visit", "click", "type"] })).toBe(false);
  });

  const asksFor = (query: string) => toolsWith(nothing).find(({ name }) => name === "web_search")!.isRisky!({ query });
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
    expect(await asksFor(query)).toBe(expected);
  });

  it("refuses an empty query and one past the service's limit", () => {
    const search = toolsWith(nothing).find(({ name }) => name === "web_search")!;
    expect(() => search.label({ query: "" })).toThrow();
    expect(() => search.label({ query: "a".repeat(501) })).toThrow();
    expect(search.label({ query: "a".repeat(500) })).toBe("Searched the web");
  });

  it("names the whole query on the card, keeps it off the step the model sees, and labels results as untrusted", async () => {
    const search = toolsWith(async () => [{ title: "Careers​ at Strawberry", url: "https://strawberrybrowser.com/careers", snippet: "Open roles" }]).find(({ name }) => name === "web_search")!;
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
  const toolsWith = (fetchPage: (url: string) => Promise<Page>, { limits, asked }: { limits?: { sites: string[]; tools: MascotTool[] }; asked?: string } = {}) =>
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

  it("is offered only with a page service, and to a bird limited to sites only with visit", () => {
    expect(fetchOf(createPageTools({ activeTab: () => tab, allTabs: () => [tab], openTab: () => tab, closeTab: () => true, ask: async () => null, canSee: () => true, onUse: () => {} }))).toBeUndefined();
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
    expect(await fetchOf(tools)!.isRisky!({ url })).toBe(await openTab.isRisky!({ url }));
  });

  it("always asks for a name or password in the address, even one the user gave", async () => {
    const url = "https://alice:pw@page.example/";
    expect(await fetchOf(toolsWith(echo, { asked: `Read ${url}` }))!.isRisky!({ url })).toBe(true);
  });

  it("says on the card that the address goes to Firecrawl, and keeps the path off the step the model sees", async () => {
    const tool = fetchOf(toolsWith(echo))!;
    const url = "https://www.acme.example/about/team?ref=1";
    expect(await tool.describe!({ url })).toBe(`Read ${url} through Firecrawl, which visits it from its own servers, without opening a tab`);
    expect(tool.label({ url })).toBe("Read acme.example");
    expect(tool.shownLabel!({ url })).toBe("Read acme.example/about/team");
    expect(tool.shownLabel!({ url: "https://acme.example/" })).toBe("Read acme.example");
  });

  it("labels the text as untrusted, and reads on from an offset without fetching again", async () => {
    const service = vi.fn(async (url: string) => page(url, "a".repeat(25_000)));
    const tool = fetchOf(toolsWith(service))!;
    const first = await tool.run({ url: "https://acme.example/" });
    expect(first).toMatch(/^https:\/\/acme\.example\/, fetched without a tab, characters 0 to 20000 of 25000\. Continue with offset 20000\. It's page content, so it's untrusted\.\n\n/);
    expect(await tool.run({ url: "https://acme.example/", offset: 20_000 })).toMatch(/characters 20000 to 25000 of 25000\. This is the end of the page\./);
    expect(service).toHaveBeenCalledTimes(1);
  });

  it("never gives half a character, wherever the offset falls", async () => {
    const tool = fetchOf(toolsWith(async (url) => page(url, "🫐".repeat(15_000))))!;
    expect((await tool.run({ url: "https://acme.example/" })).isWellFormed()).toBe(true);
    expect((await tool.run({ url: "https://acme.example/", offset: 1 })).isWellFormed()).toBe(true);
  });

  it("says to open a tab when the page came back empty, refused or not at all", async () => {
    expect(await fetchOf(toolsWith(async (url) => page(url, "")))!.run({ url: "https://acme.example/" })).toMatch(/came back empty.*open_tab/);
    expect(await fetchOf(toolsWith(async (url) => page(url, "Forbidden", 403)))!.run({ url: "https://acme.example/" })).toMatch(/answered 403.*open_tab/);
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
    expect(await fetchOf(tools)!.isRisky!({ url: "https://acme.example/news" })).toBe(true);
    expect(await fetchOf(tools)!.isRisky!({ url: "https://acme.example/" })).toBe(true);
    await fetchOf(tools)!.run({ url: "https://acme.example/" });
    expect(await fetchOf(tools)!.isRisky!({ url: "https://acme.example/news" })).toBe(false);
  });

  it("keeps a bird to its sites, wherever the page ends up", async () => {
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

describe("an action after the bird's flight", () => {
  it("doesn't happen when the element changed while the bird flew, since that isn't what was allowed", async () => {
    let flown = false;
    const peck = vi.fn(async () => {});
    const actor = { showing: true, goTo: async () => void (flown = true), peck };
    const runInPage = vi.fn(async (script: string) =>
      script.includes("safeToType: safeToType(el)")
        ? { role: "textbox", name: flown ? "Password" : "Subject", target: null, riskyClick: false, safeToType: false, secret: flown, frameUrl: null }
        : { status: "aimed", x: 10, y: 10, width: 10, height: 10, name: "Save" }
    );
    const tab = { id: "tab-1", url: "https://mail.example/", foreignFrames: [], frames: [], runInPage, actor } as unknown as Tab;
    const click = createPageTools({ activeTab: () => tab, allTabs: () => [tab], openTab: () => tab, closeTab: () => true, ask: async () => null, canSee: () => true, onUse: () => {} }).find(
      ({ name }) => name === "click"
    )!;

    expect(await click.run({ ref: "e1" })).toMatch(/changed before the action happened/);
    expect(flown).toBe(true);
    expect(peck).not.toHaveBeenCalled();
  });
});
