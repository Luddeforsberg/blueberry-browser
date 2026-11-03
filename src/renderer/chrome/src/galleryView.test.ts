import { describe, expect, it } from "vitest";
import type { GalleryMascot } from "@shared/library";
import { filterGallery, freeName } from "./galleryView";

const entry = (name: string, category: string, sites: string[], tools: GalleryMascot["draft"]["tools"]): GalleryMascot => ({
  id: name,
  author: "Blueberry",
  category,
  description: `${name} does its job.`,
  draft: { name, look: { palette: "robin", accessory: "cap" }, instructions: "Look around.", sites, tools },
});

const tidy = entry("Pipeline Tidy", "Work", ["pipedrive.com"], ["visit", "click", "type"]);
const watch = entry("Competitor Watch", "News", ["linear.app"], ["visit"]);
const names = (query: string, category: string | null = null) => filterGallery([tidy, watch], query, category).map(({ draft }) => draft.name);

describe("filterGallery", () => {
  it.each([
    ["", ["Pipeline Tidy", "Competitor Watch"]],
    ["   ", ["Pipeline Tidy", "Competitor Watch"]],
    ["PIPEDRIVE", ["Pipeline Tidy"]],
    ["watch linear", ["Competitor Watch"]],
    ["watch pipedrive", []],
    ["can’t type", ["Competitor Watch"]],
    ["can't type", ["Competitor Watch"]],
    ["nothing like this", []],
  ])("finds %j", (query, expected) => {
    expect(names(query)).toEqual(expected);
  });

  it("keeps to the chosen category, along with the search", () => {
    expect(names("", "News")).toEqual(["Competitor Watch"]);
    expect(names("pipedrive", "News")).toEqual([]);
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
