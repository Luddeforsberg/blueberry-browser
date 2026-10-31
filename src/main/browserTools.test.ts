import { describe, expect, it, vi } from "vitest";
import { createPageTools } from "./browserTools";
import type { Tab } from "./Tab";

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
    const runInFrame = vi.fn(describing);
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
