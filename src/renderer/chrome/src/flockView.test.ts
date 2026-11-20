import { beforeEach, describe, expect, it, vi } from "vitest";

// The drafts live in the module, so each test gets a fresh one.
const load = async () => {
  vi.resetModules();
  vi.stubGlobal("window", new EventTarget());
  return import("./flockView");
};

describe("what's typed on the mascots' page", () => {
  let view: Awaited<ReturnType<typeof load>>;
  beforeEach(async () => {
    view = await load();
  });

  it("is still there when the same tab comes back to the same place", () => {
    view.keepTabDraft("tab-1", "new", "half a name");
    view.forgetTabDraftElsewhere("tab-1", "new");
    expect(view.tabDraft("tab-1", "new", () => "blank")).toBe("half a name");
  });

  it("is gone once the page has moved somewhere else, even if it comes back", () => {
    view.keepTabDraft("tab-1", "new", "half a name");
    view.forgetTabDraftElsewhere("tab-1", "list");
    expect(view.tabDraft("tab-1", "new", () => "blank")).toBe("blank");
  });

  it("belongs to its tab and its place only", () => {
    view.keepTabDraft("tab-1", "new", "half a name");
    expect(view.tabDraft("tab-2", "new", () => "blank")).toBe("blank");
    expect(view.tabDraft("tab-1", "m1/name", () => "blank")).toBe("blank");
  });
});

describe("changing one part of a mascot", () => {
  it("takes only that part from what was changed, and the rest from the mascot as it is now", async () => {
    const { blankMascot, withPart } = await load();
    const now = { ...blankMascot(), id: "m1", name: "Scout", instructions: "Changed since.", worksInCloud: true };
    const opened = { ...now, name: "Scout", instructions: "As it was when opened.", worksInCloud: false };
    const changed = { ...opened, onlySomeSites: true, sites: ["svt.se"], tools: [] };
    expect(withPart(now, changed, "limits")).toEqual({ ...now, onlySomeSites: true, sites: ["svt.se"], tools: [] });
    expect(withPart(now, { ...opened, name: "Pip" }, "name")).toEqual({ ...now, name: "Pip" });
    expect(withPart(now, { ...opened, palette: "robin", accessory: "bow" }, "look")).toEqual({ ...now, palette: "robin", accessory: "bow" });
  });
});

describe("who the dock shows", () => {
  const busy = (name: string) => name.endsWith("!");
  const faces = async (flock: string[], room: number) => (await load()).dockFaces(flock, room, busy);

  it("shows everyone while they fit, and at exactly the room there is", async () => {
    expect(await faces([], 5)).toEqual({ shown: [], more: 0 });
    expect(await faces(["a", "b", "c"], 3)).toEqual({ shown: ["a", "b", "c"], more: 0 });
  });

  it("gives one place to the count when there's one too many", async () => {
    expect(await faces(["a", "b", "c", "d"], 3)).toEqual({ shown: ["a", "b"], more: 2 });
  });

  it("never hides one that's asking or working, and never moves the first", async () => {
    expect(await faces(["a", "b", "c", "d!"], 3)).toEqual({ shown: ["a", "d!"], more: 2 });
    expect(await faces(["a", "b", "c!"], 2)).toEqual({ shown: ["a"], more: 2 });
  });

  it("always shows the first, however little room there is", async () => {
    expect(await faces(["a", "b"], 0)).toEqual({ shown: ["a"], more: 1 });
  });
});
