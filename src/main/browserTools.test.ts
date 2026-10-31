import { describe, expect, it } from "vitest";
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
