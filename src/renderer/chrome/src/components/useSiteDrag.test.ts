import { describe, expect, it } from "vitest";
import { markAt, placeAmong, type Box } from "./useSiteDrag";

// Tiles 50 wide and 40 high with a 6 gap, four to a row, and five of them: a full row and one under it.
const tile = (index: number): Box => {
  const left = (index % 4) * 56;
  const top = Math.floor(index / 4) * 46;
  return { left, top, right: left + 50, bottom: top + 40 };
};
const tiles = [0, 1, 2, 3, 4].map(tile);
// Rows 27 high, one under another.
const rows = [0, 1, 2].map((index): Box => ({ left: 0, top: index * 27, right: 240, bottom: index * 27 + 27 }));

describe("placeAmong", () => {
  it("puts a tile before the one it's left of the middle of, on that row", () => {
    expect(placeAmong(10, 20, tiles, "tiles")).toBe(0);
    expect(placeAmong(30, 20, tiles, "tiles")).toBe(1);
    expect(placeAmong(200, 20, tiles, "tiles")).toBe(4);
    expect(placeAmong(10, 60, tiles, "tiles")).toBe(4);
  });

  it("puts it at the end past the last tile, and at the start above the first row", () => {
    expect(placeAmong(40, 60, tiles, "tiles")).toBe(5);
    expect(placeAmong(200, 200, tiles, "tiles")).toBe(5);
    expect(placeAmong(200, -5, tiles, "tiles")).toBe(0);
  });

  it("goes by height alone for rows, whatever the side", () => {
    expect(placeAmong(230, 13, rows, "rows")).toBe(0);
    expect(placeAmong(5, 14, rows, "rows")).toBe(1);
    expect(placeAmong(5, 81, rows, "rows")).toBe(3);
  });

  it("is the first place with nothing there", () => {
    expect(placeAmong(10, 10, [], "tiles")).toBe(0);
    expect(placeAmong(10, 10, [], "rows")).toBe(0);
  });
});

describe("markAt", () => {
  const zone: Box = { left: 0, top: 100, right: 240, bottom: 140 };

  it("stands before a tile, or after the last one", () => {
    expect(markAt(1, tiles, "tiles", zone)).toEqual({ left: 52, top: 0, right: 54, bottom: 40 });
    expect(markAt(5, tiles, "tiles", zone)).toEqual({ left: 52, top: 46, right: 54, bottom: 86 });
  });

  it("lies above a row, or under the last one", () => {
    expect(markAt(1, rows, "rows", zone)).toEqual({ left: 0, top: 26, right: 240, bottom: 28 });
    expect(markAt(3, rows, "rows", zone)).toEqual({ left: 0, top: 80, right: 240, bottom: 82 });
  });

  it("lies along the top of an empty list", () => {
    expect(markAt(0, [], "rows", zone)).toEqual({ left: 0, top: 100, right: 240, bottom: 102 });
  });
});
