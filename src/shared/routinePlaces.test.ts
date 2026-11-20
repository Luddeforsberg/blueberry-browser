import { describe, expect, it } from "vitest";
import { routinesBack, routinesParam, routinesPlace, type RoutinePlace } from "./routinePlaces";

const ID = "6f1c2a52-6d0e-4a55-9a59-1f1d3c0b2e11";

describe("where the Routines page is", () => {
  it("opens on the list with no param, an empty one, or one nobody knows", () => {
    expect(routinesPlace(null)).toEqual({ page: "list" });
    expect(routinesPlace("")).toEqual({ page: "list" });
    expect(routinesPlace(`${ID}/when/more`)).toEqual({ page: "list" });
    expect(routinesPlace("/when")).toEqual({ page: "list" });
  });

  it("comes back from its param as the same place", () => {
    const places: RoutinePlace[] = [
      { page: "list" },
      { page: "new" },
      { page: "routine", id: ID },
      { page: "part", id: ID, part: "does" },
      { page: "part", id: ID, part: "name" },
    ];
    for (const place of places) expect(routinesPlace(routinesParam(place))).toEqual(place);
  });

  it("takes a bare id, as older callers name a routine, and sends an unknown part to its page", () => {
    expect(routinesPlace(ID)).toEqual({ page: "routine", id: ID });
    expect(routinesPlace(`${ID}/colour`)).toEqual({ page: "routine", id: ID });
  });

  it("steps back one place at a time, and not from the list", () => {
    expect(routinesBack(`${ID}/when`)).toBe(ID);
    expect(routinesBack(ID)).toBe("list");
    expect(routinesBack("new")).toBe("list");
    expect(routinesBack("list")).toBeNull();
    expect(routinesBack(null)).toBeNull();
  });
});
