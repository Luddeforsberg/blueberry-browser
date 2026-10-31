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

const hunter = entry("Nest Hunter", "Home", ["hemnet.se"], ["visit", "click", "type"]);
const paper = entry("Morning Paper", "News", ["svt.se"], ["visit"]);
const names = (query: string, category: string | null = null) => filterGallery([hunter, paper], query, category).map(({ draft }) => draft.name);

describe("filterGallery", () => {
  it.each([
    ["", ["Nest Hunter", "Morning Paper"]],
    ["   ", ["Nest Hunter", "Morning Paper"]],
    ["HEMNET", ["Nest Hunter"]],
    ["paper svt", ["Morning Paper"]],
    ["paper hemnet", []],
    ["can’t type", ["Morning Paper"]],
    ["can't type", ["Morning Paper"]],
    ["nothing like this", []],
  ])("finds %j", (query, expected) => {
    expect(names(query)).toEqual(expected);
  });

  it("keeps to the chosen category, along with the search", () => {
    expect(names("", "News")).toEqual(["Morning Paper"]);
    expect(names("hemnet", "News")).toEqual([]);
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
