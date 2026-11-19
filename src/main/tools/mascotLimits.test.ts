import { describe, expect, it, vi } from "vitest";
import { createPageTools } from "./browserTools";
import type { Tab } from "../tabs/Tab";
import type { MascotTool } from "../../shared/library";
import { defined } from "../../shared/testing";

const IMAGE = Buffer.from("picture");

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
  const setUp = (tabs: Tab[], tools: MascotTool[] = ["visit", "click", "type"], openTab = vi.fn(() => defined(tabs[0]))) => {
    const list = createPageTools({
      activeTab: () => defined(tabs[0]),
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
    expect(
      setUp([], [])
        .list.map(({ name }) => name)
        .sort(),
    ).toEqual([
      "ask_user",
      "find_in_page",
      "hand_to_user",
      "hover",
      "list_elements",
      "list_tabs",
      "read_page",
      "screenshot",
      "scroll_page",
      "wait",
    ]);
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
