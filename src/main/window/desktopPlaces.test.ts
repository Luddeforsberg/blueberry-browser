import { describe, expect, it } from "vitest";
import {
  DESKTOP_DEFAULT_SPOT,
  desktopBoxPlace,
  desktopHit,
  desktopPlace,
  desktopRestingDrop,
  desktopSheetsPlace,
  desktopSpotAt,
} from "./desktopPlaces";
import { DESKTOP_BOX, DESKTOP_DROP, DESKTOP_FILLET } from "../../shared/desktopSizes";

describe("the drop on the desktop", () => {
  const area = { x: 100, y: 25, width: 1000, height: 700 };
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const EDGES = ["bottom", "top", "left", "right"] as const;
  const FRACTIONS = [0, 0.25, 0.5, 0.51, 1];
  type Box = { x: number; y: number; width: number; height: number };
  const inside = (rect: Box, within: Box) =>
    rect.x >= within.x &&
    rect.y >= within.y &&
    rect.x + rect.width <= within.x + within.width &&
    rect.y + rect.height <= within.y + within.height;
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const onScreen = (window: Box, rect: Box): Box => ({ ...rect, x: window.x + rect.x, y: window.y + rect.y });
  const side = (edge: (typeof EDGES)[number]) => edge === "left" || edge === "right";

  it("keeps its window one size along an edge, and on screen, at every edge and corner", () => {
    EDGES.forEach((edge) => {
      const { width, height } = desktopPlace(area, { edge, fraction: 0 }).window;
      FRACTIONS.forEach((fraction) => {
        const { window } = desktopPlace(area, { edge, fraction });
        expect(inside(window, area)).toBe(true);
        expect([window.width, window.height]).toEqual([width, height]);
      });
    });
  });

  it("puts the side of its window along the edge it's on, with the drop's middle on that side", () => {
    const at = (edge: (typeof EDGES)[number]) => desktopPlace(area, { edge, fraction: 0.3 });
    expect(at("bottom").window.y + at("bottom").window.height).toBe(bottom);
    expect(at("bottom").anchor.y).toBe(at("bottom").window.height);
    expect(at("top").window.y).toBe(area.y);
    expect(at("top").anchor.y).toBe(0);
    expect(at("left").window.x).toBe(area.x);
    expect(at("left").anchor.x).toBe(0);
    expect(at("right").window.x + at("right").window.width).toBe(right);
    expect(at("right").anchor.x).toBe(at("right").window.width);
  });

  it("rests 28 out of the edge and 32 along it, wholly in its window with its fillets, and that's what takes the pointer", () => {
    EDGES.forEach((edge) =>
      FRACTIONS.forEach((fraction) => {
        const place = desktopPlace(area, { edge, fraction });
        const window = { x: 0, y: 0, width: place.window.width, height: place.window.height };
        const drop = desktopRestingDrop(place, edge);
        expect(side(edge) ? [drop.width, drop.height] : [drop.height, drop.width]).toEqual([DESKTOP_DROP.out, DESKTOP_DROP.along]);
        const withFillets = side(edge)
          ? { ...drop, y: drop.y - DESKTOP_FILLET, height: drop.height + 2 * DESKTOP_FILLET }
          : { ...drop, x: drop.x - DESKTOP_FILLET, width: drop.width + 2 * DESKTOP_FILLET };
        expect(inside(withFillets, window)).toBe(true);
        if (edge === "bottom") expect(drop.y + drop.height).toBe(window.height);
        if (edge === "top") expect(drop.y).toBe(0);
        if (edge === "left") expect(drop.x).toBe(0);
        if (edge === "right") expect(drop.x + drop.width).toBe(window.width);
      }),
    );
  });

  it("starts on the right edge, a little below the middle", () => {
    expect(DESKTOP_DEFAULT_SPOT.edge).toBe("right");
    const { window, anchor } = desktopPlace(area, DESKTOP_DEFAULT_SPOT);
    const middle = window.y + anchor.y;
    expect(middle).toBeGreaterThan(area.y + area.height / 2);
    expect(middle).toBeLessThan(area.y + area.height * 0.75);
  });

  it("grows the prompt box from the drop's own place on the edge, and keeps it on screen", () => {
    EDGES.forEach((edge) =>
      FRACTIONS.forEach((fraction) => {
        const spot = { edge, fraction };
        const drop = desktopPlace(area, spot);
        const box = desktopBoxPlace(area, spot);
        expect(inside(box.window, area)).toBe(true);
        // The same point on the screen, so the box grows out of the drop.
        expect({ x: box.window.x + box.anchor.x, y: box.window.y + box.anchor.y }).toEqual({
          x: drop.window.x + drop.anchor.x,
          y: drop.window.y + drop.anchor.y,
        });
        if (edge === "right") expect(box.window.x + box.window.width).toBe(right);
        if (edge === "bottom") expect(box.window.y + box.window.height).toBe(bottom);
        // Long enough for the box, and its fillets along the top and bottom.
        const long = side(edge) ? box.window.width : box.window.width - 2 * DESKTOP_FILLET;
        expect(long).toBeGreaterThanOrEqual(DESKTOP_BOX.long);
      }),
    );
    // Away from the corners, the box's window is centred on the drop, with as much room for the chips over it as for the
    // keys under it.
    EDGES.forEach((edge) => {
      const { window, anchor } = desktopBoxPlace(area, { edge, fraction: 0.5 });
      if (side(edge)) expect(Math.abs(anchor.y - window.height / 2)).toBeLessThanOrEqual(1);
      else expect(Math.abs(anchor.x - window.width / 2)).toBeLessThanOrEqual(1);
    });
    // Taller with more lines, and never past the screen.
    expect(inside(desktopBoxPlace(area, { edge: "right", fraction: 1 }, 2000).window, area)).toBe(true);
    expect(desktopBoxPlace(area, { edge: "right", fraction: 0.5 }, 140).window.height).toBeGreaterThan(
      desktopBoxPlace(area, { edge: "right", fraction: 0.5 }).window.height,
    );
  });

  it("puts the tray and the ask beside the drop, clear of it, and on screen at any size", () => {
    EDGES.forEach((edge) =>
      FRACTIONS.forEach((fraction) => {
        const spot = { edge, fraction };
        const sheets = desktopSheetsPlace(area, spot, { width: 372, height: 420 });
        expect(inside(sheets.window, area)).toBe(true);
        const drop = desktopPlace(area, spot);
        expect(overlaps(sheets.window, onScreen(drop.window, desktopRestingDrop(drop, edge)))).toBe(false);
      }),
    );
    const tiny = { x: 0, y: 0, width: 300, height: 200 };
    EDGES.forEach((edge) => {
      expect(inside(desktopSheetsPlace(tiny, { edge, fraction: 1 }, { width: 720, height: 900 }).window, tiny)).toBe(true);
      expect(inside(desktopPlace(tiny, { edge, fraction: 1 }).window, tiny)).toBe(true);
      expect(inside(desktopBoxPlace(tiny, { edge, fraction: 1 }).window, tiny)).toBe(true);
    });
  });

  it("snaps to the nearest edge, and to a corner when it's let go near one", () => {
    const at = (x: number, y: number) => desktopSpotAt(area, 7, { x: area.x + x, y: area.y + y });
    expect(at(500, 690)).toMatchObject({ displayId: 7, edge: "bottom" });
    expect(at(500, 10)).toMatchObject({ edge: "top" });
    expect(at(10, 300)).toMatchObject({ edge: "left" });
    expect(at(990, 300)).toMatchObject({ edge: "right" });
    expect(at(20, 690)).toEqual({ displayId: 7, edge: "bottom", fraction: 0 });
    expect(at(980, 690)).toEqual({ displayId: 7, edge: "bottom", fraction: 1 });
    expect(at(980, 10).fraction).toBe(1);
    expect(desktopSpotAt(area, 7, { x: -5000, y: 5000 })).toMatchObject({ edge: "left", fraction: 1 });
  });

  it("lands where it was let go along the edge", () => {
    const spot = desktopSpotAt(area, 7, { x: right - 3, y: area.y + 300 });
    const { window, anchor } = desktopPlace(area, spot);
    expect(Math.abs(window.y + anchor.y - (area.y + 300))).toBeLessThanOrEqual(1);
  });

  it("works on a display that isn't the first, with a position below zero", () => {
    const second = { x: -1200, y: -300, width: 1200, height: 800 };
    EDGES.forEach((edge) => expect(inside(desktopPlace(second, { edge, fraction: 0.5 }).window, second)).toBe(true));
  });

  it("only lets the pointer land on what's listed, up to but not past its edge", () => {
    const window = { x: 10, y: 20, width: 200, height: 100 };
    const hits = [{ x: 150, y: 50, width: 50, height: 50 }];
    expect(desktopHit({ x: 160, y: 70 }, window, hits)).toBe(true);
    expect(desktopHit({ x: 159, y: 70 }, window, hits)).toBe(false);
    expect(desktopHit({ x: 209, y: 119 }, window, hits)).toBe(true);
    expect(desktopHit({ x: 210, y: 70 }, window, hits)).toBe(false);
    expect(desktopHit({ x: 160, y: 70 }, window, [])).toBe(false);
  });
});
