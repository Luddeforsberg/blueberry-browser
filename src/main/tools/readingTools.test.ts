import { describe, expect, it } from "vitest";
import { createPageTools } from "./browserTools";
import type { Tab } from "../tabs/Tab";

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
    const tab = {
      settled,
      foreignFrames: [{ origin: "https://bank.example", isDestroyed: () => false }],
      runInPage: async () => true,
      screenshotJpeg: async () => IMAGE,
    } as unknown as Tab;
    expect(await screenshotTool(tab, () => true).run({})).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("says so when there's nothing to see", async () => {
    const tab = { id: "tab-1", settled, screenshotJpeg: async () => null } as unknown as Tab;
    expect(await screenshotTool(tab, () => true).run({})).toMatch(/hasn't drawn/);
  });
});
