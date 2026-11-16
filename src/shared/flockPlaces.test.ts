import { describe, expect, it } from "vitest";
import { flockBack, flockParam, flockPlace, type FlockPlace } from "./flockPlaces";

const ID = "6f1c2a52-6d0e-4a55-9a59-1f1d3c0b2e11";

describe("where the mascots' page is", () => {
  it("opens on the list with no param, an empty one, or one nobody knows", () => {
    expect(flockPlace(null)).toEqual({ page: "list" });
    expect(flockPlace("")).toEqual({ page: "list" });
    expect(flockPlace(`${ID}/memory/more`)).toEqual({ page: "list" });
    expect(flockPlace("/memory")).toEqual({ page: "list" });
  });

  it("comes back from its param as the same place", () => {
    const places: FlockPlace[] = [
      { page: "list" },
      { page: "new" },
      { page: "mascot", id: ID },
      { page: "memory", id: ID },
      { page: "publish", id: ID },
      { page: "part", id: ID, part: "look" },
      { page: "part", id: ID, part: "limits" },
    ];
    for (const place of places) expect(flockPlace(flockParam(place))).toEqual(place);
  });

  it("sends an unknown part to the mascot's page", () => {
    expect(flockPlace(`${ID}/colour`)).toEqual({ page: "mascot", id: ID });
  });

  it("never opens a part of Berry or publishing it, only its page and its memory", () => {
    expect(flockPlace("berry/limits")).toEqual({ page: "mascot", id: "berry" });
    expect(flockPlace("berry/publish")).toEqual({ page: "mascot", id: "berry" });
    expect(flockPlace("berry/memory")).toEqual({ page: "memory", id: "berry" });
  });
});

describe("Back on the mascots' page", () => {
  it("goes from a part, memory or publishing to the mascot's page", () => {
    expect(flockBack(`${ID}/name`)).toBe(ID);
    expect(flockBack(`${ID}/memory`)).toBe(ID);
    expect(flockBack(`${ID}/publish`)).toBe(ID);
  });

  it("goes from a mascot's page or the steps to the list", () => {
    expect(flockBack(ID)).toBe("list");
    expect(flockBack("new")).toBe("list");
  });

  it("has nowhere to go from the list", () => {
    expect(flockBack(null)).toBeNull();
    expect(flockBack("list")).toBeNull();
    expect(flockBack("nonsense/at/all")).toBeNull();
  });
});
