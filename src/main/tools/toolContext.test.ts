import { describe, expect, it, vi } from "vitest";
import { createPageTools } from "./browserTools";
import type { Tab } from "../tabs/Tab";

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
    const frame = { reason: "other-origin-frame", mark: "https://other.example" };
    expect(await tool("click").whyRisky!({ ref: elements[0].ref })).toEqual(frame);
    expect(await tool("type_text").whyRisky!({ ref: elements[0].ref, text: "hi" })).toEqual(frame);
    expect(await tool("click").describe!({ ref: elements[0].ref })).toContain("https://other.example");
  });

  it("counts everything it found, not just what it returned", async () => {
    const tool = setUp(async () => listing);
    expect(JSON.parse(await tool("list_elements").run({})).total).toBe(100);
  });
});

describe("the step for an allowed click", () => {
  const setUp = (name: string) => {
    const tab = {
      id: "t1",
      url: "https://shop.example/basket",
      foreignFrames: [],
      runInPage: async () => ({
        role: "button",
        name,
        target: null,
        clickRisk: { reason: "risky-word", mark: "order" },
        typeRisk: { reason: "not-search" },
        frameUrl: null,
      }),
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
