import { describe, expect, it } from "vitest";
import { fetchMascotCatalog, parseGalleryMascot } from "./mascotCatalog";
import { MAX_MASCOT_NAME, parseMascotDraft } from "../shared/mascots";

const entry = {
  id: "a",
  author: "Blueberry",
  category: "Work",
  description: "Does a thing.",
  draft: { name: "Scout", look: { palette: "robin", accessory: "cap" }, instructions: "Read.", sites: [], tools: [] },
};

describe("the mascot catalog", () => {
  it("has starters that pass a mascot's own checks unchanged, with one limited to reading and one that can go anywhere", async () => {
    const catalog = await fetchMascotCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(10);
    expect(new Set(catalog.map(({ id }) => id)).size).toBe(catalog.length);
    expect(new Set(catalog.map(({ draft }) => draft.name.toLowerCase())).size).toBe(catalog.length);
    for (const { draft, author, description } of catalog) {
      expect(parseMascotDraft(draft)).toEqual({ draft });
      expect(draft.name.length).toBeLessThanOrEqual(MAX_MASCOT_NAME);
      expect(draft.name.toLowerCase()).not.toBe("berry");
      expect(draft.look.palette).not.toBe("jackdaw");
      expect(author).toBe("Blueberry");
      expect(description.length).toBeLessThanOrEqual(70);
    }
    expect(catalog.filter(({ draft }) => draft.sites.length > 0).length).toBeGreaterThan(catalog.length / 2);
    expect(catalog.some(({ draft }) => draft.sites.length > 0 && !draft.tools.includes("click") && !draft.tools.includes("type"))).toBe(true);
    expect(catalog.some(({ draft }) => draft.sites.length === 0 && draft.tools.includes("visit"))).toBe(true);
  });

  it("drops anything on an entry that isn't a card's or a mascot's", () => {
    const parsed = parseGalleryMascot({ ...entry, trusted: true, draft: { ...entry.draft, id: "berry", deletedAt: 1, galleryId: "x", skipApprovals: true, tools: ["visit", "everything"] } });
    expect(parsed).toEqual({ ...entry, draft: { ...entry.draft, tools: ["visit"] } });
  });

  it.each([
    ["no draft", { ...entry, draft: undefined }],
    ["a draft a mascot couldn't have", { ...entry, draft: { ...entry.draft, sites: ["com"] } }],
    ["no id", { ...entry, id: "" }],
    ["no author", { ...entry, author: undefined }],
    ["nothing at all", null],
  ])("shows no card for %s", (_, input) => {
    expect(parseGalleryMascot(input)).toBeNull();
  });
});
