import { describe, expect, it } from "vitest";
import { CROWN, growBerrylets, lightAt, seeded } from "./blueberryArt";

describe("the art blueberry", () => {
  const berrylets = growBerrylets(4000);

  it("gives the same grain from the same seed", () => {
    const one = seeded(7);
    const two = seeded(7);
    expect([one(), one()]).toEqual([two(), two()]);
    expect(seeded(8)()).not.toBe(seeded(7)());
  });

  it("keeps the small berries on the face of the fruit, about half of them", () => {
    expect(berrylets.length).toBeGreaterThan(1900);
    expect(berrylets.length).toBeLessThan(2100);
    for (const { x, y, facing } of berrylets) {
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(1 + 1e-9);
      expect(facing).toBeGreaterThan(0);
    }
  });

  it("starts the spiral at the crown", () => {
    const first = berrylets[0];
    expect(Math.hypot(first.x - CROWN.x, first.y - CROWN.y)).toBeLessThan(0.05);
    expect(growBerrylets(0)).toEqual([]);
    expect(growBerrylets(1)).toHaveLength(0);
  });

  it("is lit from the upper left, and dark off the edge of the fruit", () => {
    expect(lightAt(-0.4, -0.5)).toBeGreaterThan(lightAt(0.5, 0.6));
    expect(lightAt(1.2, 0)).toBe(0);
    expect(lightAt(-0.4, -0.5)).toBeLessThanOrEqual(1);
  });
});
