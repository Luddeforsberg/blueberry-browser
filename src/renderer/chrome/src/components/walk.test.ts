import { describe, expect, it } from "vitest";
import { oldTrail, FOOT_OFFSET, placeWalker, stepWalker, STRIDE, type Walker } from "./walk";

const bounds = { width: 400, height: 300 };
const walker: Walker = { x: 200, y: 150, heading: 0, foot: 1, pecksLeft: 0 };
const never = () => 0.5;

describe("stepWalker", () => {
  it("takes a step and leaves a print on the other foot", () => {
    const { walker: next, print } = stepWalker(walker, bounds, never);

    expect(next.x).toBeGreaterThan(walker.x);
    expect(next.foot).toBe(-1);
    expect(print).not.toBeNull();
  });

  it("plants the print under the bird, not where the step is heading", () => {
    const { walker: next, print } = stepWalker(walker, bounds, never);

    expect(next.x - walker.x).toBeCloseTo(STRIDE);
    expect(print!.x).toBeCloseTo(walker.x);
    expect(Math.abs(print!.y - walker.y)).toBeCloseTo(FOOT_OFFSET);
  });

  it("leaves no print while pecking, and walks on when the last peck is done", () => {
    const pecking = { ...walker, pecksLeft: 1 };
    const paused = stepWalker(pecking, bounds, never);

    expect(paused.print).toBeNull();
    expect(paused.walker.x).toBe(pecking.x);
    expect(paused.walker.pecksLeft).toBe(0);
    expect(stepWalker(paused.walker, bounds, never).print).not.toBeNull();
  });

  it("starts pecking when the dice say so", () => {
    const { walker: next, print } = stepWalker(walker, bounds, () => 0);

    expect(next.pecksLeft).toBeGreaterThan(0);
    expect(print).toBeNull();
  });

  it("turns back at the far edge", () => {
    const atEdge = { ...walker, x: bounds.width - 24 };

    expect(stepWalker(atEdge, bounds, never).walker.x).toBeLessThan(atEdge.x);
  });

  it.each([0, Math.PI])("keeps moving away from the bottom after reflecting at heading %s", (heading) => {
    const atEdge = { ...walker, y: bounds.height - 24, heading: heading + (heading === 0 ? 0.3 : -0.3) };
    const reflected = stepWalker(atEdge, bounds, never).walker;
    const next = stepWalker(reflected, bounds, never).walker;

    expect(reflected.y).toBeLessThan(atEdge.y);
    expect(next.y).toBeLessThan(reflected.y);
    expect(Math.cos(next.heading)).toBeCloseTo(Math.cos(reflected.heading));
  });

  it("stays on the page over a long walk, however it wanders", () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let current = placeWalker(bounds, random);

    for (let step = 0; step < 5000; step++) {
      current = stepWalker(current, bounds, random).walker;
      expect(current.x).toBeGreaterThanOrEqual(24);
      expect(current.x).toBeLessThanOrEqual(bounds.width - 24);
      expect(current.y).toBeGreaterThanOrEqual(24);
      expect(current.y).toBeLessThanOrEqual(bounds.height - 24);
    }
  });

  it.each([
    { width: 0, height: 0 },
    { width: 48, height: 48 },
    { width: 49, height: 49 },
  ])("copes with a page of $width by $height", (small) => {
    let current = placeWalker(small, never);
    for (let step = 0; step < 20; step++) current = stepWalker(current, small, never).walker;

    expect(Number.isFinite(current.x)).toBe(true);
    expect(Number.isFinite(current.y)).toBe(true);
  });
});

describe("oldTrail", () => {
  it.each([0, 1, 200])("places %i footprints", (steps) => {
    expect(oldTrail(0, 0, 0, steps)).toHaveLength(steps);
  });

  it("keeps each foot one stride from the previous plant along a curved path", () => {
    const prints = oldTrail(0, 0, 0.2, 200);
    const centres = prints.map((print, index) => {
      const angle = ((print.turn - 90) * Math.PI) / 180;
      const foot = index % 2 === 0 ? FOOT_OFFSET : -FOOT_OFFSET;
      return { x: print.x + Math.sin(angle) * foot, y: print.y - Math.cos(angle) * foot };
    });
    for (let index = 1; index < centres.length; index++) {
      const previous = centres[index - 1];
      const current = centres[index];
      expect(Math.hypot(current.x - previous.x, current.y - previous.y)).toBeCloseTo(STRIDE, 5);
    }
  });
});
