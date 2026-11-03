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
