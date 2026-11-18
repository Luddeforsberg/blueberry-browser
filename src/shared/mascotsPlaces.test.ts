import { describe, expect, it } from "vitest";
import { mascotsBack, mascotsParam, mascotsPlace, type MascotsPlace } from "./mascotsPlaces";

const ID = "6f1c2a52-6d0e-4a55-9a59-1f1d3c0b2e11";

describe("where the mascots' page is", () => {
  it("opens on the list with no param, an empty one, or one nobody knows", () => {
    expect(mascotsPlace(null)).toEqual({ page: "list" });
    expect(mascotsPlace("")).toEqual({ page: "list" });
    expect(mascotsPlace(`${ID}/memory/more`)).toEqual({ page: "list" });
    expect(mascotsPlace("/memory")).toEqual({ page: "list" });
  });

  it("comes back from its param as the same place", () => {
    const places: MascotsPlace[] = [
      { page: "list" },
      { page: "new" },
      { page: "mascot", id: ID },
      { page: "memory", id: ID },
      { page: "publish", id: ID },
      { page: "part", id: ID, part: "look" },
      { page: "part", id: ID, part: "limits" },
    ];
    for (const place of places) expect(mascotsPlace(mascotsParam(place))).toEqual(place);
  });

  it("sends an unknown part to the mascot's page", () => {
    expect(mascotsPlace(`${ID}/colour`)).toEqual({ page: "mascot", id: ID });
  });

  it("never opens a part of Berry or publishing it, only its page and its memory", () => {
    expect(mascotsPlace("berry/limits")).toEqual({ page: "mascot", id: "berry" });
    expect(mascotsPlace("berry/publish")).toEqual({ page: "mascot", id: "berry" });
    expect(mascotsPlace("berry/memory")).toEqual({ page: "memory", id: "berry" });
  });
});

describe("Back on the mascots' page", () => {
  it("goes from a part, memory or publishing to the mascot's page", () => {
    expect(mascotsBack(`${ID}/name`)).toBe(ID);
    expect(mascotsBack(`${ID}/memory`)).toBe(ID);
    expect(mascotsBack(`${ID}/publish`)).toBe(ID);
  });

  it("goes from a mascot's page or the steps to the list", () => {
    expect(mascotsBack(ID)).toBe("list");
    expect(mascotsBack("new")).toBe("list");
  });

  it("has nowhere to go from the list", () => {
    expect(mascotsBack(null)).toBeNull();
    expect(mascotsBack("list")).toBeNull();
    expect(mascotsBack("nonsense/at/all")).toBeNull();
  });
});
