import { describe, expect, it } from "vitest";
import type { GalleryMascot } from "@shared/library";
import { addsLine, filterGallery, freeName, galleryFacts, galleryGroups, galleryKinds, sortGallery } from "./galleryView";

const entry = (
  name: string,
  category: string,
  sites: string[],
  tools: GalleryMascot["draft"]["tools"],
  published?: { adds: number; at: number },
): GalleryMascot => ({
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
    expect(names(sortGallery([tidy, quiet, older, watch, newer, top]))).toEqual([
      "Top",
      "Newer",
      "Older",
      "Quiet",
      "Pipeline Tidy",
      "Competitor Watch",
    ]);
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
    expect(galleryGroups([tidy, top, quiet], "o", null).map(({ label, entries }) => [label, names(entries)])).toEqual([
      ["3 found", ["Top", "Quiet", "Pipeline Tidy"]],
    ]);
    expect(galleryGroups([tidy], "nothing", null)).toEqual([{ key: "found", label: "0 found", entries: [] }]);
  });
});

describe("galleryFacts", () => {
  const facts = (from: GalleryMascot) =>
    galleryFacts(from).map(({ label, lines }) => [label, lines.map(({ text, limited }) => (limited ? `🔒 ${text}` : text))]);

  it("gives a person's how many times it was added, and its limits in the tool layer's words, with a padlock only on a real limit", () => {
    expect(facts(entry("Roamer", "Work", [], ["visit"], { adds: 1204, at: 0 }))).toEqual([
      ["Made by", ["Ana"]],
      ["Added", [`${(1204).toLocaleString()} times`]],
      ["Visits", ["Can search the web and go anywhere"]],
      ["Can", ["🔒 Can’t type or click"]],
      ["Kind of job", ["Work"]],
    ]);
    expect(facts(fifth)[1]).toEqual(["Added", ["1 time"]]);
    expect(facts(quiet)[1]).toEqual(["Added", ["0 times"]]);
  });

  it("has no count for a starter, and every line of what it can't do when it can't open pages", () => {
    expect(facts(tidy)).toEqual([
      ["Made by", ["Blueberry"]],
      ["Visits", ["🔒 Only visits pipedrive.com"]],
      ["Can", ["Can click and type"]],
      ["Kind of job", ["Work"]],
    ]);
    expect(facts(entry("Reader", "Work", [], [])).find(([label]) => label === "Can")).toEqual([
      "Can",
      ["🔒 Can’t open pages by itself", "🔒 Can’t type or click"],
    ]);
  });
});

describe("addsLine", () => {
  it("says who and how many adds, one add alone", () => {
    expect(addsLine(top)).toBe("Ana · 40 adds");
    expect(addsLine(fifth)).toBe("Ana · 1 add");
    expect(addsLine(quiet)).toBe("Ana · 0 adds");
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
