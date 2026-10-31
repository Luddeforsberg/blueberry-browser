import { describe, expect, it, vi } from "vitest";
import { createPageTools } from "./browserTools";
import type { Tab } from "./Tab";
import type { MascotTool } from "../shared/library";

const IMAGE = {
  isEmpty: () => false,
  getSize: () => ({ width: 100, height: 100 }),
  toJPEG: () => Buffer.from("picture"),
};

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

describe("whether an address with a query asks in the default mode", () => {
  const asks = (url: string, open = "https://page.example/") => {
    const tab = { id: "tab-1", url: open } as unknown as Tab;
    const openTab = createPageTools({
      activeTab: () => tab,
      allTabs: () => [tab],
      openTab: () => tab,
      closeTab: () => true,
      ask: async () => null,
      canSee: () => true,
      onUse: () => {},
    }).find((tool) => tool.name === "open_tab")!;
    return openTab.isRisky!({ url });
  };
  // Counts the "?" too, so this query and hash come to exactly `length`.
  const ofLength = (length: number) => `?q=${"a".repeat(length - 3)}`;

  it.each([
    ["a short search on a listed site", "https://www.youtube.com/results?search_query=jet+engine", false],
    ["a subdomain of one", "https://sv.wikipedia.org/w/index.php?search=jet", false],
    ["no query, wherever it goes", "https://unknown.example/plain", false],
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

describe("the screenshot tool", () => {
  const settled = async () => {};

  it("returns the page as a picture", async () => {
    const tab = { settled, screenshot: async () => IMAGE } as unknown as Tab;
    expect(await screenshotTool(tab, () => true).run({})).toBe(`data:image/jpeg;base64,${Buffer.from("picture").toString("base64")}`);
  });

  it("takes nothing when Can see is off", async () => {
    let taken = false;
    const tab = {
      settled,
      screenshot: async () => {
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
      screenshot: async () => {
        canSee = false;
        return IMAGE;
      },
    } as unknown as Tab;
    expect(await screenshotTool(tab, () => canSee).run({})).toMatch(/turned off page access/);
  });

  it("says so when there's nothing to see", async () => {
    const tab = { id: "tab-1", settled, screenshot: async () => ({ ...IMAGE, isEmpty: () => true }) } as unknown as Tab;
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

  it("drops what came back if the page took the tab off its sites meanwhile", async () => {
    const tab = web("tab-1", "https://github.com/");
    (tab.getTextWithFrames as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      (tab as unknown as { url: string }).url = "https://example.com/";
      return "the other site's words";
    });
    expect(await setUp([tab]).tool("read_page").run({})).not.toContain("the other site's words");
  });
});
