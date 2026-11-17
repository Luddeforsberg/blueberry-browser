import { describe, expect, it } from "vitest";
import type { GalleryMascot } from "@shared/library";
import { filterGallery, freeName, galleryGroups, galleryKinds, mostAdded, neighbour, sortGallery } from "./galleryView";

const entry = (name: string, category: string, sites: string[], tools: GalleryMascot["draft"]["tools"], published?: { adds: number; at: number }): GalleryMascot => ({
  id: name,
  author: published ? "Ana" : "Blueberry",
  category,
  description: `${name} does its job.`,
  draft: { name, look: { palette: "robin", accessory: "cap" }, instructions: "Look around.", sites, tools },
  ...(published ? { addCount: published.adds, publishedAt: published.at } : {}),
});

const tidy = entry("Pipeline Tidy", "Work", ["pipedrive.com"], ["visit", "click", "type"]);
const watch = entry("Competitor Watch", "News and research", ["linear.app"], ["visit"]);
const names = (list: readonly GalleryMascot[]) => list.map(({ draft }) => draft.name);
const found = (query: string, category: string | null = null) => names(filterGallery([tidy, watch], query, category));

describe("filterGallery", () => {
  it.each([
    ["", ["Pipeline Tidy", "Competitor Watch"]],
    ["   ", ["Pipeline Tidy", "Competitor Watch"]],
    ["PIPEDRIVE", ["Pipeline Tidy"]],
    ["watch linear", ["Competitor Watch"]],
    ["watch pipedrive", []],
    ["does its", ["Pipeline Tidy", "Competitor Watch"]],
    ["look around", ["Pipeline Tidy", "Competitor Watch"]],
    ["nothing like this", []],
  ])("finds %j by name, line, what it's told or a site", (query, expected) => {
    expect(found(query)).toEqual(expected);
  });

  it("doesn't match on who wrote it, its kind or its limits' words", () => {
    expect(found("blueberry")).toEqual([]);
    expect(found("work")).toEqual([]);
    expect(found("can't type")).toEqual([]);
  });

  it("keeps to the chosen kind, along with the search", () => {
    expect(found("", "News and research")).toEqual(["Competitor Watch"]);
    expect(found("pipedrive", "News and research")).toEqual([]);
  });
});

const quiet = entry("Quiet", "Work", [], [], { adds: 0, at: 5 });
const older = entry("Older", "Work", [], [], { adds: 3, at: 1 });
const newer = entry("Newer", "Travel", [], [], { adds: 3, at: 2 });
const top = entry("Top", "Work", [], [], { adds: 40, at: 0 });
const fifth = entry("Fifth", "Work", [], [], { adds: 1, at: 9 });

describe("sortGallery", () => {
  it("puts people's first, most added then newest, and keeps Blueberry's own order after them", () => {
    expect(names(sortGallery([tidy, quiet, older, watch, newer, top]))).toEqual(["Top", "Newer", "Older", "Quiet", "Pipeline Tidy", "Competitor Watch"]);
  });
});

describe("mostAdded", () => {
  it("is nothing until something has adds", () => {
    expect(mostAdded([])).toEqual([]);
    expect(mostAdded([tidy, watch, quiet])).toEqual([]);
  });

  it("takes only those with adds, so one added once shows alone", () => {
    expect(names(mostAdded([quiet, fifth, tidy]))).toEqual(["Fifth"]);
  });

  it("takes the three most added, the newest first on a tie, and no more", () => {
    expect(names(mostAdded([fifth, older, quiet, newer, top]))).toEqual(["Top", "Newer", "Older"]);
  });
});

describe("galleryKinds", () => {
  it("counts each kind that has any, in the order publishing offers them", () => {
    expect(galleryKinds([watch, tidy, newer, top])).toEqual([
      { kind: "News and research", count: 1 },
      { kind: "Travel", count: 1 },
      { kind: "Work", count: 2 },
    ]);
    expect(galleryKinds([])).toEqual([]);
  });
});

describe("galleryGroups", () => {
  it("splits people's from Blueberry's, and leaves out a group with none", () => {
    expect(galleryGroups([tidy, top, quiet], "", null).map(({ label, entries }) => [label, names(entries)])).toEqual([
      ["From people", ["Top", "Quiet"]],
      ["From Blueberry", ["Pipeline Tidy"]],
    ]);
    expect(galleryGroups([tidy], "", null).map(({ key }) => key)).toEqual(["blueberry"]);
    expect(galleryGroups([tidy], "", "Travel")).toEqual([]);
  });

  it("is one group with how many were found while searching, even none", () => {
    expect(galleryGroups([tidy, top, quiet], "o", null).map(({ label, entries }) => [label, names(entries)])).toEqual([["3 found", ["Top", "Quiet", "Pipeline Tidy"]]]);
    expect(galleryGroups([tidy], "nothing", null)).toEqual([{ key: "found", label: "0 found", entries: [] }]);
  });
});

describe("neighbour", () => {
  const ids = ["a", "b", "c"];

  it("moves one along, and stays at either end", () => {
    expect(neighbour(ids, "b", 1)).toBe("c");
    expect(neighbour(ids, "b", -1)).toBe("a");
    expect(neighbour(ids, "c", 1)).toBe("c");
    expect(neighbour(ids, "a", -1)).toBe("a");
  });

  it("starts from an end when nothing in the list is picked", () => {
    expect(neighbour(ids, null, 1)).toBe("a");
    expect(neighbour(ids, "gone", -1)).toBe("c");
    expect(neighbour([], "a", 1)).toBeNull();
    expect(neighbour(["a"], "a", 1)).toBe("a");
  });
});

describe("freeName", () => {
  it("keeps a free name and counts up past taken ones, whatever their case", () => {
    expect(freeName("Scout", [])).toBe("Scout");
    expect(freeName("Scout", ["scout"])).toBe("Scout 2");
    expect(freeName("Scout", ["SCOUT", "scout 2"])).toBe("Scout 3");
  });

  it("stays within the name limit", () => {
    expect(freeName("a".repeat(24), ["a".repeat(24)])).toBe(`${"a".repeat(22)} 2`);
  });
});
